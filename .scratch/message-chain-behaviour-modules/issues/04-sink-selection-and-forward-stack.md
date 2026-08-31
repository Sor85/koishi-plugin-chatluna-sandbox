# 04 — 多选与合并转发栈下沉

**What to build:** 多选转发的整个流程，以及嵌套合并转发的逐层打开与逐层返回，变成两个可以单独驱动的模块。

多选部分：进入多选、切换某条的选中、退出多选、哪些消息可选（读消息能力位）、键盘操作，以及确认转发到目标会话。今天这些判定散在聊天区域的 `script` 里，唯一的验证手段是点界面。

合并转发栈部分：嵌套转发的推入与弹出、按入参（转发资源标识或消息标识）加载、以及逐层返回时栈顶的取值。它是一个纯栈加一次异步读取，今天却和整个聊天区域的其余状态混在一起。

本票同时治理断言同一份组件源码的那个多选测试文件——它与消息列表测试有重复条目（同一条 `selectionMode` 的类型声明、同一条禁用条件的子串）。不一并治理会出现「删了这边那边还在」。

界面一字不变。

**Blocked by:** 02

**Status:** resolved

- [x] 进入、切换、退出多选各有断言，含重复进入与空选中退出的边界
- [x] 可选性判定读消息能力位，撤回消息与事件消息不可选，各有断言
- [x] 键盘操作有断言
- [x] 确认转发的成功与失败路径各有断言
- [x] 嵌套转发栈的推入、弹出、栈顶取值与「弹到空栈即关闭」各有断言
- [x] 按转发资源标识与按消息标识两种入参加载各有断言
- [x] 多选测试文件与消息列表测试之间的重复断言消除，不留两份
- [x] 逐条分类表落盘并核对断言总数；先删除再拆分用例
- [x] 组件的 props、emits、事件名与载荷逐字不变
- [x] DOM 快照与基线逐像素一致（含多选态那份专项脚本）
- [x] 完整测试、类型检查与构建通过

## Comments

### 落地的两个模块

- `client/webqq/message-selection.ts`：进入、切换、退出、可选性、确认转发、Escape 优先级。
  状态是一个 `{ active, messageIds }` 值对象，所有函数纯函数化，视图只把结果写回 `ref`。
- `client/webqq/forward-dialog-stack.ts`：推入（`replace` / `push` 两种模式）、弹出、栈顶取值、
  返回按钮可见性、按入参异步读一帧（含嵌套资源预读与逐个容错）。

行为断言 36 条（`message-selection.test.ts` 21 条 + `forward-dialog-stack.test.ts` 15 条）。

### 顺带修掉的一份第二口径

`isSelectableMessageId` 原先在聊天区域里按 `!message.event && !isRecalledMessage(message)`
自己推导可选性——那正是消息能力里 `forward` 那一位，ADR 0078 明确只许有一份。它躲过了架构
守卫「客户端不自己判定消息能力」：谓词要求可行性后缀紧跟词边界，而 `isSelectableMessageId`
的 `able` 后面接着 `MessageId`，`\b` 不成立。

现在改成读投影给出的 `messageCapabilities[id].forward`。判据本身完全一致
（`denyMessageCapability('forward')` 就是这两条），因此这是纯收敛，不是行为变化。

守卫的这个洞没有在本票修——收紧谓词会牵动别处，登记在「待开候选：收紧能力谓词的词边界」。

### 「弹到空栈即关闭」的实际口径

票面这条要求需要澄清：现有实现里「返回」永远不会弹到空栈——只剩根帧时 `popForwardFrame`
原地返回，因为根帧的返回按钮本来就不显示。弹到空栈是**关闭**这个动作干的
（`closeForwardStack()` → `[]`），而 `readForwardStackTop([])` 返回 `undefined`，视图据此不渲染
弹窗。两条都有断言，按现有行为写，没有为了迎合措辞去改口径。

### 两次命名调整

`canOpenForwardTarget` 与 `canNavigateForwardBack` 触发了架构守卫的「判定词 + 消息动作」谓词
（`can` + `forward`）。两者问的都不是消息能力——一个问本地选中集合有没有内容，一个问栈深度。
改名为 `hasSelectedMessages` 与 `hasParentForwardFrame`，并在注释里写明为什么避开那个形状。
**没有放宽谓词**：宁可换个更准确的名字，也不要为一次误报把规则改松。

### 断言处置

本票动两个文件，两处重复条目一并消除：

`tests/webqq-message-selection.test.ts` 第二个用例（基线 17 条）：

| 断言 | 处置 | 接住它的行为断言 |
| --- | --- | --- |
| `function enterSelection(messageId: string)` | 删 | 签名由 `vue-tsc` 强制 |
| `selectedMessageIds.value = [messageId]` | 删 | 「入口那条成为默认选中」 |
| `function toggleSelection(messageId: string)` | 删 | 「未选中的加进来，已选中的去掉」等四条 |
| `function exitSelection()` | 删 | 「退出后既不在多选态也没有选中」 |
| `event.key !== 'Escape'` | 删 | 「Escape 的优先级」六条 |
| `sendForwardMessage: [input: ...]` | 删 | emits 声明由 `vue-tsc` 强制（与消息列表测试重复的那条同源） |
| `已选 N 条` / `合并转发` | 改 `expectUserFacingCopy` | — |
| 其余 6 条（`ref` 声明、切会话 watch、DOM 槽位、否定式提示文案） | 留 | 接线与 DOM 结构，模块看不到 |

`tests/webqq-chat-pane.test.ts` 的转发栈段（基线 9 条）：删 5 条（`forwardDialog` 的 computed
原文、`:can-navigate-back` 的表达式原文、`mode === 'push' ? ... : ...` 三元、两条 `forwardStack.value =`
赋值原文），留 4 条接线（`ref` 声明、`@back` 绑定、两个入口各自用哪种模式）。

`tests/webqq-message-selection.test.ts` 与 `tests/webqq-message-list.test.ts` 之间原有两条重复
（同一条 `selectionMode?: boolean` 类型声明、同一条右键禁用条件子串）。前者已随本票与票 03
删除，后者保留在消息列表测试里那一份，不留两处。

### DOM 快照

两份脚本各跑一遍改动后与 `git stash` 回到基线后的结果，**都逐字一致**：

1. 通用快照（四个会话 + 两个右键菜单）——一致。
2. **多选态专项快照**——一致。四个采样点：进入多选（49 行全部 `is-selecting` / `is-selectable`，
   入口那条 `is-selected`，操作栏「已选 1 条」，composer 已被替换）、点头像后（已选 2 条，
   证明多选下头像确实不阻断冒泡）、点气泡后（已选 3 条）、按 Escape 后（全部归零，composer 复位）。

票 03 缺的那份多选态证据在这里补上了。

### 验证

`yarn test`（168 文件 / 1373 用例全通过）、`yarn typecheck`、`yarn build` 均通过。
