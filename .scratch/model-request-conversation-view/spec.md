## Problem Statement

模型请求详情的“请求体 → 分析”页面目前主要展示请求组成图和轨迹事件账本。点击 `SYSTEM`、`USER`、`TOOL DEFS`、`TOOL CALL` 等事件后，页面会打开通用的右侧 JSON 检查器。该检查器适合查看原始节点，但不适合快速阅读模型上下文、响应内容和工具定义；同时请求事件、工具目录和模型响应之间的关系不够直观。

用户需要一种接近 AxonHub Request Conversation Viewer 的请求复盘视图：保留请求分析中的轨迹信息，在压缩事件行后，把释放出的空间用于结构化消息卡片、独立响应卡片和格式化工具列表，并能够在格式化内容与原始证据之间切换。

## Solution

仅改造“模型请求 → 请求详情 → 请求体 → 分析”视图。保留全宽请求组成图、现有轨迹控制栏和事件账本，但将分析模式下的事件账本改为左侧固定宽度的分组导航，并把事件点击行为改为定位右侧新版卡片和具体内容分区。

右侧按 `Messages → Response → Tools` 展示：

- `Messages` 展示从请求体归一化得到的 system、user、assistant、tool 请求消息
- `Response` 展示当前模型响应的一张独立卡片，内部划分思考、正文、工具调用、工具结果、结束原因和用量
- `Tools` 展示请求体中的工具定义卡片，提供工具描述、参数摘要、必填字段和格式化 Parameters JSON Schema

新增客户端纯函数解析边界，统一支持 OpenAI Chat Completions、OpenAI Responses、Anthropic Messages、Gemini generateContent 和 AI SDK。解析结果保留原始对象、源路径、来源类别和可搜索文本。格式化卡片支持长文本折叠、图片预览、搜索定位、分区高亮和卡片内原始 JSON 切换；完整请求 JSON 可以在右侧内容区整体切换查看。

独立“轨迹”页面不改变：其事件账本、右侧 JSON 检查器、打开原始请求、返回轨迹和状态恢复逻辑继续保留。

## User Stories

1. As a 模型请求复盘人员, I want to 在分析页看到请求体中的 system 消息, so that 我能快速确认模型收到的系统指令
2. As a 模型请求复盘人员, I want to 在分析页看到请求体中的 user 消息, so that 我能确认用户上下文是否完整
3. As a 模型请求复盘人员, I want to 在分析页看到请求体中的 assistant 消息, so that 我能复查历史模型输出和上下文拼接结果
4. As a 模型请求复盘人员, I want to 看到请求体中的 tool result 消息, so that 我能确认历史工具结果是否被继续传给模型
5. As a 模型请求复盘人员, I want to 看到模型响应独立于请求消息, so that 我能区分模型输入证据和本次输出证据
6. As a 模型请求复盘人员, I want to 在一张响应卡片内区分思考、正文、工具调用、工具结果、结束原因和用量, so that 我能完整理解一次模型响应
7. As a 模型请求复盘人员, I want to 查看请求体中的工具目录, so that 我能知道模型被暴露了哪些工具
8. As a 模型请求复盘人员, I want to 在工具列表中看到工具名称、描述、属性数量和必填字段, so that 我能快速扫描大量工具
9. As a 模型请求复盘人员, I want to 展开单个工具查看 Parameters JSON Schema, so that 我能核对工具参数约束
10. As a 模型请求复盘人员, I want to 查看工具定义的源路径, so that 我能回溯工具在原始请求中的位置
11. As a 模型请求复盘人员, I want to 点击左侧 system/user/assistant/tool 分组中的事件, so that 我能跳转到右侧对应内容
12. As a 模型请求复盘人员, I want to 点击响应事件, so that 我能跳转到本次响应卡片
13. As a 模型请求复盘人员, I want to 点击 TOOL DEFS, so that 我能跳转到 Tools 区域
14. As a 模型请求复盘人员, I want to 在定位后看到目标分区短暂高亮, so that 我能确认跳转成功
15. As a 模型请求复盘人员, I want to 定位到折叠内容时自动展开目标分区, so that 我能直接看到目标内容
16. As a 模型请求复盘人员, I want to 搜索左侧事件和右侧卡片, so that 我能在长请求中快速找到关键词
17. As a 模型请求复盘人员, I want to 搜索工具参数、工具结果、响应内容和 Schema, so that 我能搜索完整证据而不只搜索摘要
18. As a 模型请求复盘人员, I want to 未命中的事件和卡片降低透明度而不是消失, so that 我能保留上下文和定位关系
19. As a 模型请求复盘人员, I want to 长消息自动折叠, so that 超长系统指令不会挤压其他内容
20. As a 模型请求复盘人员, I want to 展开被折叠的完整消息, so that 我能查看全部原始语义内容
21. As a 模型请求复盘人员, I want to 消息卡片显示字符数量, so that 我能快速判断内容规模
22. As a 模型请求复盘人员, I want to 在格式化内容和原始 JSON 之间切换, so that 我能同时获得可读性和证据可验证性
23. As a 模型请求复盘人员, I want to 消息原始模式显示源路径, so that 我能把卡片内容对应回 request body
24. As a 模型请求复盘人员, I want to 查看完整请求 JSON, so that 解析失败或需要全局上下文时仍能检查原文
25. As a 模型请求复盘人员, I want to 响应原始模式保留 JSON、SSE 或 TEXT 的真实格式, so that 我能核对响应边界而不是只看归一化结果
26. As a 模型请求复盘人员, I want to SSE 响应保留 event/data 边界, so that 我能排查流式响应拼接问题
27. As a 模型请求复盘人员, I want to 远程图片和 Data URL 自动预览, so that 我能直接查看多模态请求中的图片
28. As a 模型请求复盘人员, I want to 图片加载失败时回退为 URL 或类型文本, so that 图片资源异常不会阻塞请求复盘
29. As a 模型请求复盘人员, I want to 查看 OpenAI Chat Completions 请求, so that 常见请求格式能被结构化展示
30. As a 模型请求复盘人员, I want to 查看 OpenAI Responses 请求, so that function_call 和 function_call_output 能被正确归一化
31. As a 模型请求复盘人员, I want to 查看 Anthropic Messages 请求, so that system、thinking、tool_use 和 tool_result 能被正确展示
32. As a 模型请求复盘人员, I want to 查看 Gemini generateContent 请求, so that systemInstruction、contents 和 functionResponse 能被正确展示
33. As a 模型请求复盘人员, I want to 查看 AI SDK 请求, so that typed parts 和 tool result 能被正确展示
34. As a 模型请求复盘人员, I want to 多个顶层 system 字段分别显示, so that 我能知道每条 system 内容的原始来源
35. As a 模型请求复盘人员, I want to 多个 system 卡片按连续编号显示, so that 每个卡片都有稳定的导航目标
36. As a 模型请求复盘人员, I want to assistant tool call 保留在 assistant 卡片内, so that 工具调用与发起它的 assistant 消息保持语义关联
37. As a 模型请求复盘人员, I want to 从 assistant tool call 跳转到对应工具定义, so that 我能核对调用参数与工具 Schema
38. As a 模型请求复盘人员, I want to 缺失 tool result 时不显示推测结果, so that 页面不会把推断内容伪装成事实
39. As a 模型请求复盘人员, I want to 请求边界显示序号、状态、模型、渠道和耗时, so that 我能识别当前请求上下文
40. As a 模型请求复盘人员, I want to pending 请求在自动刷新时原地更新, so that 我不需要重新定位正在查看的内容
41. As a 模型请求复盘人员, I want to 响应缺失和解析失败有明确状态, so that 我能区分尚未采集、不可用和解析错误
42. As a 模型请求复盘人员, I want to 分析页改造不影响独立轨迹页, so that 原有 JSON 检查和轨迹回溯能力继续可用
43. As a 模型请求复盘人员, I want to 在浅色主题下使用清晰的角色颜色, so that 我能快速区分不同来源
44. As a 模型请求复盘人员, I want to 在深色主题下仍能区分角色颜色, so that 夜间复盘不会丢失语义层级
45. As a 模型请求复盘人员, I want to 在窄屏下使用稳定的上下布局, so that 移动或窄窗口中内容仍可读

## Implementation Decisions

- 分析页面引入独立的客户端请求体 Conversation 归一化模块；组件只负责渲染和交互，不在 Vue 模板中直接实现协议解析
- 归一化输出包含规范化消息、独立模型响应、工具定义、原始对象、数组源路径、来源类型、可搜索文本和元数据
- 支持 OpenAI Chat Completions、OpenAI Responses、Anthropic Messages、Gemini generateContent 和 AI SDK
- 顶层 `system`、`systemInstruction`、`system_instruction` 等字段各自生成独立 system 卡片；字段内部多个文本块保持原始顺序并归入同一卡片
- 请求消息按规范化顺序从 `#0` 连续编号；响应卡片使用“本次响应”标题，不占请求消息编号
- 请求体 assistant tool call 保留在 assistant 卡片内部；请求体 tool result 作为独立 tool 消息；响应侧工具事件归入独立响应卡片
- 缺少实际响应证据时不推断 tool result
- 右侧固定排列为 `Messages`、`Response`、`Tools`
- 左侧分析导航固定宽度约 `260px`，按 `system → user → assistant → tool → 响应` 分组；空分组隐藏；请求边界行保留并定位到响应卡片
- 分析模式复用现有模型请求轨迹的请求组成图、控制栏、搜索和账本能力，通过显式 `analysis` 展示模式替换右侧检查器和点击目标；独立轨迹模式保持原实现
- 分析页搜索同时作用于左侧事件和右侧卡片，覆盖角色、预览、正文、reasoning、工具名称、参数、结果、响应、描述和 Schema；未命中内容降低透明度，命中折叠内容自动展开并定位第一个结果
- 事件定位会滚动到右侧具体卡片分区并短暂高亮；同一卡片承载多个事件时高亮对应分区
- 消息、reasoning、tool arguments、tool result、响应分区分别应用 `1200/600` 字符折叠规则；折叠态显示渐隐遮罩和展开按钮
- 消息和响应卡片右上角提供 SVG 原始内容切换按钮；消息切换到对应原始 JSON 节点，响应切换到原始 JSON、SSE 事件数组或纯文本；格式化和原始模式分别保存展开状态
- 完整请求 JSON 在右侧内容区整体切换显示，使用现有可折叠 JSON 树；左侧导航保留，再次切换恢复 Conversation 和滚动位置
- 消息原始内容和工具定义保留数组源路径并显示为低强调度路径标签
- Tools 区域按请求体原始顺序保留 `tools`、Gemini `functionDeclarations`、Anthropic tools、OpenAI functions 等工具定义，不排序、不去重
- 工具卡片采用图 19 的结构：摘要行显示工具图标、名称、描述摘要、顶层属性数量、必填字段和展开图标；点击整行展开，拖选文字不触发展开
- 工具展开态显示完整描述和格式化只读 `Parameters (JSON Schema)` 文本块；Schema 超过 `1200` 字符时按 `1200/600` 规则折叠；源路径显示在 Schema 标题附近
- assistant tool call 提供定位到 Tools 对应工具卡片的入口；定位后不自动返回 assistant 卡片
- 响应卡片内部按实际存在的内容显示思考、正文、工具调用、工具结果、结束原因和用量；完全无可展示内容时显示状态和原始响应入口
- Response 复用现有响应解析和 usage 标准化逻辑；优先使用记录详情的标准化 usage，缺失时回退到响应解析 usage
- SSE 响应合并增量内容用于格式化展示，原始模式保留完整 SSE 事件数组和 event/data 边界
- 多模态内容保持分片顺序；图片自动预览，最大约 `520px × 360px`，加载失败回退为 URL/类型文本；只渲染图片资源，不执行 HTML/SVG
- 角色颜色使用 system 紫色、user 蓝色、assistant 绿色、tool 橙色、响应青绿色，并适配浅色和深色主题
- 删除上一轮错误的独立 Conversation 概览组件及其错误布局样式，不保留兼容判断
- 不修改模型请求持久化结构，不新增 RPC，不改变独立轨迹页面的原始检查能力

## Testing Decisions

- 测试只验证外部行为和归一化结果，不依赖组件内部私有变量、DOM 实现细节或 CSS 选择器排列
- 为请求体归一化模块增加 OpenAI Chat Completions、OpenAI Responses、Anthropic、Gemini 和 AI SDK 的输入输出测试
- 覆盖顶层 system 字段拆分、连续编号、消息源路径、多模态分片顺序、assistant tool call、tool result、function_call/function_call_output、Gemini functionResponse、Anthropic tool_use/tool_result 和多工具来源
- 为响应适配层增加普通 JSON、SSE 和纯文本测试，覆盖 reasoning、正文、tool call/result、结束原因、usage、缺失响应和解析失败
- 覆盖长文本折叠、独立分区搜索、命中自动展开、卡片原始模式切换、完整请求 JSON切换、工具 Schema 折叠和工具定义跳转
- 覆盖请求组成图和左侧事件点击到右侧卡片分区的定位行为，包括请求边界、TOOL DEFS、assistant tool call 和响应事件
- 保留并扩展现有模型请求工作台测试，验证分析模式新增结构以及分析模式与独立轨迹模式的隔离
- 回归验证独立轨迹页面仍保留右侧 JSON 检查器、打开原始请求、返回轨迹和滚动状态恢复
- 按项目要求运行完整 `yarn test`、`yarn typecheck` 和 `yarn build`
- 浏览器验收覆盖完整 Koishi 开发环境、Chrome、Firefox、浅色、深色、窄屏、pending 自动刷新、图片预览和解析失败状态

## Out of Scope

- 不改变模型请求记录的持久化格式、容量策略或 RPC 协议
- 不改变模型请求采集器、ChatLuna 请求包装和响应采集行为
- 不改造独立“轨迹”页面，不删除其 JSON 检查器、打开原始请求或返回轨迹能力
- 不新增 Conversation 搜索筛选工具栏之外的全局筛选体系；本功能只复用并扩展分析页已有搜索
- 不推断缺失的工具执行、工具结果、压缩、子任务或响应内容
- 不执行请求体中的 HTML、SVG 或其他脚本内容
- 不实现模型请求重放、编辑、重试或修改原始证据
- 不在本功能中新增服务端数据模型或数据库迁移

## Further Notes

- 本功能参考 AxonHub Request Conversation Viewer 的信息架构和交互，但使用本项目自己的组件命名、样式命名空间、主题变量和 Tabler SVG 图标
- 领域边界记录在项目上下文中的“模型请求对话视图”“请求消息”“模型响应”“工具定义”“工具调用”“工具结果”和“原始模型证据”术语下
- 实现时优先复用现有 JSON 树、响应内容解析、usage 标准化、轨迹搜索和滚动定位能力
- AxonHub 的远程源码研究已确认其核心结构为请求体归一化、左侧角色导航、Messages 卡片、独立 Tools 列表和原始 JSON查看；本项目需结合自身请求/响应记录模型适配
- Triage: ready-for-agent
