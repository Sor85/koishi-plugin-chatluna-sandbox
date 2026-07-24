# 13 — 收缩主页面为工作台装配模块

**What to build:** 删除所有已经迁移的旧实现，使 WebQQ 主页面只负责初始化控制、布局和覆盖层模块并装配三个主要视觉区域。

**Blocked by:** 12 — 提取左侧栏

**Status:** ready-for-human

- [x] 主页面只保留工作台根节点、全局外观属性和主要模块装配
- [x] 主页面不包含 Koishi RPC、完整 snapshot 访问或领域命令实现
- [x] 主页面不包含消息、目录、发送者动画、公告、成员或 Dialog 表单实现
- [x] 删除迁移后不再使用的状态、computed、watcher、DOM 引用和操作函数
- [x] 各 UI 模块仅通过已确认的只读模型和 emits 接口协作
- [x] 页面 DOM、CSS class、aria 标签、data 属性和行为与基准一致
- [x] 完成 Vue 阶段的 Ego Browser 全矩阵和 Playwright Firefox 兼容验证
- [x] 完整类型检查、测试和构建通过且不存在新增控制台异常

## Answer

新增 `createWebqqWorkspaceShell` 组合模块，统一派生左侧栏、聊天区、发送控件、消息列表、右侧信息栏、环境页和覆盖层模型，并承接选择、消息、关系、群组、公告、历史、媒体与环境管理命令。`page.vue` 从 505 行收缩到 131 行，只初始化 `WorkspacePort`、工作区控制器、布局模块和覆盖层引用，并装配现有视觉区域。

修正发送控件与消息列表的旧测试所有权，使其从真实父组件 `WebqqChatPane` 检查嵌套关系。定向测试、完整测试、类型检查和构建通过。Ego Browser 与 Playwright Firefox 已完成 1400px、1000px、700px 和恢复宽屏矩阵，DOM、网格、溢出及关键交互与基准一致。验证记录位于 `.scratch/webqq-modularization/evidence/13-page-shell/verification.json`。
