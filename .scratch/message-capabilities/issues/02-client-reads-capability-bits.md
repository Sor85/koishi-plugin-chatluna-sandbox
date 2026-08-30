# 02 — 客户端右键改读能力位

**What to build:** 客户端不再自己推导一条消息能做什么，改读投影给出的能力位；右键权限因此第一次能用行为断言守住。

`messageList` 投影为每条消息给出能力位，`.vue` 里的 `canRecallMessage`、`canReactToMessage`、`isReactionReadonly`、`isMessageSelectable` 退化成读取投影结果。判定从组件搬到工作台外壳的投影里，从 `chatPaneModel` 的 interface 上就能观察到。

03 与 05 留下的源码文本守卫换成对投影的行为断言。三个写入入口——右键撤回、右键贴表情、气泡下方已有回应条——仍要逐个覆盖：它们读同一份能力位，但少接一个仍然是一条绕路，而这正是 03 号票当时点出的风险。

再加一条客户端架构守卫规则：客户端源码不得自己推导消息能力。按 ADR-0073 的规则制写谓词，跑遍客户端全部源码，新增文件默认受约束。

菜单本身不变：客户端本来就是严的那一边。

**Blocked by:** 01

**Status:** resolved

- [x] `messageList` 为每条消息给出能力位，继承前缀的位与自有消息不同
- [x] 群角色变化后能力位随之变化
- [x] 三个写入入口都读同一份能力位，逐个有行为断言覆盖
- [x] 03 与 05 留下的肯定式源码文本断言已删除，且不新增同类断言
- [x] 一条架构守卫规则钉住客户端不再自己推导消息能力，含谓词自测
- [x] 右键菜单在各种消息上显示的项与改动前一致

## Comments

### 实现记录

- `messageList` 投影新增 `messageCapabilities: Record<string, MessageCapabilities>`，由 `client/webqq/message-capabilities.ts` 按当前会话、当前操作者与当前群组算出，键集合就是当前会话读得到的那些消息。工作台外壳与工作区缩略图两处模型都经这一个 builder，没有第二种产出方式。
- `.vue` 里 `canRecallMessage`、`canReactToMessage`、`isReactionReadonly`、`isMessageSelectable` 四个函数整体删除，换成一个 `capabilitiesOf(message)` 读投影；投影还没给出这条消息时读作「一条都做不到」。菜单里另外两处内联判定（`v-if="!isRecalledMessage(message)"` 的回复、`v-if="!message.event"` 的创建分支）一起改成读能力位——它们同样是组件里的判定，留着就还有两份口径。
- **三个写入入口逐个接上**：右键撤回读 `recall`、右键贴表情读 `react`、气泡下方已有回应条的 `:readonly` 读 `!react` 且 `toggleReaction` 再挡一次。第三处是 03 号票点名的风险位置，只挡右键会让用户点一下已有 emoji 就绕过只读。
- 03 与 05 留下的四条肯定式源码文本断言已删除（三条 `isInheritedMessage` 接线 + `is-inherited` 绑定），换成 `tests/webqq-message-capabilities.test.ts` 里对投影的行为断言：每条消息的五项位、继承前缀与自有消息位不同、切换当前操作者后 `recall` 随群角色变化。留下的唯一源码断言改成否定式——四个已删除的组件内推导不得被加回来，按 ADR-0073 那类只在有人把已删实现加回来时才变红。
- 新增架构规则「客户端不自己判定消息能力」，与既有两条同处登记，读取投影的 `message-capabilities.ts` 是唯一合法持有者。谓词按两种命名形状写：判定词打头（`canRecallMessage`、`allowReactionFor`）与可行性后缀收尾（`isMessageSelectable`、`isReactionReadonly`、`forkAllowed`）。**边界按真实源码校准过**：动作词必须大小写不敏感才能抓住 `forkAllowed` 这类小写打头的拼法，但那样会把 `'is-selectable'` 这个 CSS 类名一起抓进来，因此第二条加了 `(?<![-\w])` 排除 kebab-case——类名是「哪几行看起来可勾选」的呈现绑定而不是能力判定。改造前这两条谓词恰好命中要删的四个函数、命中零处其他源码，改造后全量为零。

### 审查后的补强

`/code-review` 两轴各报一条，均已处理：

- **规格轴（中）：三个写入入口没有被逐个覆盖。** 原本只留了「四个推导函数不得被加回来」这条否定式断言，删掉任一入口的守门全量测试仍然全绿。补的是第四条架构守卫规则「消息动作入口必须由能力位守门」：锚点是 `emit('<动作>', message.id`，只命中「拿着一条消息向用户提供这个动作」的位置，因此聊天区域转交表情、页面装配转发处理器、外壳发起 RPC 这三处传 `messageId` 字符串的管道不被误抓；作用域取「离发起点最近的元素或函数」，相邻元素上的守门不会顺带放行本处。按 ADR-0073，架构守卫读取源码是第三类例外，与被禁的肯定式接线断言不是同一种成本结构：它描述被禁止的行为本身，改名、调整属性顺序、换一种守门写法都不会让它变红。**用变异实验验证过逐个成立**：分别拿掉右键撤回、右键贴表情、气泡下方回应条三处守门，全量扫描各自只报出对应那一个入口。
- **标准轴（硬）：能力判据持有者按文件名全免。** `MESSAGE_CAPABILITY_MODULE_PATTERN` 原本是 `/message-capabilities\.ts$/`，任何目录下新建同名文件都能绕过规则。收紧成 `/webqq\/message-capabilities\.ts$/` 并补一条自测：同名文件放在别的目录仍然报违规。与端口适配器那条按形状认持有者不同，能力判据的合法持有者只有一个，钉住位置比钉住文件名更贴 ADR-0073 的意图。
- **规格轴（低）：角色变化只断言了 `recall`。** 补一条「群角色只影响撤回位」，同一条消息在群主与管理员两个视角下比对完整的五项位，证明其余四项不随操作者摆动。
- **标准轴（判断题，不改）：两处 `buildMessageCapabilityMap(...)` 组装重复。** 两处是不同投影入口（工作台外壳与工作区缩略图）调用同一个 builder，与仓库既有的 `buildForwardPreviewMap` 两处调用同形；再抽一层只会多一个 Middle Man。
