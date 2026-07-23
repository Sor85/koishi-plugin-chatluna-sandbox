# MCP 状态修改必须幂等

所有 `interact` 和 `manage` MCP 工具必须携带 `idempotencyKey`，服务端按测试凭证、工具名称和 Key 在当前运行纪元内缓存首次结果。相同参数的重试返回原结果，不重复修改模拟 QQ 环境；同一 Key 搭配不同参数时返回冲突。
