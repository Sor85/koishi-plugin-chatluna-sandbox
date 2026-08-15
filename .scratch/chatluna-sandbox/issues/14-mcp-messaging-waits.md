# 14 — 通过 MCP 发送消息并等待结果

**What to build:** 外部测试控制器可以使用具有 `interact` 权限的凭证，显式选择普通用户身份上传媒体、发送消息，并从命令返回的事件游标等待后续普通事件、消息或 ChatLuna 状态。被测插件无法区分该操作来自 MCP 还是 WebQQ。

**Blocked by:** 05 — 支持富媒体消息与安全媒体存储；10 — 显示 ChatLuna 思考状态与 Token 用量；13 — 提供安全的 MCP 只读端点

**Status:** resolved

- [x] `upload_media` 接受 Base64、MIME、文件名和可选摘要并返回媒体标识
- [x] `send_message` 要求明确的 `operatorId`、逻辑会话 ID、幂等 Key 和可选测试关联标识
- [x] 消息不携带冗余机器人 ID；OneBot 事件结果使用 `recipientBotId` 标识接收机器人
- [x] 消息只能引用已上传媒体或外部 HTTPS 地址，服务端不主动抓取外部地址
- [x] MCP 消息与同一用户通过 WebQQ 发送的消息生成等价 Koishi Session 和 OneBot 事件
- [x] 变更结果立即返回消息标识、场景版本和当前事件游标
- [x] `wait_for_event`、`wait_for_message` 和 `wait_for_chatluna_state` 从指定游标等待匹配事实
- [x] 等待超时返回稳定结构化结果，服务重启或缓冲区过期返回游标过期
- [x] 测试关联标识和 MCP 来源不会进入被测插件可见的数据

## Answer

已实现媒体预上传、显式操作者消息发送、凭证与 epoch 作用域幂等、共享场景事件游标，以及三类最长 120 秒的结构化等待工具。
