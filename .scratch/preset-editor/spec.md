# 预设编辑与变量证据定位

Status: ready-for-agent

## Problem Statement

ChatLuna 核心预设与 chatluna-character 角色预设存放在 Koishi 数据目录的 YAML 文件中，目前沙盒无法直接查看、创建、编辑、重命名或删除这些文件，也无法把源码中的模板变量与模型实际收到的展开文本关联起来。

## Solution

在 ChatLuna Sandbox 左侧导航新增独立“预设”页面，分别管理 ChatLuna 核心预设和 Character 预设。页面使用完整 YAML 源码编辑器，保留未知字段、注释和顺序；只管理 `.yml` 文件，不显示旧 `.txt` 预设。

编辑器高亮 ChatLuna 单花括号模板表达式。值表达式可点击：服务端在当前空间、当前虚拟 OneBot 机器人和当前逻辑会话内，查找使用该预设快照的最新模型请求，并把表达式定位到请求消息中的精确文本范围；控制标签仅高亮。无法唯一匹配时明确提示，不降级为伪精确跳转。

文件系统仍是预设正文的权威来源；模型请求记录中的运行时预设快照只用于证明某次请求使用了哪份模板，实际展开结果仍以模型请求 HTTP 证据为准。

## Implementation Decisions

- 核心预设根目录为 `data/chathub/presets`，Character 根目录为 `data/chathub/character/presets`。
- 核心与 Character 是两种独立文档类型，不相互猜测或转换。
- 保存原始 YAML 字符串，不 parse/re-serialize；使用 revision 做乐观并发控制，并以同目录临时文件 + rename 原子替换。
- 创建、重命名、删除均受 basename/path/symlink 校验；重命名或删除可能仍被上游引用时允许用户二次确认，不自动修改上游引用。
- 请求采集时附加活动运行时预设快照；列表只返回摘要，详情保留模板单元，避免列表放大。
- 表达式匹配使用快照中的模板与共享模型证据投影，按角色、字面锚点和表达式序号求精确范围，不按变量值做全局字符串搜索。
- 跨页面导航是客户端瞬时意图：打开指定模型请求、切到分析视图、展开并高亮精确文本范围。
- `{if}`、`{for}`、`{while}`、`{repeat}` 及分支/结束标签不直接产生值，只高亮不可点击。
- 歧义匹配显示错误，不提供候选选择器。

## Testing Decisions

- 纯模块测试覆盖 YAML 模板字段、表达式范围、转义、控制标签和诊断。
- 仓库测试覆盖目录隔离、symlink、revision 冲突、原子写、CRUD 和失败不破坏原文件。
- 运行时关联测试覆盖核心/Character 事件、并发机器人/空间、回合生命周期和快照拷贝。
- 证据匹配测试覆盖重复变量、重复值、空输出、连续表达式和多协议请求投影。
- Console RPC、WorkspacePort、跨页面导航和 occurrence-aware locator 均通过各自 interface 验证。
- 完成后运行 `yarn test`、`yarn typecheck`、`yarn build`。

## Out of Scope

- 不管理旧 `.txt` 预设。
- 不自动迁移或重写 ChatLuna 配置、数据库会话中的预设引用。
- 不提供本地近似渲染预览；模型请求证据才是最终展开事实。
- 不从 system 消息内容反推预设身份。

Triage: ready-for-agent
