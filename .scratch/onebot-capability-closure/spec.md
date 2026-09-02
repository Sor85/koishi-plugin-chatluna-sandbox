# 四处只有单向入口的场景状态，补齐 OneBot 读写端

Status: ready-for-agent

来源：`koishi-plugin-onebot-webqq` 的开发者模拟环境改用沙盒的虚拟 OneBot 机器人当后端，核对它实际调用的 41 个 action 时暴露出来。价值判定站在沙盒自身，与那个消费者无关。

---

## Problem Statement

沙盒有四处场景状态只有单向入口：数据在场景里存着，插件却读不到或改不了。

- **群公告**：`SandboxGroup.announcements`（`types.ts:115-126`）是完整实体，`setGroupAnnouncement`（`control-service.ts:1980`）能写、`deleteGroupAnnouncement`（`:1999`）能删，NapCat 的 `_del_group_notice` 与 LLBot 的 `_delete_group_notice` 都已声明。但没有任何 action 能读。插件今天只能盲删一条它看不见的公告。
- **入群申请与群邀请**：`scene.requests` 是完整实体（`control-service.ts:1451` 按 `id`／`type`／`subType` 查找），`set_group_add_request` 能审批。但没有 action 能列出待审批的申请。插件漏掉一条 request 事件、或者重启一次，就再也发现不了那条申请——审批流只有写端。
- **好友备注**：`friendships[].remarks` 已经被 `get_friend_list` 当 `nick` 返回（`bot.ts:633`），用户通道的 `set-remark`（`control-service.ts:1216-1222`）能改。但机器人通道没有写入口，备注只能靠场景预设或审批好友申请时顺手带上。
- **表情回应参与者**：`SandboxMessageReaction { emojiId, participantIds }`（`types.ts:236-239`）已经按 emoji 聚合参与者，`set_msg_emoji_like` 能贴能撤。但插件只拿得到聚合结果，看不到是谁贴的。

四处都不是「沙盒没建模」，而是「建了模但没开门」。这正是 `docs/onebot-profiles.md` 里那条原则要区分的情形：沙盒只声明真实实现的 action，而这四个恰好是**能**真实实现的那一类——不需要新建任何实体，也不需要伪造任何字段。

单向入口的代价是插件在沙盒里跑不完整条流程。真实 QQ 上「列出申请 → 审批 → 复查结果」是闭环，沙盒里第一步就断了，被测插件的发现逻辑因此永远走不到。

## Solution

补四项能力，全部映射到已有领域状态：

| 语义 ID | NapCat | LLBot | surface | 映射到 |
| --- | --- | --- | --- | --- |
| `group.notice.list` | `_get_group_notice` | `_get_group_notice` | native | `SandboxGroup.announcements` |
| `group.system-msg` | `get_group_system_msg` | `get_group_system_msg` | native | `scene.requests` |
| `friend.remark.set` | `set_friend_remark` | `set_friend_remark` | native | `friendships[].remarks` |
| `message.emoji-like.list` | `fetch_emoji_like` | `fetch_emoji_like` | native | `SandboxMessageReaction.participantIds` |

四个 action 名在两种实现上一致，因此都进 `nativeActions`，不需要按 profile 分叉声明。但**参数与返回形状在两边有真实差异**，每张票各自逐条列出，按各自的上游源码照抄，不取并集也不取交集。

四项互不依赖，可以并行，也可以分四个提交落地。

## 上游核对

全部读的是 `README.md` 里记着的那两个快照版本对应的源码，不是文档站——NapCat 的文档站漏了其中三个。

- NapCat：`packages/napcat-onebot/action/router.ts` 的 `ActionName`（183 项）、`group/GetGroupNotice.ts`、`system/GetSystemMsg.ts`、`extends/FetchEmojiLike.ts`、`napcat-core/apis/msg.ts`
- LLBot：`src/onebot11/action/types.ts` 的 `ActionName`（120 项）、`go-cqhttp/GetGroupNotice.ts`、`go-cqhttp/GetGroupSystemMsg.ts`、`llbot/user/SetFriendRemark.ts`、`llbot/msg/FetchEmojiLike.ts`

两边都不存在 `get_group_notice`（不带下划线）这个写法，四张票都不要顺手加它。

## 核对后明确不做的三项

同一轮核对里另外三项上游同样真实存在，判定不加，理由记在这里，免得下次再问一遍。

**`get_image` 与 `get_record`（两边都有，属 OneBot 11 标准 action）。** 触发不到。消费者只在消息段既没有 `url`／`src`、`file` 又不是 http(s) 地址时才会走二次取回；沙盒的媒体段是 `{ file: source, url: source }`（`onebot-message.ts:174`），两个都给，那条路走不到。要让它有意义，得先建模「实现只给 file id、迫使插件二次取回」这种行为——那是媒体建模的事，不在本 spec 范围内。硬加只会多两个永不被调用的 handler，与「不声明空能力」相悖。

`get_record` 另有一层：`out_format` 沙盒无法真实转码（不跑 FFmpeg），接受 `mp3` 却返回原始 audio 等于假装转码成功了。

**语音转文字（NapCat `fetch_ptt_text`／LLBot `voice_msg_to_text`）。** 沙盒没有转写模型，全仓 `transcript`／`ptt` 零命中。转写文本没有真实来源，只能由场景预设一个字段——属于新建领域概念，与本 spec 那四项「填充已有状态」不是一类。

按 `docs/onebot-profiles.md` 的定义，它确实符合 `supported: false` 的适用情形（上游存在、沙盒没有对应领域模型）。**本轮连这个声明也不加**，这是范围决定而不是判定它不该存在——能力矩阵里多一行不可用能力对现在没有帮助。要做的时候最小模型是语音媒体上可选 `transcript?: string`、缺失时按 LLBot 上游那句「未识别到文字」失败；届时独立开票，并同时处理两边不同的 action 名（正好用现成的按 profile 声明机制，和 `_del_group_notice`／`_delete_group_notice` 一个形状）。

## 共同约束

**可见性由调用方机器人决定，不是全场景可读。** 四项都必须按 `getVisibleSnapshot(this.selfId, …)` 或等价的可见性判定过滤，形状参照 `bot.ts:205` 的 `get_recent_contact`。具体来说：公告只返回机器人所在群的；系统消息只返回机器人有权审批的群的申请与发给它自己的邀请；表情回应只允许查机器人可见的消息；备注只能改机器人自己的好友关系。漏掉可见性会让沙盒比真实 QQ 更宽松，插件因此测不出权限问题。

**读取不写状态，写入必须可复查。** 三项读取不得产生场景变更；`set_friend_remark` 按 `docs/onebot-profiles.md` 的「有状态 action」要求，写入后 `get_friend_list` 的 `nick` 必须立刻反映同一份值。

**未知 action 仍要明确失败。** 四项都经 `resolveOneBotAction` 的既有路径，能力覆盖禁用后必须照旧拒绝，不能绕过。

## User Stories

1. As a 沙盒用户, I want 机器人能列出我在环境管理页给群加的公告, so that 我不必靠删除来确认公告到底存不存在
2. As a 沙盒用户, I want 机器人能列出我造出来的入群申请和群邀请, so that 我可以只准备场景、由插件自己发现要审批什么
3. As a 沙盒用户, I want 机器人改过的好友备注在好友列表里立刻可见, so that 我能直接确认那次调用真的生效了
4. As a 沙盒用户, I want 表情回应能查出参与者是谁, so that 我能验证插件读到的回应人与我在 WebQQ 上看到的一致
5. As a 沙盒用户, I want 机器人读不到它不该看见的群和消息, so that 沙盒的权限边界和真实 QQ 一样
6. As a 被测插件开发者, I want 列申请、审批、复查结果构成闭环, so that 我的审批逻辑能在沙盒里完整跑一遍而不是卡在第一步
7. As a 被测插件开发者, I want 两种实现配置的参数与返回差异与上游一致, so that 我在沙盒上写的适配代码换到真机上不会翻车
8. As a 被测插件开发者, I want 四项能力照旧受能力覆盖约束, so that 我可以模拟「这个实现不支持它」的情形
9. As a 被测插件开发者, I want 已有的 action、事件与场景快照一字不变, so that 我现有的断言不必跟着改

## Issues

- `01-group-notice-list.md` — 群公告读取
- `02-group-system-msg.md` — 群系统消息读取
- `03-friend-remark-set.md` — 好友备注写入
- `04-emoji-like-list.md` — 表情回应参与者读取
