declare module '@koishijs/client' {
  import type { Component } from 'vue'
  import type { SandboxSnapshot, SendMessageInput } from '../src/types'

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

  export function send(event: 'onebot-sandbox/snapshot'): Promise<SandboxSnapshot>
  export function send(event: 'onebot-sandbox/send-message', input: SendMessageInput): Promise<SandboxSnapshot>
}
