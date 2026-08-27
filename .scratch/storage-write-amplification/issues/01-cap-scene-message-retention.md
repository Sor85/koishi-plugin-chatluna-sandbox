# 01 — 为场景消息设定保留上限

Status: resolved

## What to build

给沙盒场景的消息加上条数与字节双上限，达到任一上限后从最旧消息开始淘汰。主环境与每个 AI 测试空间各自持有独立配额，与 OneBot 调试记录、模型请求记录的配额互不共享。

淘汰必须级联清理：会话的 `messageIds`、因此失去引用的合并转发资源（复用现有 `pruneUnreferencedForwards`）、以及不再被任何引用持有的媒体文件（复用现有 `reclaimUnreferenced`）。

上限通过插件配置暴露，默认值需要在配置描述中说明超限会丢弃历史消息。

## Acceptance criteria

- [x] 场景消息同时受条数上限与场景 JSON 字节上限约束
- [x] 超限时从最旧消息开始淘汰，直到两个上限都满足
- [x] 淘汰后会话 `messageIds` 不残留已删除消息 ID
- [x] 淘汰产生的孤儿合并转发资源被清理
- [x] 淘汰后不再被引用的媒体文件被回收
- [x] 仍被存活消息引用的媒体不被回收
- [x] 主环境与各测试空间的配额彼此独立
- [x] 上限可通过插件配置调整，配置描述说明会丢弃历史消息
- [x] 单次场景写入规模有恒定上界（用探针断言，不只看截图）
- [x] 不改变 ADR 0042 的单份消息存储模型
- [x] 淘汰不删除会话实体本身
- [x] 相关测试、类型检查和构建通过

## Notes

现状实测：50 条消息触发 50 次 `save`，累计 272.7 KB，最后一次 9.0 KB；`scene.messages` 无上限，总写入量随消息数呈平方增长。

相关决策：ADR 0069。

## Answer

已实现。场景消息由 `SandboxControlService.reclaimSceneMessages()` 收敛（`src/control-service.ts`），
在构造函数、`commitSceneMutation()`、`replaceScene()` 与 `restoreScene()` 四个入口生效：

- 条数上限先按超额量整段淘汰；字节上限再按整块落盘的真实序列化体积迭代收敛，
  用「当前平均单条体积」估算淘汰条数后实测复核，避免逐条 stringify 的 O(n²)。
- 级联清理会话 `messageIds`、机器人投递记录与孤儿合并转发（复用 `pruneUnreferencedForwards`）；
  媒体由调用方紧随其后的 `reclaimUnreferenced` 按最终引用集回收。
- 上限通过 `sceneMessageLimit` / `sceneMessageMaxBytes` 两个配置项暴露，默认值来自
  `DEFAULT_SCENE_MESSAGE_LIMIT` / `DEFAULT_SCENE_MESSAGE_MAX_BYTES`，描述中写明会丢弃历史消息。
- 主环境与每个 AI 测试空间各自持有配额，测试空间经 `SandboxTestSpaceRetention` 传入。
- 构造时传入的初始场景先收敛再冻结为 `initialScene`，因此 `resetScene()` 不会写回超限场景；
  AI 测试空间从持久化快照恢复正是走这条路径。

验收测试：`tests/scene-message-retention.test.ts`（含单次写入规模恒定上界的探针）、`tests/config.test.ts`。
