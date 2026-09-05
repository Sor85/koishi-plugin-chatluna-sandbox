# 工具参数的取值组合用判别联合表达

一个工具的参数之间存在取值组合约束时，`inputSchema` 用 `oneOf`／`anyOf` 表达它，而不是把约束写在参数描述或工具描述里由执行体单独判定。三处适用：关系操作按 `action` 分支（`perform_friend_action`、`perform_group_action`）、模型请求记录按 `scope` 分支（`list_model_request_records`、`get_model_request_record`）、合并转发的二选一（`send_forward_message` 的 `messageIds` 与 `nodes`、`get_forward_message` 的 `forwardId` 与 `messageId`）。

`inputSchema` 是 AI 消费者唯一能学到参数契约的地方。约束留在散文里时，消费者要读完十几条参数描述才拼得出一次合法调用——`perform_group_action` 有十二个业务参数而基础必填只有四个，「`set-card` 要带 `card`」此前只写在 `card` 自己的描述里。领域层本来就是判别联合（`SandboxFriendAction`、`SandboxGroupAction`），环境变更那族对外也早就是 `oneOf`；把同一份结构还原到声明上，端点内部不再有两种表达同一件事的写法。

扁平 `properties` 与基础 `required` 都保留不动：只读 `properties` 的客户端仍然看得见全部参数（与今天完全一样），读得懂 `oneOf` 的客户端多知道每种取值各自要带什么。因此这不是收紧契约，而是补上一层此前只存在于散文里的信息。每个分支都用 `const` 钉住判别式，因此任何一次调用恰好匹配一个分支；不钉住判别式的话 `oneOf` 会退化成「随便满足一个」，一次缺参数的调用可能匹配到别的分支而被判成合法。

两种协议表述仍然不做 schema 校验，校验责任仍在工具执行体内部——`oneOf` 是声明而不是新增的校验层。但声明与执行体必须一致，因此分支清单由 `tests/mcp-tool-schema-contract.test.ts` 逐条钉住，动作枚举也与分支清单同源比对：能选的动作必须都有一个分支说明它要带什么。

同一条原则的反面是：约束能用「参数不存在」表达时，优先让它不可表达，而不是声明一个残缺的枚举再在执行体里拒绝。`clear_model_request_records` 因此不再接受 `scope`——三个记录域里只有 AI 测试空间允许经本端点清理，而未归属记录域根本没有空间标识，于是「清理未归属」在参数层面就没有写法。它此前声明成单成员枚举 `enum: ['space']` 且不在 `required` 里，那个参数既不携带信息也不真的被读，实测传 `scope: 'all'` 照样会清理 `spaceId` 指向的空间。显式传了 `scope` 仍要拒绝而不是无声忽略：另外两个模型请求记录工具都以 `scope` 为必填判别式，照着它们的形状调用本工具是最可能发生的事，而被忽略的参数会让调用方以为自己指定了范围。
