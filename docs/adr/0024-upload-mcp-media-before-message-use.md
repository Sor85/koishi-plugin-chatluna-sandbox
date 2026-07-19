# MCP 富媒体先上传再引用

外部测试控制器通过独立 `upload_media` 工具提交受大小限制的 Base64 内容并获得 `mediaId`，消息工具只引用已保存媒体或外部 HTTPS URL。服务端不接受本地文件路径，也不主动抓取外部 URL，避免消息 Schema 膨胀、主机文件泄露和 SSRF。
