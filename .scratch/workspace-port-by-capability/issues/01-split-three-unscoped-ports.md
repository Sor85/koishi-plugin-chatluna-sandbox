# 01 — 三道不定域的能力先拆出去

**What to build:** 模型请求工作台、预设工作台、MCP 调用工作台各自只学自己那道端口；三个界面的行为、端点名与请求载荷一字不变。

这三道是最干净的：**适配器都不注入当前观察空间**，因此拆出去不碰任何定域逻辑。每一道不定域的理由今天已经写在适配器的注释里——模型请求的未归属分类没有空间标识、切到别的空间也不该被当前观察空间覆盖；预设文件是全局 ChatLuna 资源；MCP 调用记录跨主环境与全部空间共享，筛选里的空间标识是记录字段而不是定域。这三句注释跟着各自的端口走。

十四个成员搬出去（模型请求 4、预设 7、MCP 调用记录 3），各配一个 Koishi 适配器与一个假适配器，**三个假适配器共用同一个记录器**。测试目录里那三个按区域分开的控制器测试文件本来就只驱动自己那一道能力，拆完后各自只准备自己那道桩。

工作区控制器**不拆**，仍是一个 module，只是构造时多收三个端口；外壳与页面装配跟着传。三道端口不需要第二份实例——适配器根本不注入空间标识，构造一次就够。

OneBot 调试那道与不定域那份工作区端口的收窄留给票 02。

**Blocked by:** None — can start immediately.

**Status:** done

- [x] 模型请求、预设、MCP 调用记录三道端口各自成立，共 14 个成员从工作区端口消失
- [x] 每道端口各配一个 Koishi 适配器与一个假适配器
- [x] 三个假适配器共用同一个记录器，断言调用序列的写法未变
- [x] 三道端口的适配器均不注入当前观察空间，各自那句理由注释跟着走
- [x] 端点名与请求载荷逐字不变
- [x] 「预设调用保持全局」「模型请求记录按显式分类发送而不注入当前空间」「MCP 调用记录按筛选参数发送而不注入当前空间」三条既有断言一字不改地通过
- [x] 三个按区域分开的控制器测试文件各自只准备自己那道假端口，断言一字不改
- [x] 工作区控制器仍是一个 module，只是多收三个端口
- [x] 场景消息、环境与关系、场景广播仍在工作区端口，未被顺手拆动
- [x] 显式空间标识仍优先于隐式定域，口径未变
- [x] 既有那条「收发 Koishi RPC 只允许出现在客户端端口适配器里」的守卫自动覆盖新增的六个文件，零新增违规、零新增豁免
- [x] 未新增按成员数或文件大小判定的规则
- [x] 未新增端口成员清单之类的肯定式实现细节断言
- [x] 四个工作台模型与发送控件模型的完整输出与 stash 基线逐字节相同
- [x] DOM 快照与基线一致
- [x] `git diff --stat` 里不出现服务端源码路径
- [x] 别处变红的断言逐条区分真红与假红，处置记入 Comments，不重判前几轮判定保留的断言
- [x] 完整测试、类型检查与构建通过

## Comments

### 落地形状

- 三道端口各成三件套：`model-request-port.ts` / `preset-port.ts` / `mcp-call-record-port.ts`（interface + `<能力>PortOperation`），`koishi-model-request-port.ts` / `koishi-preset-port.ts` / `koishi-mcp-call-record-port.ts`（适配器），`fake-model-request-port.ts` / `fake-preset-port.ts` / `fake-mcp-call-record-port.ts`（假实现，各自 `new FakePortRecorder<...>()`）。
- 三句「为什么不注入当前观察空间」的注释跟着各自的适配器走，另在 interface 的文档注释里说明拆分判据。
- 工作区端口从 38 个成员降到 24（场景消息 17、环境与关系 3、OneBot 调试 3、场景广播 1）。调试那三个留给票 02。
- 控制器改收一个端口对象 `WorkspaceControllerPorts`，内部把 14 个调用点分别路由到 `modelRequestPort` / `presetPort` / `mcpCallRecordPort`，其余仍走 `workspacePort`。它仍是一个 module。
- 页面装配构造三道新端口各一份实例（适配器不注入空间标识，不需要第二份），不定域那份工作区端口本票未动。

### 别处变红的处置

全部是假红：标识符与构造形状变了，断言口径一条未改。

| 位置 | 变红原因 | 处置 |
| --- | --- | --- |
| `tests/koishi-workspace-port.test.ts` | 三条用例驱动的方法已不在这道端口上 | 原样搬到 `tests/koishi-preset-port.test.ts`、`tests/koishi-model-request-port.test.ts`、`tests/koishi-mcp-call-record-port.test.ts`，端点名与载荷断言一字未改；工作区端口那份保留 5 条用例 |
| `tests/workspace-{model-request,preset,mcp-call}-controller.test.ts` | 假端口换成自己那道 | 改成 `createFakeModelRequestPort()` / `createFakePresetPort()` / `createFakeMcpCallRecordPort()`，顺带删掉只为宽端口准备的 `workspace` 状态常量；断言一字未改 |
| `tests/workspace-shell-regions.test.ts` | `rejectNext` 的宿主按能力散到四道端口 | 加一个按操作名路由的 `createRegionPorts()`（操作名跨端口不重名），用例里那一串操作名与错误位断言一字未改 |
| `tests/workspace-controller.test.ts` 等 6 个文件 | 控制器构造签名变了 | 新增 `tests/helpers/workspace-controller.ts`：用例只传自己驱动的那几道端口，其余补空假端口。断言一字未改 |

真红：无。

### 验证

- `yarn test`：183 个文件、1658 条用例全通过。
- `yarn typecheck`：通过。
- `yarn build`：通过。
- 模型基线：`evidence/baseline.json`（HEAD）与 `evidence/after-01.json` 逐字节相同——四个工作台模型、发送控件模型、按能力分组的 17 条调用序列（含载荷）全部一致。
- DOM 快照：`evidence/dom-baseline.html` 与 `evidence/dom-after-01.html` 逐字节相同（1361 行 SSR 输出，四个工作台组件按 page.vue 的绑定渲染）。
- `git diff --stat` 不含 `src/` 路径。

### 复审补记（`/code-review`）

- **「不注入当前空间」这条红灯换了形状，是本票的已知代价。** 搬迁前那三条用例用 `createKoishiWorkspacePort(() => 'space-1')` 构造，因此断言的是「明明有当前空间也不注入」。拆分后这三道端口的工厂**根本不收**「解析当前空间标识」的实参，注入在构造上就不可能，那句运行期断言无从表达。规格第 112 行同时要求「断言内容一字不改……不新增也不删减」，两条合起来意味着只能保留 by-construction 的形态；三个新测试文件各用一句文档注释写明这一点。要把它变回运行期红灯，唯一办法是给这三道端口加一个它们不该有的定域参数，那与规格第 67–68 行相反。
- 词汇表复核修正：`CONTEXT.md` 的正式词是**测试调用记录**，「MCP 调用记录」在「机器人动作记录」的 `_Avoid_` 行上。本次新写的散文（`mcp-call-record-port.ts` 与 `fake-mcp-call-record-port.ts` 的文档注释）已改用正式词；interface 名与方法名沿用既有 `Mcp` 前缀不动，它们与服务端端点名一一对应。既有代码里的其他叫法（组件文件名、控制器里的用户可见文案）属存量，本轮不扫。
- 未采纳：四个假端口的 `getXxxRecord` 形状相近（`详情 ?? 按 id 兜；兜不到则 rejectNext；invoke`）。三处的差异各不相同（调试原样返回、模型请求补 `requestBody`、测试调用记录补 `arguments`/`result`），且这段形状是从原来那一份宽假端口逐字搬来的。抽一个通用「找不到就拒绝」助手会引入规格没要求的抽象，也与「每个假实现只覆盖自己那一类能力、可以独立读懂」相反。
