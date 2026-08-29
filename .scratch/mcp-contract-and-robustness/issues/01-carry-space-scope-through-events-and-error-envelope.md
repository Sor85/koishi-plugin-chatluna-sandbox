# 01 — 让空间作用域贯穿事件流与错误信封

**What to build:** 测试空间里发生的事，事件流和错误信封都能说清它发生在哪个空间。目前两处丢了空间归属，且都已用探针实测复现。

**缺陷一：`handle_request` 发出的事件丢 `spaceId`。** `src/mcp/service.ts:1274-1275` 转调 `performFriendAction` / `performGroupAction` 时重新拼了一个参数对象，只带了 `operatorId`、`action`、`requestId`、`approve`、`idempotencyKey`，漏了 `spaceId`。于是 `appendEvent` 写入 `spaceId: undefined`。而 `waitFor`（`service.ts:1329`）按 `event.spaceId === spaceId` 严格相等过滤，`wait_for_event` 的 `spaceId` 又是必填，结果是测试空间里用 `handle_request` 批准申请后，等 `friend.action` 或 `group.action` 必然超时。直接调 `perform_friend_action` / `perform_group_action` 不受影响——只有 `handle_request` 这条转调路径断。

已实测：空间内建两个用户，A 发好友申请，B 用 `handle_request` 批准，用发起前 cursor 等 `friend.action`，得到 `matched: false`。

**缺陷二：错误信封的 `revision` 恒为主场景版本。** `getRevision()`（`service.ts:947-949`）写死读 `this.control`，不看 `spaceId`；`server.ts:160` 生成错误信封时调它。测试空间里失败的调用，信封里报的是主场景版本。已实测：主场景 revision=0、空间 revision=1 时 `getRevision()` 返回 0。外部控制器拿这个值当乐观并发控制的基线会一直算错。

修法沿用 `traceId` 已经确立的模式（见 `types.ts:94-101` 与 `service.ts:983` 的注释）：`callTool` 捕获错误、写下调用记录之后，把失败真正发生的那个空间的 revision 一并回填到 `SandboxMcpError` 上，传输层原样携带，不再自己调 `getRevision()`。凭证校验阶段（尚无空间可指）退回主场景版本。

不要让传输层从 `request.params.arguments.spaceId` 自己解析空间：`resolveControl` 里的空间可用性判定有接管、不存在、不可用三态，传输层复现不了。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] `handle_request` 转调时带上 `spaceId`，好友与群两条路径都覆盖
- [ ] 空间内用 `handle_request` 批准好友申请后，`wait_for_event({ type: 'friend.action' })` 能匹配
- [ ] 空间内用 `handle_request` 批准入群申请后，`wait_for_event({ type: 'group.action' })` 能匹配
- [ ] 上述两条用例在未修复的实现上变红（实测确认，不是推断）
- [ ] `SandboxMcpError` 携带失败发生时该空间的场景版本，由 `callTool` 回填
- [ ] 传输层错误信封的 `revision` 取自错误对象，不再调 `getRevision()`
- [ ] 凭证校验阶段抛出的错误没有空间可指，信封退回主场景版本
- [ ] 有用例断言测试空间里失败的调用，信封 `revision` 等于该空间的版本而非主场景版本
- [ ] 该用例在未修复的实现上变红
- [ ] `getRevision()` 若在修复后不再有调用者，一并删除；若仍有调用者，注释说明它只服务主场景
- [ ] 主场景（不带 `spaceId`）的失败调用信封 `revision` 行为不变
- [ ] 不改动 `traceId` 的语义与信封字段名
- [ ] 单元测试、类型检查与构建全绿
