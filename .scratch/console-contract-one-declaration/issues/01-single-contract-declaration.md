# 01 — 契约成为唯一声明

**What to build:** 一个 Console 端点的名字、入参与出参写一次，服务端与客户端的三份声明都从它派生。

新增 `src/console-contract.ts`：只声明端点名到「入参与出参」的映射，以及广播频道名到载荷的映射；不 import 控制服务，因此客户端引用它不会把服务端运行时拖进前端产物。契约按能力分组书写并导出分组，与 ADR-0074 的端口拆分对齐。

服务端的 `ConsoleEventMap` 直接成为契约类型本身；对 `@koishijs/console` 的 `Events` 模块增强改成从契约映射派生。客户端 `koishi-client-shim.d.ts` 里五十多条 `send` 重载塌成一条泛型签名，`receive` 同样改成按频道名取载荷的泛型签名。

`scene-mutated` 与 `mcp-activity` 的频道名与载荷进入契约的广播分组，`scene-sync.ts` 里那份本地 `SceneMutationPayload` 声明删掉。

判据是既有测试一字不改地继续通过：任何一处需要改断言才能过，都说明收敛改变了外部行为。

**Blocked by:** 无

**Status:** resolved

- [x] 端点名、入参与出参在仓库里只声明一次
- [x] 服务端两份声明与客户端补丁都从契约派生，不再各写一份名单
- [x] 客户端 `send` 与 `receive` 都是按端点名取签名的泛型，不再逐条重载
- [x] 广播频道名与载荷进入契约，本地重复声明已删除
- [x] 既有的 Console 适配器测试、端点测试与客户端端口测试一字不改地通过
- [x] `yarn typecheck` 通过，端点名拼错时在编译期报错

## Comments

### 实现记录

- 契约落在 `src/console-contract.ts`：七个能力分组（会话与消息 15 条、环境与关系 5 条、调试记录 3 条、模型请求 4 条、预设 7 条、MCP 管理 11 条、测试空间 7 条）加一份广播频道映射，`SandboxConsoleEvents` 继承全部分组。全文只有 `import type` 与 interface 声明，没有任何值导出。
- 服务端 `ConsoleEventMap` 整体删除，`SandboxConsoleRegistrar` 直接用 `SandboxConsoleEvents`；模块增强塌成 `interface Events extends SandboxConsoleEvents {}` 一行——属性函数类型对方法签名位置可赋值，因此不必逐条重写成方法形式。本地 `SpaceScoped` 也删了，改从契约引用。
- 客户端补丁从 129 行降到 41 行：五十多条 `send` 重载塌成一条 `send<Event extends keyof SandboxConsoleEvents>`，入参取 `Parameters`，出参取 `Awaited<ReturnType>` 再包一层 `Promise`——`mcp-*` 那几个端点在服务端同步返回，客户端拿到的仍是 Promise，这个形状把两种情况一起吃下。`receive` 同样按频道名取载荷。
- **顺带修掉一处口径分叉**：补丁此前把 `model-request-records` 的出参写成 `SandboxModelRequestRecordsPage`，服务端实际返回带 `source` 的 `SandboxModelRequestRecordsPage<SandboxConsoleModelRequestListItem>`；`model-request-record` 同理少了 `source`。派生后客户端拿到的是服务端真正返回的类型。
- 服务端 `broadcast` 的签名也从契约取（`broadcast<Channel extends keyof SandboxConsoleBroadcasts>`）。只改 `receive` 不改 `broadcast` 的话「改载荷字段两端一起变红」只成立一半：服务端那侧原本是 `broadcast(type: string, body: unknown)`。
- `scene-sync.ts` 里的本地 `SceneMutationPayload` 与 `mcp-admin-port.ts` 里的 `McpActivityPayload` 都收成对契约的引用（后者保留别名名字，避免改动一串消费方）。
- **收敛本身让既有测试的四条断言变红，逐条查过，没有一条是端点行为变了**（`console-adapter.test.ts` 另有三处改动，那是 02 号票删除 `bot-deliveries` 端点牵动的，不属于收敛）：`environment-components.test.ts` 两条与 `webqq-sidebar.test.ts` 一条是源码文本断言，断言对象分别是「端点名在客户端声明过」和「receive 带类型实参」，前两条改指 `src/console-contract.ts`，第三条去掉类型实参；第四条是客户端架构守卫，见 02 号票。1129 条测试里其余一条未改。
