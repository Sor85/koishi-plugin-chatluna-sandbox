# MCP 使用独立 HTTP 监听器

测试控制端点由插件内部的独立 Node.js HTTP Server 承载，不复用 Koishi 主服务器端口，使监听地址、端口、来源白名单和生命周期可以独立控制。监听器只提供 MCP Streamable HTTP，启动失败或停止不得影响 WebQQ 工作台与沙盒主体。
