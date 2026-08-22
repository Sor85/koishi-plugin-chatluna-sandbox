# 04 — 修正滚动恢复时序与切换记录时的在飞定位

**What to build:** 在测试网就位后修正证据定位相关的三处时序问题：往返后详情面板滚动量不恢复（既有缺陷）、账本与详情两处滚动恢复各写一套帧时序、切换模型请求记录时在飞的定位不会失效。

**Blocked by:** 03 — 抽出返回快照状态机并接入工作台

**Status:** done

- [x] 新增 `client/webqq/scroll-restore.ts`：`createScrollRestore(adapter)`，在有界帧窗口内把位置按回目标
- [x] 恢复目标超过当前可滚动上限时按上限夹取，内容长高后继续逼近目标，不无限重试
- [x] `model-request-workspace.vue` 的详情滚动恢复改用该 module —— 修复往返后 `detailScrollTop` 落回 0
- [x] `model-request-trajectory.vue` 的账本滚动恢复改用同一 module，两处不再各写一套 `nextTick + requestAnimationFrame`
- [x] 轨迹数据到达后仍重做一次恢复（这一次是等**数据**而不是等帧，保留并注明原因）
- [x] adapter 收窄为 `measure` / `scrollTo` / `nextTick` / `frame` 四个出口
- [x] `createEvidenceLocator` 的 `reset()` 让在飞定位失效并停止校正观察，切换记录后上一条记录的定位不会滚动新记录
- [x] 新增 `tests/scroll-restore.test.ts`：一次到位、被上限夹取后随内容增高逼近、达到目标即停止观察、窗口结束停止、重复恢复使前一次失效、取消
- [x] 补充 `tests/evidence-locator.test.ts`：`reset()` 取消在飞定位并停止校正
- [x] `yarn test`、`yarn typecheck`、`yarn build` 全部通过
- [x] Chrome 与 Firefox 各验证一次：往返后详情滚动量与账本滚动量同时恢复；切换记录不再被上一条记录的定位带走

## Comments

- 实现落点：`client/webqq/scroll-restore.ts`。`restore(top)` 在 `nextTick` 后进入一个 **30 帧**
  （约 480ms @60fps）的有界窗口，每帧把位置按回目标；写入是幂等的，已到位时不做任何事。
  `cancel()` 递增 generation 让在飞恢复立刻停手。adapter 只有
  `measure` / `scrollTo` / `nextTick` / `frame` 四个出口。

- **用帧数而不是定时器计窗口**：定时器版本在测试里会出现「窗口永不结束 + frame() 立即 resolve」
  的死循环，帧计数天然有界且在假 adapter 下完全确定。

- 关键认识修正：最初以为详情面板丢位置是「恢复时刻可滚动上限不够，写入被夹掉」，
  于是用 ResizeObserver 跟随内容长高、到位即停。实测否证了这个假设 ——
  `max` 全程 263、目标 260 一直可达，写入其实成功了，随后**返回时正文子树被重建把 scrollTop 清零**，
  而「到位即停」正好在这之前退出了观察。所以正确的语义不是「逼近目标」，而是
  「在内容稳定前一直按住目标」。

- 排查中踩过一次测试假象：脚本用 `scrollIntoViewIfNeeded` 把「打开原始请求」按钮滚进视野，
  这一步在点击之前就把详情面板滚回 0，于是快照记录的目标本身就是 0，看起来像「恢复失败」。
  改用 `element.click()` 直接派发后才拿到真实行为。**教训：验证滚动相关行为时，
  不要用会自动滚动的点击方式。**

- 缺陷确认（干净脚本 + stash 对照）：
  - 票 3 基线（单次写入）：详情面板在 150 / 350 / 700 / 1400 / 3000ms 五个采样点全部为 0
  - 票 4：五个采样点全部为 260 并保持稳定
  - 账本滚动量两者都是 959（账本原先靠「数据到达后再调一次」侥幸成立）

- 验证：`yarn test`（92 文件 / 536 用例）、`yarn typecheck`、`yarn build` 全部通过。
  浏览器验证 Chromium + Firefox 各一轮，控制台 0 错误 0 警告：
  - 往返后详情滚动量 260 与账本滚动量 959 同时恢复且稳定（两浏览器一致）
  - 回归：导航项定位仍停在 12px 留白处（scrollTop 420，与票 1 完全一致）
  - 回归：切换记录后滚动量归 0、高亮与展开工具清空，不被上一条记录的定位带走

- `reset()` 现在递增 generation 并停止校正观察。这一项无法在浏览器里稳定复现
  （需要在定位等待的两个 nextTick 与两帧之间切换记录），由三个单测覆盖：
  在飞定位失效、不产生滚动、校正观察停止。
