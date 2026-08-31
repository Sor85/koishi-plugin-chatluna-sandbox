# 断言逐条分类：`tests/webqq-message-list.test.ts`

**基线提交：** `76c83ab`（票 01 落地后、票 02 动手前）
**基线断言总数：** 234 条 `expect(...)`，分布在 13 个用例里
**失效条件：** 总数一旦变动，本表整体失效，必须按新提交重新分类。行号只在基线提交上有意义。
**动手顺序：** 先删除断言，再拆分用例。反过来会让行号整体位移，表随即失效。

## 基线口径

按变量绑定的文件分类，不按断言写法：

| 断言对象 | 条数 |
| --- | --- |
| 样式表（`webqq-messages.css` / `webqq-overlays.css` 及从它们切出的规则片段） | 76 |
| 组件源码，肯定式 | 142 |
| 组件源码，否定式 | 15 |
| 数值比较（`toBeGreaterThan`，不是文本断言） | 1 |
| **合计** | **234** |

可删的量集中在「组件源码，肯定式」这一类。76 条样式文本断言与 15 条否定式守卫按 ADR 0073 的
第一、二类例外全部保留，一条不动。

## 五类判据与处置

判据是**成本结构**而不是断言形式（ADR 0073）。

| 类别 | 处置 | 本票涉及条数 |
| --- | --- | --- |
| 1. 已有行为测试覆盖同一事实 | 全删 | 30 |
| 2. 样式文本 | 全留 | 76（本票不动） |
| 3. DOM 结构与元素顺序（含与样式选择器构成结构契约的类名） | 全留，按主题归入用例并加块注释 | 34 |
| 4. 实现细节契约 | 删肯定式、留否定式 | 见类别 1；否定式 15 条全留 |
| 5. 用户文案与展示语义 | 全留，改由 `expectUserFacingCopy` 表达 | 11 |

## 本票删除的 30 条

每一条都指名它保护的行为现在由哪条行为断言接住。

### 类型声明原文（5 条，删掉零损失——类型检查已强制同一件事）

| 行号 | 断言 | 接住它的地方 |
| --- | --- | --- |
| 15 | `model: WebqqMessageListModel` | `vue-tsc` 对 `defineProps` 的检查 |
| 17 | `replyMessages: Record<string, SandboxMessage>` | 同上 |
| 18 | `forwardPreviews: Record<string, SandboxForwardPreview>` | 同上 |
| 25 | `openForward: [input: { messageId: string; forwardId: string }]` | `vue-tsc` 对 `defineEmits` 的检查 |
| 257 | `markRecalledMessages: boolean` | 同 15；两个方向的行为由 `message-presentation.test.ts`「撤回消息只在关闭撤回标记时事件化」执行 |

### 已下沉到 `message-presentation`（12 条）

| 行号 | 断言 | 接住它的行为断言 |
| --- | --- | --- |
| 21 | `props.model.replyMessages[message.replyToMessageId]` | 「按引用标识查表」「没有引用标识，或表里查不到时都当没有引用」 |
| 102 | `查看{{ getForwardPreview(message)!.total }}条转发消息` | 「按消息标识查转发预览」＋文案改走辅助函数 |
| 103 | `getForwardPreview(message)?.title \|\| '合并转发'` | 「没有转发标识的消息即使预览表里有同名条目也不算转发」＋文案改走辅助函数 |
| 169 | `getMessageThinking(message)` | 「有思考内容时取到思考，只有用量时取到用量，两者互斥」 |
| 171 | `getMessageUsage(message)` | 同上 |
| 173 | `message.chatLuna?.thought` | 同上 |
| 258 | `shouldRenderAsEvent(message)` | 「事件消息永远渲染成事件行」「撤回消息只在关闭撤回标记时事件化」「普通消息不事件化」 |
| 260 | `shouldShowThinking(message)` | 「关闭撤回标记时撤回消息的思考与用量一并隐藏」「开启撤回标记时仍可读」 |
| 263 | `formatRecalledMessageEventText` | 「撤回事件行按操作者渲染文案」「撤回事件的操作者优先取生命周期里的撤回者」 |
| 264 | `isRecalledMessage(message)` | 同 258 |
| 266 | `isRecalledMessage(message) && !props.model.markRecalledMessages` | 同 260 |
| 292 | `emit('setMessageReaction', message.id, emojiId, enabled)` | 「表情回应的双闸门」五条（能力位、操作者、贴上、取消、他人已贴） |

### 已下沉到 `participant-presentation`（8 条）

| 行号 | 断言 | 接住它的行为断言 |
| --- | --- | --- |
| 30 | `getChatFriendActions(...).includes('remark')` | 「已经是好友时给出互动、备注与删除」 |
| 31 | `getChatFriendActions(...).includes('delete')` | 同上 |
| 71 | `isBotParticipant(message.authorId) && ...` | 「目录标记为机器人的才算机器人；缺失时按非机器人处理」 |
| 217 | `getMessageAuthorName(message.authorId)` | 「有群名片时用群名片」「群名片为空白时回退到全局昵称」「不在当前群里时用全局昵称」 |
| 218 | `getMessageRoleBadge(message.authorId)` | 「群主与管理员各有默认徽标，普通成员没有」「专属头衔覆盖身份文案，配色跟随群身份」 |
| 239 | `getGroupAuthorityBadge` | 同 218 |
| 293 / 294 | `getMessageGroupMemberActions(...).includes('mention' \| 'poke')` | 「按当前操作者与目标算动作」「目标不在当前群里时一个动作都没有」等五条 |
| 299 | `hasMessageGroupMemberManagementActions(...)` | 「表里恰是那六项，不含互动动作」「只有互动动作时子菜单不出现」 |

### 已被既有模块的行为断言覆盖（3 条）

| 行号 | 断言 | 接住它的地方 |
| --- | --- | --- |
| 16 | `getMessageClusterClass` | `tests/message-cluster.test.ts` |
| 22 | `isMergedMessage` | 同上 |
| 295 | 好友「戳一戳」菜单项的整段正则 | `participant-presentation.test.ts` 好友菜单三条；菜单项本身的 DOM 结构由 `group-menu` 的既有断言守 |

### 本就没有保护任何行为（2 条）

| 行号 | 断言 | 说明 |
| --- | --- | --- |
| 75 | `message.chatLuna?.modelRequests?.length` | 与 71 同一处模板条件的子串，重复断言同一行文本 |
| 291 | `emit('openReactionPicker', message.id)` | 该入口是否读到能力位由架构守卫「消息动作入口必须由能力位守门」逐个钉住，比断言文本强 |

## 改由 `expectUserFacingCopy` 表达的 11 条

类别 5。断言语义不变，只是把「这条断言保护的是用户可见文案」写进代码形状，让守卫规则能按形状
认出这个合法出口（ADR 0073）。

| 行号 | 文案 |
| --- | --- |
| 67 | `清空会话记录` |
| 70 | `跳转到对应请求` |
| 80 | `在线 · OneBot 机器人` |
| 82 | `发送一条消息开始测试` |
| 83 | `在模拟 QQ 环境中体验 OneBot 的消息交互` |
| 84 | `发送消息，验证插件在模拟 QQ 环境中的响应` |
| 102 | `条转发消息` |
| 103 | `合并转发` |
| 290 | `贴表情` |
| 298 | `创建分支` |
| 354 | `以上是与原会话共享的记录，在这条分支里只读` |

## 留给后续票的实现细节断言

保留，但已按主题归入独立用例并在块注释里写明负责人：

| 主题 | 条数 | 负责人 |
| --- | --- | --- |
| 多选入口、勾选标记与右键禁用 | 4 | 04 |
| 滚动追踪、位置恢复、加载更早历史的接线 | 26 | 05 / 06 |
| 思考面板的结构与离场 | 9 | 03 |
| 消息时间格式化 | 1 | 08 |
| 合并转发弹窗与嵌套栈 | 9 | 04 |
| 别的组件（表情选择页、回应条、群成员菜单、详情栏、页面装配） | 约 40 | 各自候选，见架构守卫豁免清单 |

## 结果

- 基线 234 条 → 本票后 193 条 `expect(...)` ＋ 11 条 `expectUserFacingCopy(...)`
- 用例 13 个 → 19 个，第一个巨型用例（80 条断言）拆成 8 个按主题命名的用例
- 新增行为断言 52 条：`message-presentation.test.ts` 30 条、`participant-presentation.test.ts` 22 条
- 新增读取成本断言 9 条：`message-list-read-cost.test.ts`
