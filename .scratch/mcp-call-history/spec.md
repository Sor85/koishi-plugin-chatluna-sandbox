# MCP 调用历史页

Status: ready-for-agent

## Problem Statement

外部测试控制器每次调用 MCP 工具时，服务端只在内存中留下摘要（工具名、凭证名、耗时、状态）。WebQQ 没有入口查看这些测试调用记录，也无法核对脱敏后的参数、返回值和错误，导致自动化失败只能靠 OneBot 调试或模型请求间接推断。

## Solution

在 WebQQ 最左侧导航新增独立「MCP 调用」页，读取同一套测试调用记录。列表展示摘要，点开详情查看脱敏参数、返回值和错误；Token、授权头、确认令牌和二进制媒体保持脱敏，消息正文默认省略。记录仍使用有界内存缓冲，不写入沙盒场景，也不能重放。

## Implementation Decisions

- 继续使用测试调用记录这一领域对象；不引入第二套 MCP 日志。
- 列表只返回摘要，单条详情返回脱敏参数、结果和错误结构。
- 记录在凭证鉴权成功后写入，包含权限、限流、参数和工具执行失败；无效 Bearer 不写入。
- `spaceId` 取自调用参数或创建空间的返回值；未指定空间的读取类调用保持为空。
- WebQQ 经 Console RPC 读取，不走 MCP 工具，因此刷新页面不会污染记录。
- 主环境导航可见；进入 AI 测试空间后不展示，避免与空间内聊天工作台抢入口。
- 筛选按工具、凭证名称、空间、测试关联标识和错误状态执行。

## Testing Decisions

- `SandboxMcpService` 的 `callTool` / 列表 / 详情 / 清理是服务端缝。
- Console RPC 与 WorkspacePort 验证 WebQQ 读取路径。
- 页面装配测试覆盖导航、独立视图、筛选和详情展示。
- 完成后运行 `yarn test`、`yarn typecheck`。

## Out of Scope

- 不持久化测试调用记录。
- 不提供记录重放。
- 不在详情中展开完整 Base64 媒体或 Bearer Token。

Triage: ready-for-agent
