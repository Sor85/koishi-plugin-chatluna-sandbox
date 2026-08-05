# 将合并转发建模为场景资源

合并转发不是普通文本消息的展平结果，而是沙盒场景中的独立资源。外层 `SandboxMessage` 只保存 `forwardId` 与侧栏预览摘要；完整 node 列表保存在 `SandboxSnapshot.forwards` 中，随场景快照持久化。

发送路径统一支持：

- WebQQ 多选：按来源消息 ID 生成引用 node，服务端以 `createdAt + id` 稳定排序
- OneBot `send_forward_msg` / `send_group_forward_msg` / `send_private_forward_msg`：支持 `{ data: { id } }` 引用节点与 `{ data: { user_id, nickname, content } }` 自定义节点

读取路径中，`get_msg`、消息历史和机器人事件对外层消息暴露 `{ type: 'forward', data: { id } }` 段；`get_forward_msg` 接受转发资源 `id` 或外层 `message_id`，返回可被参考仓消费的 node 列表，并支持嵌套 forward。

节点保存作者 ID/昵称快照、正文、媒体与时间；删除参与者或改名不影响历史 node。来源消息必须对操作者可见、非事件且未撤回；目标会话必须可见；节点数量设上限，避免场景无限膨胀。机器人操作者发送合并转发必须走自身 OneBot action，以保持能力覆盖、调试记录与真实操作通道约束。
