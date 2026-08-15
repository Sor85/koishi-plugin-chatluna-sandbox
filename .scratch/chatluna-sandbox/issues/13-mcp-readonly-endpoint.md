# 13 — 提供安全的 MCP 只读端点

**What to build:** 让管理员可以显式启用独立 MCP Streamable HTTP 监听器、创建具名只读测试凭证，并让外部测试控制器安全读取服务器、场景、会话、申请、能力和场景导出信息。端点默认只在本机可用，启动失败不影响 WebQQ。

**Blocked by:** 09 — 实现 NapCat、LLBot 私有接口与能力覆盖

**Status:** resolved

- [x] MCP 默认关闭，默认监听 `127.0.0.1:61901/mcp`
- [x] 监听地址、端口、IP/CIDR 白名单和精确 Origin 白名单可由全局配置设置
- [x] 来源判断只使用真实 TCP 地址并忽略代理转发头
- [x] 非回环监听默认要求 TLS，显式允许明文时持续显示安全警告
- [x] authority 4 管理员可以创建、禁用和撤销具名 Bearer 凭证
- [x] Token 由服务端高熵生成、只展示一次并仅持久化 SHA-256 摘要
- [x] 只读凭证可以使用全部 7 个 Read 工具和获准的只读 Resources
- [x] 无权限工具不会出现在工具发现结果中
- [x] 监听器认证或启动失败不会影响 WebQQ 和共享沙盒状态

## Answer

已增加独立、无状态的 MCP Streamable HTTP 监听器、来源与 Origin 校验、TLS 安全边界、具名摘要凭证存储、authority 4 管理 RPC，以及按 scope 裁剪的 7 个只读工具和只读资源。
