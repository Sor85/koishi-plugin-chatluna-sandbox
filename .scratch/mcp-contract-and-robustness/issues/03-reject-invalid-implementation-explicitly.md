# 03 — 非法 implementation 显式失败

**What to build:** 非法的 `implementation` 值在所有读取它的路径上都被明确拒绝，不再静默取默认值。

`src/mcp/service.ts:1141` 写的是 `implementation === 'llbot' ? 'llbot' : 'napcat'`。任何非 `llbot` 的值——拼错的 `napcat`、大写的 `NapCat`、完全无关的字符串——都会返回 NapCat 的能力矩阵。已实测 `implementation: 'bogus'` 与 `'napcat'` 返回的矩阵逐字节相同。

同一文件的 `requireImplementation`（`service.ts:691-695`）已经明确写下这条规则：「非法值必须显式失败：静默回落到 napcat 会让测试控制器以为自己在测另一个协议」。那条规则只在 `apply_environment_changes` 的环境变更路径上执行了，`get_capability_matrix` 与 `readResource` 两处没有执行。`get_capability_matrix` 的 inputSchema 声明了 `enum: ['napcat', 'llbot']`，但实现从不校验——传输层按 ADR 只暴露 schema 作为文档，不做参数校验，校验责任在 `executeTool` 内。

`readResource` 那两处（`service.ts:868-869`）走的是固定 URI，不接受用户输入，因此不存在非法值问题；但它们同样把 profile 硬编码在调用处而不经 `requireImplementation`。这两处只需确认参数确实来自固定 URI 即可，不必改动——若改动，说明理由。

注意 `implementation` 在 `get_capability_matrix` 上是**可选**参数，省略时默认 napcat（schema 里写着「默认 napcat」）。修复必须保留这条默认行为：`undefined` 合法，非法字符串不合法。这与 `apply_environment_changes` 里 `create-bot` 的处理一致（`service.ts:1411`：`data.implementation === undefined ? 'napcat' : requireImplementation(data.implementation)`）。

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] `get_capability_matrix` 对非法 `implementation` 抛 `invalid_arguments`
- [x] 省略 `implementation` 仍默认 napcat，行为不变
- [x] 复用 `requireImplementation`，不再在 `getCapabilityMatrix` 内二次实现判定
- [x] 有用例断言 `implementation: 'bogus'` 被拒绝而不是返回 napcat 矩阵
- [x] 该用例在未修复的实现上变红（实测确认）
- [x] 有用例断言 `implementation` 省略时仍返回 napcat 矩阵
- [x] `readResource` 的两处固定 URI 调用确认无需改动，或说明改动理由
- [x] 核实 `getCapabilityMatrix` 是否还有其他调用方受影响，逐个说明
- [x] 单元测试、类型检查与构建全绿

## Comments

**调用方核实（共三处，全部覆盖）：**

1. `executeTool` 的 `get_capability_matrix`（`service.ts:1125`）传用户输入的 `args.implementation`，是本票要修的那一处。
2. `readResource` 的 `chatluna-sandbox://capabilities/napcat`（`service.ts:913`）传字面量 `'napcat'`。
3. `readResource` 的 `chatluna-sandbox://capabilities/llbot`（`service.ts:914`）传字面量 `'llbot'`。

后两处走固定 URI，不接受用户输入，参数是源码里的字面量，`requireImplementation` 对它们必然通过，因此**未改动**。改动它们只会把两个固定值搬到别处，不消除任何风险。

**修法。** `getCapabilityMatrix` 的第一行改为 `implementation === undefined ? 'napcat' : requireImplementation(implementation)`，与 `apply_environment_changes` 里 `create-bot` 的处理（`service.ts:1411`）逐字一致：`undefined` 合法并默认 napcat，非法字符串不合法。

**实测的红。** 新断言遍历 `'bogus'`、`'NapCat'`、`'napcat '`（尾随空格）、`''`、`null`、`42` 六个值，在未修复实现上第一个值就返回了 napcat 矩阵而不是抛错。大小写与尾随空格两项特意加进去：静默回落的旧写法对它们同样静默，而这是拼错时最常见的两种形态。
