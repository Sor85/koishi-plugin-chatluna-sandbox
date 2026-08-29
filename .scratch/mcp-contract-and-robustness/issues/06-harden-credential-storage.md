# 06 — 凭证存储的健壮性

**What to build:** 损坏的凭证文件不会打挂请求处理，损坏时日志里有线索，凭证写入是原子的。两处缺陷都在凭证存储路径上。

**缺陷一：损坏的 `tokenDigest` 让请求挂死。** `normalizeStoredCredential`（`src/mcp/service.ts:658-673`）只校验 `tokenDigest` 是字符串，不校验长度或字符集。`authenticate`（`service.ts:839-843`）把它 `Buffer.from(digest, 'hex')` 后交给 `timingSafeEqual`，长度不等时 Node 抛 `ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH`。已实测：`tokenDigest: 'deadbeef'` 的条目确实让 `authenticate` 抛出。

后果比"认证失败"严重得多：`server.ts:125` 的 `authenticate` 调用在 `try` 块**之外**，而 `handleRequest` 是被 `void this.handleRequest(...)`（`server.ts:91`）调用的 async 函数。异常因此变成 unhandled rejection，同时那个 HTTP 请求永远不会收到任何响应，一直挂到客户端超时。一个坏条目让整个端点对所有客户端表现为挂起。

三层都要修，缺一层都留着同类风险：

1. `normalizeStoredCredential` 校验 `tokenDigest` 必须是 64 位十六进制，不合规的条目整条丢弃——与其余字段校验失败的处理一致
2. `authenticate` 在 `timingSafeEqual` 之前比长度，长度不等直接视为不匹配，不抛异常
3. `server.ts` 的 `authenticate` 调用移进 `try` 块，让任何意外异常都能落到 500 而不是 unhandled rejection；顺带核实 `handleRequest` 里还有没有别的 `try` 之外的逻辑

**缺陷二：非原子写入 + 静默清空。** `saveCredentials`（`service.ts:1774-1776`）用 `writeFileSync` 直接覆盖原文件，写到一半崩溃就是坏文件。`loadCredentials`（1759-1772）的 catch 把凭证列表清成空数组，不记任何日志。两条合起来是一次崩溃静默丢光全部凭证，现场没有任何线索——管理员只看到 WebQQ 里凭证列表空了。

写入改成「写临时文件 + `rename`」，`rename` 在同一文件系统内是原子的。文件权限仍保持 `0o600`。

「读取失败回到无有效凭证」这条行为**保留**：`service.ts:1769` 的注释解释了理由——可选的 MCP 能力不能阻断 WebQQ。本票只是让它可诊断，不改变它。

`SandboxMcpService` 目前拿不到 Logger（`SandboxControlService` 的 `ctx` 是私有的）。构造函数第一个参数改为接收 `Context`，与 `SandboxMcpHttpServer` 的做法一致；`src/index.ts:276` 的构造点已有可用的 `inner` context。测试 harness（`tests/helpers/mcp-service-harness.ts`）已经持有 `app`，改动很小。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] `normalizeStoredCredential` 校验 `tokenDigest` 为 64 位十六进制，不合规条目整条丢弃
- [ ] `authenticate` 对任何长度不合规的摘要返回不匹配，不抛异常
- [ ] `server.ts` 的 `authenticate` 调用移进 `try` 块
- [ ] 核实 `handleRequest` 里 `try` 之外还有无其他可抛异常的逻辑，结论写进 Comments
- [ ] 有用例断言坏 `tokenDigest` 条目不会让 `authenticate` 抛异常
- [ ] 有用例断言坏条目被丢弃后，同文件里的合规凭证仍能认证
- [ ] 上述用例在未修复的实现上变红（实测确认）
- [ ] `saveCredentials` 改为临时文件加 `rename`，权限仍为 `0o600`
- [ ] 凭证文件解析失败时写入 Logger 警告，含文件路径与失败原因
- [ ] 「解析失败回到无有效凭证」的行为保持不变
- [ ] `SandboxMcpService` 通过构造函数取得 `Context`，`src/index.ts` 与测试 harness 同步更新
- [ ] 明文 Token 仍不出现在日志里（ADR-0058）
- [ ] 不新增架构决策记录：ADR-0058 已覆盖存储位置与内容
- [ ] 单元测试、类型检查与构建全绿
