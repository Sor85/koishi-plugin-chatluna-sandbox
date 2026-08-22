# 证据定位 seam 规格

Status: ready-for-agent

## Problem Statement

「跳到某条原始模型证据，并能回到原来的位置」目前不是一个 module，而是分散在三个 Vue 组件里的三份状态与三套帧时序。

`client/webqq/analysis-view.vue` 持有展开集合、`locateGeneration`、`pendingScrollTop`、relocate ResizeObserver 与高亮定时器，并在 `jumpTo` 里用 `2×nextTick + 2×requestAnimationFrame` 等待长文本折叠后再滚动。`client/model-request-trajectory.vue` 持有 `selectedRowId`、`inspectorFocusToken` 与 `restoreState`，在 `nextTick + requestAnimationFrame` 后恢复账本滚动量。`client/model-request-workspace.vue` 持有 `returnState`、`pendingReturnState`、`returnStateToken` 与 `detailScrollTop`，并在详情到达后用 `applyPendingReturnState` 二次恢复视图快照。三个计数器互不相干，只靠 props 快照握手，每一个都是为修一次帧时序竞态而加上去的。

纯函数已经被提取到 `client/webqq/model-request-analysis.ts` 并有单测，但真正出缺陷的是这些函数之间的调用时序：该展开哪些卡片一直是对的，错的是展开、测量、折叠与滚动的先后顺序。仓库 89 个测试文件中没有一个挂载 Vue 组件，25 个通过读取源码字符串断言 .vue 内容，因此这段编排既没有行为测试，也无法在不启动浏览器的情况下验证。近 20 个提交中定位与滚动恢复回归 6 次（`f51e76d`、`0396ec2`、`350b48e`、`48d5f20`、`bcdecfd`、`734156b`）。

维护者需要一个可以在 vitest 中驱动帧时序的 seam，使证据定位的展开决策、测量、滚动校正与返回恢复具有 locality，并让回归可以在测试里变红而不是只能靠人眼在浏览器中发现。

## Solution

引入两个 module 与一个 adapter seam。

`client/webqq/evidence-locator.ts` 提供 `createEvidenceLocator(adapter)`，拥有证据定位的全部决策与时序：解析目标、同步展开所在卡片与工具定义、脉冲式强制展开长文本、等待折叠稳定、按测量数字滚动、在内容高度变化时瞬时校正、短暂高亮，以及用单一 generation 让过期定位自行失效。module 不依赖 Vue、不访问 DOM、不读取全局对象。

`EvidenceLocatorAdapter` 是唯一的 DOM、渲染状态与计时出口。`measure(target)` 返回元素顶、滚动容器顶与当前滚动量三个数字，是唯一读取布局的入口；展开状态由视图以 Vue `ref` 持有，module 通过 adapter 读写；`nextTick`、`frame`、`observeResize`、`schedule` 交出全部时序原语。生产 adapter 在 `analysis-view.vue` 内实现并负责选择检查器滚动容器，测试 adapter 是一组数字与手动推进的帧队列。

`client/webqq/evidence-navigation-stack.ts` 提供 `createEvidenceNavigationStack()`，是不需要 adapter 的纯数据状态机，保存「从哪条记录、哪个视图页签、哪个账本行、哪个滚动量离开」，并在目标详情真正到达后交出待恢复快照。

三个视图退化为 adapter 与 DOM 绑定：跨组件信号统一成 `LocateRequest { evidenceId, seq }`，三个独立计数器收敛为 module 内部的一个 generation。

## User Stories

1. As a 模型请求复盘人员, I want 点击分析导航项后目标卡片准确进入可视区域, so that 我不需要再手动寻找刚跳转的证据
2. As a 模型请求复盘人员, I want 长文本折叠完成后定位仍然准确, so that 目标不会因为折叠而被挤到视口之外
3. As a 模型请求复盘人员, I want 定位时目标卡片、工具定义与长文本自动展开, so that 我落地后直接看到内容而不是折叠头
4. As a 模型请求复盘人员, I want 定位到原始模式的消息时自动切回格式化内容, so that 我看到的是可读正文
5. As a 模型请求复盘人员, I want 连续点击多个导航项时只有最后一次生效, so that 页面不会在两个目标之间来回跳
6. As a 模型请求复盘人员, I want 目标已经在正确位置时页面不再滚动, so that 重复点击不会产生无意义抖动
7. As a 模型请求复盘人员, I want 定位后的短暂高亮准时消失, so that 高亮不会停留或错误地标记后来的目标
8. As a 模型请求复盘人员, I want 在轨迹账本选中一行后检查器定位到同一条证据, so that 账本与分析卡片描述的是同一事实
9. As a 模型请求复盘人员, I want pending 请求自动刷新后选中行与检查器位置保持不变, so that 复盘过程不会被刷新打断
10. As a 模型请求复盘人员, I want 从轨迹打开关联请求再返回后视图页签、账本行与滚动量全部还原, so that 我能回到离开时的上下文继续复盘
11. As a 模型请求复盘人员, I want 切换到另一条模型请求记录时定位状态被清空, so that 上一条记录的展开与高亮不会渗到新记录
12. As a 维护者, I want 证据定位的展开决策与帧时序集中在一个 module, so that 修改定位行为时只有一个 implementation 需要理解
13. As a 维护者, I want 三个视图不再各自持有定位计数器, so that 跨视图握手只有一种信号形状
14. As a 维护者, I want 定位 module 不依赖 Vue、DOM 与 Node, so that 它可以在 node 环境下被完整驱动
15. As a 维护者, I want 布局读取集中在 adapter 的一个方法, so that 滚动容器选择规则不会散落在 module 内部
16. As a 测试作者, I want 用假 adapter 驱动 nextTick、帧与 ResizeObserver, so that 帧时序竞态可以被确定性地复现
17. As a 测试作者, I want 断言真实定位行为而不是源码字符串, so that 重命名内部函数不会让测试失去意义
18. As a 测试作者, I want 返回快照状态机有独立测试, so that 跨请求返回不需要通过组件验证
19. As a future Agent, I want ADR 说明为何不引入 jsdom 与组件挂载测试, so that 「没有组件测试」不会被当成缺口来补
20. As a future Agent, I want `CONTEXT.md` 中有证据定位这一术语, so that 讨论这段行为时使用同一个名字
21. As a Chrome user, I want 重构后定位、返回与自动刷新行为不变, so that 现有复盘流程不受影响
22. As a Firefox user, I want 重构后定位、返回与自动刷新行为不变, so that 跨浏览器复盘能力保持一致

## Implementation Decisions

- 本次是纯结构性重构。现有可观察行为逐帧保持不变，包括等待帧数、滚动 behavior、校正阈值与高亮时长。帧时序的统一与已知不稳定的修正留给后续独立 Issue。
- 拆成两个 module：`createEvidenceLocator(adapter)` 负责定位，`createEvidenceNavigationStack()` 负责返回快照。返回快照携带工作台视图页签与滚动量，属于工作台词汇，不进入定位 module 的 interface。
- `EvidenceLocatorAdapter` 是唯一的 DOM、渲染状态与计时出口。module 内不出现 `document`、`window`、`ResizeObserver`、`requestAnimationFrame` 与 Vue import。
- `measure(target)` 返回 `{ elementTop, scrollerTop, scrollTop }` 三个数字。滚动容器选择规则（检查器下取 `.webqq-model-trajectory-inspector-body`）留在生产 adapter 里，module 只做算术。
- 展开状态（折叠卡片、原始消息、展开工具、强制展开长文本、当前高亮）继续由视图以 Vue `ref` 持有，module 通过 adapter 读写。module 拥有「定位时该展开哪些」的决策，不拥有存储。
- 强制展开长文本是一次性脉冲：目标在同步阶段进入强制展开集合，一个 `nextTick` 后移出，使长文本组件锁定展开态且后续定位仍可再次脉冲。该语义必须在 module 内以注释固定。
- 过期定位靠单一 generation 自行失效，不引入取消帧句柄。
- `prepareModelAnalysisTarget`、`analysisTargetScrollTop`、`resolveToolDefinitionLocation` 移入定位 module 成为 implementation 并停止导出。
- `modelAnalysisTargetId`、`resolveAnalysisEvidenceTarget`、`buildModelRequestAnalysisNavigation` 继续在 `model-request-analysis.ts` 导出：它们是 ADR-0061 的跨视图证据身份契约，另有测试与模板绑定依赖。
- `shouldExpandAnalysisText` 与 `exceedsAnalysisLineLimit` 属于长文本组件自身的折叠测量，不参与定位时序，留在原处并保留单测。
- 跨组件定位信号统一为 `LocateRequest { evidenceId, seq }`。`seq` 只用于触发一次定位，不参与证据身份。
- 视图切换记录时清空自身展开集合并调用 `locator.reset()`；`reset` 只负责让在飞的定位失效、停止校正观察与清除高亮。
- 三张 Issue 各自交付「一个 module 或一个消费者 + 真实接入 + 测试」，不存在只有 module 没有消费者的中间状态。
- 不引入 jsdom、happy-dom 或 `@vue/test-utils`。理由记入 ADR：jsdom 不实现布局，`getBoundingClientRect()` 恒为 0 且没有真实滚动，恰好无法验证这段编排的核心。
- 不改变模型请求记录、模型证据投影、Console RPC、轨迹派生与任何服务端行为。
- 不改变 DOM 结构、CSS 类名、视觉与动画；现有视觉与 CSS 契约测试继续通过。

## Testing Decisions

- 最高程序化测试 seam 是两个 module 的 interface。测试通过假 adapter 观察外部行为，不断言私有变量、内部函数名或源码字符串。
- 假 adapter 提供数字化 `measure`、可断言的 `scrollTo` 调用序列、以 `Set` 实现的展开状态，以及手动推进的 `nextTick`、帧、`observeResize` 与 `schedule` 队列。
- 定位测试覆盖：展开目标卡片与工具定义、取消原始模式、长文本脉冲式强制展开与其后的清除、等待折叠后再滚动、已在位置上不重复滚动、内容高度变化时的瞬时校正与阈值、连续定位时旧定位失效、按 `evidenceId` 定位、未知 `evidenceId` 不滚动、同名工具定义展开全部匹配项、高亮到期清除与被新目标覆盖、`reset` 取消在飞定位。
- 返回快照测试覆盖：压入与取出、目标详情到达前不消费、记录不匹配时不消费、清空。
- 删除以纯算术和源码字符串替代行为断言的旧用例，仅保留无法进入 module 的 DOM 契约断言（检查器滚动容器选择）。删除与新增在同一张 Issue 内完成，并逐条对照证明净覆盖不下降。
- 现有模型请求分析、轨迹、工作台、跨视图身份与 CSS 契约测试继续作为回归 prior art。
- 每张 Issue 依次运行 `yarn test`、`yarn typecheck`、`yarn build`，结果如实记录，包括失败项及其是否与本次改动相关。
- 第一张与第三张 Issue 额外在真实 Koishi 开发环境中用 Chrome 与 Firefox 各验证一次定位、展开、返回与 pending 自动刷新；jsdom 无法替代这一步。
- 浏览器验证结束后关闭本次打开的标签页与自动化会话，并清理工具生成的临时目录。

## Out of Scope

- 不统一三处帧时序、不调整等待帧数、校正阈值与高亮时长；不修正任何已知的定位不稳定。
- 不引入 jsdom、happy-dom、`@vue/test-utils` 或任何浏览器测试运行器。
- 不改变模型请求工作台的视觉结构、导航排列、颜色与交互功能。
- 不改变模型证据投影、evidenceId 生成规则与跨视图身份契约。
- 不改变模型请求记录、持久化、分页、空间归属、Console RPC 或 MCP 工具。
- 不重构消息列表贴底追踪；`createMessageListFollowController` 只作为形状先例，不在本次范围内修改。
- 不重构会话模式组成图的分段几何与已知的小分段重叠问题。
- 不进行证据定位之外的 opportunistic 重构或文件重组。

## Further Notes

- ADR-0040 规定 WebQQ 区域内状态由所属模块本地持有。证据定位是跨区域行为而不是区域本地状态，需在新 ADR 中记录这一例外，避免后续评审按 ADR-0040 改回。
- ADR-0061 继续定义共享模型证据投影是唯一理解协议结构的 module；定位 module 只消费投影产物与证据身份，不解释协议字段。
- `createMessageListFollowController` 与 `tests/message-list-follow.test.ts` 是本仓库已验证的 adapter 形状先例；它把帧时序放进了 module，但把布局测量留在了 .vue，因此本次把 `measure` 也纳入 adapter。
- 本插件尚未首次公开发布，迁移不为仓库内旧实现保留兼容层或双份实现。
