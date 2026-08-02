# 统一 OneBot 机器人动作记录与别名过滤

OneBot action 的内部调试存储、WebUI、Console RPC、MCP 列表、MCP 等待和测试统一使用同一种机器人动作记录，不保留 `type` 与 `resolvedType` 两套旧结构。记录同时包含插件实际发出的 `requestedAction`、能力矩阵解析后的规范 `action`、命中的 `matchedAlias`、脱敏 `params`、实现配置、实体索引、耗时和判别联合结果；成功记录必须包含 `result`，失败记录必须包含带稳定错误码、可重试性和追踪标识的 `error`。

查询参数 `action` 按规范 action 匹配并自动覆盖其全部别名，`requestedAction` 只精确匹配插件实际请求名，两者同时提供时取交集。`wait_for_onebot_action` 匹配成功后在顶层返回与调试列表单条记录完全同型的 `record`，使跨 NapCat、LLBot 和原生别名的断言不需要客户端再次归一。
