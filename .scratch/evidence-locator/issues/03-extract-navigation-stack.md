# 03 — 抽出返回快照状态机并接入工作台

**What to build:** 建立 `client/webqq/evidence-navigation-stack.ts` 纯数据状态机，把 `model-request-workspace.vue` 中「从轨迹打开关联请求再返回」的返回快照与二次恢复时序移入 module，删除 `returnState` / `pendingReturnState` / `returnStateToken` 三份手写状态。

**Blocked by:** 02 — 轨迹账本改用统一定位信号

**Status:** done

- [x] 新增 `createEvidenceNavigationStack()`，interface 为 `push` / `beginReturn` / `takePending` / `clear` / `canReturn`
- [x] module 不需要 adapter、不访问 DOM、不依赖 Vue
- [x] 快照包含记录身份、详情视图页签、正文页签、轨迹模式、详情滚动量与账本行位置
- [x] `model-request-workspace.vue` 删除 `returnState`、`pendingReturnState`、`returnStateToken`、`applyPendingReturnState` 的手写时序，改为消费 module
- [x] 目标详情真正到达后才消费待恢复快照；记录不匹配时不消费（`bcdecfd` 回归点）
- [x] 返回后详情页签、正文页签、轨迹模式、账本选中行与两处滚动量全部还原（`734156b` 回归点）
- [x] 轨迹检查器点到同会话另一条请求时只换详情、不离开轨迹、不重拉账本
- [x] 新增 `tests/evidence-navigation-stack.test.ts`：压入与取出、详情到达前不消费、记录不匹配不消费、清空
- [x] `yarn test`、`yarn typecheck`、`yarn build` 全部通过
- [x] Chrome 与 Firefox 各验证一次：轨迹 → 打开关联请求 → 返回的完整往返，以及往返后 pending 自动刷新

## Comments

- 实现落点：`client/webqq/evidence-navigation-stack.ts`。interface 为 `push` / `beginReturn` /
  `takePending` / `clear` / `canReturn`，纯数据、无 adapter。`takePending(recordId)` 承担
  「目标详情真正到达才消费」的判定，并给出递增的 `seq` 用于触发一次账本位置恢复。
  工作台只保留 `canReturnToTrajectory` 作为反应式镜像。

- 顺带把轨迹 `restoreState` 的 `token` 字段改名为 `seq`，与定位信号使用同一种触发序号词汇。

- 新增 `tests/evidence-navigation-stack.test.ts`（8 个用例）：压入后可返回、开始返回后不能返回第二次、
  详情到达前不消费、记录不匹配不消费、只能消费一次、序号递增、未开始返回时不消费、清空、重复压入覆盖。

- 验证：`yarn test`（91 文件 / 522 用例）、`yarn typecheck`、`yarn build` 全部通过。

- 浏览器验证（Chromium + Firefox，控制台各 0 错误 0 警告）：
  - 完整往返：轨迹视图 → 选中第 41 行（账本滚动量 959）→ 打开原始请求（切到请求视图、请求页签、
    出现返回按钮、账本隐藏）→ 返回（视图、选中行、账本滚动量 959 全部还原，返回按钮消失）
  - 刷新后仍存在的证据保持选中行与账本位置（与 pending 自动刷新走同一条 watcher 路径）
  - 组成分段定位：会话模式点击分段选中对应账本行；分析模式点击分段把对应卡片定位到 12px 留白处
    （补齐票 2 延后到本轮的两个回归点）

- **发现一处既有缺陷（本票未修，与本次变更无关）**：往返后详情面板自身的滚动量不会恢复。
  设置 260 后返回，1s 与 4s 两个采样点都读到 0。用 stash 对照票 2 状态跑同一脚本，结果完全相同，
  确认是既有行为。原因推测是 `applyPendingReturnState` 在 `nextTick + requestAnimationFrame` 后写入
  `detailElement.scrollTop`，而此时轨迹仍在重新渲染、可滚动高度只有 263px，写入被浏览器夹到 0
  且之后没有二次校正（账本自身的恢复有二次校正，所以 959 能还原）。
  建议纳入后续时序票：让详情滚动恢复也具备「内容稳定后再校正一次」的能力。
