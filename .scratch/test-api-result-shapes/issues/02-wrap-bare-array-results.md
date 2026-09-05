# 02 — 裸数组结果包一层，MCP 表述不再丢掉结构化内容

**What to build:** `list_test_spaces`、`list_pending_requests`、`get_capability_matrix` 三个工具的结果从裸数组改成 `{ items: [...] }`。

**Status:** ready-for-agent

**Blocked by:** 01（集合键统一成 `items` 在那一票里定下）

**为什么这不只是形状洁癖。** MCP 协议要求 `structuredContent` 必须是对象，因此 `jsonContent`（`src/mcp/server.ts:88-93`）只在结果是普通对象时附上它，数组与标量只落进 `content[0].text` 里的一段 JSON 字符串。同一个工具在 HTTP 表述下返回的是真正的 JSON 数组（`src/mcp/http-api.ts:281-282`）。于是 MCP 客户端对这三个工具必须改走「解析文本」的路径，而对其余三十八个工具可以直接读结构化内容。词汇表说两种表述「落到同一次工具调用上的权限、配额、幂等与记录完全相同」——这处差异不在那四项里，但它同样是消费者要为「换一种表述」付的代价。

**第二个代价是加不了字段。** 裸数组上没有地方放容量摘要、续页信息或来源标注，因此这三个工具今后要加任何东西都是破坏性变更。包一层之后加字段是兼容的。

**只包这三个，不动其他返回对象的工具。** 全仓库返回裸数组的工具就这三个：`list_test_spaces`（`requireTestSpaces().listSpaces()`）、`list_pending_requests`（`getSnapshot().requests`）、`get_capability_matrix`（`readCapabilityMatrix`，返回 `SandboxOneBotCapability[]`）。`export_scene`、`get_scene_snapshot` 等已经是对象。

**`readCapabilityMatrix` 是共享的，包装写在工具执行体里。** 它同时被 `chatluna-sandbox://capabilities/napcat` 与 `.../llbot` 两条只读资源复用（`src/mcp/service.ts` 的 `readResource`）。资源正文本来就是文本序列化，不受 `structuredContent` 的约束；两条资源保持返回裸数组，不要为了一致把它们也包起来——那会让已经在读资源的消费者白改一次。包装只加在工具这一侧。

**测试里有若干处直接对结果断言长度。** 至少 `tests/mcp-arguments.test.ts:79`、`tests/mcp-idempotency-buffers.test.ts:38`、`:60`、`tests/mcp-service.test.ts:440`、`:453`、`tests/mcp-tool-coverage.test.ts:484`、`tests/http-api.test.ts:207` 会跟着改。这些是对外形状变化的正常代价，逐处改断言而不是加兼容层。

**不做的事：** 不给这三个工具加分页；不改两条能力基线资源；不改 `jsonContent` 的判定（它对 MCP 协议的理解是对的，问题在结果形状而不在它）。

- [ ] 三个工具的结果都是 `{ items: [...] }`，有断言
- [ ] MCP 表述下三个工具都带上 `structuredContent`，有断言（今天这三处只有 `content[0].text`）
- [ ] HTTP 表述返回同一份对象，与 MCP 表述逐字段一致，有断言
- [ ] 两条能力基线资源仍返回裸数组，有断言
- [ ] 受影响的既有断言逐处改成读 `items`，没有兼容层
- [ ] 完整测试、类型检查与构建通过
