# 04 — 让工具 inputSchema 与实现读取的字段一致

**What to build:** 工具 inputSchema 列出实现确实会读取的全部参数，并由守卫测试守住，不再靠人工同步。

`src/mcp/service.ts:72-74` 自己写着「MCP 客户端只能从 tools/list 的 inputSchema 学习参数契约……这里的 schema 是给 AI 消费者的文档，必须与实现保持一致」。三处对不上：

- **`profile`**：`create-user`（`service.ts:1394`）、`create-bot`（1405）、`update-user`（1443）、`update-bot`（1459）四种环境变更都会读 `data.profile` 并经 `parseAccountProfileFromUnknown` 解析，`ENVIRONMENT_CHANGE_SCHEMAS` 里四处都没声明。`update-user` / `update-bot` 上它还有「显式传 null 或非法值即清除资料」的语义（`if (profile) ... else delete participant.profile`），这条语义完全没有对外文档。
- **`remarks`**：`set-friendship`（1486）会读 `data.remarks` 并经 `normalizeFriendshipRemarks` 规范化，schema 里没声明。
- **`testRunId`**：每次工具调用都从 args 里取并写进调用记录（1707），而且是 `list_mcp_call_records` 的筛选维度（560）。但没有任何工具把它声明成输入参数——AI 消费者读遍 `tools/list` 也不会知道该传它，那个筛选维度因此实际不可用。

`testRunId` 需要先定范围：它对哪些工具有意义？从实现看它对**所有**工具都会被记录（在 `appendCallRecord` 里，不在任何具体工具里），所以它是一个通用的调用标注参数而非某个工具的业务参数。声明方式有两种：在每个工具的 schema 里加一条，或者只在工具描述与 `chatluna-sandbox://guide` 资源里说明它是通用参数。选哪种要在 Comments 里记录理由——前者对 AI 更直观但要改 40 处，后者集中但 AI 可能读不到。

守卫测试写 `tests/mcp-tool-schema-contract.test.ts`，测试侧独立书写字段清单，不从实现导入——从实现导入只能证明实现等于自己。做法与 `tests/helpers/mcp-tool-catalogue.ts` 已确立的模式一致：一份「每个工具声明的顶层参数名集合」，加一份「每种环境变更声明的 `data` 字段集合」。

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] `create-user`、`create-bot`、`update-user`、`update-bot` 四处 schema 声明 `profile`
- [x] `update-user` / `update-bot` 的 `profile` 清除语义写进 schema 描述
- [x] `set-friendship` 的 schema 声明 `remarks`
- [x] `testRunId` 的声明方式选定并落地，理由记在 Comments 里
- [x] `tests/mcp-tool-schema-contract.test.ts` 断言每个工具的顶层参数名集合
- [x] 同一文件断言每种环境变更的 `data` 字段集合
- [x] 字段清单由测试侧独立书写，不从 `TOOL_SCHEMAS` 导入
- [x] 实测确认：给某个工具 schema 加一个字段会让守卫变红
- [x] 实测确认：从某个工具 schema 删一个字段会让守卫变红
- [x] 实测确认：改某个字段的名字会让守卫变红
- [x] 逐个核实还有没有第四处「实现读取但未声明」的字段，结论写进 Comments
- [x] 不改变任何工具的运行时参数处理行为，本票只补声明与守卫
- [x] 单元测试、类型检查与构建全绿

## Comments

**`testRunId` 选了「每个工具都声明」，但只写一处。** 它在 `appendCallRecord` 里对全部工具生效，是通用的调用标注参数而非某个工具的业务参数——所以正确的声明位置是每个工具，而正确的书写位置只有一处。`TOOL_DEFINITIONS` 的 `.map` 里加了 `withTestRunId(schema)`，已经自行声明它的工具（`list_mcp_call_records`，那里它是筛选维度）保留自己的描述。因此「改 40 处」的成本并不存在，而新增工具会自动带上它。

被否的方案是只在工具描述与 `chatluna-sandbox://guide` 里说明它是通用参数：AI 消费者按 `tools/list` 的 inputSchema 组装参数，schema 里没有的字段多数客户端根本不会发出，那个筛选维度会继续实际不可用。集中说明省不下什么——统一注入同样只有一处书写点。

**第四处与第五处「实现读取但未声明」的字段，核实结果是有：**

- **群成员条目**。`normalizeGroupMemberFromUnknown` 读取 12 个建模字段（`participantId`、`role`、`card`、`title`、`mutedUntil`、`area`、`joinTime`、`lastSentTime`、`level`、`unfriendly`、`titleExpireTime`、`cardChangeable`），`GROUP_MEMBERS` 原先只声明前四个。`create-group` 与 `update-group` 都受影响，已补齐。
- **snake_case 别名**。`parseAccountProfileFromUnknown` 与 `normalizeGroupMemberFromUnknown` 都接受 OneBot 风格别名（`long_nick`、`login_days`、`reg_time`、`birthday_*`、`is_vip`、`user_id`、`muted_until`、`join_time`…）。选择**不逐个声明**：会让两处 schema 的字段数翻倍，而消费者只需要知道规范名。别名的存在写进 schema 旁的注释与 `profile` / `members` 的描述里。

**`includeLargeValues` 在 `list_onebot_debug_records` 上确实被读取，但故意不声明。** 那里读它只为显式拒绝（`'includeLargeValues' in args` → `invalid_arguments`），声明它反而会让消费者以为可以传。工具描述已经写明「列表接口不支持此参数」。

**逐个核实过、结论是已经一致的部分：** `perform_friend_action` 与 `perform_group_action` 的全部字段都对得上 `SandboxFriendAction` / `SandboxGroupAction` 联合类型；`send_forward_message` 的节点字段、`list_model_request_records` 的十二个筛选字段、破坏性四工具的确认令牌字段均无缺漏。

**守卫的观察面是公开接口而不是源码文本。** 实际值取自 `service.getCapabilityCatalog().tools`，期望值在测试侧独立书写。三向红实测：给 `get_mcp_call_record` 加 `probeExtra`、从 `perform_friend_action` 删 `remark`、把 `wait_for_message` 的 `recipientBotId` 改名，各自都让「顶层参数名」那条断言变红。

**运行时行为零变化。** 本票只动 `TOOL_SCHEMAS`、`GROUP_MEMBERS` 与 `TOOL_DEFINITIONS` 的 schema 注入，没有触碰任何参数解析代码。

**`PROFILE_PATCH` 的类型声明成 `['object', 'null']`。** 描述里推荐用 `null` 清除资料，只声明 `type: 'object'` 会让文档推荐的输入按 JSON Schema 非法，严格校验的客户端可能在发出前就拒绝它。字段名清单抓不到这类类型漂移，因此另加一条断言：`update-user` / `update-bot` 的 `profile` 必须是 `['object', 'null']`，`create-user` / `create-bot` 没有清除语义，仍然只接受对象。
