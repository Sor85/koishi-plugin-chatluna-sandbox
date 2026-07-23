# 02 — 建立工作区端口与控制模块核心

**What to build:** 建立 WebQQ 工作区的统一状态和传输 seam，使页面通过一个可测试的控制模块加载工作区、恢复浏览器选择并获得四个同步的只读区域模型。

**Blocked by:** 01 — 建立 WebQQ 回归基线

**Status:** ready-for-human

- [x] 定义覆盖现有 WebQQ 服务端操作的类型化 WorkspacePort
- [x] 提供将 WorkspacePort 映射到现有 Koishi 控制台 RPC 的生产适配器
- [x] 提供可在 Vitest 中控制结果和失败的 fake WorkspacePort
- [x] 工作区控制模块统一持有服务端工作区状态、当前操作者和当前会话
- [x] 控制模块恢复现有浏览器本地选择并保持无效选择 fallback 不变
- [x] 控制模块输出 sidebar、chat、composer、details 四个只读区域模型
- [x] 页面通过控制模块完成初始加载但视觉、DOM 和交互保持与基准一致
- [x] 控制模块核心行为具有 Vitest 覆盖并通过完整验证命令

## Answer

新增类型化 `WorkspacePort`、Koishi RPC 生产适配器、可控制结果与单次失败的 fake port，以及统一持有工作区、当前操作者、当前会话和浏览器选择的 Vue 工作区控制模块。页面初始加载、操作者切换、会话切换和工作区替换已接入控制模块，后续领域命令将在依赖票据中逐类迁移。

控制模块测试覆盖初始加载、四区域同修订、会话持久化、用户与机器人操作者切换、失败状态保留、无效选择 fallback、无参数 RPC fallback 和原子工作区替换。Ego Browser 对照结果保存在 `.scratch/webqq-modularization/evidence/02-workspace-controller/verification.json`；PNG 截图仅保存在本地，不进入提交。
