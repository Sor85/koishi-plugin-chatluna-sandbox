# 01 — 抽出证据定位 module 并接入分析视图

**What to build:** 建立 `client/webqq/evidence-locator.ts` 与 `EvidenceLocatorAdapter` seam，把 `analysis-view.vue` 里的证据定位编排（解析目标、展开卡片与工具定义、脉冲式强制展开长文本、等待折叠、按测量数字滚动、内容变化时校正、短暂高亮、过期定位失效）整体移入 module，并用假 adapter 建立行为测试。

**Blocked by:** 无

**Status:** done

- [x] 新增 `createEvidenceLocator(adapter)`，interface 为 `locate` / `locateEvidence` / `locateTool` / `reset` / `dispose`
- [x] `EvidenceLocatorAdapter` 是唯一的 DOM、渲染状态与计时出口；module 内不出现 `document`、`window`、`ResizeObserver`、`requestAnimationFrame` 与 Vue import
- [x] `measure(target)` 返回 `{ elementTop, scrollerTop, scrollTop }`；滚动容器选择规则留在生产 adapter
- [x] 展开状态继续由 `analysis-view.vue` 以 Vue `ref` 持有，module 通过 adapter 读写
- [x] `prepareModelAnalysisTarget`、`analysisTargetScrollTop`、`resolveToolDefinitionLocation` 移入 module 并停止导出
- [x] `modelAnalysisTargetId`、`resolveAnalysisEvidenceTarget`、`buildModelRequestAnalysisNavigation`、`shouldExpandAnalysisText`、`exceedsAnalysisLineLimit` 继续留在 `model-request-analysis.ts` 导出
- [x] `analysis-view.vue` 删除 `jumpTo` 内的编排、`prepareTarget`、`measureTargetTop`、`scrollTarget`、`watchRelocate`、`stopRelocate`、`waitForAnimationFrame`、`emphasizeTarget`、`locateGeneration`、`pendingScrollTop`、`relocateObserver`、`relocateTimer`、`highlightTimer`
- [x] 长文本强制展开的一次性脉冲语义保持不变，并在 module 内以注释固定原因
- [x] 等待帧数、滚动 behavior、8px 校正阈值、480ms 校正窗口、1500ms 高亮时长逐项保持现状
- [x] 本票不改动 `model-request-trajectory.vue` 与 `model-request-workspace.vue`，`focusEvidence` prop 形状保持不变
- [x] 新增 `tests/evidence-locator.test.ts`（21 个用例）
- [x] 删除 `tests/model-request-analysis.test.ts` 中被行为测试取代的纯算术与源码字符串用例，保留检查器滚动容器 DOM 契约断言
- [x] 逐条对照旧用例证明净覆盖不下降
- [x] `CONTEXT.md` 新增「证据定位」术语；ADR-0062 记录 seam 位置、两个 adapter、状态归属分工、ADR-0040 例外与不引入 jsdom 的理由
- [x] `yarn test`（90 文件 / 514 用例）、`yarn typecheck`、`yarn build` 全部通过
- [x] Chrome 与 Firefox 各验证一次

## Comments

- 实现落点：`client/webqq/evidence-locator.ts`。module interface 5 个方法，`EvidenceLocatorAdapter` 18 个窄出口，
  集中了全部 DOM 读写、渲染状态读写与计时原语。生产 adapter 在 `analysis-view.vue` 内联实现，
  `findScroller` / `findTarget` 作为视图私有 DOM 助手保留。

- 规格中「移入 5 个纯函数」的清单有一处错误，实施时更正为 3 个：`shouldExpandAnalysisText` 与
  `exceedsAnalysisLineLimit` 实际由 `AnalysisTextBlock` 子组件的折叠测量调用，定位流程根本不经过它们，
  移进 locator 会把无关职责塞进 interface。这两个连同各自单测留在 `model-request-analysis.ts`。

- 净覆盖对照（`model-request-analysis.test.ts` 19 → 17 用例，新增 `evidence-locator.test.ts` 21 用例，合计 +19）：
  - `prepareModelAnalysisTarget` 的 4 个断言 → 4 个行为用例（展开目标卡片、工具调用展开所在消息卡片、
    响应卡片展开并退出原文视图、目标停在原始 JSON 时切回格式化内容）
  - `resolveToolDefinitionLocation` 的 1 个断言 → 3 个行为用例（唯一工具定义、同名多工具落到 TOOL DEFS 区块、
    未声明工具不定位）
  - `analysisTargetScrollTop` 的 2 个算术断言 → 5 个滚动行为用例（按测量数字滚动、已在位置上不重复滚动、
    测不到目标不滚动、折叠挤走目标时瞬时校正、阈值内视为平滑滚动中间帧不校正）
  - 源码字符串断言（`await waitForAnimationFrame()`、`watchRelocate(target, generation)`、
    `scrollTarget(target, 'smooth')`、`scrollTo(..., 'auto')`）→ 真实时序用例（校正窗口结束后不再跟随、
    后一次定位使前一次失效、高亮到期清除、旧到期回调被取消、卸载后不再校正）
  - `shouldExpandAnalysisText` 的断言迁入长文本折叠用例，未丢失
  - 保留：检查器必须以 `.webqq-model-trajectory-inspector-body` 为滚动容器（无法进入 module 的 DOM 契约）

- 行为一致性用 stash 对照证明：同一份确定性场景脚本（打开首条记录 → 分析页 → 导航第 2 项 → 工具行
  「查看工具定义」，分别在 900ms 与 2700ms 测量）在重构后与 HEAD 基线上跑出完全相同的数字 ——
  navItem 12px / scrollTop 420，toolLink 12px / scrollTop 4330，且两个时间点都稳定。

- 浏览器验证在完整 Koishi 开发环境（portal 实时链路，控制台 `http://127.0.0.1:5140`）用真实 Gemini
  `generateContent` 记录完成，Chromium 与 Firefox 各一轮，控制台 0 错误 0 警告：
  - 导航项定位：44 项中抽样 6 项（SYSTEM ×2、TOOL DEFS ×2、响应、响应 TOOL CALL），全部停在 12px 留白处且在视野内
  - 工具行「查看工具定义」：定位到对应工具定义卡片并同时展开
  - 搜索：`character_reply` 命中后正文出现 7 处高亮，首个匹配项对应卡片停在 12px（搜索定位按现有行为不加短暂高亮）
  - 轨迹检查器：1621 行账本抽样 4 行（首、第 6、中、末），全部定位到对应分析卡片且在视野内；
    Firefox 4/4 停在 12–13px，Chromium 中间那一行在 850ms 采样点读到 87px（内容仍在稳定），仍在视野内
  - 切换记录：滚动量归 0，高亮、展开工具与折叠卡片全部清空

- 采样偏差记录：首轮临时脚本在已展开卡片上重复点击「查看工具定义」，于纠正中途读到 91px，
  一度被误认为定位偏移；改用干净的确定性场景后为 12px 且稳定。后续验证一律用固定场景脚本，不复用页面残留状态。

- 保留的既有行为（本票按纯结构性重构原则未改，建议纳入后续时序票）：切换记录时不会让在飞的定位失效，
  也不会停止 relocate 观察窗口 —— 原实现同样如此（`reset` 只清高亮）。极端情况下切换记录后
  上一条记录的一次定位仍可能滚动一次新记录的内容。
