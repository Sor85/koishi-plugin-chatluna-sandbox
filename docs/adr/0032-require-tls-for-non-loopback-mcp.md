# 非回环 MCP 默认要求 TLS

测试控制端点监听回环地址时允许 HTTP，监听非回环地址时默认必须配置 TLS 证书和私钥，以保护 Bearer 凭证和测试数据。只有用户显式启用 `allowInsecureRemote` 才允许非本机明文传输，并必须在日志与环境管理界面持续显示安全警告。

该决定已被 ADR-0082 取代：非回环缺少 TLS 时改为照常启动并持续告警，`allowInsecureRemote` 开关随之删除。
