# 03 — 抽出返回快照状态机并接入工作台

**What to build:** 建立 `client/webqq/evidence-navigation-stack.ts` 纯数据状态机，把 `model-request-workspace.vue` 中「从轨迹打开关联请求再返回」的返回快照与二次恢复时序移入 module，删除 `returnState` / `pendingReturnState` / `returnStateToken` 三份手写状态。

**Blocked by:** 02 — 轨迹账本改用统一定位信号

**Status:** open

- [ ] 新增 `createEvidenceNavigationStack()`，interface 为 `push` / `beginReturn` / `takePending` / `clear` / `canReturn`
- [ ] module 不需要 adapter、不访问 DOM、不依赖 Vue
- [ ] 快照包含记录身份、详情视图页签、正文页签、轨迹模式、详情滚动量与账本行位置
- [ ] `model-request-workspace.vue` 删除 `returnState`、`pendingReturnState`、`returnStateToken`、`applyPendingReturnState` 的手写时序，改为消费 module
- [ ] 目标详情真正到达后才消费待恢复快照；记录不匹配时不消费（`bcdecfd` 回归点）
- [ ] 返回后详情页签、正文页签、轨迹模式、账本选中行与两处滚动量全部还原（`734156b` 回归点）
- [ ] 轨迹检查器点到同会话另一条请求时只换详情、不离开轨迹、不重拉账本
- [ ] 新增 `tests/evidence-navigation-stack.test.ts`：压入与取出、详情到达前不消费、记录不匹配不消费、清空
- [ ] `yarn test`、`yarn typecheck`、`yarn build` 全部通过
- [ ] Chrome 与 Firefox 各验证一次：轨迹 → 打开关联请求 → 返回的完整往返，以及往返后 pending 自动刷新

## Comments
