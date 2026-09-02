# koishi-plugin-chatluna-sandbox

在 Koishi 控制台中提供可验证 OneBot 插件行为的模拟 QQ 环境。

当前版本提供 WebQQ 风格的全页工作台。用户可以在浏览器内将普通用户或虚拟 OneBot 机器人切换为当前操作者，统一使用该参与者的视图、权限和发送身份，并在同一会话中观察被测插件回复；共享场景仍由服务端统一持有。

WebQQ 的毛玻璃、气泡尾部、颜色模式和强调色由 Koishi 插件全局配置统一控制。

## 灵感来源

- 轨迹功能的设计灵感来源于 [DeepSeek Harness（dsh）](https://github.com/deepseek-ai/deepseek-harness)。
- 请求体与响应体的样式来源于 [Axonhub](https://github.com/looplj/axonhub)。

## AI 测试空间

测试控制端点默认开启，外部测试控制器可以创建空白且隔离的 AI 测试空间，自主准备用户、机器人、群组和关系，再通过真实 OneBot 交互验证插件行为。端点只监听回环地址且要求 Bearer 测试凭证，需先在环境管理页创建凭证才能调用。修改操作必须显式携带 `spaceId`，不会写入主模拟 QQ 环境。

WebQQ 顶部主导航提供测试空间总览：主环境固定在首位，AI 空间按创建时间从旧到新排列。用户可以实时观察空间、接管或归还控制权、复盘已完成空间，以及按需重新激活或删除。数据库持久化模式会同时保存主环境和测试空间场景。

完整权限的 MCP 凭证可发现 41 个工具和 6 个只读资源，其中包括用于构造和按权限读取合并转发的 `send_forward_message`、`get_forward_message`，以及 7 个测试空间生命周期工具：`list_test_spaces`、`get_test_space`、`create_test_space`、`complete_test_space`、`fail_test_space`、`reactivate_test_space` 和 `delete_test_space`。环境管理页会直接展示由服务端权威定义生成的 MCP 工具、资源、权限范围和协议能力目录。

被测机器人只在唤醒条件成立时回复，而条件由当前装着的 ChatLuna 响应插件决定：ChatLuna 主功能与 chatluna-character 的判定口径完全不同，两者同时装上时默认只有 chatluna-character 回复，而它的白名单默认为空。`get_wakeup_rules` 按会话答出谁在响应、消息要怎么写才能唤醒它（@、引用、昵称开头、昵称任意位置、命令）、哪些触发不由消息决定（累计条数、发言等待、群活跃度、随机概率），以及哪些陷阱会让唤醒落空。同一份答案还会跟着 `send_message` 的参数说明与 `chatluna-sandbox://guide` 一起发布，因此 AI 客户端连上端点就能读到，不必先想到要问。

断言插件行为时不要只看机器人回复的文本：`wait_for_onebot_action` 可以等待插件真实发起的 OneBot action 及其成败，`wait_for_message` 的 `settleSeconds` 可以跳过「稍等」这类中间回复并拿到最终结果，专属头衔、群禁言和表情回应等有状态 action 的结果都能从场景快照复查。

## 测试控制端点

测试控制端点是一个独立的 HTTP 监听器，在同一个地址和端口上并列提供两种协议表述。两者共用监听地址、TLS、来源与 Origin 白名单、测试凭证与配额，背后是同一个测试控制服务，因此权限、幂等、确认令牌与测试调用记录的语义完全一致。插件全局配置里有三个相关分组：`MCP 测试端点` 与 `HTTP 测试端点` 各有一个总开关（默认都开启，可以按需单独关掉其中一种）和自己的路径，`端点通用设置` 放监听地址与端口、来源与 Origin 白名单、TLS 与全部调用配额。

| 表述 | 默认路径 | 适合谁 |
| --- | --- | --- |
| MCP Streamable HTTP | `/mcp` | 能自动发现工具与 Schema 的外部 AI 客户端 |
| HTTP 测试接口 | `/api` | 直接构造请求的 Shell 脚本与 CI |

HTTP 表述只做协议翻译：请求体直接就是工具参数，不必包 JSON-RPC 信封，也不必协商 `Accept: text/event-stream`；失败返回真实 HTTP 状态码，错误信封平铺在响应体顶层，字段与 MCP 表述逐字一致。

```bash
TOKEN=<测试凭证 Token>
BASE=http://127.0.0.1:61901/api/v1

# 发现工具与参数契约
curl -s -H "authorization: Bearer $TOKEN" "$BASE/tools"

# 调用工具：请求体就是参数，无参工具连 -d 都不需要
curl -s -X POST -H "authorization: Bearer $TOKEN" "$BASE/tools/get_server_info"
curl -s -X POST -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"name":"退群公告测试","idempotencyKey":"run-1-space"}' "$BASE/tools/create_test_space"

# 读取只读资源
curl -s -H "authorization: Bearer $TOKEN" "$BASE/resources"
curl -s -H "authorization: Bearer $TOKEN" --get --data-urlencode 'uri=chatluna-sandbox://guide' "$BASE/resources"
```

状态码按稳定错误码映射：参数与契约类为 `400`，凭证缺失为 `401`，权限不足为 `403`，实体或路径不存在为 `404`，动词不符为 `405`，乐观并发与空间状态冲突为 `409`，游标过期为 `410`，需要确认令牌为 `428`，请求体超限为 `413`，限流与并发超限为 `429`（带 `Retry-After`），领域主动拒绝为 `422`，未预期异常为 `500`。完整错误码清单从 `chatluna-sandbox://errors` 资源读取。

失败响应里的 `traceId` 就是那次失败写下的测试调用记录 ID，可用 `get_test_call_record` 取回完整参数与错误。WebQQ 的测试调用工作台会标注每条记录的来路，并支持按 `MCP 客户端` / `HTTP 接口` 筛选。

## OneBot 基线

| 实现配置 | 文档快照日期 | 上游来源版本 | `get_version_info.app_name` |
| --- | --- | --- | --- |
| NapCat | 2026-07-24 | `NapNeko/NapCatQQ@33546b936e008c017b2b9c1c41a0bb4f9e86c5be` | `NapCat.Onebot` |
| LLBot | 2026-07-24 | `LLOneBot/LuckyLilliaBot@d6e2f485b8164597d04a2907d307739ecfcf4a55` | `LLOneBot` |

能力覆盖支持按 action、别名和作用说明搜索；各能力的 API 兼容性说明见 `docs/onebot-profiles.md`。

## 开发

```bash
yarn install
yarn test
yarn typecheck
yarn build
```
