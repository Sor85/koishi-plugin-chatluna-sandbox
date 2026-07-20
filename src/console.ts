import { resolve } from 'node:path'
import type {} from '@koishijs/console'
import type { SandboxControlService } from './control-service'
import type { SandboxSnapshot, SendMessageInput } from './types'

interface ConsoleEventMap {
  'onebot-sandbox/snapshot': () => SandboxSnapshot
  'onebot-sandbox/send-message': (input: SendMessageInput) => Promise<SandboxSnapshot>
}

export interface SandboxConsoleRegistrar {
  addEntry(entry: { dev: string; prod: string }): unknown
  addListener<Event extends keyof ConsoleEventMap>(
    event: Event,
    callback: ConsoleEventMap[Event],
    options: { authority: number },
  ): unknown
}

export function registerConsole(console: SandboxConsoleRegistrar, control: SandboxControlService) {
  console.addEntry({
    dev: resolve(__dirname, '../client/index.ts'),
    prod: resolve(__dirname, '../dist'),
  })

  console.addListener('onebot-sandbox/snapshot', () => control.getSnapshot(), { authority: 4 })
  console.addListener('onebot-sandbox/send-message', async (input) => {
    await control.sendMessage(input)
    return control.getSnapshot()
  }, { authority: 4 })
}

declare module '@koishijs/console' {
  interface Events {
    'onebot-sandbox/snapshot'(): SandboxSnapshot
    'onebot-sandbox/send-message'(input: SendMessageInput): Promise<SandboxSnapshot>
  }
}
