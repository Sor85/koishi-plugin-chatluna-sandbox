# 05 — 实例重命名与删除

**What to build:** 用户能给会话实例改名，也能删除一个实例并连带清掉它的消息。根会话不提供删除入口，因为它的存在由参与者关系与群组决定。删除好友、被移出群或群组解散时，对应根会话下的实例连带消失。

删除实例时一并清理它的消息、因此失去引用的合并转发资源以及不再被任何引用持有的媒体，与场景既有的级联清理策略一致。

本票同时修掉一个既有的假按钮：侧栏子项现在的「删除会话」实际只发客户端的最近会话隐藏标记，实例会在下次刷新后回来、消息永远留在场景里。改成真正的领域删除。

**Blocked by:** 03

**Status:** resolved

- [x] 实例可以改名，改名后侧栏与聊天区标题同步
- [x] 多个使用默认名的实例可以通过改名区分
- [x] 删除实例后它的消息不再存在于场景中
- [x] 删除实例会清理失去引用的合并转发资源与媒体
- [x] 根会话不提供删除入口
- [x] 删除好友、被移出群或群组解散后，对应实例连带消失
- [x] 侧栏子项的删除动作是领域删除，刷新后实例不会回来

## Comments

已完成。

**领域**：解析模块新增 `removeConversationInstance`，与 `removeConversations` 同口径只动实例集合并返回被删 ID，目标不是实例时抛「会话实例不存在」——根会话没有这条路径。控制服务把原 `deleteConversations` 的级联部分抽成
`cascadeRemovedConversations(removedIds)`，删根会话、删实例与解散群组因此共用同一条清理链（消息、机器人投递记录、ChatLuna 状态、孤儿 forward，媒体由 `commitSceneMutation` 按引用扫描回收）。新增
`renameConversationInstance` 与 `deleteConversationInstance` 两个控制服务方法。

**RPC**：`chatluna-sandbox/rename-conversation-instance` 与 `chatluna-sandbox/delete-conversation-instance` 返回完整工作区状态（没有新会话 ID，因此不用 `SandboxConversationInstanceResult`），客户端一次请求完成状态替换。

**客户端**：侧栏实例子项右键给出「重命名会话」与「删除会话」，重命名走 OverlayHost 的窄输入对话框；根会话右键不再有删除项。删除后的选中回退交给 `replaceWorkspace` 重解析，不在删除路径里猜下一个选谁。

两点值得记的边界：

1. 「删除好友」与「被移出群」不删除根会话，只撤销可见性；实例的可见性完全继承根会话，因此它们随根会话一起从该操作者的投影里消失，而不是被清理。只有解散群组、删除参与者这类真的让根会话消失的路径才走级联删除。
2. 根会话原来的「删除会话」是客户端最近会话隐藏标记。本票删掉它之后该机制再无入口，于是按未发布阶段兼容策略整体移除：`hiddenRecentConversations` 偏好字段、控制器状态与 `removeRecentConversation`、
   `getVisibleRecentConversations`（移除后侧栏投影等于可见会话本身）一并删除。

未做（属于其他票）：侧栏会话行时间、展开按钮计数、子项时间与未读、「创建新会话」不常驻子项末尾与死样式清理都在 08；浏览器实测同样在 08 统一跑。删除实例没有二次确认对话框——与「删除好友」「退出群组」这类侧栏直接动作保持一致。
