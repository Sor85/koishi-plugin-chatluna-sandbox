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

## 十个采样点

`01 初始渲染` · `02 折叠一张卡` · `03 展开一个工具` · `04 切某条消息看原文` ·
`05 再切回格式化` · `06 切响应原文` · `07 展开历史变量原文` · `08 搜索命中后的展开态` ·
`09 折叠一个导航分组` · `10 切换到另一条记录`

前八个是票 01 的验收面，后两个是票 02 的。十个一次跑完，两张票各比一次。

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

| 面 | 采样点 | 结果 |
| --- | --- | --- |
| 票 01 · Chromium | 10 | 哈希与计数全一致，归一化全文逐字节相同，控制台 0 错误 |
| 票 01 · Firefox | 10 | 同上 |
| 票 02 · Chromium | 10 | 同上 |
| 票 02 · Firefox | 10 | 同上 |
