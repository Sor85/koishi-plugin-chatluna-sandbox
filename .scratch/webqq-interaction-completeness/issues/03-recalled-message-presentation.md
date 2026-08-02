# 03 — 实现可切换的撤回消息呈现

**What to build:** 按 ADR-0049 将撤回迁移为消息生命周期状态，并增加默认开启的 `webQQMarkRecalledMessages` 展示配置。

**Blocked by:** 01 — 补齐群消息表情回应 UI

**Status:** resolved

- [x] 权威场景保留撤回前正文、媒体、回复、回应和 ChatLuna 思考
- [x] 普通 OneBot `get_msg` 和机器人查询拒绝读取撤回原文
- [x] 默认开启时保留原气泡，文本和媒体显示撤回线并整体弱化
- [x] 默认开启时思考折叠区保持正常可读，已有回应只读展示
- [x] 关闭时隐藏原气泡、思考和回应，显示结构化撤回事件
- [x] 切换配置不销毁数据，重新开启后恢复原展示
- [x] 发出 `message.recalled` 和 `scene.changed`
- [x] 修复撤回与稍后 ChatLuna 归档的竞态，禁止思考挂到更早消息
- [x] 更新场景、OneBot、MCP、WebUI 和持久化测试

## Answer

已按 ADR-0049 将撤回从灰条 `event.type=recall` 改为消息生命周期状态，并增加默认开启的 `webQQMarkRecalledMessages`。

### 实现摘要

- 领域：`SandboxMessage.lifecycle` + `isRecalledMessage`；`recallVisibleMessage` 只标记 `status=recalled` 并保留正文/媒体/回复/回应/思考，不再改写 content 或删除媒体。
- OneBot：`get_msg` / `getMessage` / 历史 / 最近联系人 / `getMessageList` 不泄露撤回原文；`set_msg_emoji_like` 仍可定位消息后由领域返回“已撤回只读”。
- MCP：场景 diff 在 `scene.changed` 之外补发 `message.recalled`（带权威消息记录）。
- ChatLuna：归档跳过 `event`（戳一戳）但不再因撤回状态跳过原消息，避免思考挂到更早消息。
- WebQQ：`markRecalledMessages` 来自外观配置；开启时 `is-recalled` 弱化+划线、思考可读、回应只读；关闭时渲染结构化撤回事件并隐藏原文/思考/回应。
- 配置：`webQQMarkRecalledMessages` 默认 `true`，只影响展示。

### 验证

- `yarn vitest run tests/recalled-message-presentation.test.ts tests/message-delivery.test.ts tests/onebot-bridge.test.ts tests/message-reactions.test.ts tests/message-cluster.test.ts tests/config.test.ts tests/webqq-message-list.test.ts tests/chatluna-state.test.ts tests/console-adapter.test.ts tests/workspace-controller.test.ts tests/group-mention.test.ts tests/mcp-service.test.ts` 通过
- `yarn typecheck` 通过
- `yarn build` 通过

### 浏览器验证

- Ego Browser（Chrome）：验证默认模式保留原气泡、正文删除线、回应只读；临时关闭配置并重启后，原气泡与回应隐藏，仅显示结构化撤回事件。
- Playwright CLI（Firefox）：验证结构化撤回事件与后续消息交互正常，页面无控制台错误。

## Comments

- 2026-08-02：agent 完成 issue 03 垂直切片；直接删除旧灰条模型与相关测试假设；未提交 git。
