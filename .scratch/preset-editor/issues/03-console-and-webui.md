# Add preset workspace and evidence navigation

Status: resolved

## Goal

新增独立预设页面、完整 YAML 编辑器、CRUD 确认流程，以及到模型请求精确文本范围的跨页面导航。

## Acceptance

- 左侧导航包含“预设”。
- 支持核心与 Character 列表、搜索、创建、编辑、重命名、删除。
- CodeMirror 高亮并点击值表达式。
- 打开模型请求分析页后精确展开、滚动和高亮匹配范围。
- 保存冲突、运行时不可用、无上下文、无匹配和歧义均有明确反馈。

## Comments

- 2026-08-22：完成本 Issue 的服务端预设应用/RPC 切片，客户端仍未实现，因此保持 `pending`。
- 新增 `SandboxPresetService` 深模块：固定组合 `data/chathub/presets` 与 `data/chathub/character/presets` 文件仓库及主环境/单个 AI 测试空间模型请求 store；公开 catalog/list、read、create、save、rename、delete、locate-expression。
- catalog/read 返回从核心 `keywords[0]` 或 Character `name` 解析的展示身份、原始 YAML、revision、表达式稳定 ID/坐标与诊断；`.txt` 仍由仓库排除。CRUD 保留仓库 revision、安全路径和显式确认语义。
- locate-expression 要求文档 identity/revision、表达式稳定 ID 或坐标、明确 main/单一 space、botId 与逻辑 conversationId；按展示身份而非核心文件名，在目标 store 中由新到旧选择带请求正文且快照模板与当前源码一致的请求，再通过共享模型证据投影与表达式 matcher 返回 record/evidence/range/scope；过期、无身份、无请求、无匹配、歧义和不支持均返回结构化失败。
- 注册 authority 4 的预设 catalog/read/CRUD/locate Console events 及 module augmentation；`src/index.ts` 在正常路径与 MCP 初始化失败降级路径均传入同一个服务实例。
- 服务/RPC 聚焦测试与相关预设/模型请求测试共 40 项通过；server-only `yarn tsc -p tsconfig.json --noEmit` 通过。完整 `yarn typecheck` 仍被既有客户端 `client/webqq/model-request-live-refresh.ts:40` 的 `number | Timeout` 类型错误阻塞，本切片未修改客户端。
- 2026-08-23：完成客户端预设工作台与跨页导航切片。新增可持久化“预设”独立导航、WorkspacePort/Koishi/Fake/controller/shell 预设能力、按活动空间/逻辑会话/虚拟机器人派生的证据上下文、核心与 Character 分组搜索及完整 CRUD、脏状态切换保护、revision 冲突刷新流程和保存状态。
- 新增 CodeMirror 6 YAML 源码编辑器，直接绑定原始 YAML，不在 Vue 中解析；服务端表达式范围投影为 control/value 装饰，仅 value 可点击，保存期间只读。定位失败显示服务消息，匹配后提供模型请求证据跳转。
- 新增纯 `preset-evidence-navigation` 瞬时状态；模型请求工作台接收 intent 后应用 scope、打开指定记录、请求 request-mode 轨迹、切到证据/分析，并通过 ModelRequestTrajectory 外部 LocateRequest 透传 occurrence range。本切片按要求未修改 analysis-view/evidence-locator 的精确范围渲染，仅保留现有卡片定位。
- 新增客户端公共 seam 测试。聚焦 9 个测试文件共 25 项通过；`yarn typecheck` 通过；`yarn build:client` 通过。同步修复阻塞全量类型检查的 Timer 联合类型。
- 2026-08-24：补完精确 occurrence 导航。新增纯 `model-request-occurrence` 模块，严格按请求消息 `content` 验证 UTF-16 range（含 surrogate pair 边界），派生确定 occurrence target 并渲染专用 `<mark>`；零长度范围显示 caret，不改写正文。
- `analysis-view` 在精确定位时退出 raw、展开所属卡片与长文本，只在消息正文中渲染 occurrence；`evidence-locator` 继续保持 ADR-0062 adapter seam，通过最小 `setOccurrenceTarget` 出口测量、滚动和强调 occurrence mark。无效范围或 mark 缺失明确返回失败，不回落到卡片或其他文本；普通 evidence 定位行为不变。
- occurrence/locator 与相关回归完成后，点击值表达式会直接打开精确证据位置；脏源码不再保留旧可点击装饰，创建/重命名/删除/离页均需明确放弃，导航只在 locator 确认成功后消费。
- 最终验证：`yarn test` 105 个文件、596 项通过；`yarn typecheck`、`yarn build`、`git diff --check` 通过。
