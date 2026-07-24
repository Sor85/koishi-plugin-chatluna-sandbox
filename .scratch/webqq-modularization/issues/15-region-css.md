# 15 — 拆分区域 CSS

**What to build:** 将左侧栏、聊天、消息、发送控件和右侧信息栏样式分别归属对应视觉区域，使后续视觉修改能够在单一区域内完成。

**Blocked by:** 14 — 拆分共享 CSS 基础

**Status:** ready-for-human

- [x] 左侧栏和目录样式迁移到 sidebar 所有权
- [x] 聊天顶栏和聊天容器样式迁移到 chat 所有权
- [x] 消息行、消息簇、引用、媒体和系统事件样式迁移到 messages 所有权
- [x] 发送胶囊、参与者头像组、输入、附件和引用预览样式迁移到 composer 所有权
- [x] 群信息、私聊信息、公告和成员列表样式迁移到 details 所有权
- [x] 同一选择器不在多个区域文件中产生新的重复定义
- [x] 不重命名现有 class、不改声明值、不引入 scoped CSS 或 CSS Modules
- [x] 每个区域完成 Ego Browser 基准对照并通过完整验证命令

## Answer

新增 `webqq-sidebar.css`、`webqq-chat.css`、`webqq-messages.css`、`webqq-composer.css` 和 `webqq-details.css`，样式入口按左侧栏、聊天、消息、发送控件、右侧信息栏的顺序加载，并在其后继续加载覆盖层与现有响应式覆盖。跨区域的 conversations/profile flex 布局和明暗主题区域背景归回 `webqq-workspace.css`。

通过 PostCSS 声明级对照确认拆分前后仍为 1245 条声明，零缺失、零新增；带 `@media`/`@keyframes` 祖先上下文的检查确认五个区域文件没有跨文件重复选择器。定向测试、完整测试、类型检查和构建通过；Ego Browser 已完成各区域尺寸、主题和交互基准对照。验证记录位于 `.scratch/webqq-modularization/evidence/15-region-css/verification.json`。
