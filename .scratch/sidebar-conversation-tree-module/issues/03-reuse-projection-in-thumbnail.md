# 03 — 缩略图复用同一份会话树投影

**What to build:** `client/webqq/workspace-thumbnail-model.ts` 里还有一份几乎逐字相同的会话行投影：标题、预览、时分、头像种类、群角色与右键入口目标都自己算一遍，而且一条测试都没有。票 01 把投影收进 `conversation-tree.ts` 之后它就是第二处口径，改会话树预览的人不会知道缩略图也要跟着改。

它先补回归网再复用：缩略图的会话列表口径今天没有任何断言，直接换实现等于无网重构。

缩略图与侧栏的差别只在喂进去的会话上——缩略图只取根会话，且私聊按参与关系而不是好友关系判定，因为它是工作台的小幅预览，不做可见性收窄。这条差别留在缩略图里，不进投影模块。

**Blocked by:** 01

**Status:** resolved

- [x] 缩略图的会话列表口径先有回归网：只画根会话、私聊按参与关系、标题、头像种类、预览三种情形、时分、群角色、右键入口目标、头像引用不在这一层解析
- [x] 缩略图改为调用 `buildConversationTree` 与 `toRecentForwardTargets`
- [x] 缩略图里不再有第二份 `describeMessage` 与第二处时分格式化
- [x] 复用前后输出取值相同
- [x] 投影版缩略图在 Chrome 与 Firefox 各实测一次

## Comments

- 新增 `tests/workspace-thumbnail-model.test.ts`（10 条）。它先对着搬迁前的实现跑通，再作为复用后的回归网——顺序反过来就等于无网重构。
- 复用后删掉 42 行：第二份 `describeMessage`、第二处 `new Intl.DateTimeFormat('zh-CN')`、以及 `isRecalledMessage` / `formatRecalledMessageEventText` / `formatMentionContent` 三个只为它存在的导入。
- 复用前后取值相同：同一份确定性场景（含未加好友的私聊、与当前操作者无关的私聊、未加入的群、撤回消息、指向不存在参与者的 at 元素、`sandbox-media://` 头像引用、两个会话实例）导出缩略图的会话列表与三列转发目标，逐字段比对一致；JSON 里只有 `children` 这个键的位置从第三位移到末位，取值没有变化。
- 浏览器实测：刷新后不进工作台直接打开 AI 测试空间，命中投影版缩略图（`.webqq-space-thumbnail-workspace` 存在、live 捕获为 0），四行会话的标题与预览与真实侧栏一致，且没有展开按钮——缩略图只画根会话，`children` 恒为空。Chrome 与 Firefox 各一轮，控制台 0 error。收尾关闭两个浏览器会话并清理 `.playwright-cli`。
- 缩略图的输入规则没有动：仍是 `listRootConversations` 加 `includesConversationParticipant`。这条差别现在也有断言钉住，改成按好友关系收窄时会变红。
