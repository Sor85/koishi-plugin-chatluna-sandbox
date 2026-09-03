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
| 获取群禁言列表 | `get_group_shut_list` | `get_group_shut_list` |
| 获取最近会话 | `get_recent_contact` | 不提供此 action |
| 删除群公告 | `_del_group_notice` | `_delete_group_notice` |
| 获取群公告 | `_get_group_notice`，`message` 同时给 `image` 与 `images`，不给 `settings` 与 `read_num` | `_get_group_notice`，`message` 只给 `images`，`settings` 五个布尔必给 |
| 获取群系统消息 | `get_group_system_msg`，收 `count`，返回 `invited_requests` / `InvitedRequest` / `join_requests` 三个桶，两个桶共用同一份字段 | `get_group_system_msg`，无参，返回两个桶，入群申请用 `requester_*`、群邀请用 `invitor_*` |
| 修改好友备注 | `set_friend_remark` | `set_friend_remark` |
| 获取表情回应参与者 | `fetch_emoji_like`，要 `emojiId` 与 `emojiType`（均为 camelCase、均必填），额外返回 `result` 与 `errMsg` | `fetch_emoji_like`，收 `emoji_id` 或 `emojiId` 择一、不要 `emojiType`，不返回 `result` 与 `errMsg` |
| 批量踢出群成员 | `set_group_kick_members`，参数 `user_id` | `batch_delete_group_member`，参数 `user_ids` |
| 获取群相册列表（沙盒暂未实现） | `get_qun_album_list` | `get_group_album_list` |

两边上游都不存在不带下划线的 `get_group_notice`，沙盒也不声明它。

四项按调用方机器人的可见性过滤，不是全场景可读：群公告只返回机器人所在群的（不在群里时按 `_del_group_notice` 同一句拒绝，而不是返回空数组）；群系统消息只返回机器人有权审批的入群申请与发给它自己的群邀请，判据与 `set_group_add_request` 同源，因此列出来的 `request_id` 可以直接当审批 `flag` 用；表情回应只允许查机器人可读的消息，已撤回的消息按「消息已撤回」拒绝；好友备注只能改机器人自己的好友关系。

沙盒没有公告图片、发布设置与阅读数，因此两种配置的图片数组都是空的，LLBot 必给的 `settings` 五项按 `false` 返回、NapCat 的可选 `settings` 与 `read_num` 直接不出现。`publish_time` 是秒级整数，顺序就是群公告的存储顺序（最新在前）。群系统消息的 `checked` 与 `actor` 由场景推出：沙盒只保存待处理申请，审批后那条申请随即消失，因此 `checked` 为 `false`、`actor` 为 `0`，与上游未处理时一致。NapCat 的 `count` 限的是一次取多少条系统消息的总量，分桶发生在截断之后；LLBot 上游对没有 `payloadSchema` 的 action 不校验参数，因此传了 `count` 会被忽略而不是报错。

`fetch_emoji_like` 有两处刻意与上游不同，都写在能力作用说明里：`nickName` 返回参与者真名而不是复刻 LLBot 上游写死的空串（沙盒有真实名字，测试者要能核对贴表情的是谁）；沙盒不实现真正的游标，`cookie` 恒为空串、`isFirstPage` 恒为真，参与者多于 `count` 时按它截断并让 `isLastPage` 为 `false`。`emojiType` 只做必填校验、不参与查找——表情回应参与者按 emoji 聚合，类型不影响命中，上游也不校验类型与 `emojiId` 是否自洽。

`get_friend_msg_history` 和 `get_group_msg_history` 复用沙盒逻辑会话的唯一消息历史，按当前机器人可见性过滤，并支持 `message_seq`、`count` 与反向排序参数。`message_seq` 游标在完整逻辑会话中解析，不使用 WebQQ 最近消息窗口；翻到最早一条之后返回空列表。历史消息与实时消息使用同一套 Koishi 元素到 OneBot 消息段转换，因此图片等媒体不会降级为 `<img>` 文本。

沙盒尚未维护独立的 QQ 好友分组，因此 `get_friends_with_category` 会把当前机器人的真实好友关系放入“我的好友”默认分组。NapCat 的 `get_recent_contact` 从当前机器人可见的逻辑会话和最后一条消息实时生成，并遵守 `count` 参数；LLBot 基线不声明这个 action，避免掩盖两种实现的真实差异。

能力覆盖界面同时展示每项能力的作用说明、已支持能力和暂未实现能力。暂未实现项不可勾选，并直接显示缺少的沙盒领域模型，避免把上游存在的 action 误报为可用。

消息事件按接收机器人的实现配置生成原始字段。两种配置都提供数字 `message_id`、`message_seq`、`message_format` 和 `font`；NapCat 消息事件额外提供 `real_id`，LLBot 仅在 `get_msg` 返回中提供 `real_id`。

OneBot 协议层统一向插件返回数字 `message_id`：消息事件、`send_*` action、`get_msg`、消息历史和 `reply` 段使用同一 sequence。接收 MessageId 的 action 同时接受数字 sequence 和沙盒领域消息 ID，便于调试与内部控制；`SandboxMessage.id`、Koishi Session `messageId`、WebQQ 和 MCP 仍使用沙盒领域消息 ID，不额外保存重复序号字段。

机器人出站图片会在写入逻辑会话前转换为沙盒受控媒体。当前支持 data URI、`base64://`、机器人可见的 `sandbox-media://` 引用以及 HTTP/HTTPS 地址；远程媒体下载受 10 秒超时、10 MB 大小限制和媒体 MIME 白名单约束。`sticker` 按图片处理，本地文件路径仍不会被沙盒读取。

## 有状态 action 与可观测结果

声明为支持的有状态 action 必须把结果写入沙盒场景，插件和外部测试控制器可以从领域状态复查执行结果，而不是只能相信 action 返回了 `status: ok`：

- `set_group_special_title` 写入群成员专属头衔，`get_group_member_info`、`get_group_member_list` 与群消息事件的 `sender.title` 返回同一份头衔；与真实 QQ 一致只有群主可以授予，传空字符串表示清除。
- `set_group_ban` 写入群成员禁言到期时间，`get_group_shut_list` 返回当前仍在禁言中的成员，`get_group_member_info` 的 `shut_up_timestamp` 返回秒级到期时间戳；`duration` 为 0 表示解除禁言，禁言时长上限为 30 天。
- `set_msg_emoji_like` 按 emoji 聚合表情回应参与者并写入消息，`set` 为 `false` 时移除当前机器人的回应；`fetch_emoji_like` 从同一份聚合结果读出参与者，因此贴表情、查参与者、撤回回应构成闭环。
- `set_friend_remark` 写入机器人对该好友的备注，落到与 WebQQ 用户通道同一份规则上：前后空白被 trim，空串（含省略参数）表示删除备注而不是写入空串。`get_friend_list` 的 `remark` 与 `get_recent_contact` 的私聊 `remark` 立刻返回同一份值；不是好友按「好友关系不存在」拒绝，对自己调用按「不能对自己执行好友操作」拒绝，两句与用户通道逐字相同。
- `set_qq_profile` 写入机器人账号资料：NapCat 与 LLOneBot 都支持 `nickname` 和 `personal_note`，只有 NapCat 接受 `sex`（`0/1/2` 或 `unknown/male/female`）；LLOneBot 传入性别时明确失败，不静默忽略。对应 `get_login_info`、`get_stranger_info`、`get_friend_list` 与 `get_group_member_info` 只返回已建模的类型化字段，不透传 raw JSON。
- `send_forward_msg` / `send_group_forward_msg` / `send_private_forward_msg` 创建独立合并转发资源，并在目标会话写入外层 forward 卡片消息；响应同时返回 `message_id`、`res_id` 与 `forward_id`。节点支持 `{ data: { id } }` 引用已有可见消息，以及 `{ data: { user_id, nickname, content } }` 自定义内容，可混合使用。自定义节点内的媒体与普通 `send_msg` 一致，接受 `sandbox-media://`、`base64://`、Data URL 与 HTTP(S) 来源，落盘后再写入 node。
- `get_forward_msg` 读取合并转发详情，接受转发资源 `id` 或外层消息 `message_id`；返回的 `messages` / `message` / `nodes` 为同一份 node 列表，节点正文复用现有 OneBot 消息段转换，并支持嵌套 forward。嵌套资源内的节点媒体只要父链对操作者可见即可读取。
- 外层 `get_msg`、消息历史和机器人消息事件对合并转发只暴露 `{ type: 'forward', data: { id } }` 段，不再把节点展平成普通文本。

Koishi 的 OneBot 适配器同时提供 camelCase 便捷方法，沙盒显式实现 `getGroupInfo`、`getGroupMemberInfo` 和 `getGroupMemberList`，避免它们被当作原始 action 名转发而报「不支持的 action」。未显式声明的名称仍按原始 action 解析，不会伪造成功。
