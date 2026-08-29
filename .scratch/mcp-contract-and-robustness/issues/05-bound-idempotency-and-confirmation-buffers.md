# 05 — 给幂等缓存与确认令牌加上限与过期清理

**What to build:** 测试控制服务里每个内存缓冲区都有上限。目前 `idempotency` 与 `confirmations` 两个 Map 无上限也无过期清理，而同类的三个缓冲区都有。

`src/mcp/service.ts:713-714`。对照 `events`（`eventLimit`，默认 1000）、`callRecords`（`callRecordLimit`，默认 500）、`uploadedMedia`（`uploadedMediaLimit`，默认 256）三个都有显式上限并在超出时淘汰最旧项，这两个 Map 什么都没有：

- **`idempotency`** 只在 `rotateEpoch()` 时清空，而 `rotateEpoch()` 只由破坏性操作触发（`service.ts:1517`）。不做破坏性操作的长跑测试会话里，每个幂等键永久留存一条记录，每条都持有结果的 `structuredClone`——`apply_environment_changes` 的结果里带完整场景快照。
- **`confirmations`** 每条都有 `expiresAt`（60 秒），但过期项只在被使用时删除（`service.ts:1511`）。签发后不使用的令牌永久留存。

两者的处理不对称，必须分开决策：

**`confirmations` 不涉及契约变更。** 令牌本来就 60 秒过期，过期后必然被 `runDestructive` 判为无效。加惰性清理（每次 `set` 时清掉已过期项）纯属实现内务，行为零变化。

**`idempotency` 加 TTL 会修订 ADR-0021。** 该 ADR 承诺「按测试凭证、工具名称和 Key 在当前运行纪元内缓存首次结果」，纪元内无过期。加上 TTL 与条数上限后，超出窗口的同键重放会**重新执行操作**而不是返回首次结果——对 `send_message` 意味着重复发一条消息，对 `apply_environment_changes` 意味着重复应用变更（多半会因 `expectedRevision` 失败，但不保证）。这是对外契约的行为变更，必须：

1. 修订 ADR-0021，写明幂等缓存有界，并说明超出窗口后的语义
2. 在携带 `idempotencyKey` 的工具描述里写明有效期
3. TTL 取值要明显大于一次正常测试编排的时长；条数上限要明显大于一次编排的调用数。两个取值都要给出理由，不要凭手感

也要评估纯 LRU（不带 TTL）是否更合适：它在容量足够时不会让活跃的键失效，只淘汰最旧的。若选 LRU，同样要修订 ADR-0021 说明上限存在。选定方案与被否方案的理由都记在 Comments 里。

顺带核实 `rateWindows` 与 `activeCalls`：`rateWindows` 的每个窗口数组会被 60 秒过滤，但 Map 的键（`credentialId:category`）在凭证被吊销后不会清理；`activeCalls` 在计数归零时会 `delete`（`service.ts:1753-1756`）。判断前者是否需要处理，结论写进 Comments。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] `confirmations` 在写入时清理已过期令牌，行为零变化
- [ ] `idempotency` 有明确上限，方案（TTL / LRU / 两者）与被否方案的理由记在 Comments
- [ ] TTL 或容量取值给出理由，不是凭手感取的数
- [ ] ADR-0021 修订，写明幂等缓存有界及超出窗口后的语义
- [ ] 携带 `idempotencyKey` 的工具描述写明有效期或容量语义
- [ ] 上限与 TTL 可通过 `SandboxMcpServiceOptions` 覆盖，与既有三个 limit 的做法一致
- [ ] 有用例断言窗口内同键同参数重放仍返回首次结果
- [ ] 有用例断言同键不同参数仍返回 `idempotency_conflict`
- [ ] 有用例断言超出上限后最旧的幂等记录被淘汰
- [ ] 有用例断言过期确认令牌不再堆积
- [ ] `rateWindows` 是否需要清理，结论写进 Comments
- [ ] 单元测试、类型检查与构建全绿
