# 14 — 拆分共享 CSS 基础

**What to build:** 在不改变现有 cascade 和视觉结果的前提下，将 WebQQ 设计令牌、工作区布局、共享视觉原语和覆盖层样式从单体样式中独立出来。

**Blocked by:** 13 — 收缩主页面为工作台装配模块

**Status:** ready-for-human

- [x] 样式入口按明确顺序加载已拆出的共享样式
- [x] 颜色、间距、边框、阴影和主题变量进入设计令牌样式所有权
- [x] Koishi 页面容器、根网格和跨区域布局进入工作区样式所有权
- [x] 被两个以上区域复用的头像、Bot 徽标、状态标签、图标按钮和滚动条进入 primitives
- [x] Dialog 和其他跨区域覆盖层样式进入 overlays
- [x] shadcn-vue 自身样式不被复制或重新实现
- [x] 原选择器、声明值和加载优先级保持不变
- [x] Ego Browser 基准对照、完整测试、类型检查和构建通过

## Answer

新增 `webqq-tokens.css`、`webqq-workspace.css`、`webqq-primitives.css` 和 `webqq-overlays.css`，由 `style.css` 在 Tailwind 之后按令牌、工作区、共享原语、覆盖层的顺序加载。迁移内容包括主题变量、Koishi 容器与根网格、共享头像与 Bot 徽标、图标按钮、自定义滚动条、无障碍隐藏工具类及跨区域 Dialog 操作栏；未复制 shadcn-vue 样式。

通过 PostCSS 声明级对照确认拆分前后均为 1245 条声明，零缺失、零新增且声明值完全一致。定向测试、完整测试、类型检查和构建通过；Ego Browser 的完整尺寸矩阵、明暗主题和关键浮层对照均与基准一致。验证记录位于 `.scratch/webqq-modularization/evidence/14-shared-css/verification.json`。
