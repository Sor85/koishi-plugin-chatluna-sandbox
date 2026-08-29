# 02 — 统一错误码契约并让非预期异常可区分

**What to build:** 错误码成为真正稳定的对外契约：拼写一致、声明完整、非预期异常不伪装成业务拒绝。三处缺陷同属一类，共用一条守卫测试。

**缺陷一：`invalid_argument` 拼写不一致。** `src/mcp/service.ts:1073` 是全仓库唯一的单数形式，其余 20 余处都是 `invalid_arguments`。已实测 `list_onebot_debug_records({ includeLargeValues: true })` 返回 `invalid_argument`。按 ADR-0027 错误码是稳定契约，客户端按码分支处理时这一个码会漏掉。

**缺陷二：非预期异常被包成 `domain_error` 并原样透出 message，且不写 Logger。** `service.ts:978-980` 把任何非 `SandboxMcpError` 都归一成 `domain_error` 并携带 `error.message`。ADR-0027 明确要求「未预期异常只向客户端返回 `internal_error`，完整堆栈保留在 Koishi Logger」。现在 `TypeError` 和「只有群主可以踢人」这类正常领域拒绝在客户端完全无法区分，堆栈也没有任何地方留存。

这里需要判断：领域服务抛出的 `Error` 有一部分确实是可预期的业务拒绝（`control-service.ts` 的权限断言、`replaceScene` 的一致性校验），把它们全部降级成 `internal_error` 会丢掉对客户端有用的信息。因此不是简单替换错误码，而是要区分两类来源。先核实领域服务是否有可用的异常类型或标记可供区分；若没有，可选方案是在控制服务侧引入一个可预期业务错误基类，让 MCP 侧按类型分流。选定方案必须在本票的 Comments 里记录理由。无论选哪种，**未被识别为业务拒绝的异常必须返回 `internal_error` 且堆栈写入 Logger**。

**缺陷三：`chatluna-sandbox://errors` 资源漏了 17 个实际会发出的错误码。** 资源（`service.ts:870`）声明 14 个，实现实际发出 28 个。缺失：`concurrency_limited`、`conversation_not_found`、`credential_not_found`、`digest_mismatch`、`domain_error`、`group_not_found`、`invalid_argument`、`invalid_media_url`、`media_not_found`、`participant_not_found`、`record_not_found`、`request_not_found`、`resource_not_found`、`robot_request_forbidden`、`tool_not_found`、`unsupported_change`、`unsupported_scene_version`。这份资源是 AI 消费者唯一的错误码契约文档。

守卫测试写 `tests/mcp-error-code-contract.test.ts`：从 `src/mcp/` 源码枚举 `new SandboxMcpError('<code>'` 的全部字面量，与资源返回的数组比较，两侧互为子集才通过；`resolveControl` 里动态构造的三个空间态码在测试里显式列出。这是源码文本断言，但落在 ADR-0073 明确列出的第三类例外里（守卫自身读取源码，断言对象本来就是源码结构）——「实现总共可能发出哪些错误码」没有别的观察面，任何调用序列都枚举不出全部抛出点。按该 ADR 的成本结构判据也站得住：改错误消息、挪抛出点、合并分支都不会让它变红，只有引入未登记的码或删掉在用的码才会红。

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] `service.ts:1073` 的 `invalid_argument` 改为 `invalid_arguments`
- [x] 非预期异常返回 `internal_error`，不携带原始 message
- [x] 非预期异常的完整堆栈写入 Koishi Logger
- [x] 可预期的领域业务拒绝仍返回有信息量的错误码与消息，不被降级成 `internal_error`
- [x] 两类异常的区分方式在 Comments 里记录，含为什么不选另一种
- [x] 有用例断言注入的 `TypeError` 返回 `internal_error` 且不泄漏 message
- [x] 有用例断言领域权限拒绝仍返回可分支处理的错误码
- [x] `chatluna-sandbox://errors` 资源列出实现实际会发出的全部错误码
- [x] `tests/mcp-error-code-contract.test.ts` 双向比较实现与资源，两侧互为子集
- [x] 实测确认：新增一个未登记的错误码抛出点会让守卫变红
- [x] 实测确认：从资源里删掉一个码会让守卫变红
- [x] 若 `domain_error` 在缺陷二修复后不再存在，资源与守卫同步不再包含它
- [x] 不新增架构决策记录：本票是让实现符合 ADR-0027
- [x] 单元测试、类型检查与构建全绿

## Comments

**两类异常的区分方式：领域侧引入 `SandboxDomainError` 基类。** 核实结果是领域服务此前没有任何可供区分的类型或标记——`control-service.ts` 的 162 处拒绝、`test-spaces.ts` 的 9 处状态判定全部抛裸 `Error`，与运行时 `TypeError` 在类型上无法区分。因此在 `src/types.ts` 新增 `SandboxDomainError extends Error`，并把这些「领域主动作出的判定」改抛它：`control-service.ts`、`test-spaces.ts`、`media-storage.ts`、`onebot-profiles.ts`、`onebot-message.ts`、`model-request.ts`、`onebot-debug.ts`。两个既有的游标过期错误类改为继承它，语义一致。

`persistence.ts`（数据库不可用）与 `builtin-avatars.ts`（内部不变量）**保持裸 `Error`**：它们是基础设施故障与实现缺陷，按 ADR-0027 本就该只给客户端 `internal_error`，把堆栈留在日志里。

**被否的方案：在 MCP 侧按错误消息或调用点分流。** 消息匹配是 `resolveControl` 已经在用的手段（`message.includes('用户接管')`），但它把中文文案变成契约，改一个字就会静默错分类；按调用点分流则要求 MCP 侧逐个包裹领域调用，既漏不掉也拦不住领域方法内部深处抛出的 `TypeError`——那正是本票要抓的那一类。

**`domain_error` 保留。** 缺陷二的修复没有让它消失：它现在专指「领域说不」，消息对外部测试控制器有用（`只有群主可以设置管理员`）。`internal_error` 专指「实现出错」，只给错误码与 traceId。`tests/mcp-tool-coverage.test.ts` 里既有的 6 处 `domain_error` 断言全部保持绿，说明分流没有误伤领域拒绝。

**实测的红。** 把 `invalid_arguments` 退回单数、把 `normalizeToolError` 退回旧的内联归一化后，守卫文件里三条用例同时变红（资源比较、拼写一致、异常分流），第四条「领域拒绝仍可分支处理」两侧都绿——它是回归防线而不是新行为的证明。守卫的双向红分别用「把 `test_spaces_unavailable` 抛出点改成未登记的码」与「从资源清单里删掉 `digest_mismatch`」实测过。

**资源现在有 30 个码**（`resolveControl` 的三个空间态原先是按错误消息算出码再交给一个共用的 `throw`，源码扫描抓不到；已改成各自的字面量抛出点，因此守卫不需要任何白名单，按 ADR-0073 的规则制成立）。原先声明 14 个。清单在 `src/mcp/service.ts` 里按用途分组书写，守卫按集合比较，因此分组与顺序可以随意调整而不会变红。

**Logger 通道。** `SandboxMcpService` 的构造函数第一个参数改为 `Context`（与票 06 共用这一改动，见该票 Comments）。用例不给服务打桩，而是临时替换 `Logger.targets` 捕获真实输出，因此断言的是堆栈确实走到了 Koishi Logger 这条完整路径。

**`CONTEXT.md` 未改。** `SandboxDomainError` 是实现层的异常分类手段，不是新的领域概念——领域词汇里已有的「测试凭证」「AI 测试空间」等概念都没有变化，规格也明确把领域词汇调整列为 Out of Scope。
