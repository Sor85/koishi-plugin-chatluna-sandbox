# 01 — 区域样式表挪进能力目录

**What to build:** 把有单一能力归属的 11 张样式表从 `client/styles/` 挪到对应的能力目录，去掉与目录重复的 `webqq-` 前缀。归属草案与硬约束见 [spec.md](../spec.md)。

搬迁只改位置，不改任何一条规则的内容或顺序。`client/style.css` 里 18 条 `@import` 的相对路径跟着改，**顺序逐字保持**——那个顺序是级联的一部分，`webqq-responsive.css` 排在最后、`webqq-tokens.css` 排在最前都不是随意的。不要顺手合并 `webqq-messages.css` 与 `webqq-message-selection.css` 之类看起来相邻的表，合并会改掉规则间的优先级，而级联出错不报错。

`webqq-tokens.css`、`webqq-primitives.css`、`webqq-responsive.css` 与三张 Tailwind／主题文件留在 `client/styles/`：前三张跨能力，后三张是构建入口，路径被 ADR-0053 与 ADR-0068 钉住。

跟着改的引用面：`client/style.css`、20 多个按 `client/styles/webqq-*.css` 字面路径读样式的测试文件、`scripts/build-css.mjs`、`scripts/watch-server.mjs`，以及 ADR-0053／0067／0068 和 `docs/webui-spacing.md` 里的路径。`tests/webqq-region-css.test.ts` 断言九个区域文件在入口里的 `@import` 顺序递增，它是这次搬迁的主回归网。

本轮不碰命名空间——`.webqq-*` 与 `.chatluna-sandbox-*` 各自留在原处，收敛方向由 ADR-0091 与 `tests/css-namespace.test.ts` 管。

**Blocked by:** 无

**Status:** ready-for-agent

- [ ] 11 张区域样式表与它们服务的视图同目录，文件名去掉 `webqq-` 前缀
- [ ] `client/styles/` 只剩 tokens、primitives、responsive 与三张 Tailwind／主题文件
- [ ] `client/style.css` 的 `@import` 顺序与搬迁前逐条一致，没有文件被合并或拆分
- [ ] `tests/webqq-region-css.test.ts` 按新路径继续断言顺序递增
- [ ] `yarn test`、`yarn typecheck`、`yarn build` 全绿
- [ ] Chrome 与 Firefox 各复验六个区域，与搬迁前截图逐屏比对无差异
