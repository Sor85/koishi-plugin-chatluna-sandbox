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

**Status:** resolved

- [x] `confirmations` 在写入时清理已过期令牌，行为零变化
- [x] `idempotency` 有明确上限，方案（TTL / LRU / 两者）与被否方案的理由记在 Comments
- [x] TTL 或容量取值给出理由，不是凭手感取的数
- [x] ADR-0021 修订，写明幂等缓存有界及超出窗口后的语义
- [x] 携带 `idempotencyKey` 的工具描述写明有效期或容量语义
- [x] 上限与 TTL 可通过 `SandboxMcpServiceOptions` 覆盖，与既有三个 limit 的做法一致
- [x] 有用例断言窗口内同键同参数重放仍返回首次结果
- [x] 有用例断言同键不同参数仍返回 `idempotency_conflict`
- [x] 有用例断言超出上限后最旧的幂等记录被淘汰
- [x] 有用例断言过期确认令牌不再堆积
- [x] `rateWindows` 是否需要清理，结论写进 Comments
- [x] 单元测试、类型检查与构建全绿

## Comments

**`idempotency` 选了两者：条数上限 500 + 有效期 30 分钟，淘汰按写入顺序（FIFO）。**

单独看，**容量是必要的**：内存问题就是无界增长，容量上限直接把它封死，且是确定性的。**TTL 单独不够**：在有效期内仍可按每分钟 60 次的状态修改上限堆到 1800 条，内存依然不受控。所以纯 TTL 被否。

**纯容量上限也不够，但理由是契约而不是内存**：它能给出的承诺是「最近 N 条」，而 N 由全部凭证与全部工具共享，外部测试控制器无法据此判断自己的键还在不在。TTL 给的是「30 分钟内重放安全」，那是消费者真正能用来编排重试的形式。两者叠加后容量负责内存、TTL 负责对外承诺，各自解决一件事。

**淘汰按写入顺序而不是最近使用，这是有意的。** 有效期从首次写入起算，命中重放不延长留存期；若按最近使用刷新 Map 顺序，一条被反复重放的记录会活得比它承诺的窗口更久，与 TTL 的语义相冲突。代码、ADR-0021 与工具描述统一用「淘汰最早写入的一条」表述，不用 LRU 这个词——审查中一度把它写成 LRU，而实现是 FIFO，措辞已更正为实现的真实行为。

**取值理由：**

- 容量 500 与 `callRecordLimit` 同一量级。默认状态修改档上限是 60 次/分钟，500 条覆盖八分钟以上的满速修改，远超一次正常测试编排的调用数。
- 有效期 30 分钟。幂等键存在的理由是响应在网络上丢失后的重试，那是秒级动作；单次调用最长也只有 120 秒的等待超时。30 分钟比任何单个编排步骤高一个数量级，同时仍能约束长跑会话。

两个取值都可以通过 `SandboxMcpServiceOptions` 的 `idempotencyLimit` / `idempotencyTtlMs` 覆盖，与既有三个 limit 一致；测试用它把上限压到 2 条来断言淘汰。

**工具描述按实际配置生成，不写死默认值。** 数值可覆盖而 `TOOL_SCHEMAS` 是模块级常量，把「30 分钟 / 500 条」写死在 schema 里会让非默认部署向 AI 消费者发布一份错误的契约。因此三条对外读取工具声明的路径（`listTools`、`getCapabilityCatalog`、`chatluna-sandbox://guide`）统一经 `describeTools()`，由它按实例的实际窗口改写 `idempotencyKey` 的描述。用例分别用默认配置与 `{ idempotencyLimit: 7, idempotencyTtlMs: 120_000 }` 断言描述跟着变，另有一条断言指南资源与工具清单一致。

**`confirmations` 只加惰性清理，不加条数上限。** 令牌本来就 60 秒过期，过期后必然被 `runDestructive` 判为无效，因此清理是纯实现内务、行为零变化。加条数上限反而会是行为变更：淘汰仍在有效期内的令牌会让已签发的确认凭空失效。留存量本身有界——签发要经状态修改档的频率上限，60 秒窗口内最多几十条。

「过期令牌不再堆积」这条没有对外观察面（过期令牌在修复前后都会被拒绝），因此用例直接断言缓冲区的条目数：断言对象本来就是那个缓冲区。仓库里已有同类先例（`tests/debug-records-persistence.test.ts` 断言 `nextSequence`）。

**`rateWindows` 需要清理，已处理。** 键是 `凭证:档位`，凭证被吊销后那四个键再不会被读到。单个键在 60 秒后会退化成空数组，占用极小，但「反复创建与吊销凭证」是它唯一的单调增长源，而 `revokeCredential` 里删掉对应前缀只需两行。已在 `revokeCredential` 里加上。

**`activeCalls` 不需要处理。** `withConcurrency` 的 `finally` 在计数归零时 `delete`（`service.ts:1753-1756`），键不会残留。

**实测的红。** 把 `withIdempotency` 的有效期判定与 `rememberIdempotentResult` 退回旧写法、把 `rememberConfirmation` 退回裸 `set` 之后，「超出有效期后重放重新执行」「超出条数上限淘汰最旧」「签发新令牌时清掉过期令牌」三条同时变红，而「窗口内重放返回首次结果」「同键不同参数冲突」「有效期内的令牌不被清理」三条两侧都绿——它们守的是不该变的行为。时间用 `vi.useFakeTimers({ shouldAdvanceTime: true })` 推进，按 ADR-0066 不注入时钟。
