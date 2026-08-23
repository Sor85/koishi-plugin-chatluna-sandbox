declare module '@koishijs/client' {
  import type { Component } from 'vue'
  import type {
    DeleteGroupAnnouncementInput,
    ClearSandboxModelRequestRecordsResult,
    ClearSandboxOneBotDebugRecordsResult,
    GetForwardMessageInput,
    GetMediaContentInput,
    GetMessageHistoryInput,
    GetSandboxWorkspaceInput,
    GetSandboxModelRequestRecordInput,
    GetSandboxModelRequestRecordsInput,
    GetSandboxOneBotDebugRecordInput,
    GetSandboxOneBotDebugRecordsInput,
    ManageSandboxEnvironmentInput,
    PerformFriendActionInput,
    PerformGroupActionInput,
    RecallMessageInput,
    ClearConversationMessagesInput,
    SearchConversationMessagesInput,
    SetMessageReactionInput,
    SandboxConsoleOneBotDebugRecord,
    SandboxModelRequestDetail,
    SandboxModelRequestRecordsPage,
    SandboxModelRequestScope,
    SandboxModelRequestTrajectory,
    SandboxForward,
    SandboxMediaContent,
    SandboxMessageHistory,
    SandboxMessageSearchResult,
    SandboxOneBotDebugRecordsPage,
    SandboxWorkspaceState,
    SendForwardMessageInput,
    SendMediaMessageInput,
    SendMessageInput,
    SetGroupAnnouncementInput,
  } from '../src/types'
  import type { ListSandboxMcpCallRecordsInput, SandboxMcpCallRecordsPage } from '../src/mcp/call-records'
  import type { SandboxMcpCallRecord, SandboxMcpScope } from '../src/mcp/types'
  import type { SandboxTestSpaceSummary } from '../src/test-spaces'
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
  } from '../src/presets'

  type SpaceScoped<Input> = Input & { spaceId?: string }

  export interface Context {
    page(options: {
      name: string
      path: string
      icon: string
      order?: number
      authority?: number
      component: Component
    }): unknown
  }

  export const icons: {
    register(name: string, component: Component): void
  }

  export function send(event: 'chatluna-sandbox/workspace', input?: SpaceScoped<GetSandboxWorkspaceInput>): Promise<SandboxWorkspaceState>
  export function send(event: 'chatluna-sandbox/message-history', input: SpaceScoped<GetMessageHistoryInput>): Promise<SandboxMessageHistory>
  export function send(event: 'chatluna-sandbox/search-conversation-messages', input: SpaceScoped<SearchConversationMessagesInput>): Promise<SandboxMessageSearchResult>
  export function send(event: 'chatluna-sandbox/send-message', input: SpaceScoped<SendMessageInput>): Promise<SandboxWorkspaceState>
  export function send(event: 'chatluna-sandbox/send-media-message', input: SpaceScoped<SendMediaMessageInput>): Promise<SandboxWorkspaceState>
  export function send(event: 'chatluna-sandbox/send-forward-message', input: SpaceScoped<SendForwardMessageInput>): Promise<SandboxWorkspaceState>
  export function send(event: 'chatluna-sandbox/get-forward-message', input: SpaceScoped<GetForwardMessageInput>): Promise<SandboxForward>
  export function send(event: 'chatluna-sandbox/recall-message', input: SpaceScoped<RecallMessageInput>): Promise<SandboxWorkspaceState>
  export function send(event: 'chatluna-sandbox/clear-conversation-messages', input: SpaceScoped<ClearConversationMessagesInput>): Promise<SandboxWorkspaceState>
  export function send(event: 'chatluna-sandbox/set-message-reaction', input: SpaceScoped<SetMessageReactionInput>): Promise<SandboxWorkspaceState>
  export function send(event: 'chatluna-sandbox/media-content', input: SpaceScoped<GetMediaContentInput>): Promise<SandboxMediaContent>
  export function send(event: 'chatluna-sandbox/set-group-announcement', input: SpaceScoped<SetGroupAnnouncementInput>): Promise<SandboxWorkspaceState>
  export function send(event: 'chatluna-sandbox/delete-group-announcement', input: SpaceScoped<DeleteGroupAnnouncementInput>): Promise<SandboxWorkspaceState>
  export function send(event: 'chatluna-sandbox/manage-environment', input: SpaceScoped<ManageSandboxEnvironmentInput>): Promise<SandboxWorkspaceState>
  export function send(event: 'chatluna-sandbox/friend-action', input: SpaceScoped<PerformFriendActionInput>): Promise<SandboxWorkspaceState>
  export function send(event: 'chatluna-sandbox/group-action', input: SpaceScoped<PerformGroupActionInput>): Promise<SandboxWorkspaceState>
  export function send(event: 'chatluna-sandbox/debug-records', input?: SpaceScoped<GetSandboxOneBotDebugRecordsInput>): Promise<SandboxOneBotDebugRecordsPage<SandboxConsoleOneBotDebugRecord>>
  export function send(event: 'chatluna-sandbox/debug-record', input: SpaceScoped<GetSandboxOneBotDebugRecordInput>): Promise<SandboxConsoleOneBotDebugRecord>
  export function send(event: 'chatluna-sandbox/clear-debug-records', input?: { spaceId?: string }): Promise<ClearSandboxOneBotDebugRecordsResult>
  export function send(event: 'chatluna-sandbox/model-request-records', input: GetSandboxModelRequestRecordsInput & SandboxModelRequestScope): Promise<SandboxModelRequestRecordsPage>
  export function send(event: 'chatluna-sandbox/model-request-record', input: GetSandboxModelRequestRecordInput & SandboxModelRequestScope): Promise<SandboxModelRequestDetail>
  export function send(event: 'chatluna-sandbox/model-request-trajectory', input: GetSandboxModelRequestRecordInput & SandboxModelRequestScope & { mode: 'request' | 'conversation' }): Promise<SandboxModelRequestTrajectory>
  export function send(event: 'chatluna-sandbox/clear-model-request-records', input: SandboxModelRequestScope): Promise<ClearSandboxModelRequestRecordsResult>
  export function send(event: 'chatluna-sandbox/preset-catalog', input?: { kind?: PresetDocumentKind }): Promise<SandboxPresetDocument[]>
  export function send(event: 'chatluna-sandbox/preset-read', input: ReadSandboxPresetInput): Promise<SandboxPresetDocument>
  export function send(event: 'chatluna-sandbox/preset-create', input: CreatePresetInput): Promise<SandboxPresetDocument>
  export function send(event: 'chatluna-sandbox/preset-save', input: SavePresetInput): Promise<SandboxPresetDocument>
  export function send(event: 'chatluna-sandbox/preset-rename', input: RenamePresetInput): Promise<SandboxPresetDocument>
  export function send(event: 'chatluna-sandbox/preset-delete', input: DeletePresetInput): Promise<{ deleted: true }>
  export function send(event: 'chatluna-sandbox/preset-locate-expression', input: LocateSandboxPresetExpressionInput): Promise<LocateSandboxPresetExpressionResult>
  export function send(event: 'chatluna-sandbox/mcp-call-records', input?: ListSandboxMcpCallRecordsInput): Promise<SandboxMcpCallRecordsPage>
  export function send(event: 'chatluna-sandbox/mcp-call-record', input: { recordId: string }): Promise<SandboxMcpCallRecord>
  export function send(event: 'chatluna-sandbox/clear-mcp-call-records'): Promise<{ cleared: number }>
  export function send(event: 'chatluna-sandbox/mcp-credentials'): Promise<Array<{ id: string; name: string; scopes: SandboxMcpScope[]; enabled: boolean; createdAt: string; token?: string }>>
  export function send(event: 'chatluna-sandbox/create-mcp-credential', input: { name: string; scopes: SandboxMcpScope[] }): Promise<{ id: string; name: string; scopes: SandboxMcpScope[]; enabled: boolean; createdAt: string; token: string }>
  export function send(event: 'chatluna-sandbox/update-mcp-credential', input: { id: string; name?: string; scopes?: SandboxMcpScope[] }): Promise<{ id: string; name: string; scopes: SandboxMcpScope[]; enabled: boolean; createdAt: string; token?: string }>
  export function send(event: 'chatluna-sandbox/rotate-mcp-credential-token', input: { id: string }): Promise<{ id: string; name: string; scopes: SandboxMcpScope[]; enabled: boolean; createdAt: string; token: string }>
  export function send(event: 'chatluna-sandbox/set-mcp-credential-enabled', input: { id: string; enabled: boolean }): Promise<void>
  export function send(event: 'chatluna-sandbox/revoke-mcp-credential', input: { id: string }): Promise<void>
  export function send(event: 'chatluna-sandbox/test-spaces'): Promise<SandboxTestSpaceSummary[]>
  export function send(event: 'chatluna-sandbox/create-test-space', input: { name?: string }): Promise<SandboxTestSpaceSummary>
  export function send(event: 'chatluna-sandbox/take-over-test-space', input: { spaceId: string }): Promise<SandboxTestSpaceSummary>
  export function send(event: 'chatluna-sandbox/return-test-space', input: { spaceId: string }): Promise<SandboxTestSpaceSummary>
  export function send(event: 'chatluna-sandbox/terminate-test-space', input: { spaceId: string }): Promise<SandboxTestSpaceSummary>
  export function send(event: 'chatluna-sandbox/reactivate-test-space', input: { spaceId: string }): Promise<SandboxTestSpaceSummary>
  export function send(event: 'chatluna-sandbox/delete-test-space', input: { spaceId: string }): Promise<void>
  export function useColorMode(): import('vue').ComputedRef<'light' | 'dark'>
  export function receive<T = unknown>(event: string, listener: (data: T) => void): void
}
