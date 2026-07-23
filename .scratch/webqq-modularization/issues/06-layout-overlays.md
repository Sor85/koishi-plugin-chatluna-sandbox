# 06 — 提取工作区布局与跨区域覆盖层

**What to build:** 将跨区域布局状态和共享 Dialog 从主页面收敛为独立模块，同时保持右侧栏响应式、浮层定位和表单体验不变。

**Blocked by:** 05 — 迁移环境管理并关闭旧 RPC 入口

**Status:** ready-for-human

- [x] 工作区布局模块统一管理浏览器宽度和右侧信息栏打开、关闭状态
- [x] 浏览器缩窄时自动关闭右侧信息栏，恢复宽屏时自动打开
- [x] 聊天顶栏三点按钮和右侧栏关闭入口继续操作同一布局状态
- [x] 跨区域实体编辑、删除、好友备注、群名称和群名片 Dialog 由统一 OverlayHost 渲染
- [x] OverlayHost 使用窄状态和结构化提交事件，不访问完整工作区状态
- [x] ContextMenu、Tooltip 和 Popover 仍与原触发元素同区域渲染且定位不变
- [x] 现有 shadcn-vue Dialog、Select 和表单样式保持一致
- [x] 布局状态测试和 Ego Browser 宽窄屏、Dialog 验证通过

## Answer

新增工作区布局模块统一持有宽屏检测和右侧信息栏偏好，聊天顶栏与右侧栏关闭入口继续调用同一组 `toggleDetails`、`closeDetails` 和 `resetDetails` 接口。布局测试覆盖手动切换、缩窄自动关闭、恢复宽屏自动打开和会话重置。

实体编辑/删除、好友备注、群名称和群名片 Dialog 已集中到 `WorkspaceOverlayHost`。覆盖层只接收 users、bots、groups、强调色和结构化命令事件，不访问完整 snapshot；ContextMenu、Tooltip 和 Popover 模板未移动。Ego Browser 验证记录位于 `.scratch/webqq-modularization/evidence/06-layout-overlays/verification.json`，PNG 仅保存在本地。
