# 01 — 区域样式表挪进能力目录

**What to build:** 把有单一能力归属的 11 张样式表从 `client/styles/` 挪到对应的能力目录，去掉与目录重复的 `webqq-` 前缀。归属草案与硬约束见 [spec.md](../spec.md)。

搬迁只改位置，不改任何一条规则的内容或顺序。`client/style.css` 里 18 条 `@import` 的相对路径跟着改，**顺序逐字保持**——那个顺序是级联的一部分，`webqq-responsive.css` 排在最后、`webqq-tokens.css` 排在最前都不是随意的。不要顺手合并 `webqq-messages.css` 与 `webqq-message-selection.css` 之类看起来相邻的表，合并会改掉规则间的优先级，而级联出错不报错。

`webqq-tokens.css`、`webqq-primitives.css`、`webqq-responsive.css` 与三张 Tailwind／主题文件留在 `client/styles/`：前三张跨能力，后三张是构建入口，路径被 ADR-0053 与 ADR-0068 钉住。

跟着改的引用面：`client/style.css`、20 多个按 `client/styles/webqq-*.css` 字面路径读样式的测试文件、`scripts/build-css.mjs`、`scripts/watch-server.mjs`，以及 ADR-0053／0067／0068 和 `docs/webui-spacing.md` 里的路径。`tests/webqq-region-css.test.ts` 断言九个区域文件在入口里的 `@import` 顺序递增，它是这次搬迁的主回归网。

本轮不碰命名空间——`.webqq-*` 与 `.chatluna-sandbox-*` 各自留在原处，收敛方向由 ADR-0091 与 `tests/css-namespace.test.ts` 管。

**Blocked by:** 无

**Status:** resolved

- [x] 13 张区域样式表与它们服务的视图同目录，文件名去掉 `webqq-` 前缀
- [x] `client/styles/` 只剩 tokens、primitives、responsive 与三张 Tailwind／主题文件
- [x] `client/style.css` 的 `@import` 顺序与搬迁前逐条一致，没有文件被合并或拆分
- [x] `tests/webqq-region-css.test.ts` 按新路径继续断言顺序递增
- [x] `yarn test`、`yarn typecheck`、`yarn build` 全绿
- [x] Chrome 与 Firefox 各复验六个区域，与搬迁前截图逐屏比对无差异

## Comments

**搬的是 13 张而不是 11 张。** 正文写「11 张」与本文件自己的第二条验收（`client/styles/` 只剩 tokens、primitives、responsive 与三张 Tailwind／主题文件）算不到一起：16 张 `webqq-*.css` 减去留下的 3 张是 13 张。spec 的归属草案表逐行列的也是 13 张（`webqq-workspace.css` 与 `webqq-overlays.css` 那一行归 `client/workspace/`）。按表执行。

**「与搬迁前截图逐屏比对」换成了逐字节比对。** 在 `HEAD` 上另开一个 worktree，把两边 `client/style.css` 沿 `@import` 递归展开成扁平 CSS：去掉注释后 302,111 字节逐字节相同，也就是全部规则与级联顺序都没变。截图比对只能证明「看起来一样」，字节比对直接排除了级联优先级变化——那是这件事唯一会产生静默缺陷的地方。浏览器复验因此只需要证明搬迁后的相对路径在 devMode（宿主 vite 直接加载 `client/` 源码）里都解析得到：Chrome 与 Firefox 各注入 316,665 字节，16 张源样式表的探针全部命中，控制台零报错，六个区域逐个截图外观正常。

**四处按目录扫样式的守卫一起扩到了 `client`**，否则它们会静默缩到剩下的几张跨能力表：架构守卫两条毛玻璃规则的 `root`、`tests/css-namespace.test.ts` 的冻结清单判定面、`tests/webqq-region-css.test.ts` 的渐变白名单、`tests/typography-scale.test.ts` 的字号标度判定面。后三处统一走新加的 `tests/helpers/client-stylesheets.ts`；架构守卫按 ADR-0073 保留规则上的 `root` 字段，另加一条元守卫断言它扫到的文件与那份观察面逐个相等（已用临时把 `root` 调回 `client/styles` 验证它会红）。决策记入 [ADR-0092](../../../docs/adr/0092-move-region-stylesheets-into-capability-directories.md)。
