# 02 — 群系统消息读取，把审批流的发现端补上

**What to build:** 声明 `group.system-msg` 能力，两种实现配置的 action 名都是 `get_group_system_msg`，handler 从 `scene.requests` 里挑出机器人该看见的入群申请与群邀请，按上游的两个桶返回。沙盒已经能审批，这一票补的是「插件怎么知道有东西要审批」。

**这一票的价值在闭环。** 今天插件只能靠一次性的 request 事件知道有申请；漏掉、或者进程重启，那条申请就永远发现不了，而它明明还在 `scene.requests` 里躺着。真实 QQ 上插件可以随时重新拉一遍，沙盒补上之后同一条逻辑才能在这里跑通。

**映射：`scene.requests` 里 `type === 'group'` 的那些。** 按 `subType` 分桶——`'invite'` 进 `invited_requests`，`'add'`（缺省值，见 `control-service.ts:1452`）进 `join_requests`。每项的字段来自申请实体与它指向的群和参与者：`request_id: id`（就是审批时要传的 flag，两者必须是同一个值）、`group_id`／`group_name` 来自群、`requester_uin`／`requester_nick` 来自 `requesterId` 指向的参与者、`message` 取 `comment`、`checked` 取 `status !== 'pending'`。

**两边的形状差异，照抄不要合并。** NapCat（`system/GetSystemMsg.ts`）收 `{ count }`（`Type.Union([Number, String])`，默认 50）并返回**三个**桶——`invited_requests`、`InvitedRequest`（兼容别名，内容与前者相同）、`join_requests`；LLBot（`go-cqhttp/GetGroupSystemMsg.ts`）**无参**，返回两个桶。NapCat 还给每项一个 `actor` 字段（处理人 uin，未处理时为 0），LLBot 也有。`count` 只有 NapCat 支持，LLBot 配置下传了要忽略而不是报错——上游 `BaseAction` 对无 `payloadSchema` 的 action 就是不校验。

**可见性：机器人有权审批的才算。** 入群申请只返回机器人是群主或管理员的群的——判据用现成的 `denyGroupAuthority`（`relationship-actions.ts`，ADR-0087 收拢后的那一份），不要在这里重写角色比较，否则会撞上「群成员角色比较只允许出现在关系规则模块里」那条守卫。群邀请只返回 `targetId === this.selfId` 的，与 `handleBotGroupRequest` 的邀请分支同一条判据（`control-service.ts:1458`）。机器人看不见的群的申请一条都不出现。

**`request_id` 与 flag 必须同源。** 返回的 `request_id` 要能直接当 `set_group_add_request` 的 `flag` 用。这条要有一个跨 action 的断言钉住：列出来 → 拿 `request_id` 去审批 → 审批成功且场景里那条申请消失。否则这个 action 看着有用、实际接不上下一步。

**不做的事：** 不返回好友申请（`type === 'friend'`）——上游这个 action 只管群；好友申请在两边都是另一条路（NapCat 的 `get_friend_system_msg`／LLBot 的 `GetDoubtFriendsAddRequest` 之类），要加也是另一张票。不加 `get_group_add_request`（两边都有，但那是「查单个群的申请」，语义不同，本票不碰）。不改 `scene.requests` 的实体形状。

**Status:** ready-for-agent

- [ ] `onebot-profiles.ts` 的 `nativeActions` 里声明 `group.system-msg`，两种配置的 `action` 都是 `get_group_system_msg`
- [ ] `bot.ts` 接上 handler，读取路径经 `getVisibleSnapshot` 或等价可见性判定
- [ ] `join_requests` 只含 `subType` 为 `add`（含缺省）的群申请，`invited_requests` 只含 `invite` 的，有断言
- [ ] NapCat 配置额外返回 `InvitedRequest` 桶且内容与 `invited_requests` 相同；LLBot 配置下该桶不出现，有断言
- [ ] NapCat 配置接受 `count` 并按它截断；LLBot 配置忽略 `count` 且不报错，两者都有断言
- [ ] 每项字段齐全：`request_id`、`group_id`、`group_name`、`requester_uin`、`requester_nick`、`message`、`checked`、`actor`，取值来自场景而非常量，有断言
- [ ] `checked` 对未处理申请为 `false`；已处理申请若仍在场景里则为 `true`，有断言
- [ ] 入群申请的可见性用现成的 `denyGroupAuthority`，机器人只是普通成员的群的申请不出现，有断言
- [ ] 群邀请只返回发给本机器人的，发给别人的不出现，有断言
- [ ] 跨 action 闭环断言：列出申请 → 用返回的 `request_id` 调 `set_group_add_request` → 审批成功、场景里那条申请消失
- [ ] 没有任何可见申请时两个（NapCat 三个）桶都是空数组，不报错，有断言
- [ ] 读取不产生场景变更：调用前后 revision 与快照逐字节相同，有断言
- [ ] 能力覆盖禁用 `group.system-msg` 后调用被拒，有断言
- [ ] 没有在本票里新写任何群成员角色比较，「角色比较只允许出现在关系规则模块里」那条守卫保持全绿
- [ ] `tests/onebot-profiles.test.ts` 的能力矩阵断言同步更新
- [ ] `docs/onebot-profiles.md` 补上两边的参数与桶差异
- [ ] 领域词汇核过一遍，确认「群系统消息」或等价术语的归属
- [ ] 既有的 `set_group_add_request`、`handleBotGroupRequest` 与申请审批测试一字不改地通过
- [ ] 完整测试、类型检查与构建通过

## Comments
