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

**Status:** resolved

- [x] `normalizeStoredCredential` 校验 `tokenDigest` 为 64 位十六进制，不合规条目整条丢弃
- [x] `authenticate` 对任何长度不合规的摘要返回不匹配，不抛异常
- [x] `server.ts` 的 `authenticate` 调用移进 `try` 块
- [x] 核实 `handleRequest` 里 `try` 之外还有无其他可抛异常的逻辑，结论写进 Comments
- [x] 有用例断言坏 `tokenDigest` 条目不会让 `authenticate` 抛异常
- [x] 有用例断言坏条目被丢弃后，同文件里的合规凭证仍能认证
- [x] 上述用例在未修复的实现上变红（实测确认）
- [x] `saveCredentials` 改为临时文件加 `rename`，权限仍为 `0o600`
- [x] 凭证文件解析失败时写入 Logger 警告，含文件路径与失败原因
- [x] 「解析失败回到无有效凭证」的行为保持不变
- [x] `SandboxMcpService` 通过构造函数取得 `Context`，`src/index.ts` 与测试 harness 同步更新
- [x] 明文 Token 仍不出现在日志里（ADR-0058）
- [x] 不新增架构决策记录：ADR-0058 已覆盖存储位置与内容
- [x] 单元测试、类型检查与构建全绿

## Comments

**实测的红，而且是最有说服力的一次。** `tests/mcp-credential-storage.test.ts` 在未修复实现上 6 条里红 5 条，其中 HTTP 那条不是断言失败而是**超时**，Vitest 同时报出 `Unhandled Rejection: RangeError: Input buffers must have the same byte length / ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH`，堆栈正是 `service.ts:971 → server.ts:125 → Server.listener server.ts:91`。这正是票里描述的形态：异常在 `try` 之外抛出、请求永远收不到响应。修复后同一条用例拿到 `401 { error: 'unauthorized' }`。

**`handleRequest` 里 `try` 之外还有五处可抛异常的逻辑，因此不只是把 `authenticate` 挪进去，而是把整个方法体纳入 `try`：**

1. `new URL(request.url ?? '/', 'http://localhost')` —— 畸形请求目标可以让它抛。
2. `sourceMatches` 里的 `BlockList.addSubnet` —— 非法的来源白名单规则会抛。
3. `this.service.authenticate(token)` —— 本票的那个缺陷。
4. `this.createMcpServer(token, sourceIp)` —— 构造低层 Server。
5. `new StreamableHTTPServerTransport(...)` —— 构造 transport。

`transport` 与 `mcp` 改成 `let` 并在 `finally` 里按需关闭，因此它们构造失败时也不会漏关。另外补了一条收尾：响应头已经发出时无法再改状态码，此时 `response.end()`——不结束响应等于让请求挂到客户端超时，而挂起正是本票要消除的形态。

**三层防护各自有用例。** 存储层（丢弃坏条目）与内存层（`authenticate` 先比长度）分开断言：后者绕过 `normalizeStoredCredential` 直接往内存凭证列表注入坏摘要，因为「摘要绕过存储进到内存」没有别的观察面。

**原子写入的可观察形态。** 光断言「文件里是合法 JSON」证明不了 rename，因此用例预放一个「上次崩溃留下的」`mcp-credentials.json.tmp`：走 rename 的实现会覆盖它再搬走，直接覆盖原文件的实现会把它留在目录里。这条断言顺带暴露出一个真实问题——`writeFileSync` 的 `mode` 只在创建文件时生效，沿用崩溃残留的临时文件会把它的 0644 一路搬到凭证文件上，所以 rename 之前显式 `chmodSync(0o600)`。

**`ENOENT` 不写日志。** 首次启动时凭证文件本来就不存在，那不是损坏。其余失败（JSON 解析错、权限不足、IO 错）都写 warn，含文件路径与原始错误；不写文件内容，因为内容里带明文 Token（ADR-0058）。有一条用例专门断言告警里不出现明文 Token。

**Context 通道与票 02 共用。** 构造函数第一个参数改为 `Context`（`new SandboxMcpService(ctx, control, options)`）。票 02 的「未预期异常堆栈写入 Logger」同样需要它，两票共用这一处改动。`src/index.ts` 用已有的 `inner` context；18 处测试构造点与 `tests/helpers/mcp-service-harness.ts` 同步更新。

**一处测试夹具随之修正。** `tests/mcp-service.test.ts` 的「保留只有摘要的旧凭证」原先用 `tokenDigest: 'abc'`，现在会被整条丢弃。真实的旧记录带的是完整 sha256 摘要，夹具改成 `createHash('sha256').update('legacy-token')`——那才是它本来要模拟的东西。
