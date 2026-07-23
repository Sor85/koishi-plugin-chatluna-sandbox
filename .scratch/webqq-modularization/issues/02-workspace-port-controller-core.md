# 02 — 建立工作区端口与控制模块核心

**What to build:** 建立 WebQQ 工作区的统一状态和传输 seam，使页面通过一个可测试的控制模块加载工作区、恢复浏览器选择并获得四个同步的只读区域模型。

**Blocked by:** 01 — 建立 WebQQ 回归基线

**Status:** ready-for-agent

- [ ] 定义覆盖现有 WebQQ 服务端操作的类型化 WorkspacePort
- [ ] 提供将 WorkspacePort 映射到现有 Koishi 控制台 RPC 的生产适配器
- [ ] 提供可在 Vitest 中控制结果和失败的 fake WorkspacePort
- [ ] 工作区控制模块统一持有服务端工作区状态、当前操作者和当前会话
- [ ] 控制模块恢复现有浏览器本地选择并保持无效选择 fallback 不变
- [ ] 控制模块输出 sidebar、chat、composer、details 四个只读区域模型
- [ ] 页面通过控制模块完成初始加载但视觉、DOM 和交互保持与基准一致
- [ ] 控制模块核心行为具有 Vitest 覆盖并通过完整验证命令
