# 断言逐条分类：`tests/webqq-composer.test.ts`

**基线提交：** `e9ab03e`（本 feature 动手前）
**基线断言总数：** 79 条 `expect(...)`，分布在 7 个用例里
**失效条件：** 总数一旦变动，本表整体失效，必须按新提交重新分类。行号只在基线提交上有意义。
**动手顺序：** 先删除断言，再拆分用例。反过来会让行号整体位移，表随即失效。

## 基线口径

按断言对象与匹配器分类，不按断言意图：

| 断言对象 | 条数 |
| --- | --- |
| 组件源码（`webqq-composer.vue` / `webqq-chat-pane.vue`），肯定式文本匹配 | 39 |
| 组件源码，否定式文本匹配 | 5 |
| 组件源码，元素顺序的数值比较（`toBeGreaterThan`） | 4 |
| 样式表（`webqq-composer.css` 及从它切出的规则片段），肯定式 | 18 |
| 样式表，否定式 | 5 |
| 焦点判定模块的行为断言（`shouldRestoreComposerFocus`，`toBe`） | 8 |
| **合计** | **79** |

可删的量集中在「组件源码，肯定式文本匹配」这 39 条。18 条样式文本断言、10 条否定式守卫与
8 条焦点行为断言按 ADR 0073 的第一、二类例外与「焦点判定模块不动」一并保留，一条不动。

**基数说明：** 规格里「六十三条肯定式断言」不对应本仓库任何一种口径下的实际条数。规格自己也
写明「分类基数按五类口径重新统计，不要沿用『肯定式条数』这个数字当作可删量」，因此本表按上面
这份逐条数出来的基数为准。

## 五类判据与处置

判据是**成本结构**而不是断言形式（ADR 0073）。

| 类别 | 处置 | 本 feature 涉及条数 |
| --- | --- | --- |
| 1. 已有行为测试覆盖同一事实 | 全删 | 12（票 01 五条、票 02 一条、票 03 六条） |
| 2. 样式文本 | 全留 | 23（本 feature 不动） |
| 3. DOM 结构与元素顺序（含与样式选择器构成结构契约的类名） | 全留，按主题归入用例并加块注释 | 20 |
| 4. 实现细节契约 | 删肯定式、留否定式 | 见类别 1；否定式 10 条全留 |
| 5. 用户文案与展示语义 | 全留，改由 `expectUserFacingCopy` 表达 | 1 |

**删除范围的口径：** 只删本 feature 真的从组件里搬走、并且有下沉后的行为断言接住的那些条。
与本轮无关的实现细节断言（颜色模式接线、布局观察、类型声明原文）一律不动——它们的负责人是
各自的候选，顺手删掉会把「哪一次改动消化了哪条债务」搅混。

## 票 01 删除的 5 条

| 行号 | 断言 | 接住它的行为断言 |
| --- | --- | --- |
| 31 | `const draft = ref<ComposerDraft>(createEmptyComposerDraft())` | `composer-draft-host.test.ts`「施加草稿」三条、「从子节点回读出草稿」七条 |
| 36 | `contenteditable 的 input 事件有时早于 Selection 更新`（注释原文） | 同上「input 触发后、下一拍尚未到来时不读回草稿」「等一拍之后读到的是更新后的光标」 |
| 37 | `void nextTick(() =>` | 同上；下一拍改经 adapter 注入，测试逐拍驱动 |
| 175 | `serializeComposerDraft` | 同上「插到当前光标处并把光标留在提及之后」的 `serialize()` 断言 |
| 46 | `<ContextMenu>` | `user-stack.test.ts`「头像菜单在 Tooltip 内部直接绑定按钮以保留右键坐标」有更强的完整嵌套断言 |

另外两条与用户切换栈有关、且在 `user-stack.test.ts` 里已有同一条断言的重复项一并删除：

| 行号 | 断言 | 已有同一条断言的地方 |
| --- | --- | --- |
| 45 | `<TooltipTrigger as-child>` | `user-stack.test.ts` 的 `<Tooltip v-for="(sender, index) in orderedSenders"` 与整段嵌套断言 |
| 47 | `class="webqq-composer-user-menu" style="z-index: 160"` | `user-stack.test.ts` 同一条断言 |

## 票 01 挪走的 2 条

用户切换栈的布局动画接线，落在发送控件的测试文件里属于放错位置。它自己的测试文件
`tests/user-stack.test.ts` 有独立的豁免条目与负责人（待开候选：用户切换栈视图行为下沉）。

| 行号 | 断言 | 去处 |
| --- | --- | --- |
| 48 | `recordUserStackLayout` | `user-stack.test.ts`「切换发送者时只对头像区做 FLIP 布局动画」 |
| 49 | `await layout.animate({ duration: 260, ease: 'out(3)' })` | 同上 |

用例 `保留 Tooltip 与 ContextMenu 的原始嵌套边界` 五条断言至此全部删除或挪走，用例本身随之移除。

## 票 01 新增的接线断言 2 条

类别 4 的肯定式部分，按 ADR 0073 的要求在块注释里写明它保护的是接线而不是判定：组件必须把
DOM 映射接到草稿宿主上，少接一根线的表现是输入框完全不响应输入。

| 断言 | 说明 |
| --- | --- |
| `createComposerDraftHost` | 组件确实建立了草稿宿主，而不是自己维护一份草稿 |
| `from './webqq/composer-draft-host'` | 与既有的 `composer-focus` 接线断言同一形状 |

## 别处受影响的断言

`tests/group-mention.test.ts`（它自己的豁免条目：待开候选：关系菜单视图行为下沉）：

| 行号 | 断言 | 处置 |
| --- | --- | --- |
| 47 | `serializeComposerDraft(draft.value.tokens)` | 删。序列化改由宿主的 `serialize()` 提供，行为由 `composer-draft.test.ts` 与 `composer-draft-host.test.ts` 断言 |
| 48 | `insertComposerMention` | 换成 `draftHost.insertMention(` 的接线断言：提及请求确实到了草稿宿主 |

## 结果

- 票 01 后：`tests/webqq-composer.test.ts` 79 条 → 71 条 `expect(...)` ＋ 1 条 `expectUserFacingCopy(...)`（原第 202 行的 `aria-label="清除回复"` 改走文案出口），用例 7 个 → 7 个（删掉一个用户切换栈用例，新增一个草稿宿主接线用例）
- `tests/user-stack.test.ts` ＋2 条（挪入），用例 6 个 → 7 个
- `tests/group-mention.test.ts` 条数不变（删 1 加 1）
- 新增行为断言（三票 ＋ 退格接管合计）：`composer-draft-host.test.ts` 130 条 / 72 个用例、`composer-attachments.test.ts` 31 条 / 20 个用例、`composer-send.test.ts` 29 条 / 17 个用例

## 票 02 与票 03 的变动账

本表行号自票 01 落地后即失效。后续两票不再重排本表，而是逐票记录增删量与「删掉的每一条由谁
接住」——后者写在各票的 Comments 里。

| 票 | 变动 | `expect(...)` 条数 | 用例数 |
| --- | --- | --- | --- |
| 01 草稿宿主 | 删 7、挪出 2、加 2、1 条改走文案出口 | 71 | 7 |
| 02 提及菜单与按键路由 | 删 1（重复的元素顺序断言）、加 3（接线与否定式守卫） | 73 | 9 |
| 03 附件与发送编排 | 删 6、加 3 | 70 | 9 |
| 退格接管提及边界（票 02 收口） | 组件测试不动 | 70 | 9 |
