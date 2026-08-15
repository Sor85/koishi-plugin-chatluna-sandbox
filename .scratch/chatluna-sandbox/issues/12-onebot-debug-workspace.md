# 12 — 提供 OneBot 调试工作台

**What to build:** 在 WebQQ 工作台提供独立的调试视图，让开发者查看和清理最近的 OneBot action、原始事件与错误，快速确认插件实际调用和接收的数据，同时保证调试记录不会成为消息历史或可重放命令。

**Blocked by:** 09 — 实现 NapCat、LLBot 私有接口与能力覆盖

**Status:** ready-for-human

- [x] 调试视图可以按机器人、方向、类型和错误状态筛选记录
- [x] 记录展示 action 或事件类型、时间、结果、关联实体和必要的脱敏载荷
- [x] NapCat 与 LLBot 的原始差异可以在记录中被辨认
- [x] 用户可以清理当前 OneBot 调试记录
- [x] 调试记录使用有界内存缓冲区，不写入聊天消息或场景导出
- [x] 调试记录不能直接重放 action 或事件
- [x] 敏感媒体内容和非必要正文默认不完整记录
- [x] 被测插件异常时可以通过 trace 信息关联 Koishi Logger

## 验证记录

- `yarn test`：40 个测试文件、150 个测试全部通过
- `yarn typecheck`：通过
- `yarn build`：服务端与 WebUI 生产构建通过
- Ego Browser：验证调试入口、类型筛选、shadcn-vue 下拉、正文脱敏与清理记录，控制台 0 错误
- Firefox：验证调试页面正常渲染，控制台 0 错误
