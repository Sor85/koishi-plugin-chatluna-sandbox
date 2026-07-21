import { resolve } from 'node:path'
import type {} from '@koishijs/console'
import type { SandboxControlService } from './control-service'
import type {
  DeleteGroupAnnouncementInput,
  GetMediaContentInput,
  GetMessageHistoryInput,
  GetSandboxWorkspaceInput,
  ManageSandboxEnvironmentInput,
  PerformFriendActionInput,
  PerformGroupActionInput,
  SandboxAppearance,
  SandboxMediaContent,
  SandboxMessageHistory,
  SandboxWorkspaceState,
  SendMediaMessageInput,
  SendMessageInput,
  SetGroupAnnouncementInput,
} from './types'

interface ConsoleEventMap {
  'onebot-sandbox/workspace': (input?: GetSandboxWorkspaceInput) => SandboxWorkspaceState
  'onebot-sandbox/message-history': (input: GetMessageHistoryInput) => SandboxMessageHistory
  'onebot-sandbox/send-message': (input: SendMessageInput) => Promise<SandboxWorkspaceState>
  'onebot-sandbox/send-media-message': (input: SendMediaMessageInput) => Promise<SandboxWorkspaceState>
  'onebot-sandbox/media-content': (input: GetMediaContentInput) => SandboxMediaContent
  'onebot-sandbox/set-group-announcement': (input: SetGroupAnnouncementInput) => SandboxWorkspaceState
  'onebot-sandbox/delete-group-announcement': (input: DeleteGroupAnnouncementInput) => SandboxWorkspaceState
  'onebot-sandbox/manage-environment': (input: ManageSandboxEnvironmentInput) => SandboxWorkspaceState
  'onebot-sandbox/friend-action': (input: PerformFriendActionInput) => Promise<SandboxWorkspaceState>
  'onebot-sandbox/group-action': (input: PerformGroupActionInput) => Promise<SandboxWorkspaceState>
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

  const getWorkspace = (actorUserId?: string, messageLimit?: number): SandboxWorkspaceState => {
    const snapshot = control.getSnapshot()
    const visibleUserId = snapshot.users.some(({ id }) => id === actorUserId)
      ? actorUserId
      : snapshot.users[0]?.id
    return {
      snapshot: visibleUserId ? control.getVisibleSnapshot(visibleUserId, messageLimit) : snapshot,
      appearance,
    }
  }

  console.addListener('onebot-sandbox/workspace', (input) => getWorkspace(input?.actorUserId, input?.messageLimit), { authority: 4 })
  console.addListener('onebot-sandbox/message-history', (input) => control.getMessageHistory(input), { authority: 4 })
  console.addListener('onebot-sandbox/send-message', async (input) => {
    await control.sendMessage(input)
    return getWorkspace(input.actorUserId)
  }, { authority: 4 })
  console.addListener('onebot-sandbox/send-media-message', async (input) => {
    await control.sendMediaMessage(input)
    return getWorkspace(input.actorUserId)
  }, { authority: 4 })
  console.addListener('onebot-sandbox/media-content', (input) => control.getMediaContent(input), { authority: 4 })
  console.addListener('onebot-sandbox/set-group-announcement', (input) => {
    control.setGroupAnnouncement(input)
    return getWorkspace(input.actorUserId)
  }, { authority: 4 })
  console.addListener('onebot-sandbox/delete-group-announcement', (input) => {
    control.deleteGroupAnnouncement(input)
    return getWorkspace(input.actorUserId)
  }, { authority: 4 })
  console.addListener('onebot-sandbox/manage-environment', (input) => {
    switch (input.action) {
      case 'create-user':
        control.createUser(input.data)
        break
      case 'update-user':
        control.updateUser(input.data)
        break
      case 'delete-user':
        control.deleteUser(input.data)
        break
      case 'create-bot':
        control.createBot(input.data)
        break
      case 'update-bot':
        control.updateBot(input.data)
        break
      case 'delete-bot':
        control.deleteBot(input.data)
        break
      case 'create-group':
        control.createGroup(input.data)
        break
      case 'update-group':
        control.updateGroup(input.data)
        break
      case 'delete-group':
        control.deleteGroup(input.data)
        break
    }
    return getWorkspace(input.actorUserId)
  }, { authority: 4 })
  console.addListener('onebot-sandbox/friend-action', async (input) => {
    await control.performFriendAction(input)
    return getWorkspace(input.actorUserId)
  }, { authority: 4 })
  console.addListener('onebot-sandbox/group-action', async (input) => {
    await control.performGroupAction(input)
    return getWorkspace(input.actorUserId)
  }, { authority: 4 })
}

declare module '@koishijs/console' {
  interface Events {
    'onebot-sandbox/workspace'(input?: GetSandboxWorkspaceInput): SandboxWorkspaceState
    'onebot-sandbox/message-history'(input: GetMessageHistoryInput): SandboxMessageHistory
    'onebot-sandbox/send-message'(input: SendMessageInput): Promise<SandboxWorkspaceState>
    'onebot-sandbox/send-media-message'(input: SendMediaMessageInput): Promise<SandboxWorkspaceState>
    'onebot-sandbox/media-content'(input: GetMediaContentInput): SandboxMediaContent
    'onebot-sandbox/set-group-announcement'(input: SetGroupAnnouncementInput): SandboxWorkspaceState
    'onebot-sandbox/delete-group-announcement'(input: DeleteGroupAnnouncementInput): SandboxWorkspaceState
    'onebot-sandbox/manage-environment'(input: ManageSandboxEnvironmentInput): SandboxWorkspaceState
    'onebot-sandbox/friend-action'(input: PerformFriendActionInput): Promise<SandboxWorkspaceState>
    'onebot-sandbox/group-action'(input: PerformGroupActionInput): Promise<SandboxWorkspaceState>
  }
}
