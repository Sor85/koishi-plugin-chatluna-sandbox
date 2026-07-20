import { resolve } from 'node:path'
import type {} from '@koishijs/console'
import type { SandboxControlService } from './control-service'
import type {
  SandboxAppearance,
  SandboxWorkspaceState,
  SendMessageInput,
} from './types'

interface ConsoleEventMap {
  'onebot-sandbox/workspace': () => SandboxWorkspaceState
  'onebot-sandbox/send-message': (input: SendMessageInput) => Promise<SandboxWorkspaceState>
}

export interface SandboxConsoleRegistrar {
  addEntry(entry: { dev: string; prod: string }): unknown
  addListener<Event extends keyof ConsoleEventMap>(
    event: Event,
    callback: ConsoleEventMap[Event],
    options: { authority: number },
  ): unknown
}

export function registerConsole(
  console: SandboxConsoleRegistrar,
  control: SandboxControlService,
  appearance: SandboxAppearance,
) {
  console.addEntry({
    dev: resolve(__dirname, '../client/index.ts'),
    prod: resolve(__dirname, '../dist'),
  })

  const getWorkspace = (): SandboxWorkspaceState => ({
    snapshot: control.getSnapshot(),
    appearance,
  })

  console.addListener('onebot-sandbox/workspace', getWorkspace, { authority: 4 })
  console.addListener('onebot-sandbox/send-message', async (input) => {
    await control.sendMessage(input)
    return getWorkspace()
  }, { authority: 4 })
}

declare module '@koishijs/console' {
  interface Events {
    'onebot-sandbox/workspace'(): SandboxWorkspaceState
    'onebot-sandbox/send-message'(input: SendMessageInput): Promise<SandboxWorkspaceState>
  }
}
