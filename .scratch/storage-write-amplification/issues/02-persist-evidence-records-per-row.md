# 02 — 证据记录改为按行持久化

Status: ready-for-agent

## What to build

把 OneBot 调试记录与模型请求记录从「整个数组写成单行 JSON」改为「一条记录一行」，主键为作用域加单调序号。追加是单行 insert，补充响应体或错误是单行 update，容量回收是按序号区间 delete。

读取契约不变，但实现要下移到数据库侧：分页游标、按机器人与会话与 interactionId 过滤、`errorsOnly`、容量统计都改为 SQL 查询。内存适配器需提供等价语义，保证两种模式的测试可以共用断言。

未发布阶段不需要为旧的单行 JSON 数据写迁移逻辑，直接改表结构并更新所有调用方。

## Acceptance criteria

- [ ] 每条记录独立一行，主键为作用域 + 序号
- [ ] append 只产生单行 insert，不重写其他行
- [ ] update 只产生单行 update
- [ ] 容量回收按序号区间删除，不整表重写
- [ ] 单次写入体积不随记录总数增长（用探针断言）
- [ ] 列表默认从新到旧返回 50 条、单次最多 200 条（ADR 0047 / 0054 不变）
- [ ] 稳定序号游标语义不变，读取已回收位置返回 `cursor_expired` 与当前最早游标
- [ ] 按 botId / conversationId / interactionId / model / errorsOnly 过滤结果与改造前一致
- [ ] 条数与字节双上限行为不变，容量统计仍按完整持久化内容计算
- [ ] 大值折叠行为不变（超过 8 KiB 的 Base64 仍只在单条详情显式展开时返回完整内容）
- [ ] 内存适配器与数据库适配器共用同一套断言
- [ ] 主环境、各测试空间、未归属分类仍是彼此独立的记录库
- [ ] 相关测试、类型检查和构建通过

## Notes

现状实测：20 次请求（每次 1 append + 3 update）触发 80 次 `replaceAll`，累计写入 19.78 MB；单作用域字节上限 50 MB，单行 JSON 可逼近该值并超过 MySQL `max_allowed_packet` 的常见默认值。

相关决策：ADR 0070。
