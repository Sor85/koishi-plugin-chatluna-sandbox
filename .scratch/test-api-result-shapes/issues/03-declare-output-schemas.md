# 03 — 声明 outputSchema，并把等待结果换成判别式

**What to build:** 给注册表条目加可选 `outputSchema`，先覆盖四个 `wait_for_*`、两个发送工具、四个破坏性工具与 `get_server_info`；同时把等待类结果里的 `matched: boolean` 换成 `outcome: 'matched' | 'timeout'`。

**Status:** done

**Blocked by:** 01、02（输出声明描述的是最终形状，前两票都在改形状；`list_*` 的声明还依赖 02 把裸数组包成对象）

**为什么等待类最需要。** 四个 `wait_for_*` 的成功载荷键各不相同：`wait_for_event` 给 `event`，`wait_for_message` 给 `event`、传了 `settleSeconds` 时另给 `events`，`wait_for_onebot_action` 给 `record`，`wait_for_chatluna_state` 给 `state`。超时时统一是 `{ matched: false, reason: 'timeout', cursor }`。这四种形状今天只能靠读源码或试调一次学到，而它们是编排里调用最频繁的一族。

**`matched: boolean` 加可选载荷让一个不该存在的状态可以表达。** 「匹配到了但没有事件」在类型上合法，执行体因此要靠 `!first.matched || !first.event` 防守（`waitForSettledMessages`、`waitForOneBotAction`、`waitForChatLunaState` 各一处）。换成 `outcome` 判别式之后，`matched` 分支必带载荷、`timeout` 分支必带 `reason`，防守条件退成一次判别。

**保留 `matched` 还是换掉，倾向换掉。** 同时给两个字段等于让消费者面对两个真值来源，而它们一旦不一致就是纯粹的 bug 来源。这是一次破坏性返回变更，与 01、02 同批发生，因此把它放在这一票里一起做，而不是留一个过渡期。

**声明 `outputSchema` 有一条协议义务。** 按 MCP 规范，声明了 `outputSchema` 的工具必须返回符合它的 `structuredContent`。因此：只给结果是对象的工具声明（这就是 02 必须先落地的原因）；`src/mcp/server.ts` 的 `ListToolsRequestSchema` 处理器要把 `outputSchema` 一起映射出去（今天只映射 `name`／`description`／`inputSchema`）；SDK 是 1.29.0，用的是低层 `Server` 而不是 `McpServer.registerTool`，因此不会自动校验，声明与实际返回是否一致要靠测试钉住。

**覆盖范围先小后大，但要说清为什么。** 本票只覆盖四个 `wait_for_*`（形状最杂）、两个发送工具（`cursorBefore` 与 `cursor` 两个游标最容易被搞混，见 ADR-0102）、四个破坏性工具（`withConfirmation` 统一返回 `{ revision, cursor }`，一处声明覆盖四个工具）与 `get_server_info`（消费者的第一个调用）。其余工具留待后续，判据是「返回形状是否能从工具名与参数推断出来」——`get_scene_snapshot` 能，`wait_for_message` 不能。

**声明与实现的一致性靠一份测试侧清单。** 与工具清单、参数契约、资源清单同一个模式：`tests/` 里独立书写「哪些工具声明了 outputSchema、每份声明的顶层字段是什么」，先改测试再改实现。另外要有用例真的调用这些工具，把返回值与声明比对——只断言声明存在等于只证明了实现等于自己。

**HTTP 表述也要能读到输出声明。** `GET /v1/tools` 走的是同一个 `service.listTools`（`src/mcp/http-api.ts` 的 `list-tools` 分支），因此声明自然带出去；要有断言，避免下一次改动只顾 MCP 那一侧。

**不做的事：** 不给全部四十一个工具声明；不改 `jsonContent` 的 `structuredContent` 判定；不引入运行时校验（协议不要求服务端自校，加了反而多一条失败路径）。

- [x] `SandboxMcpToolEntry` 上新增可选 `outputSchema`，工具清单投影与 `SandboxMcpToolCapability` 一并带上它
- [x] `tools/list`（MCP）与 `GET /v1/tools`（HTTP）都返回 `outputSchema`，各有断言
- [x] 测试侧独立书写「声明了 outputSchema 的工具及其顶层字段」清单，先改测试再改实现
- [x] 每个声明了 outputSchema 的工具都有用例把真实返回值与声明比对，字段齐全且没有多余字段
- [x] 四个 `wait_for_*` 的结果用 `outcome: 'matched' | 'timeout'`，`matched` 从返回值消失，有断言
- [x] `matched` 分支必带该工具自己的载荷键（`event`／`record`／`state`），`timeout` 分支必带 `reason`，有断言
- [x] `wait_for_message` 传 `settleSeconds` 时的 `events` 在声明里出现，且与不传时的形状差异写清楚
- [x] 三处 `!matched || !event` 防守退成一次判别，有断言覆盖原先那条防守拦住的情形
- [x] 两个发送工具的 `cursorBefore` 与 `cursor` 都在声明里，描述说明各自用途
- [x] 四个破坏性工具共用一份 `{ revision, cursor }` 声明，有断言
- [x] `get_server_info` 的声明覆盖 `name`／`testApiVersion`／`transport`／`stateless`／`cursor`
- [x] 未覆盖的工具没有 `outputSchema` 字段，不给空对象，有断言
- [x] 测试指南资源里的等待示例跟着改成 `outcome`
- [x] 完整测试、类型检查与构建通过

## Comments

已落地，见 ADR-0105。声明清单与返回值比对在 `tests/mcp-tool-output-contract.test.ts`；`tools/list` 与 `GET /v1/tools` 各自带出声明的断言分别在 `tests/mcp-http.test.ts` 与 `tests/http-api.test.ts`。
