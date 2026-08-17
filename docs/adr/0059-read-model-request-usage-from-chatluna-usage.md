# 模型请求用量优先读取 chatluna-usage

模型请求详情的输入、输出、推理、缓存、TTFT、TPS 和总耗时优先从 `chatluna-usage` 读取。ChatLuna 已在 `chatluna/model-usage` 中规范化这些字段；继续从 HTTP 响应体猜测会把推理误扣成 0 输出，也拿不到 TTFT/TPS。未安装该插件或匹配不到记录时，才回退到响应体解析。
