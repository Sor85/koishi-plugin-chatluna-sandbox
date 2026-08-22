# 02 — 轨迹账本改用统一定位信号

**What to build:** 把模型请求轨迹与检查器之间的定位握手改成统一的 `LocateRequest { evidenceId, seq }`，删除 `inspectorFocusToken` 这一独立计数器，使账本选中行到分析卡片的定位只有一种信号形状。

**Blocked by:** 01 — 抽出证据定位 module 并接入分析视图

**Status:** open

- [ ] `model-request-trajectory.vue` 向内嵌分析视图传递 `LocateRequest`，不再传 `focusEvidence: { evidenceId, token }`
- [ ] 删除 `inspectorFocusToken`，序号由统一信号承担
- [ ] `analysis-view.vue` 的 prop 改为 `LocateRequest`，内部仍只调用 `locator.locateEvidence`
- [ ] 账本选中行变化、检查器换行与轨迹刷新后仍存在的证据继续定位到同一条证据
- [ ] pending 请求自动刷新不清空选中行与检查器位置（`0396ec2` 回归点）
- [ ] 组成分段点击在请求模式与会话模式下继续定位到正确分析目标
- [ ] 不改变账本行 id 由 evidenceId 派生的规则与轨迹派生逻辑
- [ ] `yarn test`、`yarn typecheck`、`yarn build` 全部通过

## Comments
