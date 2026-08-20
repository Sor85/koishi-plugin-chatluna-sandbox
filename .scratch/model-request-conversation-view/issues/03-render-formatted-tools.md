# 03 — 实现分析页 Tools 格式化工具列表

**What to build:** 让用户在模型请求分析页中以 AxonHub 风格快速扫描模型可用的工具目录，并展开单个工具查看完整描述和格式化 Parameters JSON Schema，同时能够从实际工具调用定位对应工具定义。

**Blocked by:** 01 — 建立模型请求对话归一化与响应证据模型

**Status:** resolved

- [x] Tools 区域位于 Messages 和 Response 之后
- [x] OpenAI tools、旧版 functions、Anthropic tools、Gemini functionDeclarations 和 AI SDK 工具均使用统一工具卡片展示
- [x] 工具定义保持请求体原始声明顺序，同名工具也不排序、不去重
- [x] 工具摘要行显示 SVG 工具图标、名称、描述摘要、顶层属性数量、必填字段和展开状态图标
- [x] 整条工具摘要行可切换展开状态，拖选文字不会触发展开或收起
- [x] 工具卡片默认折叠，Tools 区域默认可见
- [x] 展开态显示完整工具描述和 Parameters JSON Schema
- [x] Parameters JSON Schema 使用格式化只读 JSON 文本，不使用逐节点 JSON 树
- [x] Schema 超过 1200 字符时显示前 600 字符、渐隐遮罩和展开全部控制
- [x] Schema 标题附近显示低强调度原始源路径
- [x] Schema 摘要从顶层 properties 和 required 读取；缺失 properties 时显示 0 props，缺失 required 时不显示 required 摘要
- [x] 工具调用提供查看对应工具定义的定位入口
- [x] 定位工具定义时自动展开目标工具卡片、滚动到目标并短暂高亮，不改变发起跳转的消息卡片状态
- [x] 工具来源、原始顺序、摘要、展开、长 Schema 和调用定位均有外部行为测试

## Answer

已实现保持原始声明顺序的 Tools 卡片目录、摘要信息、格式化 Parameters Schema、长 Schema 折叠及调用到定义的定位。唯一工具名精确定位；同名定义不猜测对应关系，而是展开全部匹配项并定位 Tools 区域。外部行为测试和浏览器定位验收均通过。
