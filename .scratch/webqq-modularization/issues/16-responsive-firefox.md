# 16 — 收缩旧样式并完成 Firefox 验证

**What to build:** 完成单体样式的 contract 阶段，将全部响应式和降级规则放到明确的最终加载位置，并证明 Chrome 与 Firefox 行为一致。

**Blocked by:** 15 — 拆分区域 CSS

**Status:** ready-for-agent

- [ ] 1180px、768px 和 reduced-motion 等跨区域规则进入最终响应式样式所有权
- [ ] 响应式样式在所有区域和覆盖层样式之后加载
- [ ] 原单体样式不再保留已经迁移的重复规则
- [ ] 1400px、1000px、700px 下右侧栏、网格、滚动和浮层行为与基准一致
- [ ] Ego Browser 完成 Chromium 明暗主题和关键交互验证
- [ ] Playwright Firefox 完成布局、溢出、菜单、Dialog、Select、头像动画完成状态和控制台验证
- [ ] 不以跨浏览器字体抗锯齿差异作为失败，但不允许结构、尺寸或交互回归
- [ ] 完整类型检查、测试和构建通过
