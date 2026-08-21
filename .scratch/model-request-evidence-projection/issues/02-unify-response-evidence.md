# 02 — 统一模型响应证据

**What to build:** 让模型请求轨迹与模型请求对话视图通过同一个模型证据投影 interface 解释响应体，使模型响应正文、思考、工具调用、工具结果、结束原因和用量候选在 JSON、TEXT 与 SSE 场景下具有一致语义和可验证来源。

**Blocked by:** 01 — 统一请求消息与工具定义证据

**Status:** ready-for-agent

- [ ] 在既有模型证据投影 interface 中增加有序模型响应语义事件，不新增第二个 external seam
- [ ] JSON、TEXT 和 SSE transport 由 internal adapter 解析，并保留实际 transport 顺序与原始模型证据来源
- [ ] OpenAI choices、OpenAI Responses output、Anthropic content、Gemini candidates 及现有 AI SDK 响应结构均通过 shape-driven adapter 支持
- [ ] 正文、思考、工具调用、明确工具结果、结束原因和响应体用量候选均能投影为可验证语义事件
- [ ] 每个响应规范项具有确定性 evidenceId，并携带一个或多个响应区域来源
- [ ] 已知 SSE delta 由共享 module 统一合并，累计快照统一去重，合并结果保留全部参与来源
- [ ] 未知或损坏 SSE payload 保留为未识别证据或结构化诊断，不通过通用字符串拼接猜测内容
- [ ] 每个响应语义 payload 只由一个最具体的 adapter 负责；包装结构可显式委托子 payload，正交元数据可独立提取
- [ ] 同一响应节点被多个同等可信 adapter 匹配时返回歧义诊断，不生成重复或推测事件
- [ ] 工具调用与工具结果只通过明确调用标识建立关系，不按工具名称或出现位置自动配对
- [ ] 模型请求 pending、error、complete 和 unavailable 生命周期继续由模型请求记录决定
- [ ] 最终模型用量继续优先采用模型请求详情中的标准化值，仅在缺失时使用响应投影中的用量候选
- [ ] 模型请求轨迹的响应行改为消费共享投影，并补齐明确响应工具结果等现有视图差异
- [ ] 模型请求对话视图的响应卡片改为消费共享投影
- [ ] 响应侧旧 JSON、SSE、TEXT 扫描、内容提取和重复 fallback 全部删除
- [ ] 集中 fixture 测试覆盖普通 JSON、纯文本、SSE delta、累计快照、工具事件、结束原因、用量候选、来源、诊断和部分成功
- [ ] 下游测试只验证响应投影到轨迹行和响应卡片的映射，不重复完整协议矩阵
- [ ] 模型请求分析页与轨迹页能够展示同一响应事实，原始 JSON、SSE 和 TEXT 查看能力保持可用
- [ ] 相关测试、完整测试、类型检查和生产构建全部通过
