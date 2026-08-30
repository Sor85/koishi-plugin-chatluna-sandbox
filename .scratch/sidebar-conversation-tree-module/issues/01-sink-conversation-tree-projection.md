# 01 — 会话树投影下沉成纯模块

**What to build:** 「一个根会话在侧栏里长什么样」变成一个可以单独问的纯函数，不必先起一个完整工作台才能验证。

新增 `client/webqq/conversation-tree.ts`：入参是沙盒场景、可见会话、当前操作者与头像解析函数，出参是侧栏会话树——根会话行加它们的实例子项。先例是 `environment-directory-model.ts` 与 `relationship-directory.ts`：同样把场景投影成某个视图要的形状，同样接受注入的头像解析。

投影口径一字不改地搬过去：标题取实例名否则联系人名或群名，预览取拼接后最后一条消息（撤回时取撤回事件文案，没有消息时取「开始一段新对话」），时间按 `zh-CN` 时分，头像种类按群组与机器人判定，群角色取当前操作者在群里的角色。会话实例挂到所属根会话下的分组规则一并搬走，层级仍严格两层。

转发目标的「最近」一列改为显式复用同一个模块的结果，而不是复用外壳里的一个中间变量——改会话树投影时应该能看见谁跟着变。

判据是 `webqq-conversation-tree.test.ts` 一字不改地继续通过：它已经覆盖标题、预览、时间、分组与实例挂载，因此它就是这次搬迁的回归网。

**Blocked by:** 无

**Status:** resolved

- [x] 会话树投影住在独立纯模块里，可以不起外壳直接调用
- [x] 投影口径逐项有断言：实例挂载、预览三种情形、头像种类、群角色
- [x] 转发目标的「最近」一列显式复用同一模块
- [x] `webqq-conversation-tree.test.ts` 一字不改地通过
- [x] 工作台外壳里不再有会话树投影的实现

## Comments

- 新增 `client/webqq/conversation-tree.ts`：`buildConversationTree` 出会话树，`toRecentForwardTargets` 从同一份结果派生转发目标的「最近」一列。复用关系写在类型上：`ConversationTreeForwardTarget` 由 `Pick<ConversationTreeRow, 'title' | 'avatar' | 'avatarKind'>` 派生，`subtitle` 的类型就是 `ConversationTreeRow['preview']`。
- 行类型从 `webqq-sidebar.vue` 搬进模块（原 `WebqqSidebarConversation` 删除）。类型分三层把「层级严格两层」写进 interface：`ConversationTreeRow` 不含子项列表，`ConversationTreeInstanceRow` 是实例子项，`ConversationTreeNode.children` 只收实例行，因此「实例下不再有实例」（CONTEXT「会话实例」、ADR-0076）在类型上就成立，而不是只写在注释里。原先的 `children?: ConversationTreeRow[]` 是递归的，表达不了这条约束。
- `WebqqSidebarModel.conversations` 因此改吃 `ConversationTreeNode[]`；`client/webqq/workspace-thumbnail-model.ts` 里那份只投根会话的行补上 `kind: 'root'` 与 `children: []`（纯追加，缩略图渲染不读这两项）。
- 「最近」一列的复用关系由外壳 interface 上的一条断言守住：`forwardTargets.recent` 必须等于 `toRecentForwardTargets(sidebarModel.conversations)`。按 ADR-0073 不用肯定式源码文本断言代替它。
- 纯结构性由 stash 基线证明：同一份确定性场景（含实例、分支物化前缀、撤回消息、at 提及、群角色、两种头像引用）分别在搬迁后与 `HEAD` 上导出 `sidebarModel.conversations` 与 `forwardTargets.recent`，两份 JSON 逐字节相同；缩略图那份只多出上面两个追加字段。
- `tests/group-mention.test.ts` 与 `tests/webqq-page-shell.test.ts` 里各有一两条源码文本断言原本钉在外壳的这段投影上，随实现改指 `client/webqq/conversation-tree.ts`，断言意图不变。
- 遗留已消化：`client/webqq/workspace-thumbnail-model.ts` 里那份近乎相同的会话行投影由票 03 补上回归网后改为复用本模块。
