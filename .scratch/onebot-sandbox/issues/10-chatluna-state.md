# 10 — 显示 ChatLuna 思考状态与 Token 用量

**What to build:** 在 WebQQ 会话中保留 ChatLuna 的思考状态和模型 Token 用量，并按虚拟机器人及具体会话精确关联。多个机器人或多个会话并发响应时，各自状态不会覆盖或附着到错误消息。

**Blocked by:** 09 — 实现 NapCat、LLBot 私有接口与能力覆盖

**Status:** ready-for-agent

- [ ] WebQQ 在对应聊天中显示 ChatLuna 当前思考状态
- [ ] WebQQ 在对应聊天中显示可获得的模型 Token 用量
- [ ] 状态使用机器人 self ID、会话类型、对端标识和会话标识共同关联
- [ ] 同一机器人多个会话并发时状态彼此隔离
- [ ] 多个机器人并发时状态彼此隔离
- [ ] 无法确定归属的 ChatLuna 事件不会显示成全局状态
- [ ] 快速切换会话时状态仍附着在正确会话
- [ ] Chrome 与 Firefox 中均可观察状态更新且无控制台错误
