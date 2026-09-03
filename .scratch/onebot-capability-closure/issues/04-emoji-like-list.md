# 04 — 表情回应参与者读取，聚合数据已经存着，只是没有出口

**What to build:** 声明 `message.emoji-like.list` 能力，两种实现配置的 action 名都是 `fetch_emoji_like`，handler 从 `SandboxMessageReaction.participantIds` 取出参与者并按上游形状返回。沙盒已经按 emoji 聚合参与者，插件今天只拿得到聚合结果。

**映射是现成的，而且能比上游更有用。** `SandboxMessageReaction { emojiId, participantIds }`（`types.ts:236-239`）里的每个 participantId 直接对上返回项：`tinyId: participantId`、`nickName: participant.name`、`headUrl: participant.avatar`。注意 **LLBot 上游的 `nickName` 恒为空串**（`llbot/msg/FetchEmojiLike.ts` 里写死 `nickName: ''`，头像也是拼 qlogo URL）；沙盒有真实的参与者名字，这里**给真名**而不是复刻那个空串——但要在 `description` 里写明这是刻意偏离，否则下一个人会以为是漏抄。

**两边的参数差异是这一票最容易踩的地方。** NapCat（`extends/FetchEmojiLike.ts`）要 `message_id` + **`emojiId`** + **`emojiType`**（都是 camelCase，都必填，没有 default）+ `count`（默认 20）+ `cookie`（默认 `''`）；LLBot（`llbot/msg/FetchEmojiLike.ts`）收 `message_id` + **`emoji_id` 或 `emojiId`**（两种拼写择一，`_handle` 里 `payload.emoji_id ?? payload.emojiId`）+ `count`（默认 20）+ `cookie`，**不要 `emojiType`**。

按各自实现校验：NapCat 配置下缺 `emojiId` 或 `emojiType` 必须明确失败（上游是 `Value.Parse` 的 Assert 阶段拒绝），LLBot 配置下缺 `emoji_id` 与 `emojiId` 两者才失败、传 `emojiType` 要忽略。**不要为了省事在两边都接受所有拼写**——那会掩盖真实差异，插件在沙盒上能跑、换到 NapCat 上就崩。这条差异已经真实咬过一次消费者。

**`emojiType` 的语义按 NapCat 自己的判据。** NapCat 的 `setEmojiLike`（`napcat-core/apis/msg.ts:42`）用 `emojiId.length > 3 ? '2' : '1'`——1 是 QQ 小黄脸（qface QSid 最多三位），2 是 Unicode 码点十进制。沙盒收到 `emojiType` 后**只做校验、不参与查找**：`participantIds` 是按 `emojiId` 聚合的，类型不影响命中。但类型与 `emojiId` 明显矛盾时（比如 `emojiType: 1` 配六位 emojiId）不要报错——上游也不校验这个，沙盒不该更严。

**返回形状与分页。** `{ emojiLikesList, cookie, isLastPage, isFirstPage }`，NapCat 额外有 `result` 与 `errMsg`。沙盒的参与者列表是完整的内存数组，分页语义按 `count` 截断：一页装得下时 `isFirstPage` 与 `isLastPage` 都为 `true`、`cookie` 为空串。**不要实现真正的游标**——沙盒的场景规模装得下，假游标只会多一处能漂移的状态。装不下时按 `count` 截断并让 `isLastPage` 为 `false`，`cookie` 仍返回空串并在 `description` 里写明沙盒不分页。

**可见性：只能查机器人可见的消息。** 走既有的 `requireReadableMessage`（`bot.ts:1011`）而不是 `findAccessibleMessage`——已撤回的消息不该还能查出谁贴过表情，撤回的语义就是原文不再可读。消息不可见时按既有文案拒绝。

**不做的事：** 不加 `get_emoji_likes`（NapCat 有、LLBot 没有，且上游连参数都没声明，语义不明）；不改 `SandboxMessageReaction` 的结构；不动 `set_msg_emoji_like` 那一支（`bot.ts:466`）；查不到该 emoji 的回应时返回空列表而不是报错——那和「这条消息没人贴这个表情」是同一件事。

**Status:** resolved

- [x] `onebot-profiles.ts` 的 `nativeActions` 里声明 `message.emoji-like.list`，两种配置的 `action` 都是 `fetch_emoji_like`
- [x] `bot.ts` 接上 handler，消息定位走 `requireReadableMessage`
- [x] NapCat 配置下 `emojiId`（camelCase）与 `emojiType` 都必填，缺任一明确失败，有断言
- [x] NapCat 配置下只传 snake_case 的 `emoji_id` 时失败，有断言——这是真实差异，不要兼容掉
- [x] LLBot 配置下 `emoji_id` 与 `emojiId` 两种拼写都接受，有断言
- [x] LLBot 配置下不需要 `emojiType`，传了被忽略且不报错，有断言
- [x] `emojiLikesList` 每项含 `tinyId`／`nickName`／`headUrl`，取值来自参与者实体，`nickName` 是真名而非空串，有断言
- [x] `description` 里写明 `nickName` 给真名是对 LLBot 上游空串的刻意偏离
- [x] 该 emoji 没有回应时返回空列表，不报错，有断言
- [x] 同一人对同一 emoji 只出现一次，与 `SandboxMessageReaction` 的聚合语义一致，有断言
- [x] `count` 生效：参与者多于 `count` 时按它截断且 `isLastPage` 为 `false`，装得下时两个 page 标记都为 `true`，有断言
- [x] `cookie` 恒为空串，`description` 里写明沙盒不分页
- [x] NapCat 配置额外返回 `result` 与 `errMsg`；LLBot 配置下不出现，有断言
- [x] 已撤回的消息按既有的「消息已撤回」拒绝，有断言
- [x] 机器人不可见的消息按既有可见性文案拒绝，有断言
- [x] 读取不产生场景变更：调用前后 revision 与快照逐字节相同，有断言
- [x] 能力覆盖禁用 `message.emoji-like.list` 后调用被拒，有断言
- [x] 跨 action 闭环断言：`set_msg_emoji_like` 贴一个表情 → `fetch_emoji_like` 查出该参与者 → `set` 为 `false` 撤回后查不到
- [x] `tests/onebot-profiles.test.ts` 的能力矩阵断言同步更新
- [x] `docs/onebot-profiles.md` 补上两边的参数差异与沙盒不分页这件事
- [x] 领域词汇核过一遍，确认「表情回应」与「参与者」的归属
- [x] 既有的 `set_msg_emoji_like` 与消息能力测试一字不改地通过
- [x] 完整测试、类型检查与构建通过

## Comments

**票里那处参数差异在 `d6e2f48` 上核实无误，但当前 `main` 已经不是这样了。** 手边那份 LLBot 工作副本（v7.0.0）的 `FetchEmojiLike` 已经收回成 `emoji_id` 必填、没有 `cookie`，而且直接把 NT API 的原始结果透传出去（因此连 `result` 与 `errMsg` 都有）。按 README 钉住的快照版本 `d6e2f48` 执行：那一版确实是 `emoji_id ?? emojiId` 择一、带 `cookie`、只返回四个字段。下次升级快照时这一支要重新核。

**`result` 与 `errMsg` 的差异来自「谁在构造返回值」。** NapCat 的 `ReturnSchema` 显式声明了这两个字段（它透传 `getMsgEmojiLikesList` 的结果）；`d6e2f48` 的 LLBot 自己 `map` 出 `emojiLikesList` 再拼四个字段，因此两个都没有。不是漏抄。

**`nickName` 给真名、`headUrl` 给沙盒媒体引用。** LLBot 上游写死 `nickName: ''`、`headUrl` 拼 qlogo URL，两者在沙盒里都无意义——沙盒有真实的参与者名字与受控头像。这处刻意偏离写在能力作用说明里，`tests/onebot-profiles.test.ts` 断言说明里含「nickName」与「不分页」两个词，以免下一次改动把它悄悄抹掉。

**`emojiType` 只做必填校验。** 参与者按 `emojiId` 聚合，类型不参与命中；上游也不校验类型与 `emojiId` 是否自洽（NapCat 自己是用 `emojiId.length > 3 ? '2' : '1'` 推出来的），因此沙盒不比它更严，传 `emojiType: 1` 配六位 emojiId 照样返回结果。

**emoji ID 两边都 trim，这一处刻意不照抄上游。** `applyMessageReaction` 存的是 trim 过的 emojiId，读取不跟着归一化就会出现「`set_msg_emoji_like` 贴了 `'  76  '`、再用同一个参数 `fetch_emoji_like` 查不到」——沙盒自己的写入侧归一化了，读取侧不归一化是内部不一致，不是对上游的忠实。顺带让 LLBot 那支的「全是空白」与「没传」落到同一句拒绝上，与它上游 `if (!emojiId)` 的意图一致。有断言。
