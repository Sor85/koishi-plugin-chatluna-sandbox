# MCP 契约一致性与健壮性规格

Status: ready-for-agent

## Problem Statement

测试控制端点的 40 个工具全部有测试覆盖，89 个用例全绿，但一轮逐行审查在实现里找出 10 处缺陷。它们全都躲过了现有测试，原因是同一个：现有用例断言的是「工具能按预期工作」，没有一条断言「实现与它自己声明的契约一致」。

四处已用探针实测复现：

1. `handle_request` 转调好友/群操作时重新拼参数对象，漏了 `spaceId`，事件因此写入 `spaceId: undefined`。而 `waitFor` 按 `spaceId` 严格相等过滤，`wait_for_event` 的 `spaceId` 又是必填——测试空间里批准申请后等 `friend.action` 必然超时。直接调 `perform_friend_action` 不受影响，只有这条转调路径断。
2. 错误信封的 `revision` 恒读主场景。测试空间里失败的调用，报的是主场景版本，外部控制器据此做乐观并发控制会拿到错的基线。
3. `list_onebot_debug_records` 用 `invalid_argument`（单数），其余 20 余处都是 `invalid_arguments`。
4. `get_capability_matrix` 对非法 `implementation` 静默回落 napcat，而同一文件的 `requireImplementation` 明确写着「静默回落到 napcat 会让测试控制器以为自己在测另一个协议」——这条规则只在环境变更那条路径上执行了。

其余六处读码可确认：非预期异常被包成 `domain_error` 并原样透出 message 且不写 Logger，与 ADR-0027 冲突；`chatluna-sandbox://errors` 资源声明 14 个错误码而实现实际发出 28 个；工具 inputSchema 漏了实现确实会读取的 `profile`、`remarks`、`testRunId` 三个字段；`idempotency` 与 `confirmations` 两个 Map 无上限也无过期清理，而同类的事件、调用记录、上传媒体三个缓冲区都有上限；凭证文件里长度不合规的 `tokenDigest` 会让 `timingSafeEqual` 抛异常，抛出点在传输层 `try` 之外且 `handleRequest` 是 `void` 调用，结果是 unhandled rejection 加请求挂死；凭证文件非原子写入，配合「读取失败静默清空且不记日志」是一次崩溃静默丢光全部凭证。

这些缺陷的共同点是**声明与实现的偏离**：错误码资源、工具 inputSchema、ADR 里写下的错误归一化规则、注释里写下的「非法值必须显式失败」，四份声明都没有任何测试守住。缺陷 3、6、7 尤其能说明问题——它们不需要构造任何运行场景，一条把声明和实现对起来比较的守卫测试就能全部抓住，而这类测试目前一条都没有。

## Solution

按缺陷性质分成七张票，其中六张各自修一类缺陷并补上守住该类契约的测试，第七张清理四处过期注释与死代码。

三条纪律贯穿全部票：

**声明必须由测试守住，不能靠人工同步。** 错误码资源与工具 inputSchema 都是给 AI 消费者的对外契约文档，它们和实现分处两地，靠人工维护必然再次漂移。守卫测试必须从实现侧枚举实际行为，再与声明侧比较，而不是把两边都从同一处导入——那只能证明实现等于自己。

**空间作用域必须贯穿到底。** 缺陷 1 与 2 是同一个错误的两种形态：一处在事件流丢了 `spaceId`，一处在错误信封丢了空间归属。修法也应当一致——沿用 `traceId` 已经确立的模式，由写记录的那一层把空间信息回填到错误对象上，传输层原样携带，而不是让传输层自己去参数里翻。

**静默回落一律改成显式失败。** 非法枚举值静默取默认值，会让外部测试控制器以为自己在测另一个协议、另一个空间、另一个场景版本。这条规则实现里已经写下来了，只是没有普遍执行。

## User Stories

1. As a 外部测试控制器, I want `handle_request` 批准的申请在测试空间的事件流里可等待, so that 我不必为这条路径改用轮询
2. As a 外部测试控制器, I want 错误信封的场景版本对应失败真正发生的那个空间, so that 我能据此重新读取正确的快照
3. As a 外部测试控制器, I want 同类失败在所有工具上返回同一个错误码, so that 我的客户端能按错误码分支处理
4. As a 外部测试控制器, I want 错误码资源列出实现实际会发出的全部错误码, so that 我不会遇到文档里没有的码
5. As a 外部测试控制器, I want 非预期异常与业务拒绝可区分, so that 我知道该重试、该改参数，还是该报缺陷
6. As a 外部测试控制器, I want 非法的 `implementation` 被明确拒绝, so that 我不会以为自己在测另一个协议
7. As a 外部测试控制器, I want 工具 inputSchema 列出实现会读取的全部字段, so that 我不必读源码才能发现可用参数
8. As a 外部测试控制器, I want 幂等键的有效期有明确承诺, so that 我知道长时间后重放会发生什么
9. As a 维护者, I want 错误码声明与实现的偏离会让测试变红, so that 那份资源不会再次漂移
10. As a 维护者, I want 工具 inputSchema 与实现读取字段的偏离会让测试变红, so that 契约文档不再靠人工同步
11. As a 维护者, I want 非预期异常的堆栈留在 Koishi Logger, so that 我能定位客户端只看到错误码的那些失败
12. As a 维护者, I want 服务内每个缓冲区都有上限, so that 长跑测试会话不会无界增长
13. As a 维护者, I want 损坏的凭证文件不会打挂请求处理, so that 一个坏条目不会让端点表现为挂起
14. As a 维护者, I want 凭证文件损坏时日志里有线索, so that 我不必靠猜来解释凭证凭空消失
15. As a 维护者, I want 凭证写入是原子的, so that 一次崩溃不会静默丢掉全部凭证

## Implementation Decisions

### 空间归属沿用 traceId 的回填模式

`SandboxMcpError` 上已经有 `traceId`，由 `callTool` 在写下调用记录后回填，传输层原样携带。场景版本走同一条路：`callTool` 捕获错误时把发生失败的那个空间的 revision 回填到错误对象上。传输层不再调 `getRevision()`，只在凭证校验阶段（尚无空间可指）退回主场景版本。

不采用「传输层从 `request.params.arguments.spaceId` 自己解析」的方案：那会让传输层第二次实现空间解析逻辑，而 `resolveControl` 里的空间可用性判定（接管、不存在、不可用三态）无法在传输层复现。

### 错误码守卫从实现侧枚举

守卫测试从 `src/mcp/` 的源码里枚举 `new SandboxMcpError('<code>'` 的全部字面量，与 `chatluna-sandbox://errors` 资源返回的数组比较，两侧互为子集才算通过。动态构造码（`resolveControl` 里的三个空间态）在测试里显式列出。

这是源码文本断言，但落在 ADR-0073 明确列出的第三类例外里——「架构守卫自身读取源码……它的断言对象本来就是源码结构」。这里被守的对象是「实现总共可能发出哪些错误码」这份清单，它没有别的观察面：没有任何调用序列能枚举出全部抛出点。守卫的两侧也是独立的（一侧是散落各处的抛出点，一侧是集中的资源数组），不构成「实现等于自己」。

按 ADR-0073 的成本结构判据，它也站得住：等价重构不会让它变红（改错误消息、挪抛出点、合并分支都不影响码集合），只有引入未登记的码或删掉在用的码才会红——那正是需要的行为。

### 工具 inputSchema 守卫按字段清单书写

不做源码扫描。测试侧独立书写一份「每个工具声明的顶层参数名集合」，与 `TOOL_SCHEMAS` 比较；`apply_environment_changes` 的每种变更再单独比较一份 `data` 字段集合。字段被误删、误加、改名都会变红。这与 `tests/helpers/mcp-tool-catalogue.ts` 已经确立的做法一致——测试侧独立书写，不从实现导入。

### 幂等缓存加 TTL 会修订 ADR-0021

ADR-0021 承诺「按测试凭证、工具名称和 Key 在当前运行纪元内缓存首次结果」，纪元内无过期。加上 TTL 与条数上限后，超出窗口的同键重放会重新执行操作而不是返回首次结果。这是对外契约的行为变更，必须修订 ADR-0021 并在工具描述里写明有效期，不能只改实现。

`confirmations` 不涉及契约变更：它本来就有 60 秒过期，只是过期项不被清理，惰性清理即可。

### 凭证服务需要 Logger 通道

`SandboxMcpService` 目前拿不到 Logger——`SandboxControlService` 的 `ctx` 是私有的。构造函数第一个参数改为接收 `Context`，与 `SandboxMcpHttpServer` 已有的做法一致（它持有 `ctx` 并用 `ctx.logger('chatluna-sandbox')`）。`src/index.ts` 的构造点已有可用的 `inner` context。

不在 options 里加 `logger` 回调：那会在只有一个消费者的地方引入一层间接，且与传输层的做法不一致。

## Testing Decisions

主 seam 仍是 `service.callTool`，与既有 MCP 测试一致；缺陷 1 的验证需要真实的申请审批流程，用 `tests/helpers/mcp-service-harness.ts` 的测试空间构造。两份守卫测试各自独立成文件，避免两张票改同一个文件：错误码守卫写 `tests/mcp-error-code-contract.test.ts`，schema 守卫写 `tests/mcp-tool-schema-contract.test.ts`。

每张票都必须先让新用例在未修复的实现上变红，再修复。缺陷 3、4、6、7 尤其要注意：它们的修复很小，容易先改实现再补一条必然通过的用例。

验收：单元测试、类型检查与构建全绿。不做浏览器验证——七张票都不触及 WebQQ 可见状态。

## Out of Scope

- 给 `wait_for_event` 增加等待主场景事件的能力。主场景不可等待是既有设计（`spaceId` 在 wait 类工具上必填），不是本规格发现的缺陷。
- `wait_for_*` 的 20ms `setInterval` 轮询改成事件驱动。是效率问题而非正确性问题，且改动面远大于本规格任何一张票。
- 升级 `@modelcontextprotocol/sdk`（当前锁 1.29.0，npm 最新 1.30.0）。与本规格无关。
- 为凭证存储新增架构决策记录。ADR-0058 已覆盖存储位置与内容，原子写入与损坏诊断是实现健壮性，不是决策。
- 领域词汇调整。七张票都不引入新概念，`CONTEXT.md` 不变。

## Further Notes

- 缺陷 1 的探针：空间内建两个用户，A 发好友申请，B 用 `handle_request` 批准，用发起前 cursor 等 `friend.action` 得到 `matched: false`。
- 缺陷 2 的探针：主场景 revision=0、空间 revision=1 时 `getRevision()` 返回 0。
- 缺陷 4 的探针：`implementation: 'bogus'` 与 `'napcat'` 返回的矩阵逐字节相同。
- 缺陷 9 的探针：`tokenDigest: 'deadbeef'` 的凭证条目让 `authenticate` 抛 `ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH`。
- 分支与提交：依仓库规则不自行创建分支、不自行提交。

