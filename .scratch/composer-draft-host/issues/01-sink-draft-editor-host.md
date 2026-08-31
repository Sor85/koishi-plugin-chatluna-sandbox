# 01 — 草稿与编辑器的双向同步下沉成宿主模块

**What to build:** 输入框里「打的字变成草稿、草稿变回节点、光标停在该停的位置」这件事，第一次能不起组件就驱动和断言。

草稿与 contenteditable 之间的双向转换今天全留在组件里：从子节点遍历回读出草稿，把草稿渲染成节点，把光标放到第几个 token 的第几个偏移，以及读回当前光标落在哪个 token 的哪个偏移。这些是宿主操作，带副作用、有时序，按最小结构接口注入——读回节点、渲染节点、读光标、写光标、等下一拍——测试用造假宿主驱动，不注入 DOM 类型。

两条今天只写在注释里的时序成为可断言的事实：**input 事件有时早于 Selection 更新，必须等一拍再读回草稿**，否则读到的是旧光标；**输入法组字期间不许读回草稿**，否则未上屏的拼音会被当成正文。输入法状态从模板上两个内联赋值变成宿主模块的一部分。

提及菜单、按键路由、附件与发送这一轮都还留在组件里，它们改用宿主模块暴露出来的草稿与光标。界面一字不变。

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] 从节点回读出草稿有断言，含纯文本、单个提及、文本与提及交替三种形态
- [x] 把草稿渲染成节点有断言，且渲染后再回读得到同一份草稿
- [x] 按 token 与偏移写光标有断言，含写到提及之后、写到末尾、目标越界时的兜底
- [x] 读回光标有断言，含光标落在提及节点内部时的归属
- [x] 「input 触发后、Selection 尚未更新」这个中间态能被驱动，且此时不读回草稿
- [x] 「组字期间不读回草稿」有断言
- [x] 宿主操作经注入的最小结构接口，测试用造假宿主驱动，不注入 DOM 类型
- [x] 已有的纯 token 模块一行不改，其测试一条不改
- [x] 逐条分类表落盘并核对断言总数；先删除再拆分用例
- [x] 那一条落错文件的用户切换栈断言挪回它自己的测试文件
- [x] 组件的 props、emits、事件名与载荷逐字不变
- [x] DOM 快照与基线逐像素一致，光标快照与基线一致
- [x] 完整测试、类型检查与构建通过

## Comments

### 落地形状

新模块 `client/webqq/composer-draft-host.ts`，注入形状按子问题分成两种，沿用已有做法：

- 纯判定吃朴素结构，直接单元测试：`readComposerDraftTokens`（子节点读数 → 草稿 token）、
  `planComposerHostNodes`（草稿 → 节点计划）、`resolveComposerCaretFromReading`（读回光标）、
  `resolveComposerCaretTarget`（写光标）。
- 带副作用与时序的宿主操作走 adapter：`readNodes` / `renderNodes` / `readCaret` / `writeCaret` /
  `nextTick` / `focus`。测试用造假宿主驱动，`nextTick` 攒进待办队列由测试排，因此
  「input 已触发、Selection 尚未更新」那个中间态可以被驱动。

`composer-draft-host.test.ts` 35 个用例、54 条 `expect(...)`。

### 两条时序的实际口径

**input 早于 Selection 更新。** 治理前是「先立刻读一遍（可能拿到旧光标）→ 更新菜单 → `nextTick`
后再读一遍 → 再更新菜单」。治理后只在等一拍之后读一次。两者对用户不可区分：`nextTick` 在同一批
微任务里解决，中间不发生绘制，因此不存在「先按旧光标渲染一帧」的可能。这么改之后
「此刻不读回草稿」才是一条可以驱动、可以断言的事实，而不是一次会被立刻覆盖掉的中间赋值。

**组字期间不读回草稿。** 治理前组字期间照常读回，未上屏的拼音因此进了草稿。直接改成「不读回」
会让占位文案在组字期间重新出现（草稿仍为空），和拼音叠在一起。因此空草稿的判定改成
`!composing && isComposerDraftEmpty(tokens)`：占位文案、`data-empty` 与发送按钮的可用性口径
与治理前逐字相同，而草稿本身不再被未上屏的拼音污染。浏览器快照里
「组字中」采样点的 `data-empty` 与占位可见性两个引擎都与基线一致。

### 顺带发现、本轮不修的既有缺陷

子节点序号与 token 序号按「一个 token 一个节点」对应。浏览器换行插入的 `<br>` 在回读时会并进
相邻文本 token，节点数从此多于 token 数，落在换行之后的光标因此被夹到最后一个 token 上，
表现为「按 shift+Enter 换行之后再输入 `@` 不弹候选菜单」。治理前的算术完全相同，本轮逐字保留
并在模块里写了边界注释，不顺手改判——改判会让光标快照与基线不一致，且属于另一件事。

### 删除的断言与接住它们的地方

见 `../assertion-classification.md`。本票在 `tests/webqq-composer.test.ts` 删 7 条、挪出 2 条、
加 2 条接线断言，1 条 `aria-label="清除回复"` 改走 `expectUserFacingCopy`；用例数不变（删掉一个用户切换栈用例，新增一个接线用例）。

### 别处变红的处置

`tests/group-mention.test.ts` 两条断言变红，都是假红——函数搬家导致的标识符变化，行为口径未变：

| 断言 | 判定 | 处置 |
| --- | --- | --- |
| `serializeComposerDraft(draft.value.tokens)` | 假红。序列化口径未变，由 `composer-draft.test.ts` 与 `composer-draft-host.test.ts` 的 `serialize()` 断言执行 | 删 |
| `insertComposerMention` | 假红。插入口径未变，只是改由宿主调用 | 换成 `draftHost.insertMention(` 的接线断言 |

### 验证

| 命令 | 结果 |
| --- | --- |
| `yarn test` | 通过。173 个文件、1513 项 |
| `yarn typecheck` | 通过 |
| `yarn build` | 通过。`@vueuse/core` 两处 `#__PURE__` 注解警告是既有的，与本票无关 |
| DOM 快照 ＋ 光标快照（Chromium） | 15 个采样点逐字一致，控制台无错误 |
| DOM 快照 ＋ 光标快照（Firefox） | 15 个采样点逐字一致，控制台无错误 |

证据与脚本见 `../evidence/`。
