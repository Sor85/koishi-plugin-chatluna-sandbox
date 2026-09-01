# 03 — 其余转售成员退场，一条规则拦住下一个

**What to build:** 控制服务的公开成员表少 9 个键，而对外 surface 一字不变；读一页记录、清一次记录、看一次容量摘要，用户与外部测试控制器都看不到任何变化。

七个实现是一行 `return this.<记录库>.<方法>(...)` 的成员删掉，约十七个消费点改成直接问记录库——取得记录库的那条路是票 02 建的。其中一个成员全仓零调用，直接删；追加记录那个成员的唯一消费方是仅在开发模式下生效的错误预览种子，改成直接写进记录库。

ChatLuna 失败回填（找到该会话最近一条失败记录、单行更新、把任务登记进更新跟踪）从控制服务的私有方法挪进已经拥有 ChatLuna 错误解析与「最近一条失败记录」查找的那个 module，签名接收记录库。**不进记录库**——记录库不该认识 ChatLuna。那段解释「错误回调是同步的，记录查找与单行更新只能在后台完成；收尾等待通过更新跟踪覆盖它，避免关机时丢掉这次归档」的注释原样跟着走，它记的是一条改坏了不报错的规则。

守卫随本票上线：服务端源码里公开成员体不得只有一句 `this.<字段>.<方法>(...)`，且该字段的声明类型是另一个 module 的类。判定读同文件里的私有字段声明，用 `Map` / `Set` / 数组字面量初始化的字段不算——读自己的集合不是转售。规则跑遍服务端全部源码，不按文件名列白名单。落地后命中 ChatLuna 状态库那两个一行委托，按**成员**登记为有主豁免，负责人指向「ChatLuna 状态库的归属」这条后续候选。

既有的豁免匹配以「文件 ＋ 规则」成对判定，一条豁免会放行该文件下该规则的全部违规。本规则要的是成员级粒度——那两处豁免同在一个文件里，沿用文件级匹配会让同文件长出第三个转售成员被静默放过。

**Blocked by:** 02

**Status:** resolved

- [x] 七个一行转售成员已从控制服务消失，消费点改成直接问记录库
- [x] 全仓零调用的那个成员已删除，未以兼容为由保留
- [x] 开发预览种子直接写进记录库，控制服务上那个键已消失
- [x] 记录列表分页、筛选、清理结果与容量摘要一字不变，有断言
- [x] ChatLuna 失败回填搬迁后行为有断言：给定上游错误与会话，该会话最近一条失败记录被更新，且这次更新被收尾等待覆盖
- [x] 记录库未获得任何 ChatLuna 知识
- [x] 那段关于同步回调与收尾等待的注释一字不改地跟着逻辑走
- [x] 守卫规则对服务端源码全量生效，未登记的违规按文件、规则与成员报出
- [x] 规则认得出一行转售，含 `async` 与带返回值、不带返回值两种形态
- [x] 规则不误报：读自己的集合、`return this.<字段>`（没有调用）、只有一句但调用自由函数的成员、记录库自身
- [x] ChatLuna 状态库那两处按成员登记为有主豁免，理由与负责人均非占位文字
- [x] 豁免按成员匹配有断言：同一文件同一规则下另一个未登记的成员仍然报出
- [x] 「移除任一豁免后对应文件重新报错」那条元守卫断言仍然成立
- [x] 新规则的豁免与既有两条规则的豁免登记在同一份清单里且形状一致
- [x] 写下 ADR 0084：记录库拥有单记录域未命中、跨记录域未命中属于调用方、控制服务只留装配入口、宽规则守卫与两条按成员登记的有主豁免
- [x] 领域词汇核过一遍，确认无需新词
- [x] Console RPC 契约逐字不变
- [x] MCP 工具清单与 schema 逐字不变
- [x] stash 基线比对记录列表页、容量摘要与清理结果的完整输出，逐字节相同
- [x] `git diff --stat` 里没有客户端路径
- [x] 别处变红的断言逐条区分真红与假红，处置记入 Comments，不重判前几轮判定保留的断言
- [x] 完整测试、类型检查与构建通过

## Comments

### 成员表的实际收窄：消失 9 个，新增 1 个

按同一把尺子（两空格缩进的公开成员）数，控制服务从 79 个降到 71 个：

```
消失 clearModelRequestRecords clearOneBotDebugRecords findOneBotDebugRecord
     getModelRequestRecord getModelRequestRecords getOneBotDebugRecord
     getOneBotDebugRecords recordModelRequest updateModelRequest
新增 getOneBotDebugStore
```

规格里的「少 9 个键」按消失数成立；净减 8，因为调试记录库也需要一个「把记录库交出去」的入口。
这不是打折，是规格自己的两条决定的合成结果：「控制服务上取得记录库的入口保留」＋「两种证据对称
处理」。两个入口形状相同（只返回字段、不带调用），因此都不构成转售。

`updateModelRequest` 全仓零调用，直接删；`recordModelRequest` 的唯一 src 消费方是开发预览种子，
`seedDevelopmentModelRequestErrors` 的签名改成接收记录库，不再认识控制服务。

### ChatLuna 失败回填

搬进 `src/chatluna-error.ts`，签名 `archiveChatLunaModelRequestError(store, error, target)`。
它不进记录库——记录库不该认识 ChatLuna 的错误格式。那段关于「错误回调是同步的、收尾等待靠
更新跟踪覆盖」的注释一字未改地跟着走。新增两条直接断言（`tests/chatluna-error.test.ts`）：
回填命中该会话最近一条失败记录、旁路会话不受影响、`waitForPersistence()` 就足以等到这次更新；
上游错误里没有可用信息时不回填。控制服务那一侧的既有端到端断言一字未改地继续通过。

### 守卫规则：落地时命中四处，收成两处

规则按规格实现后，全量扫描 `src/` 报出四处：

```
src/control-service.ts  getChatLunaStates        → chatLunaState.getStates(…)
src/control-service.ts  recordChatLunaModelRequest → chatLunaState.recordModelRequest(…)
src/onebot-debug.ts     waitForPersistence       → writes.settle(…)
src/record-store.ts     summarize                → index.summary(…)
```

后两处不是规格预期的债务，处置各不相同：

- `record-store.ts` 的 `summarize` 转售的 `ScopeRowIndex` **就声明在同一个文件里**。规格的条件是
  「另一个 module 的类」，同 module 内的内部结构不是转售，因此这是规则实现的漏洞而不是债务：
  协作字段判定加上「同文件里声明的类不算」，并补一条自测钉住。
- `onebot-debug.ts` 的 `waitForPersistence` 确实只有一句 `this.writes.settle()`。它没有被登记成
  豁免，而是把两个记录库的落盘等待对齐：调试记录库补一个私有 `settle()`，公开的
  `waitForPersistence` 与内部读取都经它——模型请求库本来就是这个形状（那边的收尾等待还要覆盖
  旁路采集的外部 Promise，调试记录没有那一类，因此两者在这一层重合）。零行为变化，且正是
  规格「两种证据记录对称处理」这条决定的延伸，不是为了让守卫闭嘴而加的间接层。

收成之后规则恰好命中规格预期的两处，两条都按**成员**登记为有主豁免，负责人指向后续候选
「ChatLuna 状态库的归属」。豁免结构与既有两条规则共用一份清单，只多一个可选的 `member` 字段：
带成员就只放行那一个成员，不带仍按「文件 ＋ 规则」匹配，因此前两条规则的豁免形状未变。

规则自测覆盖：带返回值 / 不带返回值 / `async` / 参数跨行四种转售形态都认得出；读 `Map` 与
数组字面量、裸 `return this.<字段>`、调用自由函数的单句成员、私有成员、两句都在转售、
同 module 内声明的类、记录库自身（多语句读取 + 私有落盘等待）七类都不误报。

### 元守卫的调整

- 「豁免按文件与规则成对匹配」改名为「未登记成员的豁免按文件与规则成对匹配」，断言未改。
- 新增「登记了成员的豁免只放行那一个成员，同文件同规则的别的成员仍然报出」。
- 「移除任一豁免后对应文件重新报错」保留，并对成员级豁免额外要求「暴露的只是它自己那一个成员」。
- 「每条豁免都写明理由与负责人」加上了占位文字检查（理由与负责人都不得以 TODO／待补／暂时／无 开头）。

### 领域词汇

核过一遍，无需新词。本轮动的是 module interface 的宽度，没有引入新的用户可见概念；
「证据记录」「记录域」「联邦读取」都已在册，用法未变。

### stash 基线

`evidence/baseline.ts` 的输出与票 02 完成后逐字节相同（`diff` 无输出），覆盖记录列表页（含分页与筛选）、
详情、三种来路的轨迹、容量摘要与清理结果。

### 别处变红的处置

全部是假红——标识符改名，行为口径与成本结构未变，共 13 个测试文件 71 处：

- `.getOneBotDebugRecords(` → `.getOneBotDebugStore().getRecords(`
- `.clearOneBotDebugRecords()` → `.getOneBotDebugStore().clear()`
- `.getModelRequestRecords(` → `.getModelRequestStore().getRecords(`
- `.clearModelRequestRecords()` → `.getModelRequestStore().clear()`
- `.recordModelRequest(` → `.getModelRequestStore().append(`
- `seedDevelopmentModelRequestErrors(control)` → `…(control.getModelRequestStore())`

替换只作用于服务端测试文件；客户端端口上同名的方法（`port.getOneBotDebugRecords`、
`shell.clearModelRequestRecords` 等）一处未动——它们是 Console RPC 客户端的词汇，不是记录库的。

记录域规则的两处自测样例里引用了已删成员，跟着更新成当前词汇；那只是合成字符串，规则的判定
（枚举后取控制服务）未变。没有重判前几轮判定保留的断言。

顺带清掉票 01／02 造成的 7 个未使用类型引入；`control-service.ts` 与 `model-request.ts` 里
另外 5 处未使用项在收拢前就存在，本轮不碰。

### 验证

`yarn typecheck`、`npx vitest run`（179 文件 / 1636 用例）、`yarn build` 全部通过。
`git diff --stat` 只含 `src/`、`tests/` 与新增的 `docs/adr/0084-*.md`，无 `client/` 路径。
`src/console-contract.ts` 未出现在 diff 中；`src/mcp/service.ts` 的 12 行改动全是调用点，
`TOOL_DEFINITIONS`（工具清单与 schema）一字未动。
