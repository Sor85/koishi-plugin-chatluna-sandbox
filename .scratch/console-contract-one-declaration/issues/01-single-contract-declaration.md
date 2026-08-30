# 01 — 契约成为唯一声明

**What to build:** 一个 Console 端点的名字、入参与出参写一次，服务端与客户端的三份声明都从它派生。

新增 `src/console-contract.ts`：只声明端点名到「入参与出参」的映射，以及广播频道名到载荷的映射；不 import 控制服务，因此客户端引用它不会把服务端运行时拖进前端产物。契约按能力分组书写并导出分组，与 ADR-0074 的端口拆分对齐。

服务端的 `ConsoleEventMap` 直接成为契约类型本身；对 `@koishijs/console` 的 `Events` 模块增强改成从契约映射派生。客户端 `koishi-client-shim.d.ts` 里五十多条 `send` 重载塌成一条泛型签名，`receive` 同样改成按频道名取载荷的泛型签名。

`scene-mutated` 与 `mcp-activity` 的频道名与载荷进入契约的广播分组，`scene-sync.ts` 里那份本地 `SceneMutationPayload` 声明删掉。

判据是既有测试一字不改地继续通过：任何一处需要改断言才能过，都说明收敛改变了外部行为。

**Blocked by:** 无

**Status:** ready-for-agent

- [ ] 端点名、入参与出参在仓库里只声明一次
- [ ] 服务端两份声明与客户端补丁都从契约派生，不再各写一份名单
- [ ] 客户端 `send` 与 `receive` 都是按端点名取签名的泛型，不再逐条重载
- [ ] 广播频道名与载荷进入契约，本地重复声明已删除
- [ ] 既有的 Console 适配器测试、端点测试与客户端端口测试一字不改地通过
- [ ] `yarn typecheck` 通过，端点名拼错时在编译期报错
