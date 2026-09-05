# 测试控制端点的返回形状：分页、结构化内容与输出声明

Status: done

来源：对现有 MCP／HTTP 接口参数设计的一次评审。评审里另外六项（调用标注参数不参与指纹、数值与枚举参数显式失败、参数取值组合用判别联合、按结果筛选用状态枚举、事件类型封闭词汇、返回发送前游标）已经落地，见 ADR-0097 到 ADR-0102。剩下这三项都动返回形状，因此单独成规格。

---

## Problem Statement

对外声明这一轮已经收拾干净：参数的取值集合、取值组合与必填关系都写进了 `inputSchema`，取值集合之外的输入一律显式失败。返回形状还没有，而消费者对返回值的了解全靠「调一次看看」。

**分页在四个 list 工具上有四套协议。**

| 工具 | 集合键 | 游标参数 | 续页字段 |
| --- | --- | --- | --- |
| `list_conversations` | `items` | `limit`／`offset` | `nextOffset` |
| `list_onebot_debug_records` | `records` | `limit`／`beforeSequence` | `nextCursor`／`earliestCursor` |
| `list_model_request_records` | `records` | `limit`／`beforeSequence`／`beforeCreatedAt`／`beforeId` | `nextCursor`／`nextCreatedAt`／`nextId`／`earliestCursor` |
| `list_test_call_records` | `records` | 无 | 无 |

最坏一处在 `list_model_request_records`：`scope: 'all'` 时执行体把 `beforeSequence` 静默置空（序号是每个记录域各自独立的计数，跨域没有意义），此时只有 `beforeCreatedAt` + `beforeId` 有效。也就是说哪个游标能用取决于另一个参数的取值，而三个游标在声明里并列、都不标条件。翻页翻不动不会报错，只会一直拿到同一页。

游标过期时的恢复建议是「请使用 `earliestCursor=123` 恢复分页」——让消费者自己把数值拼回参数，而恢复本来可以直接给一个能用的游标值。

`list_test_call_records` 是唯一没有上限的 list：保留 500 条时它一次全返回，也没有任何续页字段。

**MCP 表述下三个工具丢掉 `structuredContent`。** `jsonContent`（`src/mcp/server.ts:88-93`）只在结果是普通对象时附 `structuredContent`，因为 MCP 协议要求它必须是对象。返回裸数组的 `list_test_spaces`、`list_pending_requests`、`get_capability_matrix` 因此在 MCP 下只剩 `content[0].text` 里的一段 JSON 字符串，而同一个工具在 HTTP 表述下返回的是真正的 JSON 数组（`src/mcp/http-api.ts:281-282`）。词汇表说两种表述「落到同一次工具调用上的权限、配额、幂等与记录完全相同」，这处差异不在那四项里——它是结果保真度，而且不是协议翻译的必然结果。

裸数组还有第二个代价：往结果里加任何字段都是破坏性变更，因此这三个工具将来加不了容量摘要或续页信息。

**工具返回什么完全没有机器可读的声明。** 注册表条目只有 `inputSchema`（`src/mcp/tool-registry.ts` 的 `SandboxMcpToolEntry`），SDK 是 1.29.0、协议支持 `outputSchema`，但没有用。等待类最需要：四个 `wait_for_*` 的成功载荷键各不相同（`event` ／ `event` + `events` ／ `record` ／ `state`），超时载荷是 `{ matched: false, reason: 'timeout', cursor }`。消费者要么读源码，要么每个工具先试一次。

`matched: boolean` 与可选载荷的组合还让「匹配到了但没有事件」这个状态可以表达，执行体今天靠 `!first.matched || !first.event` 防守它。

## Solution

三件事，按顺序做：

1. **分页收成一个不透明游标。** 对外只有 `limit` 与 `pageCursor`，返回 `items` 与 `nextPageCursor`（没有更多页时不出现）。序号、时间戳、破平键怎么编码是服务端的事，消费者不必知道哪个游标在哪种取值下有效。
2. **裸数组结果包一层。** 三个工具的结果变成 `{ items: [...] }`，MCP 表述因此拿得到 `structuredContent`，两种表述的结果保真度一致。
3. **给工具声明 `outputSchema`。** 先覆盖四个 `wait_for_*`、两个发送工具、四个破坏性工具与 `get_server_info`；同时把 `matched: boolean` 换成 `outcome: 'matched' | 'timeout'`，让「匹配到了但没有事件」不可表达。

顺序不能换：`outputSchema` 描述的是最终形状，而前两票都在改形状；`list_*` 的输出声明还依赖第二票把裸数组包成对象。

## 共同约束

**记录页类型是共享的，不要改它们。** `SandboxOneBotDebugRecordsPage`（`src/types.ts:452`）、`SandboxModelRequestRecordsPage`（`src/types.ts:662`）与 `SandboxTestCallRecordsPage`（`src/mcp/call-records.ts`）同时被 Console 契约（`src/console-contract.ts:109`、`:116`、`:144`）与 WebQQ 三个记录页读取，客户端直接读 `hasMore`／`nextCursor`／`nextCreatedAt`（`client/workspace/shell.ts:328-330`、`client/workspace/page.vue:110-112`）。翻译发生在测试控制端点自己这一侧，按 ADR-0095 的口径由翻译它的模块自述。

**容量摘要与最早游标不要丢。** 两族记录页都带 `capacity`，游标过期时还要能恢复分页。不透明游标只替换「消费者自己拼参数」这一段，不减少信息量。

**HTTP 表述与 MCP 表述必须给出同一份结果。** 这三票都不允许出现「一种表述有、另一种没有」的字段。

**对外声明的顺序与清单由测试侧独立书写。** 工具清单（`tests/helpers/mcp-tool-catalogue.ts`）、参数契约（`tests/mcp-tool-schema-contract.test.ts`）与资源清单（`MCP_RESOURCE_URIS`）都是先改测试再改实现。输出声明按同一模式加一份清单。

## User Stories

1. As a 外部测试控制器, I want 四个 list 工具用同一套分页参数, so that 我只需要学一遍翻页
2. As a 外部测试控制器, I want 翻页游标由服务端给出, so that 我不必判断哪个游标在哪种 scope 下有效
3. As a 外部测试控制器, I want 游标过期时直接拿到一个能用的游标, so that 恢复分页不用自己拼参数
4. As a 外部测试控制器, I want 测试调用记录也能分页, so that 记录多的时候我不必一次收下全部
5. As a MCP 客户端, I want 全部工具都返回 structuredContent, so that 我不必对某几个工具改走解析文本的路径
6. As a 外部测试控制器, I want 从 tools/list 就知道工具返回什么, so that 我不必先试调一次再写断言
7. As a 外部测试控制器, I want 等待类工具的结果用一个判别式区分等到与超时, so that 我不必判断可选载荷在不在
8. As a 沙盒用户, I want WebQQ 的三个记录页与容量摘要一字不变, so that 这次改动不影响我复盘

## Issues

- `01-one-opaque-page-cursor.md` — 分页收成一个不透明游标
- `02-wrap-bare-array-results.md` — 裸数组结果包一层
- `03-declare-output-schemas.md` — 声明 outputSchema 并把等待结果换成判别式
