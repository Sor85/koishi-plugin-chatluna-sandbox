# MCP 状态修改必须幂等

改变模拟 QQ 环境或 AI 测试空间状态的 `interact` 与 `manage` 工具必须携带 `idempotencyKey`，服务端按测试凭证、工具名称和 Key 在当前运行纪元内缓存首次结果。相同参数的重试返回原结果，不重复修改模拟 QQ 环境；同一 Key 搭配不同参数时返回冲突。

`expectedRevision` 不能替代幂等键：它只能拒绝重复提交，响应在网络上丢失后重试会得到 `revision_conflict`，外部测试控制器无从判断上一次是否已经生效。

以下工具不在此列，各有更合适的机制：

- 事件等待工具（`wait_for_*`）不改变状态，按 ADR-0018 与命令分离；缓存首次结果会让重试拿不到新事件。
- `upload_media` 按内容寻址，`mediaId` 是正文摘要，同样的字节必然得到同一个 ID，天然幂等。
- `prepare_destructive_action` 只签发确认令牌，不改变领域状态，而且它本身就是破坏性操作的重试入口。
- 破坏性管理操作（`reset_scene`、`clear_scene`、`import_scene`、`delete_environment_entity`）由 ADR-0023 的一次性确认令牌覆盖。该令牌绑定测试凭证、工具、参数与场景版本且只能用一次，比缓存首次结果更严；ADR-0023 有意让这些操作无法盲目重试，重试必须重新取得令牌，因此不叠加幂等键。
