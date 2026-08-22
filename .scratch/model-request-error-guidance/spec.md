## Problem Statement

模型请求页面能够保存 HTTP 状态、原始响应体和采集层异常，但错误详情目前通常只显示 `HTTP 429` 或传输异常。ChatLuna 在模型调用失败后还会通过 `chatluna/after-chat-error` 暴露其规范错误码、面向用户的错误消息和 `originError`，这些内容没有与已经采集的模型请求关联。页面也没有根据 ChatLuna 官方错误码文档提示可能原因。

## Solution

在 ChatLuna 核心错误事件到达时，按 ChatLuna 内部会话映射找到唯一的沙盒空间和最近一条尚未附加 ChatLuna 错误的失败模型请求，把以下证据写入该请求记录：

- ChatLuna 错误码
- ChatLuna 错误消息
- ChatLuna `originError.message`（若存在）
- `isTimeout` 标记（若存在）

模型请求详情页为错误请求增加独立错误诊断卡片。卡片优先展示 ChatLuna 报错内容，同时保留采集层报错和 trace；再根据 ChatLuna 官方错误码表给出对应的“可能原因”。对于没有 ChatLuna 错误码的 HTTP/传输失败，只展示已有原始证据，不根据裸 HTTP 状态猜测 ChatLuna 原因。

## Implementation Decisions

- ChatLuna 错误是模型请求记录的一部分，不另建日志或页面状态。
- 关联必须可证明：核心链路只在单个沙盒控制服务内，`chatluna/after-chat-error` 的内部会话 ID 唯一映射到一个活动机器人/逻辑会话时更新记录；无法唯一归属时不猜测。
- 同一空间内选择最近一条 `status = error`、尚无 `chatlunaError`、且优先匹配活动逻辑会话的记录。
- `chatluna-character` 当前没有公开的错误事件；保留其底层 HTTP 响应和传输错误，不伪造 character 专属诊断。
- 官方原因映射只使用 ChatLuna 文档明确给出的错误码含义与处理建议；宽泛错误码 103 保持宽泛，不从 HTTP 401/403/429 推断 API Key 或限流。
- 当前项目尚未公开发布，直接扩展请求记录结构，不增加旧协议兼容层。

## Testing Decisions

- 覆盖 ChatLuna 错误对象的安全提取，包括嵌套 `originError` 和 timeout。
- 覆盖错误事件只更新唯一空间、优先匹配逻辑会话、无法唯一归属时不串写。
- 覆盖详情页存在 ChatLuna 报错、原始原因、官方可能原因和文档链接。
- 运行完整测试、类型检查和构建。

## Development Preview

- `NODE_ENV=development` 时，主模拟 QQ 环境自动补齐 11 条幂等错误预览记录，覆盖当前所有官方原因映射。
- 每条记录使用 `dev-chatluna-error-preview:<code>` 作为稳定交互标识，数据库模式和 HMR 重载不会重复生成。
- 生产环境不生成模拟证据。

## Out of Scope

- 不解析或展示错误堆栈、cause 链和任意 `data`，避免把大对象或敏感内容写入记录。
- 不根据供应商 HTTP 状态自行维护通用故障知识库。
- 不实现请求重试或一键修复。

Triage: ready-for-agent
