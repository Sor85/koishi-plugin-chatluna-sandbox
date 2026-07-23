# 17 — 迁移辅助模块并完成最终集成验证

**What to build:** 将现有 WebQQ 专用辅助逻辑归入统一功能目录，完成路径 contract 和整个模块化工作的最终行为、架构与浏览器验证。

**Blocked by:** 16 — 收缩旧样式并完成 Firefox 验证

**Status:** ready-for-human

- [x] WebQQ 专用状态、消息簇、头像堆叠、关系目录、通知和菜单辅助模块移动到统一功能目录
- [x] 路径迁移只更新 import 和测试引用，不改变辅助逻辑行为或命名
- [x] 删除迁移后为空、重复或不再使用的旧路径文件
- [x] 检查 UI 模块不存在直接 Koishi RPC、完整 snapshot 访问或跨区域 DOM 操作
- [x] 检查主页面只承担工作台装配且各模块接口符合规格和 ADR
- [x] 运行所有 targeted tests、完整测试、类型检查和生产构建
- [x] 使用 Ego Browser 完成 Chromium 全矩阵、视觉基线和控制台验证
- [x] 使用 Playwright Firefox 完成最终兼容验证，并记录可合并结果

## Answer

将 `workspace-state`、`message-cluster`、`user-stack`、`relationship-directory`、`notification-requests`、`friend-menu` 和 `group-menu` 七个纯辅助模块迁移到 `client/webqq/`，只调整文件路径、类型路径、生产 import 和测试 import，旧路径文件全部删除。新增路径契约测试确保辅助模块统一归属且旧入口不会重新出现。

最终架构审查发现左侧栏、消息列表、发送控件、通知和创建弹层仍接收完整 `SandboxSnapshot`，因此将快照派生集中到 `workspace-shell`，UI 改为字段级只读模型；主页面继续保持 131 行装配入口，UI 模块不存在直接 Koishi RPC 或工作区控制器访问。新增架构契约测试防止完整快照重新渗入 UI。

定向测试通过，完整测试为 28 个文件、96 个测试通过，类型检查和生产构建通过。Ego Browser Chromium 与 Playwright Firefox 均完成 1400px、1000px、700px 和恢复宽屏矩阵，页面无横向溢出；通知、添加账号 Popover/Select、头像展开动画和机器人右键菜单均通过。Firefox 控制台为 0 错误、0 组件告警，仅保留 Koishi 开发环境既有的 10 条路由匹配告警。可合并结果记录于 `.scratch/webqq-modularization/evidence/17-helper-migration-final-verification/verification.json`，PNG 仅保存在本地。
