# 17 — 迁移辅助模块并完成最终集成验证

**What to build:** 将现有 WebQQ 专用辅助逻辑归入统一功能目录，完成路径 contract 和整个模块化工作的最终行为、架构与浏览器验证。

**Blocked by:** 16 — 收缩旧样式并完成 Firefox 验证

**Status:** ready-for-agent

- [ ] WebQQ 专用状态、消息簇、头像堆叠、关系目录、通知和菜单辅助模块移动到统一功能目录
- [ ] 路径迁移只更新 import 和测试引用，不改变辅助逻辑行为或命名
- [ ] 删除迁移后为空、重复或不再使用的旧路径文件
- [ ] 检查 UI 模块不存在直接 Koishi RPC、完整 snapshot 访问或跨区域 DOM 操作
- [ ] 检查主页面只承担工作台装配且各模块接口符合规格和 ADR
- [ ] 运行所有 targeted tests、完整测试、类型检查和生产构建
- [ ] 使用 Ego Browser 完成 Chromium 全矩阵、视觉基线和控制台验证
- [ ] 使用 Playwright Firefox 完成最终兼容验证，并记录可合并结果
