declare module '@koishijs/client' {
  import type { Component } from 'vue'
  import type {
    DeleteGroupAnnouncementInput,
    ClearSandboxOneBotDebugRecordsResult,
    GetMediaContentInput,
    GetMessageHistoryInput,
    GetSandboxWorkspaceInput,
    GetSandboxOneBotDebugRecordsInput,
    ManageSandboxEnvironmentInput,
    PerformFriendActionInput,
    PerformGroupActionInput,
    SandboxMediaContent,
    SandboxMessageHistory,
    SandboxOneBotDebugRecord,
    SandboxWorkspaceState,
    SendMediaMessageInput,
    SendMessageInput,
    SetGroupAnnouncementInput,
  } from '../src/types'

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

  export function send(event: 'onebot-sandbox/workspace', input?: GetSandboxWorkspaceInput): Promise<SandboxWorkspaceState>
  export function send(event: 'onebot-sandbox/message-history', input: GetMessageHistoryInput): Promise<SandboxMessageHistory>
  export function send(event: 'onebot-sandbox/send-message', input: SendMessageInput): Promise<SandboxWorkspaceState>
  export function send(event: 'onebot-sandbox/send-media-message', input: SendMediaMessageInput): Promise<SandboxWorkspaceState>
  export function send(event: 'onebot-sandbox/media-content', input: GetMediaContentInput): Promise<SandboxMediaContent>
  export function send(event: 'onebot-sandbox/set-group-announcement', input: SetGroupAnnouncementInput): Promise<SandboxWorkspaceState>
  export function send(event: 'onebot-sandbox/delete-group-announcement', input: DeleteGroupAnnouncementInput): Promise<SandboxWorkspaceState>
  export function send(event: 'onebot-sandbox/manage-environment', input: ManageSandboxEnvironmentInput): Promise<SandboxWorkspaceState>
  export function send(event: 'onebot-sandbox/friend-action', input: PerformFriendActionInput): Promise<SandboxWorkspaceState>
  export function send(event: 'onebot-sandbox/group-action', input: PerformGroupActionInput): Promise<SandboxWorkspaceState>
  export function send(event: 'onebot-sandbox/debug-records', input?: GetSandboxOneBotDebugRecordsInput): Promise<SandboxOneBotDebugRecord[]>
  export function send(event: 'onebot-sandbox/clear-debug-records'): Promise<ClearSandboxOneBotDebugRecordsResult>
}
