# 05 — 迁移 OneBot 与 ChatLuna 到逻辑会话

**What to build:** 让虚拟 OneBot 适配器和 ChatLuna 状态完全使用统一参与者与逻辑会话。删除领域模型中的机器人归属字段不能改变机器人真实 QQ 身份，也不能让不同机器人的思考状态、Token 用量或协议事件互相串联。

**Blocked by:** 04 — 实现消息单份存储与机器人事件投递

**Status:** ready-for-agent

- [ ] `bot.selfId`、`get_login_info` 返回的 QQ ID 和所有 OneBot 事件的 `self_id` 始终等于目标机器人真实身份
- [ ] OneBot 私聊和群聊发送、查询、撤回、资料修改、关系申请及群操作都使用新的参与者与逻辑会话模型
- [ ] 机器人 action 以自身真实 `selfId` 执行，不依赖 WebQQ 当前操作者或普通用户代理
- [ ] 同一逻辑会话中的多个机器人分别维护 ChatLuna 思考状态和 Token 用量
- [ ] 切换当前操作者不会改变 ChatLuna 状态归属，无法确定机器人或会话的状态不显示
- [ ] OneBot bridge 和 ChatLuna 多机器人回归测试覆盖用户、机器人、私聊和群聊路径
