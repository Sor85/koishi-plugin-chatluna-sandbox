# 客户端按能力分目录，而不是按文件类型

`client/` 下每个文件属于一个能力目录，视图与服务它的 module 放在一起。目录是 `workspace`、`webqq`、`model-request`、`preset`、`mcp`、`onebot-debug`、`test-call`、`test-space`、`environment`，加上三个不按能力划分的既有目录：跨能力复用的 `shared`、shadcn-vue 封装 `components`、样式表 `styles`。`client/` 根只留控制台入口 `index.ts` 与作用于整棵树的全局声明（`shims.d.ts`、`koishi-client-shim.d.ts`、`style.css`）。

**判据是能力归属，与 [ADR-0074](./0074-split-client-rpc-ports-by-capability.md) 给端口用的那条同源，不是文件类型。** 此前的实际分层是「`.ts` 进 `client/webqq/`，`.vue` 留在根」：根目录躺着 16 个 `webqq-*.vue`，而 `webqq/` 目录就在旁边；同时那个以一种能力命名的目录里装着 16 个 `model-request-*`、5 个 `workspace-thumbnail-*`、4 个 `preset-*`、3 个 `mcp-*`，它实际是客户端全部逻辑 module 的杂物间。同一件事因此被文件类型劈到两层——`model-request-workspace.vue` 与 `model-request-query.ts` 之间没有任何东西表明它们是一个能力的两半。按类型分层还与 [ADR-0040](./0040-modularize-webqq-by-layout-and-behavior.md) 自己的拆分轴（布局区域与行为）相矛盾。

**能力标识归目录，文件名里不再重复。** `webqq-sidebar.vue` 成为 `webqq/sidebar.vue`，`model-request-query.ts` 成为 `model-request/query.ts`，端口三件套统一叫 `port.ts`／`koishi-port.ts`／`fake-port.ts`。前缀与目录同时表达同一个事实时，改一处不改另一处就会分叉，而分叉不报错。唯一为回避歧义留下的偏离是 `webqq/message-search-panel.vue`：同目录已有搜索编排 `message-search.ts`，两者同名会让省略扩展名的导入按解析顺序静默选中 `.ts`。

归属按引用关系判定，不按名字。`webqq-avatar.vue` 被 17 个跨能力的视图引用、`webqq-scrollbar.ts` 被 18 个引用，它们是 ADR-0040 说的共享视觉模块，因此进 `shared/` 而不是 `webqq/`；`webqq-avatar-picker.vue` 名字带 webqq，但唯一的消费方是环境管理的新建浮层与实体弹层，因此进 `environment/`；`workspace-thumbnail-*` 五个 module 与 `workspace-thumbnail.vue` 的消费方是 AI 测试空间总览，因此进 `test-space/` 而不是 `workspace/`。反过来，`message-capabilities.ts` 留在 `webqq/`——它是场景消息的判据，`shared/` 会让「谁是合法持有者」这条守卫的位置约束变弱。

**守卫从清单制换成规则制。** 原先那条守卫逐个断言八个辅助 module「在 `client/webqq/` 且不在 `client/`」，它只看得见名单里的文件，名单外新增的文件默认豁免，随文件数增长自动失效。换成两条按目录成立的断言：根目录只允许那四个文件，顶层目录只允许上面列举的那些。新加一个没有归属的 `.vue` 到根目录会立刻红灯，而这是原来那张名单永远看不见的。

代价是导入路径变长，且「这个文件属于哪个能力」的判断从此必须在落盘前做出——放不进任何目录的文件会被守卫拦住。这正是想要的：`client/` 根此前是默认落点，能力归属可以无限推迟。本轮不改 `client/styles/` 的文件名，那里的 `webqq-` 前缀对应的是 CSS 选择器命名空间而不是目录，两者恰好同名但不是同一个事实。
