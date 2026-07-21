declare module '@koishijs/client' {
  import type { Component } from 'vue'
  import type {
    DeleteGroupAnnouncementInput,
    GetMessageHistoryInput,
    GetSandboxWorkspaceInput,
    ManageSandboxEnvironmentInput,
    SandboxMessageHistory,
    SandboxWorkspaceState,
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
  export function send(event: 'onebot-sandbox/set-group-announcement', input: SetGroupAnnouncementInput): Promise<SandboxWorkspaceState>
  export function send(event: 'onebot-sandbox/delete-group-announcement', input: DeleteGroupAnnouncementInput): Promise<SandboxWorkspaceState>
  export function send(event: 'onebot-sandbox/manage-environment', input: ManageSandboxEnvironmentInput): Promise<SandboxWorkspaceState>
}
