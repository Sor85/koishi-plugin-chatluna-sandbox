# 01 — 「取不到就抛」归证据记录库

**What to build:** 读不到一条记录时看到的那句提示与今天一字不变，但「这条记录在不在」这件事换了主人——从控制服务挪回证据记录库自己。

两个记录库各长出一个「取不到就抛」的读取成员，与既有的「取不到返回空值」并存：两者不互相替代，前者服务于「调用方就是要这条记录」，后者服务于跨记录域遍历。抛出的是领域错误，消息含记录标识，与今天逐字相同。

控制服务上那两处各自写了一遍同一句判定的成员随之消失，消费方直接问记录库。未归属那条路上抛裸 `Error` 而不是领域错误的那处**随行消失**，不是就地改类——它今天只经 Console RPC 暴露，两个错误类在那条路上都只把消息送过去，因此对外可观察行为逐字相同。

跨记录域未命中不动：没有任何单个记录库知道「全部记录域都没有」，那句判定留在调用方。记录域目录用返回空值表达查找未命中、让持久化故障照原样抛出，这条刻意的取舍本轮经过它，必须有断言压住。

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] 两种证据记录各有断言：取不到时抛领域错误，消息含记录标识，与今天逐字相同
- [x] 「取不到返回空值」与「取不到就抛」并存有断言：同一条不存在的记录，一个返回空值一个抛出
- [x] 未归属那条路上的提示与主模拟 QQ 环境一字相同，有断言
- [x] 跨记录域未命中的提示与单记录域一字相同，有断言
- [x] 跨记录域读取时一次持久化故障照原样抛出、不被当成未命中，有断言
- [x] 控制服务上那两处写同一句判定的成员已消失，消费方直接问记录库
- [x] 外部测试控制器一侧的结构化未命中与错误码一字不变，有断言
- [x] 控制服务其余职责一律未动
- [x] Console RPC 契约逐字不变
- [x] MCP 工具清单与 schema 逐字不变
- [x] stash 基线比对记录详情与跨记录域查找的完整输出，逐字节相同
- [x] `git diff --stat` 里没有客户端路径
- [x] 别处变红的断言逐条区分真红与假红，处置记入 Comments，不重判前几轮判定保留的断言
- [x] 完整测试、类型检查与构建通过

## Comments

### 落地形状

- 两个记录库各新增 `requireRecord`：`SandboxModelRequestStore.requireRecord(recordId)` 与
  `SandboxOneBotDebugStore.requireRecord(recordId, includeLargeValues?)`，抛 `SandboxDomainError`，
  消息分别是 `模型请求记录不存在：<id>` 与 `调试记录不存在：<id>`，与收拢前逐字相同。
- 控制服务上 `getOneBotDebugRecord` 与 `getModelRequestRecord` 已消失。为让消费方直接持有调试记录库，
  控制服务新增 `getOneBotDebugStore()`（形如既有的 `getModelRequestStore()`，只交出记录库、不带调用），
  两种证据因此对称。
- 未归属那处的裸 `Error` 随行消失：Console 的未归属详情改走 `requireRecord`，MCP 侧同样。

### stash 基线

`.scratch/evidence-record-library-ownership/evidence/baseline.ts` 只驱动 Console RPC 监听器与
`getModelRequestStore().append()`，因此同一份脚本在 HEAD 与工作区都能跑。两次输出见
`evidence/01-baseline-head.json` 与 `evidence/01-after.json`，1692 行里只有一处差异：

```diff
-    "error": "Error: 模型请求记录不存在：缺失"
+    "error": "SandboxDomainError: 模型请求记录不存在：缺失"
```

这正是本票要消除的那处裸 `Error`。错误类名不在 Console RPC 的载荷里（那条路只送 `message`），
消息逐字未变，因此对外可观察行为逐字节相同。脚本本身连跑两次结果一致，确定性已验证。

### 别处变红的处置

四处，全部是假红（标识符改名，行为口径与成本结构未变）：

- `tests/fold-large-debug-values.test.ts`：`control.getOneBotDebugRecord({...})` →
  `control.getOneBotDebugStore().requireRecord(...)`；用例名里的成员名跟着改。
- `tests/chatluna-state.test.ts`、`tests/model-request-persistence.test.ts`：
  `control.getModelRequestRecord({ recordId })` → `control.getModelRequestStore().requireRecord(recordId)`。
- 没有重判前几轮判定保留的断言；MCP 侧「持久化故障不伪装成未命中」与「结构化未命中」两条既有断言
  一字未改地继续通过。

### 验证

`yarn typecheck`、`npx vitest run`（179 文件 / 1628 用例全绿）、`yarn build` 均通过。
`git diff --stat` 只含 `src/` 与 `tests/`，无 `client/` 路径；`src/console-contract.ts` 与
`TOOL_DEFINITIONS`（`src/mcp/service.ts` 内的工具清单与 schema）未出现在 diff 中。
