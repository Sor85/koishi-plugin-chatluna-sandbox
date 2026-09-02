# 源码按能力分目录，而不是按文件类型

`client/` 下每个文件属于一个能力目录，视图与服务它的 module 放在一起。目录是 `workspace`、`webqq`、`model-request`、`preset`、`mcp`、`onebot-debug`、`test-call`、`test-space`、`environment`，加上三个不按能力划分的既有目录：跨能力复用的 `shared`、shadcn-vue 封装 `components`、样式表 `styles`。`client/` 根只留控制台入口 `index.ts` 与作用于整棵树的全局声明（`shims.d.ts`、`koishi-client-shim.d.ts`、`style.css`）。

**判据是能力归属，与 [ADR-0074](./0074-split-client-rpc-ports-by-capability.md) 给端口用的那条同源，不是文件类型。** 此前的实际分层是「`.ts` 进 `client/webqq/`，`.vue` 留在根」：根目录躺着 16 个 `webqq-*.vue`，而 `webqq/` 目录就在旁边；同时那个以一种能力命名的目录里装着 16 个 `model-request-*`、5 个 `workspace-thumbnail-*`、4 个 `preset-*`、3 个 `mcp-*`，它实际是客户端全部逻辑 module 的杂物间。同一件事因此被文件类型劈到两层——`model-request-workspace.vue` 与 `model-request-query.ts` 之间没有任何东西表明它们是一个能力的两半。按类型分层还与 [ADR-0040](./0040-modularize-webqq-by-layout-and-behavior.md) 自己的拆分轴（布局区域与行为）相矛盾。

**能力标识归目录，文件名里不再重复。** `webqq-sidebar.vue` 成为 `webqq/sidebar.vue`，`model-request-query.ts` 成为 `model-request/query.ts`，端口三件套统一叫 `port.ts`／`koishi-port.ts`／`fake-port.ts`。前缀与目录同时表达同一个事实时，改一处不改另一处就会分叉，而分叉不报错。唯一为回避歧义留下的偏离是 `webqq/message-search-panel.vue`：同目录已有搜索编排 `message-search.ts`，两者同名会让省略扩展名的导入按解析顺序静默选中 `.ts`。

归属按引用关系判定，不按名字。`webqq-avatar.vue` 被 17 个跨能力的视图引用、`webqq-scrollbar.ts` 被 18 个引用，它们是 ADR-0040 说的共享视觉模块，因此进 `shared/` 而不是 `webqq/`；`webqq-avatar-picker.vue` 名字带 webqq，但唯一的消费方是环境管理的新建浮层与实体弹层，因此进 `environment/`；`workspace-thumbnail-*` 五个 module 与 `workspace-thumbnail.vue` 的消费方是 AI 测试空间总览，因此进 `test-space/` 而不是 `workspace/`。反过来，`message-capabilities.ts` 留在 `webqq/`——它是场景消息的判据，`shared/` 会让「谁是合法持有者」这条守卫的位置约束变弱。

**守卫从清单制换成规则制。** 原先那条守卫逐个断言八个辅助 module「在 `client/webqq/` 且不在 `client/`」，它只看得见名单里的文件，名单外新增的文件默认豁免，随文件数增长自动失效。换成两条按目录成立的断言：根目录只允许那四个文件，顶层目录只允许上面列举的那些。新加一个没有归属的 `.vue` 到根目录会立刻红灯，而这是原来那张名单永远看不见的。

代价是导入路径变长，且「这个文件属于哪个能力」的判断从此必须在落盘前做出——放不进任何目录的文件会被守卫拦住。这正是想要的：`client/` 根此前是默认落点，能力归属可以无限推迟。本轮不改 `client/styles/`。那 16 个 `webqq-*.css` 的前缀既不对应目录也不对应内容——`webqq-messages.css` 里 190 条选择器是 `.chatluna-sandbox-*`、只有 34 条是 `.webqq-*`，`webqq-message-selection.css` 是 42 比 1。它们该按能力挪进对应目录，但那件事要同时碰 `style.css` 里靠顺序成立的级联和二十多处按文件名读样式的断言，与本轮的搬迁风险不该叠在一个提交里；命名空间本身的收敛方向见 [ADR-0091](./0091-converge-css-namespaces.md)。

**服务端只收 `src/chatluna-*` 这一组，`src/` 根其余文件保持平铺。** `src/mcp/`、`src/model-evidence/`、`src/presets/` 早已按能力切出去，剩下的根文件里只有 chatluna 那七个共享同一条边界——它们全都在读被测响应插件的运行时（[ADR-0088](./0088-read-wakeup-rules-from-the-responder-runtime.md)、[ADR-0080](./0080-follow-event-conversation-when-reading-history.md)），因此收成 `src/chatluna/`，同样去掉与目录重复的前缀。`onebot-*` 三个、`evidence-*` 两个都是各自独立的单文件概念，进目录只是换个位置，不产生任何新的边界。

**服务端不按目录设第二条布局守卫。** 客户端那两条断言成立是因为它有明确的能力集合；`src/` 根的平铺文件不构成一个可枚举的集合，钉住它只会在每次新增领域模块时逼出一次无意义的名单更新。服务端真正影响导航的是单文件规模——`control-service.ts` 2934 行、`bot.ts` 1209 行、`types.ts` 1033 行——而 [ADR-0074](./0074-split-client-rpc-ports-by-capability.md) 已经写明不按成员数或文件大小设守卫：那三个文件要拆，得等某条能力真的可以按归属剥出来，建目录一点都不解决。
