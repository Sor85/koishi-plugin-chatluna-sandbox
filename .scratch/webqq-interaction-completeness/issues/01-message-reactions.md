# 01 — 补齐群消息表情回应 UI

**What to build:** 在现有 `message.reactions` 领域状态上实现 WebQQ 展示和当前操作者操作，视觉参考 `koishi-plugin-onebot-webqq` 的 TIM reaction chip。

**Blocked by:** 无

**Status:** ready-for-agent

- [ ] 群消息展示表情图标、回应者头像叠层和总数
- [ ] 消息右键菜单提供“贴表情”并打开完整本地目录、常用区和搜索
- [ ] 点击已有 chip 切换当前操作者自己的回应
- [ ] 普通用户走用户交互，机器人走 `set_msg_emoji_like`
- [ ] 私聊不显示主动回应入口
- [ ] 撤回消息保留已有回应但禁止新增或取消
- [ ] 覆盖 NapCat、LLOneBot、用户操作、能力禁用和撤回边界测试
- [ ] 使用 Ego Browser 验证 Chrome、Firefox 和窄屏浮层
