# 02 — 导航折叠与当前目标进 module，「切换记录时全部复位」成为一条事实

**What to build:** 折叠左侧导航分组、滚动时高亮当前分组的行为一字不变；切换到另一条模型请求记录后，十项展开态全部回到初始——而这一条第一次是可断言的事实，不再是一段十四行的手写赋值。

两项状态搬进票 01 建好的 module：折叠导航分组、当前导航目标。十项到齐之后，「切换记录时全部复位」从「逐项清十次、漏掉一项不报错」变成 module 上的一次调用与一条断言。漏掉一项的表现是上一条记录的展开态残留到下一条，今天没有任何红灯。

组件那一侧仍然负责调用定位器的复位与把滚动容器归零——那两件事不属于展开态。导航跟踪与滚动留在组件。

**断言豁免与棘轮随本票收口。** 两条从「未治理」挪到「已消化」那一组，棘轮相应减二（棘轮不数已消化那一组）。第三条的负责人改指向一条新的待开候选「模型请求工作台外壳行为下沉」——它的二十三处源码断言里**零处**涉及这十个状态，它断言的是外层工作台组件，本轮下沉消化不了它。留着现在的负责人会让下一轮有人照着做一遍才发现。

不写新的架构决定记录，也不加领域词汇：「有状态但与 DOM 无关的行为住在反应式 module 里」已经是记录在案的决定，新 module 是它的第四个实例；展开态与原文态是界面状态而不是领域概念。

**Blocked by:** 01

**Status:** done

- [x] 折叠导航分组与当前导航目标两项住在 module 里
- [x] 折叠导航分组的界面行为一字不变，有断言
- [x] 滚动时当前分组的高亮行为一字不变
- [x] 「切换记录时十项全部复位」是 module 上的一次调用，且有断言逐项验证
- [x] 组件仍负责调用定位器的复位与把滚动容器归零，这两件事未被吸收进 module
- [x] 导航跟踪与滚动留在组件
- [x] 两条断言豁免从「未治理」挪到「已消化」，理由与负责人均非占位文字
- [x] 棘轮相应减二，且只减不增
- [x] 第三条豁免的负责人改指向「模型请求工作台外壳行为下沉」，理由写明它的源码断言零处涉及这十个状态
- [x] 「移除任一豁免后对应文件重新报错」那条元守卫断言仍然成立
- [x] 未写新的架构决定记录，未给领域词汇加新词
- [x] 未借机合并证据定位与证据导航
- [x] 未新增肯定式实现细节断言
- [x] DOM 快照与基线一致：折叠一个导航分组、切换到另一条记录（验复位）
- [x] Chromium 与 Firefox 各跑一次，控制台无错误
- [x] `git diff --stat` 里不出现服务端源码路径
- [x] 验收后清理浏览器会话与工具生成的临时目录
- [x] 别处变红的断言逐条区分真红与假红，处置记入 Comments，不重判前几轮判定保留的断言
- [x] 完整测试、类型检查与构建通过

## Comments

### 落地形状

- `collapsedNavigationGroups` 与 `activeNavigationTarget` 进 module，十项到齐。两项仍以 `ref`
  形式暴露给模板读取（`aria-expanded`、`v-show`、`is-current` 三处绑定一字未动），转换则是
  module 上的两个函数。
- `focusNavigationTarget(target)` 收下「当前导航目标只在真的变了时才改变，空目标不清掉它」这条
  规则并返回是否变了；视图据此决定要不要把左侧条目滚进视野。空目标不清掉当前目标原先只是
  `if (nextTarget && …)` 里的一个条件，现在是一条断言——它的失效形态是滚到页尾时左侧高亮闪掉一下。
- 视图侧的 `toggleNavigationGroup` 退成两行：转调 module，再排一次跟随重量。折叠分组会改变
  左侧条目布局，重量是 DOM 的事，留在视图。
- 复位从十四行手写赋值变成 `resetExpansion()` 一次调用。视图那一侧仍然负责 JSON 树缓存、
  历史预览缓存、导航锚点脏标记、`locator.reset()` 与把滚动容器归零——那些都不属于展开态。

### 断言豁免与棘轮

- `tests/model-request-analysis.test.ts` 与 `tests/model-request-read-cost.test.ts` 从「未治理」
  移入「已消化」，棘轮 21 → 19（只减不增）。已消化那一组的共用理由补上「成本结构」一项：
  读取代价那份文件剩下的肯定式断言守的是成本而不是判定。
- `tests/model-request-read-cost.test.ts` 里那个 `it` 加了块注释，按 ADR-0073 对保留肯定式
  第 4 类断言的要求写明它保护什么、少哪一条会怎样失效（不报错，只是打开大请求变慢、输入掉帧），
  以及行为那一半已经由 `tests/analysis-expansion.test.ts` 断言。
- `tests/webqq-model-request-workspace.test.ts` 的负责人改成「待开候选：模型请求工作台外壳行为
  下沉」。核过：它读的是 `page.vue`、`webqq-sidebar.vue`、`model-request-workspace.vue`、
  `model-response-content-preview.vue`、`model-request-trajectory.vue` 与
  `model-request-json-tree.vue`，**一条都不读 `analysis-view.vue`**，因此零处涉及这十项状态。

### 与 ADR-0062 的冲突（已收口）

`docs/adr/0062-put-evidence-locating-behind-a-testable-adapter.md` 第二段原先写着「展开状态（折叠
卡片、原始消息、展开工具、强制展开长文本、当前高亮）继续由视图以 Vue `ref` 持有」，理由是「只有
时序需要进入可测 module，渲染状态留在框架里更简单」。本轮把前四项搬进了 `analysis-expansion`，
因此那句描述与那条理由都已过时。

按 `docs/agents/domain.md` 的「处理 ADR 冲突」，冲突先明确登记而不静默覆盖；报给用户后取得决定：
**订正 ADR-0062 那一段，不为展开态单开记录**——它是一句话的订正而不是一条新决定，因此也不违反
本票「不写新的架构决定记录」。落地形状：

- ADR-0062 第二段改成「定位 module 只拥有展开决策，不拥有展开态本身」，写明展开态起初在视图、
  后来收进 `analysis-expansion`，以及为什么收（那两条规则改坏了都不报错，留在组件里没有观察面）。
  「决策与状态分离」这条线没有变，变的只是状态的主人。当前高亮与当前 occurrence 作为例外写明
  仍归定位器，理由是复位不能拆到两个主人手里。
- ADR-0065 第二段里那句「这一分工沿用 ADR-0062 对展开状态的处理」跟着订正：它借的是决策与状态
  分离，而不是「状态留在视图里」这个已经变了的位置。
- `CONTEXT.md` 未动。「展开状态」仍在证据定位那条的 `_Avoid_` 行上，含义是它不是证据定位的
  同义词——本轮把它独立成 module 之后这一点更成立，不是要给它加词条。

### 复审修正（`/code-review`）

- **四处集合翻转收成一个 `toggled` helper**（Duplicated Code）。`toggleCard` / `toggleTool` /
  `toggleHistoryVariableRaw` / `toggleNavigationGroup` 原先各抄一遍
  `next.has(x) ? next.delete(x) : next.add(x)`；抄四份的代价是其中一处在后续改动里悄悄分叉，
  表现为那一类东西再也收不起来。`setMessageRaw` 与 `setResponseRaw` 的「一切就登记挂载」没有合并：
  一个是集合并集、一个是布尔赋值，形状只是相似，合并会把两种类型塞进一个签名。
- **模板的导航折叠读取改走 `isNavigationGroupCollapsed`。** 原先模板直接读集合
  （`collapsedNavigationGroups.has(group.key)`），而谓词只有测试在用——同一个事实两条读法，
  其中一条在生产代码里没人走。收敛后的口径是：集合成员一律经谓词读（调用方不必知道那是个 `Set`），
  纯布尔仍以 `ref` 形式读（`v-if="responseRawMounted"` 是惯用写法，包一层函数只是噪音）。
  集合本身不再从解构里取，`aria-expanded` 与 `v-show` 那两条结构契约断言跟着改标识符，口径未变。
- **`nextTarget!` 去掉。** 改成 `scrollNavigationTargetIntoView(activeNavigationTarget.value)`
  ——要滚进视野的本来就是刚写进去的那个当前目标，不需要非空断言，也不必在视图里重复一遍空目标判定。
- **三个 `it` 补上 ADR-0073 要求的块注释。** 本票把 `tests/model-request-analysis.test.ts` 移入
  「已消化」，那条记录因此开始生效：下沉后仍保留的接线断言必须在块注释里写明保护的是接线而不是判定、
  以及少接一根线的表现形态。补的是历史变量原文切换、变量卡片折叠、卡片头部空白折叠三处。
- **已消化那组共用理由改成析取**（「接线、DOM 结构契约**或**成本结构」）：合取会让先前三条条目
  的理由带上不适用于它们的「成本结构」。
- **补了检查器布局的三个采样点。** 分析视图有两个挂载点，原先只采了工作台那个。检查器不渲染左侧
  导航、滚动的是 `inspector-body`，是另一条代码路径。两张票都没要求，补上是因为「行为一字不变」
  对两个挂载点都要成立；十三个采样点在两个引擎下全部与基线一致。

### 别处变红的处置

| 位置 | 变红原因 | 真红／假红 | 处置 |
| --- | --- | --- | --- |
| `tests/model-request-analysis.test.ts:450` | `collapsedNavigationGroups = ref(new Set<…>())` 已不在视图里 | 假红 | 删除。「默认全部展开」改由 module 的行为断言执行（五类判据第 1 类：已有行为测试覆盖同一事实，全删） |
| `tests/model-request-analysis.test.ts:454` | `collapsedNavigationGroups.value = new Set()` 已不在视图里 | 假红 | 删除。复位已是 module 上的一条断言 |
| `tests/model-request-analysis.test.ts:455` | `next.has(group) ? next.delete(group) : next.add(group)` 已不在视图里 | 假红 | 删除。切换已是 module 上的一条断言 |

真红：无。同一个 `it` 里的 `@click="toggleNavigationGroup(group.key)"`、
`:aria-expanded="!collapsedNavigationGroups.has(group.key)"`、
`v-show="!collapsedNavigationGroups.has(group.key)"` 与那条吸顶样式断言全部保留（第 3 类结构契约
与第 2 类样式文本），用例名与块注释同步说明保留的是什么。
`'is-current': activeNavigationTarget === item.target` 未变红——那两项仍以 `ref` 暴露。
`expect(view).not.toContain('collapsedNavigationGroups.value = new Set(resolveCollapsedAnalysisGroups(')`
是前几轮判定保留的否定式守卫，未重判、未删。

### 验证

- `yarn test`：185 个文件、1679 条用例全通过（本轮新增 4 条：导航分组折叠、折叠不改变当前目标、
  当前目标只在变了时才改变、十项复位）。
- `yarn typecheck`：通过。
- `yarn build`：通过。
- DOM 快照：`evidence/dom-after-{chromium,firefox}.json` 与基线的十三个采样点全部一致，
  归一化全文逐字节相同，控制台 0 错误。采样点 09（折叠一个导航分组）与 10（切换到另一条记录，
  验复位）是本票的观察面：09 的折叠分组数 0 → 1、`aria-expanded` 第五项 true → false；
  10 的折叠卡片、展开工具、折叠分组、已挂载原文块与当前导航目标全部回到初始。
- `git diff --stat` 不含 `src/` 路径。
