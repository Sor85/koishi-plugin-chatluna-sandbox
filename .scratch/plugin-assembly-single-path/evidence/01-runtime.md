# 01 证据：主路径与降级路径的真实执行

单路装配之后，两条路各跑一次。开发环境为 `/Users/arrog1nt/code/koishi 插件/开发环境/koishi-dev`，按项目重启规则完整重启（按路径 `pkill` 后 `yarn dev`，确认只有一个 worker、5140 与 61901 已释放再启动）。

## 主路径（2026-09-01 18:22）

| 观察项 | 结果 |
| --- | --- |
| 插件 apply 次数 | 1 |
| 端点相关错误日志 | 无 |
| 61901 监听 | 有（`POST /mcp` → 401，`GET /api/v1/tools` → 401，门禁生效） |
| 控制台侧栏 `/chatluna-sandbox` 入口 | 1 个 |
| 环境管理 → MCP 能力 | 徽标 40 |
| 环境管理 → MCP 凭证 | 列出既有凭证 `agent` |
| WebQQ 发送 | 「装配收拢验收 主路径」发出并出现在消息记录，页面 0 console error |

`MCP 能力 40` 与凭证列表都走 `chatluna-sandbox/mcp-capabilities`、`chatluna-sandbox/mcp-credentials`，这两个监听器只在 Console 注册拿到 MCP 服务时才存在——它们有数据即证明 `endpoint?.mcp` 不为空。

## 降级路径（2026-09-01 18:28，此前从未被执行过）

强制手段：把 `dataDirectory` 临时指向 `/tmp/sandbox-endpoint-readonly/chatluna-sandbox`（父目录 `chmod 500`），命中构造函数里的 `mkdirSync`。真实部署里的对应场景是数据目录不可写。

日志原文一字不变：

```
2026-09-01 18:28:03 [E] chatluna-sandbox 测试控制端点初始化失败；WebQQ 仍可继续使用。 Error: EACCES: permission denied, mkdir '/tmp/sandbox-endpoint-readonly/chatluna-sandbox'
    at mkdirSync (node:fs:1370:26)
    at new SandboxMcpService (.../koishi-plugin-chatluna-sandbox/lib/index.js:11114:35)
    at Object.apply (...)
```

| 观察项 | 结果 |
| --- | --- |
| 插件 apply 次数 | 1（Console 未被注册第二遍） |
| 控制台侧栏 `/chatluna-sandbox` 入口 | 1 个 |
| 61901 监听 | 无（没有 MCP 服务就没有监听器可启动） |
| 环境管理 → MCP 能力 | 无徽标（目录为空，监听器未注册） |
| WebQQ 发送 | 「装配收拢验收 降级路径」发出并出现在消息记录，页面 0 console error |
| 模型请求采集器 | 照常安装 |

主路径与降级路径的差别只落在「有没有 MCP 服务、有没有监听器」上，WebQQ 两次都完整可用。

## 监听启动失败（2026-09-01 18:40，规格未要求真跑，顺手补上）

强制手段：先用一个占位 HTTP 服务器占住 `127.0.0.1:61901`，再启动开发环境，命中 `start()` 里的 `listen`。

日志原文一字不变：

```
2026-09-01 18:40:55 [E] chatluna-sandbox 测试控制端点监听器启动失败；WebQQ 仍可继续使用。 Error: listen EADDRINUSE: address already in use 127.0.0.1:61901
```

| 观察项 | 结果 |
| --- | --- |
| 61901 归属 | 仍是占位进程，插件没抢到 |
| 环境管理 → MCP 能力 | 徽标 40（**MCP 服务照旧注册给 Console**） |
| WebQQ | 照常可用 |

这一条是两种降级模式没被合并的正面证据：构造失败时 MCP 能力目录为空，监听失败时它是 40。收拢后的单路装配把这两种可观察结果都保住了。

## 收尾

- `dataDirectory` 改回 `resolve(inner.baseDir, 'data/chatluna-sandbox')`，`git diff` 只剩装配那一处；源码里再无 `TEMP-VERIFY` 痕迹。
- `/tmp/sandbox-endpoint-readonly` 与占用 61901 的占位进程都已清除；开发环境数据目录 `data/chatluna-sandbox` 全程未被触碰。
- 恢复后再完整重启一次确认主路径回位：61901 重新监听，MCP 能力徽标回到 40。
- 浏览器会话已关闭，临时目录已清理。

## 开发环境侧的一次意外（与本轮改动无关）

第一次重启时开发环境陷入崩溃循环：`koishi-plugin-logger-plus` 在 `lib/index.js:304` 执行 `Math.max(...files[date] ?? [0])`，而 `koishi-dev/logs` 里单日文件数已达 10 万量级，展开实参直接 `RangeError: Maximum call stack size exceeded`，worker 每 6 秒崩溃重启一次，控制台无法访问。经用户确认后把 `logs` 整体改名为 `logs-archive-20260901` 并新建空 `logs`（2.7 GB 历史日志原样保留，未删除，未改 `koishi.yml`），开发环境随即稳定。这是开发环境的数据积累问题，与本插件无关，但任何人重启该环境都会撞上。
