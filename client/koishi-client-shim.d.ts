declare module '@koishijs/client' {
  import type { Component } from 'vue'
  import type {
    DeleteGroupAnnouncementInput,
    ClearSandboxOneBotDebugRecordsResult,
    GetForwardMessageInput,
    GetMediaContentInput,
    GetMessageHistoryInput,
    GetSandboxWorkspaceInput,
    GetSandboxOneBotDebugRecordInput,
    GetSandboxOneBotDebugRecordsInput,
    ManageSandboxEnvironmentInput,
    PerformFriendActionInput,
    PerformGroupActionInput,
    RecallMessageInput,
    SearchConversationMessagesInput,
    SetMessageReactionInput,
    SandboxConsoleOneBotDebugRecord,
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
  import type { SandboxMcpScope } from '../src/mcp/types'
  import type { SandboxTestSpaceSummary } from '../src/test-spaces'

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

  export function send(event: 'onebot-sandbox/workspace', input?: SpaceScoped<GetSandboxWorkspaceInput>): Promise<SandboxWorkspaceState>
  export function send(event: 'onebot-sandbox/message-history', input: SpaceScoped<GetMessageHistoryInput>): Promise<SandboxMessageHistory>
  export function send(event: 'onebot-sandbox/search-conversation-messages', input: SpaceScoped<SearchConversationMessagesInput>): Promise<SandboxMessageSearchResult>
  export function send(event: 'onebot-sandbox/send-message', input: SpaceScoped<SendMessageInput>): Promise<SandboxWorkspaceState>
  export function send(event: 'onebot-sandbox/send-media-message', input: SpaceScoped<SendMediaMessageInput>): Promise<SandboxWorkspaceState>
  export function send(event: 'onebot-sandbox/send-forward-message', input: SpaceScoped<SendForwardMessageInput>): Promise<SandboxWorkspaceState>
  export function send(event: 'onebot-sandbox/get-forward-message', input: SpaceScoped<GetForwardMessageInput>): Promise<SandboxForward>
  export function send(event: 'onebot-sandbox/recall-message', input: SpaceScoped<RecallMessageInput>): Promise<SandboxWorkspaceState>
  export function send(event: 'onebot-sandbox/set-message-reaction', input: SpaceScoped<SetMessageReactionInput>): Promise<SandboxWorkspaceState>
  export function send(event: 'onebot-sandbox/media-content', input: SpaceScoped<GetMediaContentInput>): Promise<SandboxMediaContent>
  export function send(event: 'onebot-sandbox/set-group-announcement', input: SpaceScoped<SetGroupAnnouncementInput>): Promise<SandboxWorkspaceState>
  export function send(event: 'onebot-sandbox/delete-group-announcement', input: SpaceScoped<DeleteGroupAnnouncementInput>): Promise<SandboxWorkspaceState>
  export function send(event: 'onebot-sandbox/manage-environment', input: SpaceScoped<ManageSandboxEnvironmentInput>): Promise<SandboxWorkspaceState>
  export function send(event: 'onebot-sandbox/friend-action', input: SpaceScoped<PerformFriendActionInput>): Promise<SandboxWorkspaceState>
  export function send(event: 'onebot-sandbox/group-action', input: SpaceScoped<PerformGroupActionInput>): Promise<SandboxWorkspaceState>
  export function send(event: 'onebot-sandbox/debug-records', input?: SpaceScoped<GetSandboxOneBotDebugRecordsInput>): Promise<SandboxOneBotDebugRecordsPage<SandboxConsoleOneBotDebugRecord>>
  export function send(event: 'onebot-sandbox/debug-record', input: SpaceScoped<GetSandboxOneBotDebugRecordInput>): Promise<SandboxConsoleOneBotDebugRecord>
  export function send(event: 'onebot-sandbox/clear-debug-records', input?: { spaceId?: string }): Promise<ClearSandboxOneBotDebugRecordsResult>
  export function send(event: 'onebot-sandbox/mcp-credentials'): Promise<Array<{ id: string; name: string; scopes: SandboxMcpScope[]; enabled: boolean; createdAt: string }>>
  export function send(event: 'onebot-sandbox/create-mcp-credential', input: { name: string; scopes: SandboxMcpScope[] }): Promise<{ id: string; name: string; scopes: SandboxMcpScope[]; enabled: boolean; createdAt: string; token: string }>
  export function send(event: 'onebot-sandbox/set-mcp-credential-enabled', input: { id: string; enabled: boolean }): Promise<void>
  export function send(event: 'onebot-sandbox/revoke-mcp-credential', input: { id: string }): Promise<void>
  export function send(event: 'onebot-sandbox/test-spaces'): Promise<SandboxTestSpaceSummary[]>
  export function send(event: 'onebot-sandbox/create-test-space', input: { name?: string }): Promise<SandboxTestSpaceSummary>
  export function send(event: 'onebot-sandbox/take-over-test-space', input: { spaceId: string }): Promise<SandboxTestSpaceSummary>
  export function send(event: 'onebot-sandbox/return-test-space', input: { spaceId: string }): Promise<SandboxTestSpaceSummary>
  export function send(event: 'onebot-sandbox/terminate-test-space', input: { spaceId: string }): Promise<SandboxTestSpaceSummary>
  export function send(event: 'onebot-sandbox/reactivate-test-space', input: { spaceId: string }): Promise<SandboxTestSpaceSummary>
  export function send(event: 'onebot-sandbox/delete-test-space', input: { spaceId: string }): Promise<void>
  export function useColorMode(): import('vue').ComputedRef<'light' | 'dark'>
  export function receive<T = unknown>(event: string, listener: (data: T) => void): void
}
