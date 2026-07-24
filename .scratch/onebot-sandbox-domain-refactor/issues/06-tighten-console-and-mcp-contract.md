# 06 — 收紧 Console RPC 与未来 MCP 控制合同

**What to build:** 让 Console RPC 成为共享测试控制模块的清晰适配器，并为后续 MCP 提供稳定合同。交互请求显式提供参与者操作者，环境准备没有操作者，逻辑消息和会话不携带观察机器人字段，机器人事件单独标明接收者。

**Blocked by:** 04 — 实现消息单份存储与机器人事件投递

**Status:** ready-for-human

- [x] 工作区、好友操作、群操作、公告、历史和媒体请求统一使用 `operatorId`
- [x] 消息发送请求只需要操作者、逻辑会话和消息内容或媒体，不接受独立发送者或机器人归属
- [x] 环境管理请求不接受 `operatorId`，执行环境准备时不产生参与者交互事件
- [x] 工作区返回稳定逻辑会话和单份消息，消息中不包含冗余机器人 ID
- [x] 机器人事件输出使用 `recipientBotId` 表达投递对象，为未来 MCP 事件过滤提供稳定语义
- [x] 旧 RPC 字段在类型与运行时合同中均不可用，Console 适配器测试验证所有新合同

## Answer

- Console 工作区、消息、媒体、公告、好友与群组操作统一接收 `operatorId`；显式传入不存在的操作者立即报错，不再回退到默认用户
- 发送与媒体发送输入只保留操作者、逻辑会话和内容或媒体数据；`senderId`、`botId`、`actorUserId`、`userId` 与 `currentUserId` 在运行时统一拒绝
- 环境管理合同不含操作者字段；创建测试用户不会触发 Koishi 消息中间件，确保环境准备不会伪造参与者交互
- 工作区返回单份逻辑会话和消息，并按操作者可见会话过滤 ChatLuna 状态，避免向无权参与者泄露机器人思考或 Token 状态
- 新增 `onebot-sandbox/bot-deliveries` 查询接口，使用 `recipientBotId` 和可选 `messageId` 过滤机器人投递，为后续 MCP 读取事件提供稳定合同
- 类型定义删除消息级 `botId`，控制台适配器回归测试覆盖旧字段拒绝、稳定工作区、状态可见性、环境静默和机器人投递过滤
- Standards 审查 0 项问题；Spec 审查 0 项问题。当前会话禁止派生子代理，因此由主线程按同样两个维度核对
- 验证通过：`yarn test`（30 个文件、116 个测试）、`yarn typecheck`、`yarn build`、`git diff --check`
