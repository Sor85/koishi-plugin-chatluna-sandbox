# 02 — 通过 Console 和工作区端口暴露测试调用记录

**What to build:** 让 WebQQ 经 Console RPC 和 WorkspacePort 读取、筛选和清理测试调用记录，不经过 MCP 工具，因此刷新页面不会污染记录。

**Status:** resolved

- [x] Console 注册列表、详情和清理 RPC
- [x] WorkspacePort 不注入当前工作区 spaceId
- [x] 工作区控制器加载筛选记录并清理缓冲区
- [x] MCP 未初始化时 RPC 不注册
