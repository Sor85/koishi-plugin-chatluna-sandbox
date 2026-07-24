# 04 — 迁移消息、媒体、历史与公告命令

**What to build:** 让聊天消息、媒体、历史记录和群公告操作统一通过工作区控制模块执行，同时保持现有聊天体验和错误表现不变。

**Blocked by:** 03 — 迁移好友、群组与申请命令

**Status:** ready-for-human

- [x] 文本消息和媒体消息通过工作区控制模块发送
- [x] 媒体内容加载和失败 fallback 通过 WorkspacePort 完成
- [x] 历史消息加载通过工作区控制模块完成并保持排序和滚动行为
- [x] 群公告新增和删除通过工作区控制模块完成
- [x] 成功操作更新对应区域模型后再向 UI resolve
- [x] 失败操作保持旧工作区状态并保留区域 loading、错误提示和表单清理语义
- [x] ChatLuna 思考状态和 Token 显示关联保持不变
- [x] 控制模块测试、现有消息簇测试和 Ego Browser 聊天验证全部通过

## Answer

文本、媒体、媒体内容、历史分页和群公告命令已统一迁移到工作区控制模块。控制模块继续使用当前可见用户作为 OneBot 调用上下文，成功命令先原子替换工作区再完成 Promise；失败命令统一抛出 `WorkspaceControllerError`，页面原有 loading、错误提示、输入清理和媒体 fallback 逻辑保持不变。

历史分页保留旧消息前置、消息表去重和 `hasMoreMessages` 更新语义。ChatLuna 思考状态与 Token 展示相关模板和计算逻辑未修改。Ego Browser 已实际发送文本消息并确认消息出现、输入框清空且控制台无异常；验证记录位于 `.scratch/webqq-modularization/evidence/04-messaging-media-history-announcements/verification.json`，PNG 仅保存在本地。
