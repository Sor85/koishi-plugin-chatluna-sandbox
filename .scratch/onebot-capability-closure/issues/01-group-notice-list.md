# 01 — 群公告读取，让插件看得见它今天只能盲删的东西

**What to build:** 声明 `group.notice.list` 能力，两种实现配置的 action 名都是 `_get_group_notice`，handler 读 `SandboxGroup.announcements` 并按上游形状返回。沙盒已经能写能删公告，这一票只补读取端。

**映射是现成的，不新建实体。** `SandboxGroupAnnouncement` 是 `{ id, authorId, content, createdAt }`（`types.ts:115-119`），逐字段对上上游：`notice_id: id`、`sender_id: authorId`、`message.text: content`、`publish_time` 取 `createdAt` 的**秒级**时间戳（上游是秒，沙盒内部存 ISO 字符串，转换在 handler 里做一次）。

**两边的返回形状有一处真实差异，照抄不要合并。** NapCat 的 `ReturnSchema`（`group/GetGroupNotice.ts`）里 `message` 同时给 `image` 和 `images` 两个数组字段，还有可选的 `settings` 与 `read_num`；LLBot（`go-cqhttp/GetGroupNotice.ts`）只给 `images`，`settings` 是必给的五个布尔。沙盒没有公告图片，两边的图片字段都返回空数组——**但字段名要按各自实现出现**，这正是实现配置存在的意义。`settings` 与 `read_num` 沙盒没有对应状态，不要编：LLBot 那五个布尔按 `false` 给（它是必给字段），NapCat 那两个可选字段直接不出现。

**参数只有 `group_id`。** NapCat 声明成 `Type.String`，LLBot 声明成 `Schema.union([Number, String])`；沙盒统一走既有的 `normalizeOneBotGroupId`，与 `delete_group_notice` 那一支一致（`bot.ts:361`）。

**可见性：机器人必须在群里。** 不在群里按既有的群可见性错误拒绝，不要返回空数组——空数组会让插件以为群里没公告。`_del_group_notice` 那一支怎么判，这一支就怎么判。

**不做的事：** 不加 `_send_group_notice`（发公告是另一件事，沙盒的公告目前由环境管理页与测试控制器创建）；不加 `get_group_notice` 这个不带下划线的写法（两边上游都没有）；不动公告实体的字段，特别是不为了凑上游而加 `title`——上游的返回里本来就没有 title。

**Status:** ready-for-agent

- [ ] `onebot-profiles.ts` 的 `nativeActions` 里声明 `group.notice.list`，两种配置的 `action` 都是 `_get_group_notice`，`handler` 与 `description` 按既有风格写
- [ ] `bot.ts` 接上 handler，形状与 `delete_group_notice` 那一支对称
- [ ] 返回 `notice_id`／`sender_id`／`publish_time`／`message.text` 四个字段，取值来自 `SandboxGroupAnnouncement` 的对应字段
- [ ] `publish_time` 是秒级整数，不是毫秒也不是 ISO 字符串，有断言
- [ ] NapCat 配置下 `message` 同时出现 `image` 与 `images`，LLBot 配置下只出现 `images`，两者都是空数组，有断言
- [ ] LLBot 配置下 `settings` 五个布尔字段齐全且为 `false`；NapCat 配置下不出现 `settings` 与 `read_num`，有断言
- [ ] 群里有多条公告时，返回顺序与 `group.announcements` 的既有存储顺序一致（`setGroupAnnouncement` 用 `unshift`，因此最新在前），handler 不重新排序，有断言
- [ ] 群里没有公告时返回空数组，不是报错，有断言
- [ ] 机器人不在群里时按既有群可见性文案拒绝，与 `_del_group_notice` 同一句，有断言
- [ ] 读取不产生场景变更：调用前后场景 revision 与快照逐字节相同，有断言
- [ ] 能力覆盖禁用 `group.notice.list` 后调用被拒，理由是既有的「能力已被禁用」，有断言
- [ ] `_get_group_notice` 之外的名字（含 `get_group_notice`）仍按「基线不支持」拒绝，有断言
- [ ] `tests/onebot-profiles.test.ts` 的能力矩阵断言同步更新
- [ ] `docs/onebot-profiles.md` 的实现差异表按需补一行；`README.md` 的基线版本信息不需要动（不是快照升级）
- [ ] 领域词汇核过一遍，确认「群公告」是否已在 `CONTEXT.md`，缺则补
- [ ] 既有的 `_del_group_notice`、`setGroupAnnouncement`、`deleteGroupAnnouncement` 测试一字不改地通过
- [ ] 完整测试、类型检查与构建通过

## Comments
