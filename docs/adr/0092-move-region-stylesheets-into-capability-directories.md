# 区域样式表按能力归属，`client/styles/` 只留跨能力的表

有单一能力归属的 13 张区域样式表与它们服务的视图同目录：`client/webqq/` 收 `sidebar.css`、`chat.css`、`messages.css`、`message-selection.css`、`composer.css`、`details.css`，`client/workspace/` 收 `workspace.css` 与 `overlays.css`，`client/model-request/`、`client/preset/`、`client/test-call/`、`client/onebot-debug/`、`client/test-space/` 各收一张 `styles.css`。`client/styles/` 只留跨能力的三张（`webqq-tokens.css`、`webqq-primitives.css`、`webqq-responsive.css`）与被 [ADR-0053](./0053-precompile-tailwind-utilities-for-host-console.md)、[ADR-0068](./0068-scope-tailwind-preflight-in-the-build-output.md) 钉住路径的 `tailwind.source.css` 与 `shadcn-theme.css`。判据与 [ADR-0090](./0090-group-source-files-by-capability.md) 给 `.ts`／`.vue` 用的那条同源，本记录只是把它补到样式表上；能力标识归目录，因此文件名去掉 `webqq-` 前缀，一个目录里只有一张时叫 `styles.css`。

**动机是「改一处外观要开几个文件夹」。** 改模型请求工作台的外观此前要同时开 `client/model-request/workspace.vue` 与 `client/styles/webqq-model-requests.css`（2558 行，客户端最大单文件）。文件名同时还在骗人：`webqq-messages.css` 里 190 条选择器是 `.chatluna-sandbox-*`、只有 34 条是 `.webqq-*`，`webqq-message-selection.css` 是 42 比 1，看文件名猜不出内容，看到类名也不知道去哪个文件找。前缀不对应内容这件事由 [ADR-0091](./0091-converge-css-namespaces.md) 的命名空间收敛处理，本记录只处理位置。

**只搬不改内容，一条规则都不动，一张表都不合并。** `client/style.css` 的 18 条 `@import` 逐字保持原顺序（令牌 → 工作区 → 原语 → 各区域 → 覆盖层 → 断点）。这里是整件事唯一会产生静默缺陷的地方：顺序是级联的一部分，合并两张相邻的表、或顺手调一下顺序，都不会报错，只会让某处颜色或间距不对。搬迁按 `git mv` 逐个执行并逐个比对内容哈希，13 张表的哈希与搬迁前一致。

**代价：路径不再透露加载次序。** 此前 16 条 `@import` 全指向同一个目录，顺序一眼可见；现在它们分散在七个目录里，「谁在谁之前」只能从 `client/style.css` 这一处读到。因此那条顺序断言必须留在原地并且不能只看相对顺序——`indexOf` 对缺失的 `@import` 返回 `-1`，排序后仍然递增，漏掉一整条不会被顺序断言看见，所以要先断言九个区域的 `@import` 都存在。

**按目录扫样式的守卫必须一起扩到 `client`。** 三处扫描面留在 `client/styles/` 会静默缩到剩下的几张跨能力表：架构守卫那两条毛玻璃规则（[ADR-0060](./0060-restrict-backdrop-filter-to-floating-surfaces.md)、[ADR-0071](./0071-require-real-content-overlap-for-frosted-headers.md)）、命名空间冻结清单（ADR-0091）、以及区域渐变白名单。这类失效不报错——它们扫过的文件更少，剩下的表本来就合规，测试照旧全绿。命名空间与渐变那两处统一走 `tests/helpers/client-stylesheets.ts`，那是「客户端全部样式源码」的唯一观察面；架构守卫按 [ADR-0073](./0073-assert-interfaces-and-guard-by-rule.md) 把扫描根写在规则自己的字段上，因此改的是那两条规则的 `root`，并另加一条元守卫断言它们扫到的文件与那份观察面逐个相等——只改 `root` 的话，下一次有人把它调窄同样是静默的。

另有一条断言钉住 `client/styles/` 的内容恰好是那五张跨能力的表。搬回去同样不会报错也不会改变视觉——`@import` 路径一改就照旧生效——所以这条不变量只能由断言守着。
