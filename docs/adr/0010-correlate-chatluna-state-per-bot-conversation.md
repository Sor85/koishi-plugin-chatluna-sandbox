# ChatLuna 状态按 Bot 和会话关联

ChatLuna 思考状态与 Token 用量使用 Bot `selfId`、会话类型、对端 ID 和 `conversationId` 共同关联到具体聊天，允许多个机器人并发思考。无法确定归属的事件不得显示为全局状态，以免在多机器人或多会话环境中把指标附着到错误消息。
