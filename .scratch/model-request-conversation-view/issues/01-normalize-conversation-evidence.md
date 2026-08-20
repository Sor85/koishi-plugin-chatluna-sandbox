# 01 — 建立模型请求对话归一化与响应证据模型

**What to build:** 让模型请求记录中的请求体和响应体能够统一转换为模型请求对话视图数据，使上层分析视图可以稳定读取请求消息、模型响应、工具定义、源路径、原始模型证据和解析状态，而不需要理解各模型协议的字段差异。

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] OpenAI Chat Completions 请求能够归一化为连续编号的 system、user、assistant 和 tool 请求消息
- [x] OpenAI Responses 的 input、function_call 和 function_call_output 能够按消息及工具交互语义归一化
- [x] Anthropic Messages 的顶层 system、thinking、tool_use 和 tool_result 能够按既定边界归一化
- [x] Gemini generateContent 的 systemInstruction、contents、functionCall 和 functionResponse 能够按既定边界归一化
- [x] AI SDK 的 typed parts、工具调用和工具结果能够按既定边界归一化
- [x] 多个顶层 system 来源分别生成独立 system 请求消息，并保留字段内部的原始分片顺序
- [x] 文本、图片、文件、音频及其他多模态分片保持原始顺序，并拒绝把 HTML 或 SVG 当作可执行内容
- [x] assistant 工具调用保留在 assistant 请求消息内，请求体中的明确工具结果生成独立 tool 请求消息
- [x] 工具定义统一提供名称、描述、参数 Schema、顶层属性数量、必填字段和原始源路径
- [x] 同时存在多种工具定义字段时按请求体原始声明顺序全部保留，不排序、不去重
- [x] JSON、SSE 和 TEXT 响应能够归一化为独立模型响应，并保留思考、正文、工具调用、工具结果、结束原因和用量
- [x] SSE 格式化结果能够合并增量内容，原始模型证据继续保留 event/data 边界
- [x] 用量优先采用模型请求记录中的标准化值，缺失时回退到响应解析结果
- [x] 每条请求消息、模型响应和工具定义均保留原始对象、数组源路径、来源类别和可搜索文本
- [x] 缺失工具结果或其他证据时不生成推断内容
- [x] 未知协议、损坏结构、缺失响应和响应解析失败均返回明确且可渲染的状态
- [x] 五类协议、源路径、工具语义、多模态、SSE、用量和失败状态均有外部行为测试

## Answer

已在 `client/webqq/model-request-conversation.ts` 建立统一请求/响应证据模型，覆盖 Chat Completions、Responses、Anthropic、Gemini 与 AI SDK，并通过 `tests/model-request-conversation.test.ts` 的 11 项外部行为测试验证协议顺序、原始路径、多模态、工具语义、SSE 去重、用量回退和失败状态。
