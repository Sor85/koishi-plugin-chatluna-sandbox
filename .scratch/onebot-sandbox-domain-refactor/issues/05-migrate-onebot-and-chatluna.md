# 05 — 迁移 OneBot 与 ChatLuna 到逻辑会话

**What to build:** 让虚拟 OneBot 适配器和 ChatLuna 状态完全使用统一参与者与逻辑会话。删除领域模型中的机器人归属字段不能改变机器人真实 QQ 身份，也不能让不同机器人的思考状态、Token 用量或协议事件互相串联。

**Blocked by:** 04 — 实现消息单份存储与机器人事件投递

**Status:** ready-for-human

- [x] `bot.selfId`、`get_login_info` 返回的 QQ ID 和所有 OneBot 事件的 `self_id` 始终等于目标机器人真实身份
- [x] OneBot 私聊和群聊发送、查询、撤回、资料修改、关系申请及群操作都使用新的参与者与逻辑会话模型
- [x] 机器人 action 以自身真实 `selfId` 执行，不依赖 WebQQ 当前操作者或普通用户代理
- [x] 同一逻辑会话中的多个机器人分别维护 ChatLuna 思考状态和 Token 用量
- [x] 切换当前操作者不会改变 ChatLuna 状态归属，无法确定机器人或会话的状态不显示
- [x] OneBot bridge 和 ChatLuna 多机器人回归测试覆盖用户、机器人、私聊和群聊路径

## Answer

- 虚拟 OneBot 机器人继续以各自真实 `selfId` 注册运行时，`get_login_info` 与消息、通知、申请事件的 `self_id` 不受逻辑会话重构影响
- 私聊发送使用稳定参与者对会话 ID，群聊发送使用 `group:<groupId>`，标准 Koishi 方法与 OneBot action 共用控制服务完成查询、撤回、资料和关系群操作
- 多机器人 bridge 回归验证同一群消息向不同机器人复用消息 ID，同时各 Session 和 OneBot 原始事件保留各自 `selfId`
- 新增 `SandboxChatLunaStateStore`，使用 `botParticipantId + conversationId` 关联思考状态与 Token 用量，不依赖消息级机器人字段或当前操作者
- ChatLuna core 与 chatluna-character 事件均按 Session 中真实机器人和逻辑 channel 解析；`model-usage` 缺少唯一机器人映射时忽略，错误事件无法判定归属时删除瞬时状态而不串联
- 当前操作者视角查询不参与状态键计算，切换用户或机器人不会移动状态；删除机器人或逻辑会话会清理对应状态
- Standards 审查 0 项问题；Spec 审查 0 项问题。当前会话禁止派生子代理，因此由主线程按同样两个维度核对
- 验证通过：`yarn test`（30 个文件、116 个测试）、`yarn typecheck`、`yarn build`、`git diff --check`
