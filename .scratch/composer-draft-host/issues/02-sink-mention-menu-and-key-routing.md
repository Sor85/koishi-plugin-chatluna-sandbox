# 02 — 提及菜单与按键路由下沉

**What to build:** 「输入 @ 之后会发生什么」以及「这一次按键是什么意思」变成可以单独驱动的判定。

菜单部分：什么时候开、什么时候关、候选怎么按已输入的片段过滤、选中一个候选后提及插到哪里、以及插完光标落在提及之后而不是跳走。

按键部分三条分流：菜单开着时方向键上下移动候选、Enter 选中候选、Esc 只关菜单；菜单关着时 Enter 才是发送。加上退格——删到提及边界时整块删掉而不是留下半截。

这一轮开始，草稿宿主回答「这次按键有没有被菜单消费」，组件只在未被消费时才走发送。这条边把「Enter 到底发送还是选中」从组件里的一个内联条件变成一个可断言的答案。

「组字期间不开候选菜单」有断言——输入法未上屏时弹出候选会把拼音当成提及片段去过滤。

界面一字不变。

**Blocked by:** 01

**Status:** resolved

- [x] 菜单开合的判定有断言，含输入 @ 后开、片段中出现空白后关、候选为空时不开
- [x] 候选过滤有断言，含按名称与按关键字两种命中
- [x] 选中候选后提及插入位置与光标落点各有断言
- [x] 从别处传入的提及被插到当前光标处，有断言
- [x] 方向键在菜单内移动、Enter 选中、Esc 只关菜单，三条各有断言
- [x] 菜单关着时 Enter 走发送，有断言
- [x] 退格跨提及整块删除有断言，含提及位于开头与位于两段文本之间（**按键不改由组件消费，见下**）
- [x] 「这次按键有没有被菜单消费」由草稿宿主回答，组件不自己判
- [x] 「组字期间不开菜单」有断言
- [x] 逐条分类表落盘并核对断言总数；先删除再拆分用例
- [x] 那个混了三个主题的用例拆成回复上下文、附件浮层、内联提及三个
- [x] 组件的 props、emits、事件名与载荷逐字不变
- [x] DOM 快照与基线逐像素一致，光标快照与基线一致
- [x] 别处变红的断言逐条区分真红与假红，处置记入 Comments
- [x] 完整测试、类型检查与构建通过

## Comments

### 落地形状

菜单与按键都进了票 01 的 `client/webqq/composer-draft-host.ts`——草稿与菜单必须同处一个模块，
拆开会让两者之间的 interface 宽到没有意义。新增的纯判定：

- `resolveComposerMentionMenu`：菜单该不该开。四条关闭条件各自成立（没有候选、组字中、
  光标不在文本 token 上、片段里出现空白）。
- `routeComposerKey`：这次按键是什么意思。返回 `none` / `blocked` / `move-candidate` /
  `select-candidate` / `close-menu` / `submit` 六种动作之一。

宿主上新增 `mentionMenuOpen` / `mentionCandidates` / `mentionMenuIndex` 三个只读态与
`routeKey` / `selectMentionCandidate` / `setMentionSelection` / `closeMentionMenu` 四个动作。
组件的 `handleEditorKeydown` 从 36 行的六段内联条件收成 8 行：问一次 `routeKey`，
按返回值决定要不要 `preventDefault`，只在 `submit` 时走发送。

高亮项的夹紧从一个 `watch` 改成 `computed`：候选表变短时高亮项自动收回来，
不再依赖某次副作用去修正它。行为口径与治理前逐字相同（候选为空时归 0，否则夹到末位）。

### 退格：断言落地，接线不动

**这一条与 What to build 的字面要求有出入，需要一次确认。**

「退格到提及边界时整块删掉」这条规则今天由 `contentEditable = 'false'` 提供——提及芯片是原子
节点。在两个引擎里都实测过：一次退格删掉整块芯片，从不留下半截 `@测试` 文本。

原本的打算是把退格也路由给宿主，用既有的 `deleteComposerBackward` 算 token、再自己写光标。
实测后放弃，两条理由都是硬的：

1. **它会改变 Firefox 里 Selection 落点的表示形式。** 「退格两次」删掉整块提及后，Chromium 把
   anchor 留在文本节点上（`#text`, offset 3），Firefox 留在编辑器元素上（`DIV`, offset 1）；
   自己写光标会把 Firefox 也变成 `#text`, 3。视觉位置相同，但票上「光标快照与基线一致」这条
   就不成立了。
2. **`deleteComposerBackward` 的第一条分支与今天的行为不同。** 光标停在提及后自动补入的分隔
   空格之后时，它把提及**和分隔空格**一起删掉；今天的宿主只删那个空格，芯片留着。
   路由过去等于悄悄改掉一次真实行为。

因此这一票只把**删除之后的口径**变成可断言的事实，不动接线：`composer-draft-host.test.ts`
新增「退格跨提及整块删除」三条，分别驱动提及位于两段文本之间、位于开头、以及删干净之后
（草稿算空、占位文案回来）。`routeComposerKey` 里退格明确返回 `none`，并在注释里写明为什么。

如果更希望要「跨引擎口径一致」而愿意接受 Firefox 那一处 anchor 表示形式的变化，
把退格改成宿主消费是一次小改动，本票的判定与断言都已就位。

### 别处变红的处置

一条都没有变红。移动前后 `tests/webqq-composer.test.ts` 里与菜单有关的断言只有
`WebqqMentionMenu`（模板里的组件名，未变）与 `chatluna-sandbox-composer-mention`（类名，未变）。

### 删除与拆分的账

见 `../assertion-classification.md`。本票在 `tests/webqq-composer.test.ts`：

- 删 1 条：`expect(attachmentIndex).toBeGreaterThan(replyIndex)` 在同一个用例里出现两次，去重。
- 加 3 条：`draftHost.routeKey({` 接线，加两条否定式守卫
  （`event.key === 'ArrowDown'` 与 `detectMentionTrigger` 不得回到组件里）。
- 那个混了三个主题的 31 条用例拆成三个：回复上下文与附件共用的浮动包络、回复上下文自身的
  省略与按钮、提及作为内联 token。用例 7 个 → 9 个（含票 01 新增的接线用例）。

### 验证

| 命令 | 结果 |
| --- | --- |
| `yarn test` | 通过。173 个文件、1543 项 |
| `yarn typecheck` | 通过 |
| `yarn build` | 通过。`@vueuse/core` 两处 `#__PURE__` 注解警告是既有的 |
| DOM 快照 ＋ 光标快照（Chromium） | 15 个采样点与 feature 基线逐字一致，控制台无错误 |
| DOM 快照 ＋ 光标快照（Firefox） | 15 个采样点与 feature 基线逐字一致，控制台无错误 |

证据与脚本见 `../evidence/`。
