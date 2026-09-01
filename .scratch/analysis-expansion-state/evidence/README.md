# 证据：分析视图的 DOM 快照

这一轮的可观察结果是**渲染**而不是模型。分析视图是组件，没有可导出的模型，它的对外事实就是
折叠、展开、原文与复位在 DOM 上的形态。因此本轮的纯结构性证明回到 DOM 快照。

## 脚本

| 文件 | 用途 | 运行方式 |
| --- | --- | --- |
| `dom-snapshot.mjs` | 分析视图的 DOM，10 个采样点 | `node .scratch/analysis-expansion-state/evidence/dom-snapshot.mjs <输出 json> [chromium\|firefox]` |
| `compare-dom.mjs` | 逐采样点比对 DOM 哈希、滚动量与各项计数 | `node compare-dom.mjs <基线 json> <当前 json>` |

Playwright 装在仓库外的临时目录（`npm i playwright@latest`，实测 1.62 才对得上本机
`~/Library/Caches/ms-playwright` 里的 `chromium-1234`），再把 `playwright` /
`playwright-core` 软链进仓库 `node_modules`（已被 `.gitignore` 忽略），因为 ESM 的裸标识符
按脚本自身位置解析，不按 cwd。验收后删掉软链。

快照跑在仓库外的完整 Koishi 开发环境（`http://127.0.0.1:5140/chatluna-sandbox`），只读不写，
不触发新的模型请求。归一化全文写到 `/tmp`（每个采样点约 15 万字符，落进仓库没有比对价值），
committed 的 JSON 只留哈希、长度与可读计数。

## 十三个采样点

工作台布局（`.webqq-model-analysis`，滚动 `.webqq-model-request-detail`）：
`01 初始渲染` · `02 折叠一张卡` · `03 展开一个工具` · `04 切某条消息看原文` ·
`05 再切回格式化` · `06 切响应原文` · `07 展开历史变量原文` · `08 搜索命中后的展开态` ·
`09 折叠一个导航分组` · `10 切换到另一条记录`

检查器布局（`.webqq-model-analysis.is-inspector`，滚动 `.webqq-model-trajectory-inspector-body`）：
`11 检查器初始渲染` · `12 检查器里折叠一张卡` · `13 检查器里切某条消息看原文`

`01`–`08` 是票 01 的验收面，`09`–`10` 是票 02 的。`11`–`13` 覆盖分析视图的**第二个挂载点**：
检查器不渲染左侧导航、滚动的是另一个容器，是另一条代码路径，两张票都没要求，补上是因为
「行为一字不变」这句话对两个挂载点都要成立。选中账本行会带一次定位，短暂高亮 1500ms 后自动清除，
采样前等够时间。

`05` 是「原文一旦挂载就留着」的观察面：已挂载原文块数为 1、其中隐藏 1 —— 树留在 DOM 里但
不显示。因此归一化**不抹整个 `style` 属性**，只抹 `--webqq-*` 里的实测像素值；抹掉
`display: none` 这份快照就分不出「挂载但隐藏」与「从未挂载」。

`02` 折叠的是第 3 条消息卡片：它是本条记录里唯一命中搜索词的消息卡片，`08` 因此能看出
「搜索命中时相关卡片自动展开」，而不只是工具那一半。

## 确定性

- 每次全新浏览器上下文（本地偏好为空，首屏视图与筛选固定），自动刷新默认关闭。
- 一律用 `element.click()` 直接派发，不用 Playwright 的 `click()`——后者会先
  `scrollIntoViewIfNeeded`，把待验证的滚动量在点击之前就改掉，而当前导航目标（`is-current`）
  正是由滚动量决定的。
- 基线在改动前于干净工作区采集，Chromium 连跑三次、Firefox 连跑两次，十个采样点两两一致。

## 结果

`dom-baseline-*.json` 是 `ff5b4d1` 的读数，`dom-after-*.json` 是两张票加复审修正之后的读数。

| 面 | 采样点 | 结果 |
| --- | --- | --- |
| Chromium | 13 | 哈希与计数全一致，归一化全文逐字节相同，控制台 0 错误 |
| Firefox | 13 | 同上 |

基线取法：改动只在 `client/**`，因此不必 stash——`git checkout ff5b4d1 -- client/webqq/analysis-view.vue`
把视图单独回到基线（旧视图自带那十个 `ref`，不 import 新模块），确认 Vite 返回旧源码后采样，
再 `git checkout HEAD -- client/webqq/analysis-view.vue` 恢复。
