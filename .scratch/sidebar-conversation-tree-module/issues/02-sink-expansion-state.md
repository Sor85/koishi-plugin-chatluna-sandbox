# 02 — 展开态下沉成反应式模块

**What to build:** 「展开着哪些会话行」变成一个可以单独驱动的模块，其中那条自动展开的规则第一次有断言。

新增 `client/webqq/conversation-tree-expansion.ts`：持有展开着的会话 ID 集合，暴露「展开着吗」「切换」以及「按当前选中的会话补齐展开态」。先例是 `composer-draft.ts`、`scroll-restore.ts` 与 `evidence-navigation.ts`（ADR-0065）——有状态但与 DOM 无关的行为住在模块里，不住在组件里。

那条规则今天是侧栏组件里的一个 watcher，一条测试都没有：选中一个会话实例时自动展开它所属的那一行。它的理由是新建与分叉完成后新实例会被自动选中，而展开态是侧栏本地状态，折叠的父行会让侧栏一行都不高亮。搬进模块后规则变成一个函数，侧栏在选中变化时调它一次；理由从注释升级成断言——用户手动收起后不因为仍然选中而被强行展开回去。

展开态仍是侧栏本地状态：不进工作区状态、不持久化，折叠一行不改变选中。

**Blocked by:** 01

**Status:** resolved

- [x] 展开与收起有断言
- [x] 选中一个实例后其所属那一行被补齐为展开
- [x] 手动收起后不因仍然选中而被强行展开回去
- [x] 选中根会话不改变任何展开态
- [x] 实例被删除后残留的展开态不影响其余行
- [x] 侧栏组件里不再持有展开态实现，`webqq-sidebar.test.ts` 中针对这两块的源码文本断言已删除
- [x] 分叉出新实例后侧栏确实高亮它（浏览器实测一次，按项目约定收尾）

## Comments

- 新增 `client/webqq/conversation-tree-expansion.ts`：`isConversationExpanded` / `toggleConversationExpanded` / `revealConversation`。侧栏只在选中变化时调 `revealConversation` 一次。
- 「手动收起后不被强行展开回去」这条落在模块自己身上而不是靠组件的 watcher 不触发：模块记住上一次补齐时的选中会话，选中没变就不补齐。因此这条规则在没有组件的环境里也成立，可以逐条断言。
- 浏览器实测（Chrome 与 Firefox 各一轮，Koishi 开发环境完整重启后进行）：
  - 右键根会话「创建新会话」后父行自动展开、新实例子项带 `is-active`（Chrome `aria-expanded=true`、`收起会话（3 个会话实例）`；Firefox 同）。
  - 手动点收起后父行保持 `aria-expanded=false`、子项列表消失，没有被选中状态强行展开回去。
  - 消息右键「创建分支」后侧栏出现「分支：测试群」并高亮，父行从收起状态被重新补齐为展开。
  - 两个浏览器控制台 0 error。
- 收尾：删除本次创建的三个会话实例，关闭两个浏览器会话，清理 `.playwright-cli` 临时目录。
- 代码审查后的修正：`webqq-sidebar.test.ts` 里原本加了三条肯定式源码接线断言（`createConversationTreeExpansion()` 之类），ADR-0073 允许的四类里没有这一类，已删除，只留否定式的「已删除实现」守卫；组件确实驱动了模块由上面的浏览器实测执行验证。
