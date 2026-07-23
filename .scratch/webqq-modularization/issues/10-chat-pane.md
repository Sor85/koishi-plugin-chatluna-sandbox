# 10 — 提取聊天区域

**What to build:** 将聊天顶栏、消息列表和发送控件组合成一个完整聊天区域，使主页面不再持有聊天交互实现。

**Blocked by:** 09 — 提取聊天消息列表

**Status:** ready-for-human

- [x] 聊天区域使用现有 main 根元素且不改变根网格关系
- [x] 聊天顶栏头像、标题、副标题和右侧栏三点按钮保持现有 DOM 与视觉
- [x] 消息列表和发送控件作为聊天区域内部模块组合
- [x] 回复状态和消息列表与发送控件之间的协作保持现有行为
- [x] 当前会话变化通过显式 watcher 精确重置现有聊天本地状态
- [x] 聊天区域不访问完整 snapshot，也不直接调用 WorkspacePort 或 Koishi RPC
- [x] 主页面不再包含消息渲染、发送控件和聊天顶栏实现
- [x] 类型检查、完整测试、构建和 Ego Browser 聊天路径验证通过

## Answer

新增 `WebqqChatPane`，沿用原 `main.webqq-chat` 根节点组合聊天顶栏、`WebqqMessageList` 和 `WebqqComposer`。引用选择由聊天区域本地协调，并通过会话 ID watcher 精确清理；控制器调用仍由页面事件处理，聊天区域不引用 WorkspacePort 或 Koishi RPC。

Ego Browser 验证页面仅有一个聊天 main 根节点，测试群顶栏、消息列表、发送控件和右侧栏按钮均存在，发送 `票据10聊天区域验证` 后消息正常出现且无发送错误。验证记录位于 `.scratch/webqq-modularization/evidence/10-chat-pane/verification.json`，PNG 仅保存在本地。
