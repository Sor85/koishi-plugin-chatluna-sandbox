# 13 — 收缩主页面为工作台装配模块

**What to build:** 删除所有已经迁移的旧实现，使 WebQQ 主页面只负责初始化控制、布局和覆盖层模块并装配三个主要视觉区域。

**Blocked by:** 12 — 提取左侧栏

**Status:** ready-for-agent

- [ ] 主页面只保留工作台根节点、全局外观属性和主要模块装配
- [ ] 主页面不包含 Koishi RPC、完整 snapshot 访问或领域命令实现
- [ ] 主页面不包含消息、目录、发送者动画、公告、成员或 Dialog 表单实现
- [ ] 删除迁移后不再使用的状态、computed、watcher、DOM 引用和操作函数
- [ ] 各 UI 模块仅通过已确认的只读模型和 emits 接口协作
- [ ] 页面 DOM、CSS class、aria 标签、data 属性和行为与基准一致
- [ ] 完成 Vue 阶段的 Ego Browser 全矩阵和 Playwright Firefox 兼容验证
- [ ] 完整类型检查、测试和构建通过且不存在新增控制台异常
