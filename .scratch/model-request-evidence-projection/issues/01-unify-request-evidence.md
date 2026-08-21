# 01 — 统一请求消息与工具定义证据

**What to build:** 让模型请求轨迹与模型请求对话视图通过同一个模型证据投影 interface 解释请求体，使 System、请求消息、内容分片、工具定义、工具调用和明确工具结果在两个视图中具有相同的顺序、语义、来源和证据身份。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] 建立浏览器与服务端均可运行的纯模型证据投影 module，并只公开一个接收模型请求证据切片的 interface
- [ ] 请求投影分别输出有序请求消息和有序工具定义，不为不同证据平面建立虚假的总顺序
- [ ] OpenAI Chat Completions、OpenAI Responses、Anthropic Messages、Gemini generateContent 和 AI SDK 请求结构均通过 shape-driven internal adapter 支持
- [ ] 顶层 System、消息角色、消息边界和多模态内容分片保持协议语义与原始顺序
- [ ] 工具定义保持独立证据平面和原始声明顺序，不被投影为 System 或其他请求消息
- [ ] assistant 工具调用保留在明确消息上下文中；请求工具结果仅在存在实际证据时生成
- [ ] 每个规范项具有确定性 evidenceId，并携带请求区域、原始结构路径及只读原始值来源
- [ ] `messages`、`contents` 和 `input` 同时出现时按确定规则选择主要会话容器并返回结构化歧义诊断，不静默拼接
- [ ] 局部不支持或损坏只产生结构化诊断，不删除其他能够证明的请求证据
- [ ] adapter 选择不依赖 provider、域名、IP、模型名称或未持久化协议字段
- [ ] 模型请求轨迹的请求行与请求组成统计改为消费共享投影
- [ ] 模型请求对话视图的请求消息与工具定义改为消费共享投影
- [ ] 请求侧旧协议解析、重复顺序规则和对应 fallback 全部删除
- [ ] 集中协议 fixture 测试覆盖五类请求结构、System 边界、typed parts、多模态、工具证据、来源、evidenceId 和诊断
- [ ] 下游测试只验证请求投影到轨迹、组成统计和对话卡片的映射，不重复完整协议矩阵
- [ ] 模型请求分析页与轨迹页能够展示同一请求证据，且现有原始证据查看能力保持可用
- [ ] 相关测试、完整测试、类型检查和生产构建全部通过
