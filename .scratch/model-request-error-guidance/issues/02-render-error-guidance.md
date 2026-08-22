# Render error guidance

Status: resolved

## Goal

为模型请求详情中的错误请求展示 ChatLuna 报错内容和官方文档对应的可能原因。

## Acceptance

- 错误卡片区分 ChatLuna 报错、原始原因和采集层错误。
- 已知 ChatLuna 错误码显示官方可能原因。
- 提供 ChatLuna 官方错误码文档链接。
- 没有 ChatLuna 错误码时不根据裸 HTTP 状态猜测原因。
- 页面测试和样式测试覆盖新增内容。

## Comments

- 已增加错误诊断卡片、ChatLuna 报错/原始原因/采集错误分层展示。
- 已按官方错误码文档展示可能原因，并提供文档链接。
- 已移除未捕获 ChatLuna 规范错误时的冗余说明；请求错误码改用与左侧状态一致的错误 Badge，trace 使用次要等宽文本。
- 开发环境自动生成覆盖 11 个错误码的幂等预览记录，生产环境不生成。
