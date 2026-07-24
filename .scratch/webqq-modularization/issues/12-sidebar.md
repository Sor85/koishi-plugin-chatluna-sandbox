# 12 — 提取左侧栏

**What to build:** 将导航、最近会话、好友、群组、通知和搜索迁移为独立左侧栏，使目录和关系入口能够单独维护且保持现有网格与交互。

**Blocked by:** 11 — 提取右侧信息栏

**Status:** ready-for-human

- [x] 左侧栏使用 Vue Fragment 输出现有导航 rail 和 conversations 两个网格子节点
- [x] 不增加改变工作区网格或 CSS 直接子元素关系的包裹节点
- [x] 最近、好友、群组和通知入口保持现有内容、顺序、图标和关系标记
- [x] 搜索词、当前目录标签和通知浮层状态由左侧栏本地管理
- [x] 好友和群组 ContextMenu、添加群组 Popover 仍与原触发元素同区域渲染
- [x] 左侧栏只接收 sidebar 只读模型并通过事件表达选择和领域操作
- [x] 主页面不再包含导航、目录、搜索和通知模板
- [x] 目录与菜单单元测试、完整验证命令和 Ego Browser 验证通过

## Answer

新增 `WebqqSidebar`，使用 Vue Fragment 保持 `webqq-rail` 与 `webqq-conversations` 仍为工作区网格的直接子节点。搜索词、目录标签、通知标签及请求处理状态迁移到左侧栏本地；好友、群组、会话和通知操作通过明确事件交由页面控制器执行。主页面不再包含导航、目录、搜索、通知和对应菜单模板。

定向测试、完整测试、类型检查和构建通过。Ego Browser 已验证导航、目录、通知浮层和宽窄屏网格；Firefox 验证期间发现并修复 `IconPlus` 缺失导入，刷新后组件解析告警清零。验证记录位于 `.scratch/webqq-modularization/evidence/12-sidebar/verification.json`。
