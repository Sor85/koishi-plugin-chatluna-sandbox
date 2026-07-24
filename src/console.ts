import { resolve } from 'node:path'
import type {} from '@koishijs/console'
import type { SandboxControlService } from './control-service'
import type {
  DeleteGroupAnnouncementInput,
  GetMediaContentInput,
  GetMessageHistoryInput,
  GetSandboxBotDeliveriesInput,
  GetSandboxWorkspaceInput,
  ManageSandboxEnvironmentInput,
  PerformFriendActionInput,
  PerformGroupActionInput,
  SandboxAppearance,
  SandboxBotDelivery,
  SandboxMediaContent,
  SandboxMessageHistory,
  SandboxWorkspaceState,
  SendMediaMessageInput,
  SendMessageInput,
  SetGroupAnnouncementInput,
} from './types'
import { getSandboxUsers } from './types'

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
  'onebot-sandbox/bot-deliveries': (input?: GetSandboxBotDeliveriesInput) => SandboxBotDelivery[]
}

const legacyRpcFields = ['senderId', 'botId', 'actorUserId', 'userId', 'currentUserId'] as const

function hasOwnField(input: unknown, field: string): boolean {
  return input !== null && typeof input === 'object' && Object.prototype.hasOwnProperty.call(input, field)
}

function assertNoLegacyRpcFields(input: unknown): void {
  const field = legacyRpcFields.find((candidate) => hasOwnField(input, candidate))
  if (field) throw new Error(`不支持旧 RPC 字段：${field}`)
}

function assertInteractionInput<Input>(input: Input): Input {
  assertNoLegacyRpcFields(input)
  return input
}

function assertEnvironmentInput(input: ManageSandboxEnvironmentInput): ManageSandboxEnvironmentInput {
  if (hasOwnField(input, 'operatorId')) throw new Error('环境管理不接受操作者字段：operatorId')
  assertNoLegacyRpcFields(input)
  return input
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

  const getWorkspace = (input: GetSandboxWorkspaceInput = {}): SandboxWorkspaceState => {
    assertNoLegacyRpcFields(input)
    const snapshot = control.getSnapshot()
    if (input.operatorId && !snapshot.participants.some(({ id }) => id === input.operatorId)) {
      throw new Error(`参与者不存在：${input.operatorId}`)
    }
    const visibleParticipantId = input.operatorId ?? getSandboxUsers(snapshot)[0]?.id ?? snapshot.participants[0]?.id
    const visibleSnapshot = visibleParticipantId ? control.getVisibleSnapshot(visibleParticipantId, input.messageLimit) : snapshot
    const visibleConversationIds = new Set(visibleSnapshot.conversations.map(({ id }) => id))
    return {
      snapshot: visibleSnapshot,
      chatLunaStates: control.getChatLunaStates().filter(({ conversationId }) => visibleConversationIds.has(conversationId)),
      appearance,
    }
  }

  console.addListener('onebot-sandbox/workspace', (input) => getWorkspace(input), { authority: 4 })
  console.addListener('onebot-sandbox/message-history', (input) => control.getMessageHistory(assertInteractionInput(input)), { authority: 4 })
  console.addListener('onebot-sandbox/send-message', async (input) => {
    await control.sendMessage(assertInteractionInput(input))
    return getWorkspace({ operatorId: input.operatorId })
  }, { authority: 4 })
  console.addListener('onebot-sandbox/send-media-message', async (input) => {
    await control.sendMediaMessage(assertInteractionInput(input))
    return getWorkspace({ operatorId: input.operatorId })
  }, { authority: 4 })
  console.addListener('onebot-sandbox/media-content', (input) => control.getMediaContent(assertInteractionInput(input)), { authority: 4 })
  console.addListener('onebot-sandbox/set-group-announcement', (input) => {
    control.setGroupAnnouncement(assertInteractionInput(input))
    return getWorkspace({ operatorId: input.operatorId })
  }, { authority: 4 })
  console.addListener('onebot-sandbox/delete-group-announcement', (input) => {
    control.deleteGroupAnnouncement(assertInteractionInput(input))
    return getWorkspace({ operatorId: input.operatorId })
  }, { authority: 4 })
  console.addListener('onebot-sandbox/manage-environment', (input) => {
    assertEnvironmentInput(input)
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
    return getWorkspace()
  }, { authority: 4 })
  console.addListener('onebot-sandbox/friend-action', async (input) => {
    await control.performFriendAction(assertInteractionInput(input))
    return getWorkspace({ operatorId: input.operatorId })
  }, { authority: 4 })
  console.addListener('onebot-sandbox/group-action', async (input) => {
    await control.performGroupAction(assertInteractionInput(input))
    return getWorkspace({ operatorId: input.operatorId })
  }, { authority: 4 })
  console.addListener('onebot-sandbox/bot-deliveries', (input) => control.getBotDeliveries(assertInteractionInput(input ?? {})), { authority: 4 })
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
    'onebot-sandbox/bot-deliveries'(input?: GetSandboxBotDeliveriesInput): SandboxBotDelivery[]
  }
}
