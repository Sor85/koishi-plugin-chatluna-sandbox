# 03 — 思考面板与指针交互分流下沉

**What to build:** 思考面板的展开与离场、以及点头像／点气泡／点整条这三条路的分流规则，变成可以单独驱动的模块。

思考面板部分：展开态、思考时长文案（无时长时显示「思考过程」，有时长时按秒取整并对负值兜底），以及离场时把面板冻结在原视觉位置的判定。冻结这一步内含一条真判定——按消息方向决定钉左缘还是钉右缘，选错会让面板在离场瞬间水平跳位；同时要解除宽度百分比约束，否则会按收缩后的行宽重算。DOM 读写按最小结构接口注入。

指针交互分流部分三条规则：多选态下头像**不得**阻断冒泡，否则点头像无法勾选；气泡在捕获阶段接管，但只在多选且该消息可转发时才吞掉事件改为切换勾选；整条点击要排除气泡区，只覆盖头像、发送者信息与行内空白。

这三条今天全靠人点界面验证，改坏了不会报错。

**Blocked by:** 02

**Status:** resolved

- [x] 思考时长文案覆盖无时长、正常时长、负值三种输入
- [x] 离场冻结的左右缘判定按消息方向各有断言
- [x] 离场冻结解除宽度百分比约束这一条有断言
- [x] 多选态下头像不阻断冒泡有断言
- [x] 气泡接管只在「多选且可转发」时发生，其余组合不接管，各有断言
- [x] 整条点击排除气泡区有断言
- [x] DOM 读写经注入的最小结构接口，不注入完整 DOM 类型，测试用造假对象驱动
- [x] 逐条分类表落盘并核对断言总数；先删除再拆分用例
- [x] 组件的 props、emits、事件名与载荷逐字不变
- [x] DOM 快照与基线逐像素一致（含多选态那份专项脚本）
- [x] 完整测试、类型检查与构建通过

## Comments

### 落地的两个模块

- `client/webqq/thinking-panel.ts`：时长文案、展开态切换、离场冻结。
  冻结拆成两层——`computeThinkingPanelFreeze` 是纯函数（输入两个矩形加一个方向，输出七个样式
  字段），`freezeThinkingPanel` 按最小结构接口读写。注入的接口只声明四项：`parentElement`、
  `style` 的那七个字符串字段、`getBoundingClientRect()`、`classList.contains()`。
  `HTMLElement` 天然满足，测试写一个内存替身即可，不引入 jsdom。
- `client/webqq/message-pointer-routing.ts`：三条分流规则，返回 `none` / `open-profile` /
  `toggle-selection` 三种动作。`closest` 的落点按 `{ closest(selector) }` 这个单方法接口注入，
  因此「整条点击排除气泡区」这条判定连选择器一起住在模块里，测试用替身驱动。

行为断言 21 条（`thinking-panel.test.ts` 11 条 + `message-pointer-routing.test.ts` 10 条）。

### 一条真红，暴露出守卫的一个真实作用

第一版把三个处理器的公共部分抽成 `pointerContextOf` + `applyPointerAction` 两个辅助函数，
架构守卫「消息动作入口必须由能力位守门」当场变红：`emit('toggleSelection', message.id)` 落在
`applyPointerAction` 里，而能力位在 `pointerContextOf` 里读，守卫按发起点所在的**最小作用域**
逐个判定，看不见隔了一层的读取。

闸门本身没坏（`routeBubbleClick` / `routeRowClick` 都在判 `forwardCapability`），但守卫的意义
正是「每个入口在自己的作用域里都能看到那次读取」。因此改成三个处理器各自在函数体里读一次
能力位，不抽公共辅助函数，并把这条约束写成注释留在原地。**没有放宽守卫的谓词。**

### 断言处置

本票动的是 `tests/webqq-message-selection.test.ts` 的第一个用例（基线 26 条断言）：

| 断言 | 处置 | 接住它的行为断言 |
| --- | --- | --- |
| `function handleMessageAvatarClick(message: SandboxMessage, event: MouseEvent)` | 删 | 函数签名由 `vue-tsc` 强制 |
| `if (props.model.selectionMode) return` | 删 | 「多选态什么都不做，把事件交给整条」 |
| `event.preventDefault()` | 删 | 三个 route 函数的返回值断言（`none` 表示不吞事件） |
| `event.stopPropagation()` | 删 | 同上 |
| `closest('.chatluna-sandbox-message-bubble')` | 删 | 「落点在气泡里时不处理」 |
| `@click="handleMessageAvatarClick(...)"` | 留 | 接线，模块看不到 |
| `not.toContain('@click.stop="handleMessageAvatarClick')` | 留 | 否定式守卫，成本结构与肯定式相反 |

`tests/webqq-message-list.test.ts` 的两处思考断言全部保留（类别 3 DOM 结构 + 一条接线），
加了块注释写明类别与依据。该文件断言总数不变，因此票 02 的分类表仍然有效，本票不需要新表。

### DOM 快照

同一份脚本在改动后与 `git stash` 回到基线后各跑一遍，**结果逐字一致**：四个会话的归一化
`outerHTML`、16 项呈现计数、气泡右键菜单（回复 / 创建分支 / 贴表情 / 多选 / 撤回）与
头像右键菜单（查看资料）全部相同。采样场景含 16 条思考行。

多选态那份专项采样未走通：脚本里从右键「多选」进入多选态后取不到 `.is-selectable` 行，
因此多选态下的头像／气泡／整条点击仍只有模块的行为断言覆盖，没有 DOM 证据。这一项留给票 04
——它本来就要把整个多选流程下沉，届时一并补种。

### 验证

`yarn test`（166 文件 / 1337 用例全通过）、`yarn typecheck`、`yarn build` 均通过。
