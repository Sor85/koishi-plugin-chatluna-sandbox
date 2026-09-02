# 区域样式按能力归属

`client/styles/` 下 16 个 `webqq-*.css` 仍然平铺在一个目录里，而它们服务的视图已经按能力分进了目录（[ADR-0090](../../docs/adr/0090-group-source-files-by-capability.md)）。这轮把有单一能力归属的样式表挪到对应目录，让改一处外观只需要打开一个文件夹。

## 现状与问题

三个问题，只有前两个属于本轮：

1. **文件名与内容对不上。** `webqq-messages.css` 里 190 条选择器是 `.chatluna-sandbox-*`、34 条是 `.webqq-*`；`webqq-message-selection.css` 是 42 比 1。看文件名猜不出内容，看到类名也不知道去哪个文件找。
2. **样式与它管的组件分居两地。** 改模型请求工作台的外观要同时开 `client/model-request/workspace.vue` 与 `client/styles/webqq-model-requests.css`（2558 行，客户端最大单文件）。
3. 命名空间本身的收敛已由 [ADR-0091](../../docs/adr/0091-converge-css-namespaces.md) 与 `tests/css-namespace.test.ts` 接管，**不在本轮范围内**。

## 归属草案

| 样式表 | 目标 |
| --- | --- |
| `webqq-sidebar.css` `webqq-chat.css` `webqq-messages.css` `webqq-composer.css` `webqq-details.css` `webqq-message-selection.css` | `client/webqq/` |
| `webqq-model-requests.css` | `client/model-request/` |
| `webqq-presets.css` | `client/preset/` |
| `webqq-test-calls.css` | `client/test-call/` |
| `webqq-debug.css` | `client/onebot-debug/` |
| `webqq-spaces.css` | `client/test-space/` |
| `webqq-workspace.css` `webqq-overlays.css` | `client/workspace/` |
| `webqq-tokens.css` `webqq-primitives.css` | 留在 `client/styles/`（跨能力令牌与原语） |
| `webqq-responsive.css` | 留在 `client/styles/`（跨区域断点，没有单一归属） |
| `tailwind.source.css` `tailwind.generated.css` `shadcn-theme.css` | 留在 `client/styles/`（构建入口与主题基线，路径被 ADR-0053／0068 钉住） |

目录承担能力标识后文件名去掉前缀，例如 `client/model-request/styles.css`；一个目录里有多张表时按区域命名，例如 `client/webqq/messages.css`。

## 硬约束

- **只搬不改内容。** `client/style.css` 的 18 条 `@import` 顺序逐字保持（tokens → workspace → primitives → 各区域 → overlays → responsive）。顺手合并或拆分文件是这件事唯一会产生静默缺陷的地方：级联优先级变了不报错，只是某处颜色或间距不对。
- `tests/webqq-region-css.test.ts` 直接断言九个区域文件在入口里的 `@import` 顺序递增，路径改完它必须仍然绿。
- 另有 20 多个测试文件、`scripts/build-css.mjs`、`scripts/watch-server.mjs` 与三个 ADR 写着 `client/styles/webqq-*.css` 的字面路径，需一并改。这些改错会红，不是静默失效。

## 验收

- `client/styles/` 只剩跨能力的五张表；其余样式表与它们服务的视图同目录
- `yarn test`、`yarn typecheck`、`yarn build` 全绿
- 浏览器复验：Chrome 与 Firefox 各走一遍工作台、模型请求、预设、测试调用、OneBot 调试、AI 测试空间六个区域，与搬迁前截图逐屏比对
