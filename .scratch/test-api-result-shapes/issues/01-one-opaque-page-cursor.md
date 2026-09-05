# 01 — 分页收成一个不透明游标，翻页不再取决于另一个参数的取值

**What to build:** 四个 list 工具对外只保留 `limit` 与 `pageCursor` 两个分页参数，返回 `items` 与 `nextPageCursor`。游标是服务端编码的不透明字符串，消费者原样传回即可续页；没有更多页时 `nextPageCursor` 不出现。

**Status:** done

**为什么是不透明游标，而不是把四套协议改成一套。** 三族记录的排序键真的不一样：OneBot 调试记录只有每个记录域各自独立的 `sequence`，模型请求记录在单域用 `sequence`、跨域用 `createdAt` + `id`，会话列表根本没有游标只有 `offset`。把差异写进对外声明就一定会出现「哪个参数有效取决于另一个参数」，而那是今天最坏的一处：`list_model_request_records` 在 `scope: 'all'` 时把 `beforeSequence` 静默置空（见 `src/mcp/tool-registry.ts` 的 `listModelRequestRecords`，`federatedQuery` 那一行），此时只有 `beforeCreatedAt` + `beforeId` 有效，而三个游标在声明里并列、都不标条件。翻页翻不动不报错，只会一直拿到同一页。

**编码内容按记录种类各自决定，不追求统一的载荷。** 建议编成 base64url 的 JSON，字段就是今天的续页字段（`{ sequence }`／`{ createdAt, id }`／`{ offset }`），外加一个记录种类标记，让「把调试记录的游标传给模型请求工具」这种误用能被认出来并报 `invalid_arguments`，而不是当成一个碰巧能解析的游标。纪元或表结构变化时游标该失效，因此不要在里面藏可长期使用的语义。

**`limit` 保持现状。** 它已经是显式失败加越界收敛（ADR-0098），上下限也写在声明里。`list_test_call_records` 是唯一没有 `limit` 的 list，本票给它补上，默认与另外三个一致。

**游标过期的恢复建议要给一个能用的游标。** 今天两处的文案是「请使用 `earliestCursor=123` 恢复分页」（`listOneBotDebugRecords` 与 `listModelRequestRecords` 的 catch 分支），让消费者自己把数值拼回参数名。改成直接给出编码好的 `pageCursor` 值。`earliestCursor` 本身仍在结果里保留，它是容量信息。

**集合键统一成 `items`。** 今天 `list_conversations` 叫 `items`，另外三个叫 `records`。选 `items` 是因为它与「包一层」那一票（02）给裸数组用的键同名，端点上只剩一个集合键。

**`capacity` 与 `hasMore` 都保留。** 前者是容量摘要，后者今天就在两族记录页里；`nextPageCursor` 的有无与 `hasMore` 表达同一件事，但同时给出不算冗余——`hasMore: true` 而没有游标是一种真实状态（联邦页在第二排序键跨域不可比时不给续页游标，见词汇表「联邦读取」）。这种情况下必须能看出「还有更多但翻不过去」，而不是让消费者以为到底了。

**记录页类型是共享的，不要改。** `SandboxOneBotDebugRecordsPage`（`src/types.ts:452`）、`SandboxModelRequestRecordsPage`（`src/types.ts:662`）与 `SandboxTestCallRecordsPage`（`src/mcp/call-records.ts`）同时被 Console 契约（`src/console-contract.ts:109`、`:116`、`:144`）与 WebQQ 三个记录页读取，客户端直接读 `hasMore`／`nextCursor`／`nextCreatedAt`（`client/workspace/shell.ts:328-330`、`client/workspace/page.vue:110-112`）。翻译写在测试控制端点自己这一侧，按 ADR-0095 由翻译它的模块自述。

**不做的事：** 不改 Console 契约与三个记录页；不改会话消息分页（`get_conversation` 的 `messageLimit` 不是翻页）；不给 `list_pending_requests`、`list_test_spaces`、`get_capability_matrix` 加分页（它们的集合天然有界，包一层是 02 的事）。

- [x] 四个 list 工具的声明里只剩 `limit` 与 `pageCursor` 两个分页参数，`beforeSequence`／`beforeCreatedAt`／`beforeId`／`offset` 从对外声明消失
- [x] `tests/mcp-tool-schema-contract.test.ts` 的参数清单先改后实现，四个工具逐条一致
- [x] 四个工具的结果集合键都是 `items`，续页字段都是 `nextPageCursor`，有断言
- [x] 单域模型请求记录按序号续页，翻到底后 `nextPageCursor` 不出现，有断言
- [x] `scope: 'all'` 的模型请求记录按时间与记录标识续页，且真的能翻到第二页，有断言（今天这条路径静默翻不动）
- [x] 调试记录按序号续页，正序与倒序各有断言
- [x] 会话列表按偏移续页，有断言
- [x] 测试调用记录补上 `limit` 与续页，默认条数与另外三个一致，有断言
- [x] 把一种记录的游标传给另一种记录的工具时报 `invalid_arguments`，有断言
- [x] 伪造或截断的游标报 `invalid_arguments`，不当成「从头开始」，有断言
- [x] 游标过期时的 recovery 里给出可直接使用的 `pageCursor`，有断言
- [x] `capacity` 与 `earliestCursor` 在结果里保留，有断言
- [x] `hasMore: true` 但不给续页游标的联邦情形有断言
- [x] HTTP 表述与 MCP 表述返回同一份分页结果，有断言
- [x] Console 契约、三个记录页与它们的既有测试一字不改地通过
- [x] 领域词汇核过一遍：「调试记录游标」的定义是否要跟着改写
- [x] 完整测试、类型检查与构建通过

## Comments

已落地，见 ADR-0103。`src/mcp/page-cursor.ts` 拥有游标的编码、解码与记录种类判定；四个 list 工具的翻译写在 `src/mcp/tool-registry.ts` 的执行体里，记录页共享类型一字未改。断言在 `tests/mcp-page-cursor.test.ts` 与 `tests/mcp-tool-schema-contract.test.ts`，两种表述给出同一份分页结果的断言在 `tests/http-api.test.ts`。领域词汇里「调试记录游标」改写成「分页游标」（`CONTEXT.md`）。
