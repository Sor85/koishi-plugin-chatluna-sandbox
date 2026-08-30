# Console 契约是唯一声明，三份声明改为派生

一个 Console 端点的名字与签名此前要写三遍：服务端的事件映射、服务端对 `@koishijs/console` 的 `Events` 模块增强、客户端 `koishi-client-shim.d.ts` 里的一条 `send` 重载。三份是同一份名单换三种语法，五十多行乘三份，没有任何东西要求它们一致。真实成本不在抄三遍，而在加端点时要记住抄哪三处，以及漏抄后的错误形态不一致：漏客户端那处报「没有匹配的重载」，漏服务端那处编译通过而运行时才报「未知事件」。

**契约放在 `src/console-contract.ts` 供两端共享，不是各写一份。** 客户端已经在直接引用 `src/types.ts`、`src/conversation-resolution.ts` 与 `src/message-capabilities.ts`，把契约放进 `client/` 会让服务端反向依赖客户端目录。代价是这个 `src` 模块要被前端一起读到，因此它只有类型声明：不 import 控制服务，全部 import 都是 `import type`，一条守卫钉住这两点——一处值导入就会把 Koishi 运行时打进前端产物，而那类回归不报错，只让产物默默变大。契约按 [ADR-0074](./0074-split-client-rpc-ports-by-capability.md) 的能力分组书写并导出分组，分组是给读的人用的，端点集合是全体分组的并集。

**三份声明改为派生而不是靠约定同步。** 服务端的事件映射直接就是契约类型；模块增强写成 `interface Events extends SandboxConsoleEvents {}`；客户端那五十多条重载塌成一条 `send<Event extends keyof SandboxConsoleEvents>`，入参取 `Parameters`、出参取 `Awaited<ReturnType>` 并统一包一层 `Promise`，因此同步返回的端点在客户端仍是 Promise。这不是洁癖：写这条 ADR 时用集合比对实测出已经漂了一个端点——`chatluna-sandbox/bot-deliveries` 在服务端两份声明与注册点都有，客户端补丁没有它的 `send` 重载，客户端也没有任何调用。它既不是被用着的端点，也没有被当成服务端自用登记过，两边都没人报错。按未发布阶段兼容策略删除；机器人事件投递的领域读取仍由控制服务与 MCP 工具承担，删的只是那个没人调的 Console 端点。

**声明、注册与消费三者的集合由守卫钉住，各自一条断言。** 注册集合来自假 Console 实际收集的事件名，那是服务端真相；声明集合与消费方名单读源码——interface 的键在运行时不存在，`send` 的调用点也只以字符串字面量出现，两者没有别的观察面，属于 [ADR-0073](./0073-assert-interfaces-and-guard-by-rule.md) 明示的架构守卫例外。谓词按形状判定：任何叫 `Sandbox*ConsoleEvents` 的分组自动进端点集合，新增分组不必改守卫。无主端点要么有客户端消费方，要么进登记表，理由与负责人均为必填；登记不是放行，是有主的债务，形态与客户端架构守卫的豁免清单一致。

**广播频道进入同一份契约，`receive` 因此和 `send` 一样有类型。** 服务端 `broadcast` 的签名也按频道名取载荷，改载荷字段两端一起变红；`scene-sync.ts` 里那份本地 `SceneMutationPayload` 与 MCP 端口里那份 `McpActivityPayload` 都收成对契约的引用。`chatluna-sandbox/mcp-activity` 同时是请求端点与广播频道，这不是重复：一个回答「现在跑着吗」，一个通知「状态变了」，契约把两者分别登记而不合并成一条。

顺带暴露了一处一直存在的违规：`scene-sync.ts` 的模块级 `receive` 本就不在端口适配器里，此前靠 `receive<Payload>(...)` 的类型实参让守卫的 `receive\s*\(` 命不中而躲过检查。载荷类型收进频道映射后类型实参失去存在理由，这条违规第一次显形，已按必填理由与负责人登记进客户端架构守卫的豁免清单，负责的后续工作是把场景变更订阅按 `subscribeMcpActivity` 的形状搬进工作区端口。

**鉴权级别留在注册点，不进契约。** `authority: 4` 是注册时的策略而不是端点的形状：同一个端点在不同宿主上可以要求不同权限，把它写进契约会让「端点是什么」和「谁能调它」共用一个变更原因。

与 ADR-0074 的关系是对齐而不是派生。端口按能力拆分是客户端一侧的抽象，回答「调用方要认识几个 seam」；契约按同样的能力分组书写只是为了让两边读起来对得上。契约不派生端口接口：端口的方法名、可选参数与显式定域规则都是客户端自己的取舍，两者各自演化。ADR-0074 那条决定不变。
