# 02 — 轨迹账本改用统一定位信号

**What to build:** 把模型请求轨迹与检查器之间的定位握手改成统一的 `LocateRequest { evidenceId, seq }`，删除 `inspectorFocusToken` 这一独立计数器，使账本选中行到分析卡片的定位只有一种信号形状。

**Blocked by:** 01 — 抽出证据定位 module 并接入分析视图

**Status:** done

- [x] `model-request-trajectory.vue` 向内嵌分析视图传递 `LocateRequest`，不再传 `focusEvidence: { evidenceId, token }`
- [x] 删除 `inspectorFocusToken`，序号由统一信号承担
- [x] `analysis-view.vue` 的 prop 改为 `LocateRequest`，内部仍只调用 `locator.locateEvidence`
- [x] 账本选中行变化、检查器换行与轨迹刷新后仍存在的证据继续定位到同一条证据
- [x] pending 请求自动刷新不清空选中行与检查器位置（`0396ec2` 回归点）
- [x] 组成分段点击在请求模式与会话模式下继续定位到正确分析目标
- [x] 不改变账本行 id 由 evidenceId 派生的规则与轨迹派生逻辑
- [x] `yarn test`、`yarn typecheck`、`yarn build` 全部通过

## Comments

- 实现落点：`client/model-request-trajectory.vue` 的 `analysisLocateRequest`（组成分段点击，ref）与
  `inspectorLocateRequest`（账本选中行，computed），两者共用一个 `locateSeq` 计数器 ——
  两种模式由 `props.analysis` 决定互斥渲染，因此一个计数器不会互相触发。
  `analysis-view.vue` 的 prop 由 `focusEvidence: { evidenceId, token }` 改为 `locateRequest: LocateRequest`。

- `evidenceId` 为空字符串表示来源行没有模型证据（请求边界行），按共享身份表回落到第一条卡片。
  这条约定原先只写在轨迹组件的注释里，现已提升到 `LocateRequest` 的类型文档中。

- `tests/webqq-model-request-workspace.test.ts` 的两条源码字符串断言随之更新，并补一条
  `not.toContain('inspectorFocusToken')`，防止旧计数器被重新引入。

- 验证：`yarn test`（90 文件 / 514 用例）、`yarn typecheck`、`yarn build` 全部通过。
  本票按计划不单独做浏览器验证，其两个回归点（pending 自动刷新保留选中行、组成分段定位）
  并入票 3 的浏览器轮次一起覆盖。
