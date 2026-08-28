# 04 — 客户端四处标签与三套词汇收敛到证据种类 module

**What to build:** 在模型请求轨迹视图里,同屏四处对同一种工具证据的说法一致。证据种类过滤开关、轨迹账本的种类列、请求组成图的图例与分段、以及嵌在检查器里的分析导航分组,不再各自使用一张标签表。分析导航的响应分组显示英文,不再是同一张表里唯一的中文项。

已核实的现状:一条工具定义证据在这四处分别显示为全大写、全大写、词首大写、以及一个更粗粒度的合并名称。两处都没有排版层面的大小写转换,这些写法是硬编码在字符串里直接呈现的。粒度也不一致——分析导航合并成一档,组成图合并成两档,过滤开关与账本分成三档,用户要自己在三种粒度之间建立映射。

四张标签表改为从证据种类 module 取标签:徽标语境取全大写变体,标题与图例语境取词首大写变体。粒度差异保留但改为使用 module 的具名聚合,不再由各视图自己合并。

客户端不再持有自己的分类词汇:证据过滤种类提升为基础证据种类本身,分析导航的分组键与条目种类删除,对话卡片角色删除。证据过滤模块里三个纯翻译函数——轨迹行到过滤种类、消息角色到过滤种类、导航条目到过滤种类——随之删除,因为基础种类统一后不再需要翻译。

过滤开关仍然只暴露八种基础种类中的七种,不含模型响应。暴露哪个子集是视图决策,与组成图只用聚合后的五档、导航只用聚合后的六档同理。因此模型响应分组的现有过滤行为完全不变:隐藏助手消息不会连带隐藏响应分组。钉住该行为的现有测试仍然有效,只是它的理由从「响应分组没有单一角色」变成「过滤开关不暴露响应种类」。

**Blocked by:** 01 — 建立证据种类 module;03 — 服务端轨迹派生改用基础证据种类

**Status:** ready-for-human

- [x] 过滤开关、轨迹账本种类列、组成图图例与分段、分析导航分组四处的标签全部来自证据种类 module
- [x] 徽标语境使用全大写变体,标题与图例语境使用词首大写变体
- [x] 分析导航的响应分组显示英文
- [x] 组成图继续使用工具交互聚合,分析导航继续使用工具分组聚合,粒度与改动前一致
- [x] 证据过滤种类提升为基础证据种类本身
- [x] 分析导航的分组键与条目种类删除
- [x] 对话卡片角色删除
- [x] 证据过滤模块里三个纯翻译函数删除,无残留引用
- [x] 过滤开关只暴露七种基础种类,不含模型响应
- [x] 隐藏助手消息不会连带隐藏响应分组,该现有行为的测试仍然通过
- [x] 请求边界行不参与种类过滤,隐藏全部种类后仍能看出有哪些请求
- [x] 按种类过滤、切换过滤成员、过滤摘要等现有行为全部不变
- [x] 证据种类的配色与图标保持现状
- [x] 证据身份与跨视图定位行为不受影响
- [x] 客户端不再有位于证据种类 module 之外的证据分类词汇
- [x] 现有过滤测试中测翻译函数的用例改为断言基础种类可直接用于过滤判定;其余用例保持不变
- [x] 现有分析导航测试中引用分组键与条目种类的断言改用基础种类与工具分组聚合
- [x] 不引入组件挂载测试、jsdom 或 happy-dom
- [x] 单元测试、类型检查与构建全绿
- [x] 改动了服务端类型与 Console RPC 形状,浏览器验证前完整重启一次项目:确认旧进程与子进程已退出、端口已释放,重启后确认只有一个实例且加载当前构建产物
- [x] 浏览器验证:打开模型请求轨迹视图,确认四处对同一种工具证据的说法一致,徽标处全大写、标题处词首大写、粒度对应关系清楚
- [x] 浏览器验证:分析导航的响应分组显示英文

## Comments

四处标签都改为从证据种类 module 取值：过滤开关与账本种类列取徽标变体，组成图图例与导航分组标题取标题变体。`MODEL_EVIDENCE_FILTER_KINDS` 由基础种类过滤掉模型响应后派生，标签也来自 module。

删除的客户端词汇：`ModelEvidenceFilterKind`（提升为 `SandboxEvidenceKind`）、`ModelRequestAnalysisGroupKey` 的手写字面量表与 `ModelRequestAnalysisItemKind`、`ModelConversationRole`。三个纯翻译函数 `trajectoryRowFilterKind` / `messageRoleFilterKind` / `analysisItemFilterKind` 一并删除，仓库内无残留引用。请求边界不参与过滤这条规则留在账本里，用 `row.kind === 'request' ? undefined : row.kind` 表达，并由 `isEvidenceVisible(filter, undefined)` 的用例守住。

顺带的可见文案变化，两处都是同一张标签表内的中英混杂：分析导航响应分组 `响应` → `Response`、导航项徽标 `响应` → `RESPONSE`；响应卡片头部徽标同样改为取 module 的 `RESPONSE`（`.webqq-model-analysis-role` 自带 `text-transform: lowercase`，渲染为 `response`）。导航分组 `Variables` → `Variable`，与其余单数档位一致。

CSS 只改选择器名，不改颜色：`.webqq-model-analysis-nav-group.is-variables` → `.is-variable`、`.webqq-model-analysis-card.is-tool` → `.is-tool-result`、账本的 `.is-tool` → `.is-tool-call, .is-tool-result`（位置不动，保持它压过 `.is-response` 的既有优先级）。

重启与浏览器验证：按单实例规则先终止旧开发环境（含孤儿 watcher/worker）并确认 5140/5141 释放，再 `yarn dev` 重启，确认只有一个编排进程且 watcher 指向本仓库源码。Chrome 与 Firefox 结果一致：

- 过滤开关七档 `SYSTEM USER VARIABLE TOOL DEFS | ASSISTANT TOOL CALL TOOL RESULT`，无 RESPONSE
- 账本种类列 `SYSTEM USER VARIABLE TOOL DEFS TOOL CALL`——三种工具证据各自成档，这是行种类压平后的可见证据
- 组成图图例 `System User Tool Defs`，分段配色仍为 role 色（system `#737985`、user `#2f76c9`、variable `#a13d76`、tool-definition `#c46b00`）
- 导航分组 `System 3 / User 1 / Variable 15 / Response 2 / Tool 38`，全英文
- 账本徽标配色未变：TOOL DEFS `rgb(196,107,0)`、TOOL CALL `rgb(143,90,168)`（响应来源行同时带 `is-response` 时仍由工具色胜出，与改动前一致）
- 隐藏 TOOL DEFS 只移除工具定义行，TOOL CALL 与请求边界行保留，再次点击恢复
- 两个浏览器控制台 0 error
