# 16 — 收缩旧样式并完成 Firefox 验证

**What to build:** 完成单体样式的 contract 阶段，将全部响应式和降级规则放到明确的最终加载位置，并证明 Chrome 与 Firefox 行为一致。

**Blocked by:** 15 — 拆分区域 CSS

**Status:** ready-for-human

- [x] 1180px、768px 和 reduced-motion 等跨区域规则进入最终响应式样式所有权
- [x] 响应式样式在所有区域和覆盖层样式之后加载
- [x] 原单体样式不再保留已经迁移的重复规则
- [x] 1400px、1000px、700px 下右侧栏、网格、滚动和浮层行为与基准一致
- [x] Ego Browser 完成 Chromium 明暗主题和关键交互验证
- [x] Playwright Firefox 完成布局、溢出、菜单、Dialog、Select、头像动画完成状态和控制台验证
- [x] 不以跨浏览器字体抗锯齿差异作为失败，但不允许结构、尺寸或交互回归
- [x] 完整类型检查、测试和构建通过

## Answer

新增最终加载的 `webqq-responsive.css`，统一持有 1180px、768px 与 reduced-motion 规则；`style.css` 仅保留 Tailwind 和按所有权排序的样式导入，响应式覆盖位于全部区域及覆盖层之后。声明级回归检查保持 1245 条声明不变。

Ego Browser Chromium 与 Playwright Firefox 均完成 1400px、1000px、700px 和恢复宽屏矩阵，页面无横向溢出；明暗主题、通知浮层、头像展开动画、头像右键菜单、Dialog 和 Select 均通过。Firefox 验证发现并修复左侧栏 `IconPlus` 缺失导入，刷新后控制台为 0 错误、0 组件告警，仅保留 Koishi 开发环境既有的 10 条路由匹配告警。完整测试为 26 个文件、92 个测试通过，类型检查和构建通过。
