# 03 — 实现可切换的撤回消息呈现

**What to build:** 按 ADR-0049 将撤回迁移为消息生命周期状态，并增加默认开启的 `webQQMarkRecalledMessages` 展示配置。

**Blocked by:** 01 — 补齐群消息表情回应 UI

**Status:** ready-for-agent

- [ ] 权威场景保留撤回前正文、媒体、回复、回应和 ChatLuna 思考
- [ ] 普通 OneBot `get_msg` 和机器人查询拒绝读取撤回原文
- [ ] 默认开启时保留原气泡，文本和媒体显示撤回线并整体弱化
- [ ] 默认开启时思考折叠区保持正常可读，已有回应只读展示
- [ ] 关闭时隐藏原气泡、思考和回应，显示结构化撤回事件
- [ ] 切换配置不销毁数据，重新开启后恢复原展示
- [ ] 发出 `message.recalled` 和 `scene.changed`
- [ ] 修复撤回与稍后 ChatLuna 归档的竞态，禁止思考挂到更早消息
- [ ] 更新场景、OneBot、MCP、WebUI 和持久化测试
