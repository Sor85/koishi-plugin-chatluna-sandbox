# 09 — 提取聊天消息列表

**What to build:** 将消息渲染、消息簇、引用、媒体、系统事件、历史加载和滚动定位迁移为独立消息列表，同时保持所有聊天内容的可观察表现不变。

**Blocked by:** 08 — 提取发送消息控件

**Status:** ready-for-human

- [x] 消息列表只接收 chat 消息模型并通过事件请求回复、历史加载和头像操作
- [x] TIM 消息簇首、中、尾样式及连续消息头像隐藏规则保持不变
- [x] QQ 模式不合并消息的行为保持不变
- [x] 引用消息外观、点击定位和临时高亮行为保持不变
- [x] 文本、图片、媒体标签、媒体失败 fallback 和文件信息保持不变
- [x] 戳一戳等系统事件继续中断消息簇并使用现有样式
- [x] ChatLuna 思考状态和 Token 显示保持正确关联
- [x] 历史加载、滚动位置、消息右键菜单、单元测试和 Ego Browser 验证通过

## Answer

新增 `WebqqMessageList`，集中渲染欢迎态、TIM/QQ 消息簇、系统事件、引用、文本与媒体，并在组件内管理历史加载状态和引用目标临时高亮。页面仅提供只读消息模型，并处理回复、历史加载、好友操作和群成员操作事件。

现有消息气泡、媒体 fallback、文件信息、右键菜单和 GroupMemberMenu 结构保持不变。Ego Browser 验证右键回复生成引用条，发送后引用内容为 `Koishi / 票据08发送控件验证`，点击引用后正确高亮消息 `7d3501c8`。验证记录位于 `.scratch/webqq-modularization/evidence/09-message-list/verification.json`，PNG 仅保存在本地。
