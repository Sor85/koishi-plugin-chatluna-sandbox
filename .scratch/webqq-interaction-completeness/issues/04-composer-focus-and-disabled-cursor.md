# 04 — 恢复发送焦点并移除禁止光标

**What to build:** 保持现有单请求发送锁，在发送结束后可靠恢复消息输入焦点，并统一调整发送区域禁用光标。

**Blocked by:** 无

**Status:** resolved

- [x] textarea 使用稳定 ref，发送成功和失败后在 `nextTick` 恢复焦点
- [x] 只有原会话、原操作者和原输入控件仍有效时才恢复焦点
- [x] 发送中继续阻止重复提交，不新增消息队列
- [x] 输入框、附件、表情和发送按钮禁用时均不显示 `not-allowed` 光标
- [x] disabled 和透明度仍清楚表达不可操作状态
- [x] 覆盖连续“输入—回车—输入—回车”、失败、切换会话和组件卸载测试
- [x] 使用真实浏览器验证 Chrome、Firefox 和键盘连续发送

## Answer

在 `client/webqq/composer-focus.ts` 抽出 `shouldRestoreComposerFocus` 作为 WebQQ 用户交互公共接缝：仅当原会话、原操作者和原 textarea 仍挂载有效时允许恢复焦点。

`client/webqq-composer.vue`：
- 为 textarea 增加稳定 `inputRef`
- 发送时捕获 `requestConversationId` / `requestOperatorId` / 原 textarea
- 成功与失败共用 `finally`：先解除 `sending`，`await nextTick()` 后再条件 `focus`
- 继续用 `sending` 单请求锁，不引入发送队列

`client/styles/webqq-composer.css`：
- `.webqq-composer-action:disabled` 改为 `cursor: default`，保留 `opacity: 0.45`
- `.webqq-composer textarea:disabled` 使用 `cursor: text` 与透明度
- 发送区域不再声明 `cursor: not-allowed`（当前 composer 无独立表情发送按钮；表情选择器属于消息回应，不在本 issue 范围）

测试：`tests/webqq-composer.test.ts` 覆盖成功/失败可恢复、会话/操作者切换与卸载不抢焦点、单请求锁接线、禁用光标与 disabled 语义。

验证：
- `yarn vitest run tests/webqq-composer.test.ts` 通过
- `yarn typecheck` 通过
- `yarn build` 通过

浏览器验证：Ego Browser（Chrome）与 Playwright CLI（Firefox）均确认发送完成后 textarea 重新成为 activeElement；390px 窄屏无横向溢出，连续输入路径可用。

## Comments

- 实现遵循 TDD：先红灯（缺 `inputRef`/焦点恢复/CSS），再绿灯。
- 不做提交。
