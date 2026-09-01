# 01 — 展开态与原文态成为一个 module，定位 adapter 退成转发

**What to build:** 折叠一张证据卡、展开一个工具、切某条消息看原始 JSON 再切回格式化、切响应原文、展开历史变量原文、搜索命中后自动展开——这些行为一字不变，但它们第一次能不起组件就驱动。

八项状态搬出组件：响应原文、消息原文、两个「已挂载」集合、历史变量原文、折叠卡片、展开工具、强制展开文本。新 module 无 DOM、无渲染依赖、不需要任何环境，与旁边那三个 module（证据定位、证据导航、模型请求分析投影）同形。

**证据定位那条既有决定一行不改。** adapter 仍是唯一的 DOM、渲染状态与计时出口，测量仍只交出三个数字，滚动容器的选择规则仍留在视图侧。变的只是它八项操作的实现——展开卡片、展开工具、读写消息原文、读写响应原文、读写强制展开文本，从「内联闭包直接改引用」变成「转调 module」。定位器继续拥有展开决策，新 module 只拥有展开态。

**定位高亮与当前命中不搬。** 它们不在组件的复位清单里，起初看像漏掉，核过之后确认不是：定位器的复位自己就会清掉这两项。它们的写入与复位都属于定位器，搬走会把定位器的复位拆到两个主人手里。

两条今天只写在注释里、改坏了不报错的规则随本票获得断言：原文一旦挂载就留着（切回格式化内容不丢树内展开态），以及从未切开的消息不为它构造整棵树（读取代价那一半）。

导航折叠、当前导航目标与切换记录的复位留给票 02。

**Blocked by:** None — can start immediately.

**Status:** done

- [x] 八项展开与原文状态住在新 module 里，组件不再直接持有它们
- [x] module 无 DOM 依赖，用普通单元测试驱动，无需任何环境
- [x] 「切原文时顺带展开那张卡」有断言
- [x] 「原文一旦挂载就登记为已挂载，切回格式化内容后仍在已挂载集合里」有断言
- [x] 「从未切开的消息不进已挂载集合」有断言
- [x] 「搜索命中时展开卡片与工具，且用集合替换而不是逐条展开」有断言
- [x] 折叠、展开、切原文、切回格式化的界面行为一字不变
- [x] 证据定位 adapter 的 seam 形状未改：测量仍只交出三个数字，滚动容器选择规则仍在视图侧
- [x] adapter 的八项操作退成转调 module，定位器仍拥有展开决策
- [x] 定位高亮与当前命中仍由定位器持有与复位，未搬进新 module
- [x] 未借机合并证据定位与证据导航
- [x] JSON 树缓存留在组件，未被当成视图状态搬走
- [x] 指针与选区守卫三处留在组件：标题双击选词、标题拖选复制、工具摘要拖选
- [x] 搜索命中后的跳转仍留在组件，只有「哪些展开」这一半进 module
- [x] 未新增「哪些状态归 module」之类的肯定式实现细节断言
- [x] 模型请求分析投影与读取放大那两份既有测试一字不改地通过
- [x] DOM 快照与基线一致：初始渲染、折叠一张卡、展开一个工具、切消息原文、切回格式化、切响应原文、展开历史变量原文、搜索命中后的展开态
- [x] Chromium 与 Firefox 各跑一次，控制台无错误
- [x] `git diff --stat` 里不出现服务端源码路径
- [x] 验收后清理浏览器会话与工具生成的临时目录
- [x] 别处变红的断言逐条区分真红与假红，处置记入 Comments，不重判前几轮判定保留的断言
- [x] 完整测试、类型检查与构建通过

## Comments

### 落地形状

- 新增 `client/webqq/analysis-expansion.ts`：`createAnalysisExpansion()` 持有八项状态（折叠卡片、
  展开工具、强制展开文本、消息原文、消息原文已挂载、历史变量原文、响应原文、响应原文已挂载），
  暴露谓词、转换与一次 `reset()`。无 DOM、无计时、无环境依赖，只依赖 `vue` 与
  `model-request-analysis` 里的两个纯函数（目标标识与响应卡片常量）。
- 两个 watcher 消失。「原文一旦挂载就留着」原先由 `watch(rawMessages)` 求并集表达，现在写在
  `setMessageRaw` 里：切成原文时登记，切回格式化时不登记。因此「从未切开的消息不进已挂载集合」
  与「切回格式化后仍在集合里」是同一个函数的两条断言，而不是靠 watcher 的触发时机成立。
- 定位 adapter 的八项操作退成转发：`expandCard`、`setToolExpanded: expandTool`、`isMessageRaw`、
  `setMessageRaw`、`isResponseRaw`、`setResponseRaw`、`getExpandedText`、`setExpandedText`
  直接指向 module 成员，adapter 里不再有内联闭包。`measure` / `scrollTo` / `observeResize` /
  `schedule` / `setHighlight` / `setOccurrenceTarget` 一字未动，滚动容器选择规则仍是视图里的
  `findScroller()`。
- 搜索命中那一段拆成两半：视图算「哪些卡片与工具命中」（读搜索文本表，那是投影的事），
  module 做集合替换。跳转（`jumpTo`）仍在视图，它要滚动。
- 切换记录的复位：视图改调 `resetExpansion()` 清掉这八项，导航折叠与当前导航目标仍由视图
  自己清（留给票 02），JSON 树缓存、历史预览缓存、锚点脏标记、`locator.reset()` 与滚动归零
  也仍在视图。

### 别处变红的处置

| 位置 | 变红原因 | 真红／假红 | 处置 |
| --- | --- | --- | --- |
| `tests/model-request-analysis.test.ts:325` | `rawHistoryVariables.has(variable.id)` 改名 | 假红 | 跟着改成 `isHistoryVariableRaw(variable.id)`，断言口径未变（它守的是「默认渲染消息预览、切换后渲染原始 XML」这条分支结构） |
| `tests/model-request-analysis.test.ts:330` | `toggleHistoryRaw` 改名 | 假红 | 跟着改成 `toggleHistoryVariableRaw` |
| `tests/model-request-read-cost.test.ts:63` | `rawMountedMessages.has(...)` 改名 | 假红 | 跟着改成 `isMessageRawMounted(message.evidenceId)`，成本断言（原文树按需挂载）保留 |

真红：无。`v-if="responseRawMounted"` 那条未变红——响应原文已挂载仍以 `ref` 形式从 module
解构出来，模板写法一字不变。`tests/evidence-locator.test.ts` 全部 28 条未变红：假 adapter 的
形状与断言没动，这正是 seam 未改的证据。`tests/model-request-read-amplification.test.ts`
是服务端读取放大，本票未触及。前几轮判定保留的断言一条未重判。

### 验证

- `yarn test`：185 个文件、1675 条用例全通过。
- `yarn typecheck`：通过。
- `yarn build`：通过。
- DOM 快照：`evidence/dom-baseline-{chromium,firefox}.json` 与
  `evidence/dom-after-{chromium,firefox}.json`，十三个采样点的 DOM 哈希、滚动量、
  折叠／展开／已挂载各项计数与当前导航目标全部一致；两份归一化全文逐字节相同；控制台 0 错误。
  本票的验收面是 `01`–`08`（`11`–`13` 是检查器布局，见 `evidence/README.md`）。
  基线用 `git checkout ff5b4d1 -- client/webqq/analysis-view.vue` 取，Chromium 连跑三次、
  Firefox 连跑两次确认确定性。
- `git diff --stat` 不含 `src/` 路径。
