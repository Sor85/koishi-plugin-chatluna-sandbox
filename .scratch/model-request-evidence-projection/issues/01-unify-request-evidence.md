# 01 — 统一请求消息与工具定义证据

**What to build:** 让模型请求轨迹与模型请求对话视图通过同一个模型证据投影 interface 解释请求体，使 System、请求消息、内容分片、工具定义、工具调用和明确工具结果在两个视图中具有相同的顺序、语义、来源和证据身份。

**Blocked by:** None — can start immediately

**Status:** done

- [x] 建立浏览器与服务端均可运行的纯模型证据投影 module，并只公开一个接收模型请求证据切片的 interface
- [x] 请求投影分别输出有序请求消息和有序工具定义，不为不同证据平面建立虚假的总顺序
- [x] OpenAI Chat Completions、OpenAI Responses、Anthropic Messages、Gemini generateContent 和 AI SDK 请求结构均通过 shape-driven internal adapter 支持
- [x] 顶层 System、消息角色、消息边界和多模态内容分片保持协议语义与原始顺序
- [x] 工具定义保持独立证据平面和原始声明顺序，不被投影为 System 或其他请求消息
- [x] assistant 工具调用保留在明确消息上下文中；请求工具结果仅在存在实际证据时生成
- [x] 每个规范项具有确定性 evidenceId，并携带请求区域、原始结构路径及只读原始值来源
- [x] `messages`、`contents` 和 `input` 同时出现时按确定规则选择主要会话容器并返回结构化歧义诊断，不静默拼接
- [x] 局部不支持或损坏只产生结构化诊断，不删除其他能够证明的请求证据
- [x] adapter 选择不依赖 provider、域名、IP、模型名称或未持久化协议字段
- [x] 模型请求轨迹的请求行与请求组成统计改为消费共享投影
- [x] 模型请求对话视图的请求消息与工具定义改为消费共享投影
- [x] 请求侧旧协议解析、重复顺序规则和对应 fallback 全部删除
- [x] 集中协议 fixture 测试覆盖五类请求结构、System 边界、typed parts、多模态、工具证据、来源、evidenceId 和诊断
- [x] 下游测试只验证请求投影到轨迹、组成统计和对话卡片的映射，不重复完整协议矩阵
- [x] 模型请求分析页与轨迹页能够展示同一请求证据，且现有原始证据查看能力保持可用
- [x] 相关测试、完整测试、类型检查和生产构建全部通过

## Comments

- 评审后修正（请求平面）：
  - `readCallId` 不再把裸 `id` 当调用标识。消息、Responses item 和 AI SDK part 都带自己的条目 id，
    按条目 id 配对等于按位置推断。新增 `readCallObjectId` 只在记录本身就是工具调用/工具结果对象时使用
    （OpenAI `tool_calls[i]`、Anthropic `tool_use` / `tool_result`、Gemini `functionCall` / `functionResponse`）。
  - 被工具结果切断的语义分片改为为每个贡献它的原始分块各留一条来源（真实路径 + 原始值只读引用），
    不再合成一个新数组当成“原始值”；消息级 `tool_calls` 的分片来源指向整条原始消息，不再是 `undefined`。
  - Responses 的 `input` 允许是单个条目对象，补齐了迁移时收窄的这一路覆盖。
