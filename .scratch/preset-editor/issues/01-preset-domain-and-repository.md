# Build preset document repository

Status: resolved

## Goal

实现核心/Character YAML 文档解析、变量范围、目录列表与安全 CRUD。

## Acceptance

- 仅管理两个固定根目录下的 `.yml` 普通文件。
- 保存原始源码并使用 revision 冲突检查。
- 创建、保存、重命名、删除具备路径和 symlink 防护。
- 变量表达式精确高亮，控制标签不可点击。
- 测试覆盖解析与文件操作。

## Comments

- 2026-08-22：完成 `src/presets/` 深模块，公开源文档解析与文件系统仓库 interface。
- 源文档解析使用 `yaml` 的语义节点和源码范围，仅提取核心 `prompts[*].content`/`format_user_prompt` 与 Character `system`/`input`；保留原始 YAML，支持双花括号转义、嵌套花括号/括号/引号，并区分可点击值表达式和不可点击控制标签。
- 文件仓库支持两个固定根目录的 `.yml` list/read/create/save/rename/delete，包含 SHA-256 revision、显式危险操作确认、basename/path/symlink 校验、同目录临时文件原子保存与失败清理；不检查或改写上游引用。
- 新增 `tests/preset-source-document.test.ts` 与 `tests/preset-repository.test.ts`；后续补齐 YAML CST 映射、CRLF/折叠/转义/Unicode/缩进/chomping，以及并发 revision、inode 和 symlink 换目标回归。
