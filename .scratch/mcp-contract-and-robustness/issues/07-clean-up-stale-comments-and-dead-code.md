# 07 — 清理四处过期注释、死代码与无效参数

**What to build:** 四处小项，各自独立，都是读代码的人会被误导的地方。

**一：过期的 SDK 版本注释。** `src/mcp/server.ts:132` 写着「MCP SDK 1.23.x 会在 JSON-RPC 响应真正写入前提前结束 handleRequest」，而 `package.json` 锁的是 `@modelcontextprotocol/sdk` 1.29.0。这条注释是 `waitForResponseCompletion` 存在的全部理由，版本号过期会让人以为该 workaround 已经不需要了。

必须先核实 1.29.0 是否仍有这个行为，再决定怎么改：仍存在就把版本号更新成实测过的版本；已修复就连 `waitForResponseCompletion` 一起删掉（`server.ts:63-76`、134）。核实方式是删掉 `await waitForResponseCompletion(response)` 后跑 `tests/mcp-http.test.ts`——现有 HTTP 用例已经经真实 MCP 客户端断言过响应正文与工具调用结果，注释描述的症状（无正文、无 Content-Type 的 200）会让它们变红。不要只靠读 SDK 源码或 changelog 下结论。

**二：死代码。** `server.ts:157` 的 `error instanceof SandboxMcpError ? error : new SandboxMcpError('internal_error', '工具调用失败')` 的 else 分支不可达：`callTool`（`service.ts:977-984`）已经把所有异常归一成 `SandboxMcpError` 再抛出。删掉或改成断言，并在注释里说明归一化发生在哪一层。

注意：本项与 02 有交集（02 会改 `callTool` 的归一化逻辑）。若 02 已合并，重新核实这个分支的可达性再动手。

**三：`wait_for_chatluna_state` 接受 `cursor` 但从不使用 `cursor.sequence`。** `service.ts:1347-1349` 只校验 `cursor.epoch`，之后 `matches()` 直接读 `control.getChatLunaStates()` 的当前状态。工具描述（420）承诺「从事件游标等待 ChatLuna 思考或完成状态」，但游标在这个工具上不提供任何回放位置保证——`sequence` 是必填字段（`CURSOR` 的 `required`）却被完全忽略。

对比 `waitFor`（1323-1345）用 `event.cursor.sequence > sequence` 真正做了位置过滤。两种处理不能都对。选一条并落地：要么让它真的按 `sequence` 过滤（需要状态变更进入事件流，改动较大），要么承认它是「等待当前状态」而不是「从游标等待」，把工具描述与 `cursor` 参数的描述改成实情。倾向后者，但要先核实 `getChatLunaStates()` 返回的是否只有活跃状态——若它保留已结束的状态，忽略 `sequence` 就是真缺陷而不只是文档问题。结论记在 Comments 里。

**四：格式错位。** `service.ts:1323` 的 `private async waitFor(args, predicate) {    const cursor = asRecord(args.cursor)` 把第一条语句挤在了函数签名同一行。

**Blocked by:** None — can start immediately；第二项动手前先看 02 是否已合并

**Status:** ready-for-agent

- [ ] 实测确认 SDK 1.29.0 是否仍需要 `waitForResponseCompletion`，方式是删掉后跑 HTTP 用例
- [ ] 仍需要则更新注释里的版本号为实测版本；不需要则连辅助函数一起删除
- [ ] 结论与实测过程记在 Comments 里，不引用 changelog 代替实测
- [ ] `server.ts:157` 的不可达分支删除或改为断言，并说明归一化发生在哪一层
- [ ] 核实 `getChatLunaStates()` 是否保留已结束状态，结论记在 Comments
- [ ] `wait_for_chatluna_state` 的游标语义与实现对齐：改实现或改描述，二选一并说明理由
- [ ] 若改描述，`cursor` 参数在该工具上的必填性一并重新评估
- [ ] `service.ts:1323` 的格式错位修正
- [ ] 四项各自独立提交或合并提交均可，但 Comments 里逐项记录结论
- [ ] 单元测试、类型检查与构建全绿
