# OneBot 实现配置基线

OneBot Sandbox 只声明已经由沙盒领域服务真实实现的 action，不把上游完整 action 列表伪装为可用能力。`bot.internal` 与底层 `_request` 共用同一份基线和逐机器人能力覆盖。

当前基线版本信息统一维护在项目 `README.md`。基线源码位于 `src/onebot-profiles.ts`；升级快照时必须同步更新 README、能力矩阵和 `tests/onebot-profiles.test.ts`。

## 能力分类

- `standard`：OneBot 11 标准查询、消息、申请和群管理 action
- `native`：Go-CQHTTP 兼容接口、实现扩展或沙盒为既有 QQ 交互提供的方法别名
- `supported: false`：上游实现存在但沙盒没有对应领域模型，调用时明确返回不支持原因
- `id`：稳定的语义能力标识，例如 `group.notice.delete`
- `action`：对应实现真实暴露的外部 action，例如 NapCat 的 `_del_group_notice` 与 LLBot 的 `_delete_group_notice`
- `handler`：沙盒内部共享的领域处理器，同一语义能力可以由不同 action 和参数结构进入
- `description`：面向能力覆盖界面的简短用途说明
- `disabledCapabilities`：管理员针对单个机器人按语义能力 `id` 禁用能力，不影响其他机器人

NapCat 与 LLBot 都提供 `send_poke`、`friend_poke` 和 `group_poke`。沙盒将三个 action 解析到同一项“发送戳一戳”能力；禁用 `send_poke` 时三个名称都会被拒绝。能力覆盖搜索支持按 action、别名、语义 ID、作用说明和不支持原因筛选，因此搜索 `poke` 或“戳一戳”都能定位该能力。未知 action 不会伪造成功，而是返回带实现配置名称的明确错误。

## 实现差异示例

| 语义能力 | NapCat | LLBot |
| --- | --- | --- |
| 获取私聊历史 | `get_friend_msg_history` | `get_friend_msg_history` |
| 获取群聊历史 | `get_group_msg_history` | `get_group_msg_history` |
| 获取好友分组 | `get_friends_with_category` | `get_friends_with_category` |
| 获取最近会话 | `get_recent_contact` | 不提供此 action |
| 删除群公告 | `_del_group_notice` | `_delete_group_notice` |
| 批量踢出群成员 | `set_group_kick_members`，参数 `user_id` | `batch_delete_group_member`，参数 `user_ids` |
| 获取群相册列表（沙盒暂未实现） | `get_qun_album_list` | `get_group_album_list` |

`get_friend_msg_history` 和 `get_group_msg_history` 复用沙盒逻辑会话的唯一消息历史，按当前机器人可见性过滤，并支持 `message_seq`、`count` 与反向排序参数。历史消息与实时消息使用同一套 Koishi 元素到 OneBot 消息段转换，因此图片等媒体不会降级为 `<img>` 文本。

沙盒尚未维护独立的 QQ 好友分组，因此 `get_friends_with_category` 会把当前机器人的真实好友关系放入“我的好友”默认分组。NapCat 的 `get_recent_contact` 从当前机器人可见的逻辑会话和最后一条消息实时生成，并遵守 `count` 参数；LLBot 基线不声明这个 action，避免掩盖两种实现的真实差异。

能力覆盖界面同时展示每项能力的作用说明、已支持能力和暂未实现能力。暂未实现项不可勾选，并直接显示缺少的沙盒领域模型，避免把上游存在的 action 误报为可用。

消息事件按接收机器人的实现配置生成原始字段。两种配置都提供数字 `message_id`、`message_seq`、`message_format` 和 `font`；NapCat 消息事件额外提供 `real_id`，LLBot 仅在 `get_msg` 返回中提供 `real_id`。
