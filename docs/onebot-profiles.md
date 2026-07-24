# OneBot 实现配置基线

OneBot Sandbox 只声明已经由沙盒领域服务真实实现的 action，不把上游完整 action 列表伪装为可用能力。`bot.internal` 与底层 `_request` 共用同一份基线和逐机器人能力覆盖。

## 基线快照

| 实现配置 | 文档快照日期 | 上游来源版本 | `get_version_info.app_name` |
| --- | --- | --- | --- |
| NapCat | 2026-07-24 | `NapNeko/NapCatQQ@33546b936e008c017b2b9c1c41a0bb4f9e86c5be` | `NapCat.Onebot` |
| LLBot | 2026-07-24 | `LLOneBot/LuckyLilliaBot@d6e2f485b8164597d04a2907d307739ecfcf4a55` | `LLOneBot` |

基线源码位于 `src/onebot-profiles.ts`。升级快照时必须同步更新来源版本、能力矩阵和 `tests/onebot-profiles.test.ts`。

## 能力分类

- `standard`：OneBot 11 标准查询、消息、申请和群管理 action
- `native`：Go-CQHTTP 兼容接口、实现扩展或沙盒为既有 QQ 交互提供的方法别名
- `supported: false`：上游实现存在但沙盒没有对应领域模型，调用时明确返回不支持原因
- `disabledCapabilities`：管理员针对单个机器人禁用基线中已有的 action，不影响其他机器人

`send_poke`、`friend_poke` 和 `group_poke` 解析到同一项能力；禁用 `send_poke` 时三个名称都会被拒绝。未知 action 不会伪造成功，而是返回带实现配置名称的明确错误。

消息事件按接收机器人的实现配置生成原始字段。两种配置都提供数字 `message_id`、`message_seq`、`message_format` 和 `font`；NapCat 消息事件额外提供 `real_id`，LLBot 仅在 `get_msg` 返回中提供 `real_id`。
