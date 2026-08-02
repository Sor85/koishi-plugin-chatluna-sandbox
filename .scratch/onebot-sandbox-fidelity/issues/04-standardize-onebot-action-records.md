# 04 — 统一 OneBot 机器人动作记录

**What to build:** 为所有 OneBot action 建立单一、可判别的机器人动作记录，使内部调试、WebUI、Console RPC、MCP 和测试共享同一语义，并能明确观察原始请求名、规范 action 和别名命中。

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] 每条记录同时保存插件实际请求的 `requestedAction` 和能力矩阵中的规范 `action`
- [x] 通过别名解析时记录 `matchedAlias`，直接使用规范 action 时不伪造别名
- [x] 成功记录始终包含 `status: success` 和 `result`
- [x] 失败记录始终包含 `status: error`，以及稳定的 code、message、retryable 和 traceId
- [x] 记录继续包含定位测试所需的实现、机器人身份、参数、耗时和受影响实体信息
- [x] 内部调试存储、WebUI、Console RPC、MCP list、MCP wait 和自动化测试使用同一记录模型
- [x] `action` 过滤匹配规范 action，并自动覆盖能力矩阵声明的所有别名
- [x] `requestedAction` 过滤仅精确匹配插件实际请求名；两个过滤条件同时提供时使用 AND
- [x] `wait_for_onebot_action` 成功时直接返回匹配记录和事件游标，不再要求从通用事件数据中解包
- [x] 旧 `type`、`resolvedType` 及依赖它们的 fallback 被删除，不保留未发布旧结构的兼容层
- [x] NapCat 与 LLOneBot 的规范 action、别名 action、成功和失败路径均有契约测试
- [x] 运行针对性测试、项目测试、类型检查和完整构建并全部通过
