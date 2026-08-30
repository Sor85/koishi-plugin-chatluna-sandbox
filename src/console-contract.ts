import type {
  BranchConversationInstanceInput,
  ClearConversationMessagesInput,
  ClearSandboxModelRequestRecordsResult,
  ClearSandboxOneBotDebugRecordsResult,
  CreateConversationInstanceInput,
  DeleteConversationInstanceInput,
  DeleteGroupAnnouncementInput,
  GetForwardMessageInput,
  GetMediaContentInput,
  GetMessageHistoryInput,
  GetSandboxOneBotDebugRecordInput,
  GetSandboxOneBotDebugRecordsInput,
  GetSandboxWorkspaceInput,
  ListSandboxModelRequestRecordsInput,
  ManageSandboxEnvironmentInput,
  PerformFriendActionInput,
  PerformGroupActionInput,
  ReadSandboxModelRequestRecordInput,
  ReadSandboxModelRequestTrajectoryInput,
  RecallMessageInput,
  RenameConversationInstanceInput,
  SandboxConsoleModelRequestDetail,
  SandboxConsoleModelRequestListItem,
  SandboxConsoleOneBotDebugRecord,
  SandboxConversationInstanceResult,
  SandboxForward,
  SandboxMediaContent,
  SandboxMessageHistory,
  SandboxMessageSearchResult,
  SandboxModelRequestRecordsPage,
  SandboxModelRequestScope,
  SandboxModelRequestTrajectory,
  SandboxOneBotDebugRecordsPage,
  SandboxWorkspaceState,
  SearchConversationMessagesInput,
  SendForwardMessageInput,
  SendMediaMessageInput,
  SendMessageInput,
  SetGroupAnnouncementInput,
  SetMessageReactionInput,
} from './types'
import type {
  CreatePresetInput,
  DeletePresetInput,
  LocateSandboxPresetExpressionInput,
  LocateSandboxPresetExpressionResult,
  PresetDocumentKind,
  ReadSandboxPresetInput,
  RenamePresetInput,
  SandboxPresetDocument,
  SavePresetInput,
} from './presets'
import type { ListSandboxMcpCallRecordsInput, SandboxMcpCallRecordsPage } from './mcp/call-records'
import type {
  SandboxMcpCallRecord,
  SandboxMcpCapabilityCatalog,
  SandboxMcpCreatedCredential,
  SandboxMcpPublicCredential,
  SandboxMcpScope,
} from './mcp/types'
import type { SandboxTestSpaceSummary } from './test-spaces'

/**
 * Console 契约：前后端之间端点名、入参、出参与广播载荷的唯一声明。
 *
 * 服务端的事件映射、对 `@koishijs/console` 的 `Events` 模块增强与客户端 `send` / `receive`
 * 的签名全部从这里派生，加端点只改这一处。本模块只有类型，不 import 控制服务，因此客户端
 * 引用它不会把服务端运行时拖进前端产物；入参与出参一律引用既有领域类型，不复制一份形状。
 *
 * 分组按 ADR-0074 的客户端端口能力书写，分组只是给读的人用的；端点集合是全体分组的并集。
 * 鉴权级别不进契约：它是注册时的策略，不是端点的形状。
 */

/** 端点入参统一允许定域到某个 AI 测试空间；省略时作用于主模拟 QQ 环境。 */
export type SpaceScoped<Input> = Input & { spaceId?: string }

/** 会话与消息：单个沙盒场景内部的会话读写、消息收发与媒体读取。 */
export interface SandboxConversationConsoleEvents {
  'chatluna-sandbox/workspace': (input?: SpaceScoped<GetSandboxWorkspaceInput>) => Promise<SandboxWorkspaceState>
  'chatluna-sandbox/message-history': (input: SpaceScoped<GetMessageHistoryInput>) => Promise<SandboxMessageHistory>
  'chatluna-sandbox/search-conversation-messages': (input: SpaceScoped<SearchConversationMessagesInput>) => Promise<SandboxMessageSearchResult>
  'chatluna-sandbox/send-message': (input: SpaceScoped<SendMessageInput>) => Promise<SandboxWorkspaceState>
  'chatluna-sandbox/create-conversation-instance': (input: SpaceScoped<CreateConversationInstanceInput>) => Promise<SandboxConversationInstanceResult>
  'chatluna-sandbox/branch-conversation-instance': (input: SpaceScoped<BranchConversationInstanceInput>) => Promise<SandboxConversationInstanceResult>
  'chatluna-sandbox/rename-conversation-instance': (input: SpaceScoped<RenameConversationInstanceInput>) => Promise<SandboxWorkspaceState>
  'chatluna-sandbox/delete-conversation-instance': (input: SpaceScoped<DeleteConversationInstanceInput>) => Promise<SandboxWorkspaceState>
  'chatluna-sandbox/send-media-message': (input: SpaceScoped<SendMediaMessageInput>) => Promise<SandboxWorkspaceState>
  'chatluna-sandbox/send-forward-message': (input: SpaceScoped<SendForwardMessageInput>) => Promise<SandboxWorkspaceState>
  'chatluna-sandbox/get-forward-message': (input: SpaceScoped<GetForwardMessageInput>) => Promise<SandboxForward>
  'chatluna-sandbox/recall-message': (input: SpaceScoped<RecallMessageInput>) => Promise<SandboxWorkspaceState>
  'chatluna-sandbox/clear-conversation-messages': (input: SpaceScoped<ClearConversationMessagesInput>) => Promise<SandboxWorkspaceState>
  'chatluna-sandbox/set-message-reaction': (input: SpaceScoped<SetMessageReactionInput>) => Promise<SandboxWorkspaceState>
  'chatluna-sandbox/media-content': (input: SpaceScoped<GetMediaContentInput>) => Promise<SandboxMediaContent>
}

/** 环境与关系：参与者目录、群公告与好友群关系的变更。 */
export interface SandboxEnvironmentConsoleEvents {
  'chatluna-sandbox/set-group-announcement': (input: SpaceScoped<SetGroupAnnouncementInput>) => Promise<SandboxWorkspaceState>
  'chatluna-sandbox/delete-group-announcement': (input: SpaceScoped<DeleteGroupAnnouncementInput>) => Promise<SandboxWorkspaceState>
  'chatluna-sandbox/manage-environment': (input: SpaceScoped<ManageSandboxEnvironmentInput>) => Promise<SandboxWorkspaceState>
  'chatluna-sandbox/friend-action': (input: SpaceScoped<PerformFriendActionInput>) => Promise<SandboxWorkspaceState>
  'chatluna-sandbox/group-action': (input: SpaceScoped<PerformGroupActionInput>) => Promise<SandboxWorkspaceState>
}

/** 调试记录：OneBot 调试记录的联邦读取与清理。 */
export interface SandboxDebugRecordConsoleEvents {
  'chatluna-sandbox/debug-records': (input?: SpaceScoped<GetSandboxOneBotDebugRecordsInput>) => Promise<SandboxOneBotDebugRecordsPage<SandboxConsoleOneBotDebugRecord>>
  'chatluna-sandbox/debug-record': (input: SpaceScoped<GetSandboxOneBotDebugRecordInput>) => Promise<SandboxConsoleOneBotDebugRecord>
  'chatluna-sandbox/clear-debug-records': (input?: { spaceId?: string }) => Promise<ClearSandboxOneBotDebugRecordsResult>
}

/** 模型请求：记录列表、详情、轨迹与清理；定域由入参自带的 scope 表达，不走 spaceId 注入。 */
export interface SandboxModelRequestConsoleEvents {
  'chatluna-sandbox/model-request-records': (input: ListSandboxModelRequestRecordsInput) => Promise<SandboxModelRequestRecordsPage<SandboxConsoleModelRequestListItem>>
  'chatluna-sandbox/model-request-record': (input: ReadSandboxModelRequestRecordInput) => Promise<SandboxConsoleModelRequestDetail>
  'chatluna-sandbox/model-request-trajectory': (input: ReadSandboxModelRequestTrajectoryInput) => Promise<SandboxModelRequestTrajectory>
  'chatluna-sandbox/clear-model-request-records': (input: SandboxModelRequestScope) => Promise<ClearSandboxModelRequestRecordsResult>
}

/** 预设：ChatLuna 预设文档的读取、编辑与表达式定位。 */
export interface SandboxPresetConsoleEvents {
  'chatluna-sandbox/preset-catalog': (input?: { kind?: PresetDocumentKind }) => Promise<SandboxPresetDocument[]>
  'chatluna-sandbox/preset-read': (input: ReadSandboxPresetInput) => Promise<SandboxPresetDocument>
  'chatluna-sandbox/preset-create': (input: CreatePresetInput) => Promise<SandboxPresetDocument>
  'chatluna-sandbox/preset-save': (input: SavePresetInput) => Promise<SandboxPresetDocument>
  'chatluna-sandbox/preset-rename': (input: RenamePresetInput) => Promise<SandboxPresetDocument>
  'chatluna-sandbox/preset-delete': (input: DeletePresetInput) => Promise<{ deleted: true }>
  'chatluna-sandbox/preset-locate-expression': (input: LocateSandboxPresetExpressionInput) => Promise<LocateSandboxPresetExpressionResult>
}

/**
 * MCP 管理：调用记录、能力目录、凭证与服务器活动。
 *
 * `mcp-activity` 同时是请求端点与广播频道，这不是重复：一个回答「现在跑着吗」，
 * 一个通知「状态变了」，因此两者各自登记。
 */
export interface SandboxMcpConsoleEvents {
  'chatluna-sandbox/mcp-call-records': (input?: ListSandboxMcpCallRecordsInput) => SandboxMcpCallRecordsPage
  'chatluna-sandbox/mcp-call-record': (input: { recordId: string }) => SandboxMcpCallRecord
  'chatluna-sandbox/clear-mcp-call-records': () => { cleared: number }
  'chatluna-sandbox/mcp-activity': () => SandboxMcpActivityPayload
  'chatluna-sandbox/mcp-capabilities': () => SandboxMcpCapabilityCatalog
  'chatluna-sandbox/mcp-credentials': () => SandboxMcpPublicCredential[]
  'chatluna-sandbox/create-mcp-credential': (input: { name: string; scopes: SandboxMcpScope[] }) => SandboxMcpCreatedCredential
  'chatluna-sandbox/update-mcp-credential': (input: { id: string; name?: string; scopes?: SandboxMcpScope[] }) => SandboxMcpPublicCredential
  'chatluna-sandbox/rotate-mcp-credential-token': (input: { id: string }) => SandboxMcpCreatedCredential
  'chatluna-sandbox/set-mcp-credential-enabled': (input: { id: string; enabled: boolean }) => void
  'chatluna-sandbox/revoke-mcp-credential': (input: { id: string }) => void
}

/** 测试空间：AI 测试空间自身的存在与归属。 */
export interface SandboxTestSpaceConsoleEvents {
  'chatluna-sandbox/test-spaces': () => SandboxTestSpaceSummary[]
  'chatluna-sandbox/create-test-space': (input: { name?: string }) => SandboxTestSpaceSummary
  'chatluna-sandbox/take-over-test-space': (input: { spaceId: string }) => SandboxTestSpaceSummary
  'chatluna-sandbox/return-test-space': (input: { spaceId: string }) => SandboxTestSpaceSummary
  'chatluna-sandbox/terminate-test-space': (input: { spaceId: string }) => SandboxTestSpaceSummary
  'chatluna-sandbox/reactivate-test-space': (input: { spaceId: string }) => SandboxTestSpaceSummary
  'chatluna-sandbox/delete-test-space': (input: { spaceId: string }) => void
}

/** 端点集合是全体分组的并集；服务端注册与客户端消费都以它为唯一名单。 */
export interface SandboxConsoleEvents extends
  SandboxConversationConsoleEvents,
  SandboxEnvironmentConsoleEvents,
  SandboxDebugRecordConsoleEvents,
  SandboxModelRequestConsoleEvents,
  SandboxPresetConsoleEvents,
  SandboxMcpConsoleEvents,
  SandboxTestSpaceConsoleEvents {}

export type SandboxConsoleEndpoint = keyof SandboxConsoleEvents

/** 场景变更广播载荷：`spaceId` 省略时表示主模拟 QQ 环境。 */
export interface SandboxSceneMutationPayload {
  spaceId?: string
  revision: number
}

/** MCP 服务器活动广播载荷。 */
export interface SandboxMcpActivityPayload {
  running: boolean
}

/** 广播频道名到载荷；服务端 `broadcast` 与客户端 `receive` 都从这里取类型。 */
export interface SandboxConsoleBroadcasts {
  'chatluna-sandbox/scene-mutated': SandboxSceneMutationPayload
  'chatluna-sandbox/mcp-activity': SandboxMcpActivityPayload
}

export type SandboxConsoleBroadcastChannel = keyof SandboxConsoleBroadcasts
