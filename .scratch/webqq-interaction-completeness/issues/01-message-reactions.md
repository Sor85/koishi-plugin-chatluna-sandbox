# 01 — 补齐群消息表情回应 UI

**What to build:** 在现有 `message.reactions` 领域状态上实现 WebQQ 展示和当前操作者操作，视觉参考 `koishi-plugin-onebot-webqq` 的 TIM reaction chip。

**Blocked by:** 无

**Status:** resolved

- [x] 群消息展示表情图标、回应者头像叠层和总数
- [x] 消息右键菜单提供“贴表情”并打开完整本地目录、常用区和搜索
- [x] 点击已有 chip 切换当前操作者自己的回应
- [x] 普通用户走用户交互，机器人走 `set_msg_emoji_like`
- [x] 私聊不显示主动回应入口
- [x] 撤回消息保留已有回应但禁止新增或取消
- [x] 覆盖 NapCat、LLOneBot、用户操作、能力禁用和撤回边界测试
- [x] 使用真实浏览器验证 Chrome、Firefox 和窄屏浮层

## Answer

已在现有 `message.reactions` 领域状态上补齐 WebQQ 表情回应展示与操作，并保证用户交互与机器人 `set_msg_emoji_like` 写入同一场景事实。

### 实现摘要

- 领域层：`setMessageReaction` 对机器人走 `set_msg_emoji_like`，对普通用户直接 `applyMessageReaction`；限制群聊、撤回后只读、能力禁用生效。
- Console RPC：新增 `onebot-sandbox/set-message-reaction`。
- WebQQ：TIM 风格 chip（表情、回应者头像叠层、总数）、右键“贴表情”、完整 qface 目录 + 常用区 + 搜索；私聊无主动入口；点击 chip 切换自己的回应。
- 依赖：新增 `qface@1.4.1`。

### 验证

- `yarn vitest run tests/message-reactions.test.ts tests/emoji-catalog.test.ts tests/webqq-message-list.test.ts tests/onebot-bridge.test.ts tests/webqq-architecture.test.ts tests/koishi-workspace-port.test.ts` 通过
- `yarn typecheck` 通过
- `yarn build` 通过

### 浏览器验证

- Ego Browser（Chrome）：验证群消息右键“贴表情”、完整目录、搜索结果、reaction chip 与 390px 窄屏浮层，无横向溢出。
- Playwright CLI（Firefox）：验证右键表情菜单、搜索与窄屏布局，无控制台错误。

## Comments

- 2026-08-02：agent 完成 issue 01 垂直切片；未提交 git。
