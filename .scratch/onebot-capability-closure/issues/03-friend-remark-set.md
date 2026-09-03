# 03 — 好友备注写入，机器人通道走用户通道那一份规则

**What to build:** 声明 `friend.remark.set` 能力，两种实现配置的 action 名都是 `set_friend_remark`，handler 落到用户通道已有的 `set-remark` 规则上。备注今天只能靠场景预设或审批好友申请时顺手带上，机器人没有独立的写入口。

**复用规则，不复制写入逻辑。** `control-service.ts:1216-1222` 那段就是完整规则：`remark.trim()` 非空则写 `friendship.remarks[operatorId]`，空则 `delete` 掉该键，然后 `commitSceneMutation()`。「空串表示清除备注」是 LLBot 上游的真实语义（`SetFriendRemark.ts` 的 `remark` 默认 `''`），两边一致，沙盒已有的这段行为正好对上。

**入口形状有个选择，倾向对称那条。** 群动作走 `performBotGroupAction`（`control-service.ts:1482`），是 ADR-0087 收拢后的形状；好友动作目前只有 `deleteBotFriend`（`:1475`）这个独立方法，还没收。**建议新增 `performBotFriendAction(botId, { action: 'set-remark', targetId, remark })`**，内部落到与用户通道同一段 `set-remark`，与群动作那条通道对称。

**但不要求顺带把 `deleteBotFriend` 收进去。** 那是好友动作通道的收拢，属于 ADR-0087 的续作，独立成票。本票只需要新入口不再复制一份写入逻辑；若实现时发现收拢 `deleteBotFriend` 是顺手的，也要单独提交并单独记录。

**可见性：只能改自己的好友关系。** 不是好友时按既有的「好友关系不存在」拒绝（`control-service.ts:1214` 那句，用户通道已在用），不要静默建立关系。对自己调用时按既有的「不能对自己执行好友操作」拒绝。

**写入必须可复查。** 按 `docs/onebot-profiles.md` 的有状态 action 要求：写完之后 `get_friend_list` 的 `nick`（`bot.ts:633`）必须返回同一份值，`get_recent_contact` 里那份备注（`bot.ts:231`）同样跟着变。这两处是现成的读取端，不要新增读取路径。

**参数。** 两边都是 `{ user_id, remark }`，`user_id` 收数字或字符串，`remark` 缺省为空串。返回值上游是 `null`（LLBot 明确 `BaseAction<Payload, null>`），沙盒按既有的 `{ status: 'ok', retcode: 0, data: null }` 形状返回，与 `delete_group_notice` 那一支一致。

**不做的事：** 不加好友分组相关的 `set_friend_category`（LLBot 有、NapCat 没有，且沙盒没有分组模型——`get_friends_with_category` 现在把所有好友放进「我的好友」默认分组）；不改 `remarks` 的存储结构；不动审批好友申请时写备注那条路（`control-service.ts:1441`），它与本票是同一份状态的两个写入点，都保留。

**Status:** resolved

- [x] `onebot-profiles.ts` 的 `nativeActions` 里声明 `friend.remark.set`，两种配置的 `action` 都是 `set_friend_remark`
- [x] `bot.ts` 接上 handler，参数 `user_id` 同时接受数字与字符串
- [x] 新入口落到与用户通道同一段 `set-remark` 规则，写入逻辑在仓库里只有一份
- [x] 非空 `remark` 写入 `friendships[].remarks[botId]`，`get_friend_list` 的 `nick` 立刻返回同一份值，有断言
- [x] 空串 `remark` 删除该键（不是写入空串），`get_friend_list` 的 `nick` 回落空串，有断言
- [x] 省略 `remark` 参数时按空串处理，与 LLBot 上游默认值一致，有断言
- [x] `remark` 前后空白被 trim，与用户通道行为一致，有断言
- [x] `get_recent_contact` 返回的私聊备注跟着变，有断言
- [x] 不是好友时按既有的「好友关系不存在」拒绝，文案与用户通道逐字相同，有断言
- [x] 对自己调用时按既有的「不能对自己执行好友操作」拒绝，有断言
- [x] 写入产生一次场景变更提交，`revision` 递增，有断言
- [x] 返回形状是 `{ status: 'ok', retcode: 0, data: null }`，有断言
- [x] 能力覆盖禁用 `friend.remark.set` 后调用被拒，有断言
- [x] `deleteBotFriend` 未被本票改动；若顺带收拢则单独提交并在 Comments 里说明
- [x] 审批好友申请时写备注那条路的既有测试一字不改地通过
- [x] `tests/onebot-profiles.test.ts` 的能力矩阵断言同步更新
- [x] `docs/onebot-profiles.md` 的有状态 action 一节补上好友备注
- [x] 领域词汇核过一遍，确认「好友备注」的归属
- [x] 完整测试、类型检查与构建通过

## Comments

**写入规则抽成了 `applyFriendRemark`，两条通道各自只剩一句调用。** 用户通道的 `performFriendAction` 与新的 `performBotFriendAction` 都调它，因此「非空写入、空串删除、提交一次场景变更」在仓库里只有一份。拒绝的两句文案不是人工对齐的：机器人通道逐句复用了用户通道的顺序（先 `getParticipant` → 再自己 → 再好友关系），测试对两条通道同时断言同一句。

**`deleteBotFriend` 原样没动。** 好友动作通道的收拢（把它也收进 `performBotFriendAction`）仍然是 ADR-0087 的续作，独立成票；本票只保证新入口不复制第二份写入逻辑。

**`get_friend_list` 的 `nick` 在 OneBot 表面叫 `remark`。** 票里写的 `bot.ts:633` 是 `getFriendList()`（Universal 形状）里的 `nick`，它经 `get_friend_list` handler 落成 OneBot 的 `remark` 字段。两处都断言了，避免下一个人只查其中一处以为漏了。

**「好友备注」已在 `CONTEXT.md`，定义不需要改。** 那条词条说的是「参与者为自己的好友设置的本地名称」，机器人通道多一个写入口不改变这件事本身。
