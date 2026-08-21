# 统一模型证据语义投影规格

Status: ready-for-agent

## Problem Statement

模型请求轨迹与模型请求对话视图目前分别解释同一份模型请求记录。两套实现各自识别 OpenAI、Anthropic、Gemini、Responses、AI SDK、JSON、SSE 和文本响应，并分别处理 System、请求消息、工具定义、工具调用、工具结果、模型响应和原始模型证据。

这种结构已经让用户看到同一份原始模型证据在不同视图中产生不同结果：同一个 Gemini System 分片需要在分析视图与轨迹中分别修复；Responses `input`、AI SDK typed parts 和响应工具结果的覆盖范围不一致；轨迹组成图与分析导航还会按各自规则重新计算事件序号和定位目标。用户无法确信轨迹行、组成分段和分析卡片描述的是同一事实，维护者也必须在多个 module 中重复修改并验证相同协议规则。

用户需要模型请求轨迹与模型请求对话视图通过同一个证据解释 seam 读取模型请求记录，使所有视图共享相同的消息边界、工具语义、响应事实、原始来源和稳定身份，同时继续保留模型请求记录作为权威事实，不引入新的持久化副本或外部协议。

## Solution

建立一个读取时运行的模型证据投影 module。它通过一个小 interface 接收请求体、响应原文和响应 transport 格式，使用内部 shape-driven adapter 将现有模型请求协议解释为三个相互独立且保持内部顺序的证据平面：请求消息、工具定义和响应语义事件。

每个规范项都提供确定性的证据身份、语义种类以及一个或多个原始模型证据来源。局部损坏、不支持和结构歧义通过结构化诊断返回；能够证明的其他内容继续投影。module 不根据 provider、域名、工具名称、相邻位置或未知 SSE 内容猜测语义。

模型请求轨迹和模型请求对话视图成为该 interface 的下游 adapter。轨迹只负责会话聚合、请求边界、时间与组成统计；对话视图只负责卡片模型、搜索与原始证据展示；分析导航和轨迹显示投影共同使用证据身份完成跨视图定位。旧协议解析按请求证据、响应证据和稳定身份三个阶段直接替换并删除，不保留双解析或兼容 fallback。

## User Stories

1. As a 模型请求复盘人员, I want 模型请求轨迹与模型请求对话视图解释出相同的请求消息, so that 我不会在两个视图中看到互相矛盾的上下文
2. As a 模型请求复盘人员, I want 同一条证据在轨迹、组成图和分析卡片中具有稳定身份, so that 点击和定位不会因分组序号不同而跳到错误内容
3. As a 模型请求复盘人员, I want 每条规范消息能够回到原始模型证据, so that 我可以核对格式化内容是否忠实于请求体
4. As a 模型请求复盘人员, I want 合并后的流式响应保留所有原始来源, so that 我可以追溯正文来自哪些 SSE payload
5. As a 模型请求复盘人员, I want 顶层 System 内容和请求消息保持其协议语义顺序, so that 我能准确复盘模型实际收到的上下文
6. As a 模型请求复盘人员, I want 多个 System 来源保持独立边界, so that 不同字段或分片不会被错误合并
7. As a 模型请求复盘人员, I want user、assistant 和 tool 请求消息保持原始消息边界, so that 对话历史不会被平铺后失去角色关系
8. As a 模型请求复盘人员, I want 消息内文本、图片、文件、音频、视频和其他内容分片保持顺序, so that 多模态上下文能够按原始结构阅读
9. As a 模型请求复盘人员, I want 工具定义与请求消息保持为不同证据平面, so that 能力目录不会被伪装成对话消息
10. As a 模型请求复盘人员, I want 工具定义保持原始声明顺序, so that 同名或相似工具仍可按原始证据区分
11. As a 模型请求复盘人员, I want assistant 工具调用保留在其明确的消息上下文中, so that 我能知道哪个模型输出发起了调用
12. As a 模型请求复盘人员, I want 工具结果只在存在明确证据时显示, so that 页面不会把推测结果当作事实
13. As a 模型请求复盘人员, I want 工具调用与工具结果只通过明确调用标识关联, so that 同名工具或相邻事件不会产生错误配对
14. As a 模型请求复盘人员, I want 模型响应正文与请求消息保持分离, so that 我能区分输入证据与本次输出证据
15. As a 模型请求复盘人员, I want 模型思考内容作为响应证据保留, so that 轨迹和响应卡片能够引用相同事实
16. As a 模型请求复盘人员, I want 模型结束原因作为响应证据保留, so that 我能判断一次请求为何停止
17. As a 模型请求复盘人员, I want 响应中的工具调用和工具结果在轨迹与响应卡片中一致, so that 工具交互不会只出现在其中一个视图
18. As a 模型请求复盘人员, I want 响应体中的用量作为候选证据保留, so that现有用量优先级可以在缺少标准化值时继续回退
19. As a 模型请求复盘人员, I want JSON 响应得到结构化解释, so that 常见非流式响应能够直接复盘
20. As a 模型请求复盘人员, I want TEXT 响应保留为可见正文及原始证据, so that 非 JSON 模型响应不会被判定为空
21. As a 模型请求复盘人员, I want SSE transport 保留事件顺序, so that 流式响应能够按实际接收顺序核对
22. As a 模型请求复盘人员, I want 已知协议的 SSE delta 被正确合并, so that 格式化正文不会显示重复或残缺片段
23. As a 模型请求复盘人员, I want 累计 SSE 快照被去重, so that 同一工具结果或正文不会重复出现
24. As a 模型请求复盘人员, I want 未知 SSE payload 明确显示为未识别证据, so that 系统不会通过字符串拼接猜测模型输出
25. As a 模型请求复盘人员, I want 局部损坏的响应仍显示其他可证明内容, so that 一个坏字段不会让整条记录无法复盘
26. As a 模型请求复盘人员, I want 完全无法识别的结构返回明确诊断, so that 我能区分空响应、损坏响应和未支持协议
27. As a 模型请求复盘人员, I want 同时包含多个主要请求容器的记录报告结构歧义, so that 系统不会静默混合两套对话上下文
28. As a 模型请求复盘人员, I want 同一响应节点被多个协议形状匹配时报告歧义, so that 重复内容不会被误认为多个模型事件
29. As a 模型请求复盘人员, I want OpenAI Chat Completions 证据在所有视图中一致, so that常见请求格式能够稳定复盘
30. As a 模型请求复盘人员, I want OpenAI Responses 的 input、function call 和 function call output 在所有视图中一致, so that Responses 请求不会只在分析页可见
31. As a 模型请求复盘人员, I want Anthropic Messages 的 System、thinking、tool use 和 tool result 在所有视图中一致, so that Anthropic 证据边界不会漂移
32. As a 模型请求复盘人员, I want Gemini generateContent 的 systemInstruction、contents、functionCall 和 functionResponse 在所有视图中一致, so that Gemini System 和工具事件不会重复修复
33. As a 模型请求复盘人员, I want AI SDK typed parts 保持原始顺序, so that 工具结果前后的语义分片不会被重新排列
34. As a 模型请求复盘人员, I want 自定义域名、IP 网关和 OpenAI 兼容网关按证据结构识别, so that provider 展示标签不会决定错误的协议解释
35. As a 模型请求复盘人员, I want pending、error、complete 和 unavailable 生命周期继续准确显示, so that证据投影不会改变模型请求记录状态
36. As a 模型请求复盘人员, I want 最终 Token 用量继续遵循现有来源优先级, so that架构重构不会改变统计结果
37. As a 模型请求复盘人员, I want 会话轨迹继续按逻辑会话聚合模型请求记录, so that共享投影不会改变会话范围
38. As a 模型请求复盘人员, I want 请求时间跨度和进行中状态继续使用实际记录证据, so that投影不会虚构 TTFT 或解码阶段
39. As a 模型请求复盘人员, I want 请求组成统计基于统一消息和工具证据, so that组成图与分析卡片数量保持一致
40. As a 模型请求复盘人员, I want 搜索结果覆盖统一投影中的正文、工具和响应内容, so that同一关键词不会因视图不同而消失
41. As a 模型请求复盘人员, I want 自动刷新后同一证据保持稳定定位, so that pending 请求完成时页面不会跳到另一条内容
42. As a 模型请求复盘人员, I want 原始 JSON、SSE 和文本查看能力保持不变, so that格式化投影始终可以被原文验证
43. As a 维护者, I want 所有模型协议知识集中在一个 module, so that新增或修复协议结构时只修改一个 implementation
44. As a 维护者, I want 调用方只学习一个模型证据投影 interface, so that轨迹和对话视图不需要理解 adapter 注册与选择规则
45. As a 维护者, I want 请求、响应和 transport adapter 保持为 internal seam, so that多个真实实现可以独立测试而不扩大外部 interface
46. As a 维护者, I want 证据投影 module 同时可在服务端和浏览器运行, so that服务器轨迹与客户端对话视图可以复用同一实现
47. As a 维护者, I want 共享 module 不依赖 Node、Koishi、Vue 或 DOM, so that它不会破坏服务端、生产客户端或开发模式构建
48. As a 维护者, I want 协议识别按结构而不是 provider 选择, so that展示标签、域名和代理部署不会成为隐含协议契约
49. As a 维护者, I want 每个规范项携带结构化来源而不是展示目标, so that原始证据 locality 不依赖 DOM 或 CSS
50. As a 维护者, I want 结构化诊断不包含页面文案, so that同一诊断可以被服务器测试和不同客户端呈现
51. As a 维护者, I want 投影 interface 不接收空间、状态、耗时和最终 usage, so thatmodule interface 与其协议语义职责保持一致
52. As a 维护者, I want 投影使用只读原始引用而不是深拷贝大响应, so that重构不会不必要地放大内存开销
53. As a 维护者, I want 投影 module 不引入全局缓存, so that不存在难以验证的缓存失效和跨记录污染
54. As a 维护者, I want 请求或响应平面在迁移完成时立即删除旧解析, so that两套实现不会继续漂移
55. As a 维护者, I want 每个迁移阶段都通过完整外部行为验证, so that请求、响应和定位可以独立回归
56. As a 测试作者, I want 一个集中协议 fixture 矩阵, so that同一协议事实不需要在多个测试套件重复编码
57. As a 测试作者, I want 协议测试通过最高的模型证据投影 seam, so that测试不会锁定 internal adapter 函数
58. As a 测试作者, I want 下游测试只验证轨迹、卡片和导航映射, so that重构 internal implementation 不需要改写大量测试
59. As a 测试作者, I want 跨视图契约测试验证相同 evidenceId, so that轨迹点击和分析定位的漂移能够直接变红
60. As a Reviewer, I want 删除依赖源码字符串和私有变量的协议断言, so that评审关注 module interface 的实际行为
61. As a future Agent, I want 协议事实、显示投影和交互状态具有清晰 locality, so that修改模型请求功能时能快速找到正确 module
62. As a future Agent, I want ADR 解释为何不能按 provider 分派或持久化投影, so that未来不会重新引入已拒绝的浅 seam
63. As a plugin developer, I want 模型请求采集、持久化和 Console RPC 保持不变, so that插件集成不会因内部投影重构而改变
64. As a Chrome user, I want 轨迹与分析导航在重构后正常工作, so that现有浏览器工作流不受影响
65. As a Firefox user, I want 轨迹与分析导航在重构后正常工作, so that跨浏览器复盘能力保持一致

## Implementation Decisions

- 模型请求记录及其中的原始模型证据继续作为权威事实。模型证据投影是读取时的内部 module，不是新的领域概念、持久化对象或外部协议。
- 模型证据投影 module 提供唯一 external seam。入口接收一条记录的证据切片，只包含请求体、响应原文和响应 transport 格式。
- interface 不接收 provider、URL、模型请求生命周期、HTTP 状态、空间归属、耗时或最终用量。这些事实由现有模型请求记录和读取 module 继续拥有。
- 投影输出包含三个独立平面：有序请求消息、有序工具定义和有序响应语义事件。不同平面之间不建立虚假的总顺序。
- 请求消息保留角色、消息边界和有序内容分片。System、user、assistant 和 tool 继续使用项目领域语言定义的请求消息语义。
- 工具定义保持独立于请求消息，并保留原始声明顺序。工具定义不得被投影为 System 或其他对话消息。
- 响应语义事件覆盖可见正文、思考内容、工具调用、工具结果、结束原因和响应体中能够证明的用量候选。
- 每个规范项提供确定性的 evidenceId。身份由请求或响应区域、原始结构路径和语义种类派生，不持久化，也不使用角色内序号作为身份。
- 每个规范项必须携带至少一个原始模型证据来源。来源包含请求或响应区域、原始结构路径及对应原始值的只读引用。
- 由多个流式 payload 合并的规范项保留多个来源。不存在来源的内容不得进入投影。
- 解析允许部分成功。能够证明的证据继续返回，不支持、损坏和歧义通过结构化诊断暴露。
- 结构化诊断至少表达诊断代码、严重程度和来源；不包含页面展示文案，也不以内部异常作为正常不支持协议的 interface。
- 协议识别采用多个 shape-driven internal adapter。provider、域名、IP、模型名称和未持久化的协议枚举均不得作为 adapter 选择依据。
- 请求侧从 `messages`、`contents` 或 `input` 中选择一个主要会话容器。顶层 System 和工具定义作为正交证据独立提取。
- 多个主要请求容器同时存在时使用确定性的结构优先级，并返回歧义诊断；不得把多个会话容器静默拼接。
- 响应侧先由 transport adapter 解析 JSON、TEXT 或 SSE，再由语义 adapter 解释每个 payload。
- 每个响应语义 payload 只由一个最具体的 adapter 负责。包装 adapter 可以显式委托子 payload，用量等正交元数据可以独立提取。
- 同一响应节点被多个同等可信 adapter 匹配时保留为未知证据并返回歧义诊断，不合并重复推测结果。
- 已知协议 adapter 负责合并 delta 和去重累计 SSE 快照，同时保留参与合并的全部来源。
- 未知 SSE payload 保持未识别状态，不通过通用字符串拼接、字段邻近或跨事件猜测语义。
- 工具调用和工具结果统一保存显式调用标识、工具名称与来源。只有明确调用标识匹配时才建立关系；不得按名称或出现位置推断。
- 请求、响应和 transport adapter 是 implementation 内部 seam。调用方不直接注册、选择或调用具体 adapter。
- 共享 implementation 使用浏览器安全的纯 TypeScript，不依赖 Node、Koishi、Vue、DOM 或平台全局对象，并进入现有服务端和客户端构建图。
- 共享投影每次处理当前可用证据，不公开“只解析请求”或“只解析响应”的模式参数。
- 投影不深拷贝原始请求和响应子树；规范项持有只读引用。module 不实现全局缓存，调用方可按记录身份进行局部 memoize。
- 模型请求轨迹 module 使用规范投影生成轨迹行和请求组成统计，并继续负责按逻辑会话聚合记录、最多读取现有上限内的请求、生成请求边界及基于实际证据的时间跨度。
- 模型请求对话视图 adapter 使用规范投影生成卡片模型、搜索文本、原始证据展示和可渲染状态，不再读取协议特定字段。
- 分析导航与轨迹显示投影使用 evidenceId 关联组成分段、轨迹行和分析目标，不再分别计算角色内 indexInKind 作为跨视图契约。
- 最终模型用量继续遵循现有规则：优先采用模型请求详情中的标准化用量，缺失时才使用投影从响应体提取的候选。
- 模型请求 pending、error、complete、unavailable 状态继续由模型请求记录及现有读取 module 决定；证据投影不得覆盖生命周期事实。
- 迁移分为三个行为完整的 tracer bullet：请求证据及两个调用方、响应证据及两个调用方、稳定 evidenceId 及跨视图导航。
- 每个证据平面迁移完成时删除对应旧协议解析与旧测试契约，不保留双解析、兼容 fallback 或按旧输出重试。
- 已知不一致以权威证据规则为准，不要求旧输出逐字兼容。Responses input、AI SDK typed parts、Gemini System 和明确响应工具结果应在轨迹与模型请求对话视图中获得一致支持。
- 本次工作不改变页面视觉结构；任何必要的显示模型调整都应复用现有 Vue、shadcn-vue、Tabler SVG 图标和项目样式命名空间。

## Testing Decisions

- 好测试通过最高可用 module interface 观察外部行为，不直接调用 internal adapter，不断言私有函数、局部变量、源码排列或任意实现细节。
- 最高程序化测试 seam 是模型证据投影 interface。协议 fixture 输入证据切片，断言请求消息、工具定义、响应事件、evidenceId、来源和诊断。
- 集中 fixture 矩阵覆盖 OpenAI Chat Completions、OpenAI Responses、Anthropic Messages、Gemini generateContent 和 AI SDK。
- 请求证据测试覆盖多个顶层 System 来源、messages/contents/input 选择、角色顺序、AI SDK typed parts、多模态内容、工具定义来源、工具调用和明确工具结果。
- 请求证据测试覆盖多个主要会话容器同时存在的歧义，并断言不会静默混合上下文。
- 响应证据测试覆盖 JSON、TEXT 和 SSE transport，以及 OpenAI choices、Responses output、Anthropic content 和 Gemini candidates 等已支持结构。
- SSE 测试覆盖 delta 合并、累计快照去重、event/data 顺序、多来源 provenance、损坏事件、未知事件和完成标记。
- 响应测试覆盖正文、思考、工具调用、工具结果、结束原因、用量候选、纯文本响应、空响应和损坏 JSON。
- 工具关系测试断言仅显式调用标识能够关联调用与结果；同名、相邻和缺少标识的事件不得自动配对。
- 来源测试断言每个规范项都能回到请求或响应区域的具体原始路径；合并事件保留全部来源。
- evidenceId 测试断言相同原始证据得到确定性身份，不同语义项即使共享父节点也不会冲突。
- 诊断测试覆盖 unsupported、malformed 和 ambiguous 类别，并验证局部错误不会删除其他可证明证据。
- 模型请求轨迹测试只验证规范投影到请求边界、轨迹行、会话聚合、时间和组成统计的映射，不重复完整协议矩阵。
- 模型请求对话视图测试只验证规范投影到消息卡片、响应卡片、工具卡片、搜索文本及原始证据状态的映射。
- 分析导航和轨迹显示测试验证组成分段、轨迹行与分析目标共享同一 evidenceId，并覆盖请求与响应工具事件。
- 工作台集成测试覆盖选择轨迹事件、定位分析卡片、打开关联请求、返回轨迹、自动刷新及滚动状态恢复。
- 协议行为不得依赖读取 Vue 或 TypeScript 源码字符串的测试。仍有价值的视觉结构和 CSS 契约测试可保留，但不能替代 interface 行为测试。
- 现有模型请求记录、模型请求持久化、Console、MCP、用量和采集测试继续作为回归 prior art，证明本次重构没有改变外部记录契约。
- 每个 tracer bullet 先运行新增及相关模型请求测试，再运行完整 `yarn test`、`yarn typecheck` 和 `yarn build`。
- 完成跨视图身份迁移后，在真实 Koishi 开发环境验证模型请求分析页和轨迹页；Chrome 与 Firefox 都需覆盖请求、响应、工具事件、搜索、定位和 pending 自动刷新。
- 浏览器验证结束后关闭自动化会话，并清理工具生成的临时目录；开发服务可按项目规则保留并报告准确地址。

## Out of Scope

- 不改变模型请求记录的持久化 Schema、容量策略、回收规则、分页游标或空间隔离。
- 不新增、删除或修改 Console RPC、MCP 工具或外部测试控制端点。
- 不改变模型请求采集器、ChatLuna fetch 包装、Undici 观测、请求脱敏或响应 clone 行为。
- 不改变模型请求的 provider 推断、模型名称推断或 URL 规范化逻辑；这些字段也不参与协议 adapter 选择。
- 不改变模型请求生命周期状态、HTTP 状态、空间归属、逻辑会话归属或测试关联标识。
- 不改变 ChatLuna usage 的关联策略及标准化用量优先级。
- 不新增模型请求重放、编辑、重试、删除单条记录或修改原始模型证据的能力。
- 不持久化模型证据投影、evidenceId、诊断或任何视图专用模型。
- 不把模型证据投影 interface 发布为插件对外公共接口。
- 不引入协议插件注册、运行时第三方 adapter、动态加载或配置式协议优先级。
- 不新增当前已支持协议之外的模型供应商能力；本次只统一现有协议覆盖并修正两个视图的不一致。
- 不改变会话轨迹的聚合上限、记录生命周期或时间证据规则。
- 不推断缺失的工具执行、工具结果、上下文压缩、子任务、TTFT、解码阶段或嵌套调用关系。
- 不进行模型请求工作台视觉重设计、导航重排、颜色调整或新的交互功能。
- 不引入全局投影缓存、持久缓存、worker 或额外性能基础设施。
- 不进行模型请求功能之外的 opportunistic 重构或文件重组。

## Further Notes

- ADR-0054 继续定义模型请求记录的独立持久化和分页语义。
- ADR-0057 继续定义模型请求轨迹是从模型请求记录读取时派生的视图，不是独立持久化事实。
- ADR-0059 继续定义标准化 ChatLuna 用量优先于响应体用量候选。
- ADR-0061 是本规格的架构来源，记录共享模型证据投影、shape-driven adapter、证据来源和直接替换策略。
- `CONTEXT.md` 不新增“规范模型证据”词条；模型请求记录、原始模型证据、模型请求轨迹、模型请求对话视图、请求消息、模型响应、工具定义、工具调用和工具结果继续作为领域语言。
- 测试 seam 已在规格前确认：唯一最高 seam 是模型证据投影 interface；轨迹和模型请求对话视图是该 seam 的下游 adapter。
- 本插件尚未首次公开发布，因此迁移不为仓库内旧解析结果保留兼容层。
- 本规格应继续通过 `/to-tickets` 拆成依赖明确的 tracer-bullet Issue，再由独立 `/implement` 会话按阻塞关系实施。
