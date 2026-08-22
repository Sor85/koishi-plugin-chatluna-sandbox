# Capture ChatLuna errors

Status: resolved

## Goal

把 `chatluna/after-chat-error` 暴露的 ChatLuna 错误码、消息、原始原因和 timeout 标记关联到唯一的失败模型请求记录。

## Acceptance

- 请求记录结构包含可选 `chatlunaError`。
- 关联仅在空间/会话可证明时发生。
- 无法唯一归属时不更新任何记录。
- 单元测试覆盖提取与关联。

## Comments

- 已增加 `chatlunaError` 记录字段、安全提取器和唯一会话关联。
- 已覆盖同会话优先关联及多机器人歧义不串写。
