# 04 — 让工具 inputSchema 与实现读取的字段一致

**What to build:** 工具 inputSchema 列出实现确实会读取的全部参数，并由守卫测试守住，不再靠人工同步。

`src/mcp/service.ts:72-74` 自己写着「MCP 客户端只能从 tools/list 的 inputSchema 学习参数契约……这里的 schema 是给 AI 消费者的文档，必须与实现保持一致」。三处对不上：

- **`profile`**：`create-user`（`service.ts:1394`）、`create-bot`（1405）、`update-user`（1443）、`update-bot`（1459）四种环境变更都会读 `data.profile` 并经 `parseAccountProfileFromUnknown` 解析，`ENVIRONMENT_CHANGE_SCHEMAS` 里四处都没声明。`update-user` / `update-bot` 上它还有「显式传 null 或非法值即清除资料」的语义（`if (profile) ... else delete participant.profile`），这条语义完全没有对外文档。
- **`remarks`**：`set-friendship`（1486）会读 `data.remarks` 并经 `normalizeFriendshipRemarks` 规范化，schema 里没声明。
- **`testRunId`**：每次工具调用都从 args 里取并写进调用记录（1707），而且是 `list_mcp_call_records` 的筛选维度（560）。但没有任何工具把它声明成输入参数——AI 消费者读遍 `tools/list` 也不会知道该传它，那个筛选维度因此实际不可用。

`testRunId` 需要先定范围：它对哪些工具有意义？从实现看它对**所有**工具都会被记录（在 `appendCallRecord` 里，不在任何具体工具里），所以它是一个通用的调用标注参数而非某个工具的业务参数。声明方式有两种：在每个工具的 schema 里加一条，或者只在工具描述与 `chatluna-sandbox://guide` 资源里说明它是通用参数。选哪种要在 Comments 里记录理由——前者对 AI 更直观但要改 40 处，后者集中但 AI 可能读不到。

守卫测试写 `tests/mcp-tool-schema-contract.test.ts`，测试侧独立书写字段清单，不从实现导入——从实现导入只能证明实现等于自己。做法与 `tests/helpers/mcp-tool-catalogue.ts` 已确立的模式一致：一份「每个工具声明的顶层参数名集合」，加一份「每种环境变更声明的 `data` 字段集合」。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] `create-user`、`create-bot`、`update-user`、`update-bot` 四处 schema 声明 `profile`
- [ ] `update-user` / `update-bot` 的 `profile` 清除语义写进 schema 描述
- [ ] `set-friendship` 的 schema 声明 `remarks`
- [ ] `testRunId` 的声明方式选定并落地，理由记在 Comments 里
- [ ] `tests/mcp-tool-schema-contract.test.ts` 断言每个工具的顶层参数名集合
- [ ] 同一文件断言每种环境变更的 `data` 字段集合
- [ ] 字段清单由测试侧独立书写，不从 `TOOL_SCHEMAS` 导入
- [ ] 实测确认：给某个工具 schema 加一个字段会让守卫变红
- [ ] 实测确认：从某个工具 schema 删一个字段会让守卫变红
- [ ] 实测确认：改某个字段的名字会让守卫变红
- [ ] 逐个核实还有没有第四处「实现读取但未声明」的字段，结论写进 Comments
- [ ] 不改变任何工具的运行时参数处理行为，本票只补声明与守卫
- [ ] 单元测试、类型检查与构建全绿
