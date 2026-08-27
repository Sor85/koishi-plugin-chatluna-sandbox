# 存储写放大治理

## 背景

对数据存储层的排查发现两处写放大，均已用探针脚本实测确认。修复分两个决策落地，见 ADR 0069（场景消息保留上限）与 ADR 0070（证据记录按行持久化）。

同批排查发现的媒体误回收、目录泄漏与空间恢复缺陷已在提交 `3acd3ff` 修复，不属于本规格范围。

## 实测证据

场景整块落盘（`src/control-service.ts` 的 `queueScenePersistence`）：

| 场景 | 观测值 |
| --- | --- |
| 50 条消息触发的 `save` 次数 | 50 |
| 累计写入 | 272.7 KB |
| 最后一次写入 | 9.0 KB |
| `scene.messages` 上限 | 无 |

写入规模随累积消息数线性增长，因此总写入量随消息数呈平方增长。

证据记录整表重写（`src/model-request.ts` 的 `queuePersist`，`src/onebot-debug.ts` 同构）：

| 场景 | 观测值 |
| --- | --- |
| 20 次请求（每次 1 append + 3 update）的 `replaceAll` 次数 | 80 |
| 累计写入 | 19.78 MB |
| 单作用域字节上限 | 50 MB |
| 单作用域记录条数上限 | 500 |

单行 JSON 体积可逼近 50 MB，超过 MySQL `max_allowed_packet` 的常见默认值（5.7 为 4 MB，8.0 为 64 MB）。每个 AI 测试空间是独立作用域，各自持有一份配额。

## 决策

- 场景消息：加条数与字节双上限，淘汰最旧，级联清理会话引用、孤儿合并转发与无引用媒体（ADR 0069）
- 证据记录：改为一行一条，追加与更新都是单行操作，读取契约不变（ADR 0070）

## 不在范围内

- 媒体去重丢失文件名与 MIME（原排查编号 8）：独立缺陷，另行处理
- 关机时挂起写入可能丢失：Koishi 的 dispose 不可等待，已在 `3acd3ff` 中降级为「失败可见」并写明平台限制，无法在插件侧根治

## Issues

- `issues/01-cap-scene-message-retention.md`
- `issues/02-persist-evidence-records-per-row.md`
