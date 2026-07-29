import { resolve } from 'node:path'
import type {} from '@koishijs/console'
import type { SandboxControlService } from './control-service'
import type { SandboxMcpService } from './mcp/service'
import type { SandboxMcpScope } from './mcp/types'
import { trimSnapshotMessages, type SandboxTestSpaceService, type SandboxTestSpaceSummary } from './test-spaces'
import type {
  DeleteGroupAnnouncementInput,
  ClearSandboxOneBotDebugRecordsResult,
  GetMediaContentInput,
  GetMessageHistoryInput,
  GetSandboxBotDeliveriesInput,
  GetSandboxOneBotDebugRecordsInput,
  GetSandboxWorkspaceInput,
  ManageSandboxEnvironmentInput,
  PerformFriendActionInput,
  PerformGroupActionInput,
  RecallMessageInput,
  SandboxAppearance,
  SandboxBotDelivery,
  SandboxMediaContent,
  SandboxOneBotDebugRecord,
  SandboxMessageHistory,
  SandboxWorkspaceState,
  SendMediaMessageInput,
  SendMessageInput,
  SetGroupAnnouncementInput,
} from './types'
import { getSandboxUsers } from './types'

type SpaceScoped<Input> = Input & { spaceId?: string }

interface ConsoleEventMap {
  'onebot-sandbox/workspace': (input?: SpaceScoped<GetSandboxWorkspaceInput>) => SandboxWorkspaceState
  'onebot-sandbox/message-history': (input: SpaceScoped<GetMessageHistoryInput>) => SandboxMessageHistory
  'onebot-sandbox/send-message': (input: SpaceScoped<SendMessageInput>) => SandboxWorkspaceState
  'onebot-sandbox/send-media-message': (input: SpaceScoped<SendMediaMessageInput>) => SandboxWorkspaceState
  'onebot-sandbox/recall-message': (input: SpaceScoped<RecallMessageInput>) => Promise<SandboxWorkspaceState>
  'onebot-sandbox/media-content': (input: SpaceScoped<GetMediaContentInput>) => SandboxMediaContent
  'onebot-sandbox/set-group-announcement': (input: SpaceScoped<SetGroupAnnouncementInput>) => SandboxWorkspaceState
  'onebot-sandbox/delete-group-announcement': (input: SpaceScoped<DeleteGroupAnnouncementInput>) => SandboxWorkspaceState
  'onebot-sandbox/manage-environment': (input: SpaceScoped<ManageSandboxEnvironmentInput>) => SandboxWorkspaceState
  'onebot-sandbox/friend-action': (input: SpaceScoped<PerformFriendActionInput>) => Promise<SandboxWorkspaceState>
  'onebot-sandbox/group-action': (input: SpaceScoped<PerformGroupActionInput>) => Promise<SandboxWorkspaceState>
  'onebot-sandbox/bot-deliveries': (input?: SpaceScoped<GetSandboxBotDeliveriesInput>) => SandboxBotDelivery[]
  'onebot-sandbox/debug-records': (input?: SpaceScoped<GetSandboxOneBotDebugRecordsInput>) => SandboxOneBotDebugRecord[]
  'onebot-sandbox/clear-debug-records': (input?: { spaceId?: string }) => ClearSandboxOneBotDebugRecordsResult
  'onebot-sandbox/mcp-credentials': () => Array<{ id: string; name: string; scopes: SandboxMcpScope[]; enabled: boolean; createdAt: string }>
  'onebot-sandbox/create-mcp-credential': (input: { name: string; scopes: SandboxMcpScope[] }) => { id: string; name: string; scopes: SandboxMcpScope[]; enabled: boolean; createdAt: string; token: string }
  'onebot-sandbox/set-mcp-credential-enabled': (input: { id: string; enabled: boolean }) => void
  'onebot-sandbox/revoke-mcp-credential': (input: { id: string }) => void
  'onebot-sandbox/test-spaces': () => SandboxTestSpaceSummary[]
  'onebot-sandbox/create-test-space': (input: { name?: string }) => SandboxTestSpaceSummary
  'onebot-sandbox/take-over-test-space': (input: { spaceId: string }) => SandboxTestSpaceSummary
  'onebot-sandbox/return-test-space': (input: { spaceId: string }) => SandboxTestSpaceSummary
  'onebot-sandbox/terminate-test-space': (input: { spaceId: string }) => SandboxTestSpaceSummary
  'onebot-sandbox/reactivate-test-space': (input: { spaceId: string }) => SandboxTestSpaceSummary
  'onebot-sandbox/delete-test-space': (input: { spaceId: string }) => void
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
  broadcast(type: string, body: unknown): unknown
}

export function registerConsole(
  console: SandboxConsoleRegistrar,
  control: SandboxControlService,
  appearance: SandboxAppearance,
  mcp?: SandboxMcpService,
  testSpaces?: SandboxTestSpaceService,
) {
  console.addEntry({
    dev: resolve(__dirname, '../client/index.ts'),
    prod: resolve(__dirname, '../dist'),
  })

  // 场景变更实时广播给 WebQQ：发送消息不再等待机器人处理完成，机器人回复靠此通知前端刷新。
  control.onSceneMutation(({ revision }) => {
    void console.broadcast('onebot-sandbox/scene-mutated', { revision })
  })
  testSpaces?.onSpaceCreated((spaceId, spaceControl) => {
    spaceControl.onSceneMutation(({ revision }) => {
      void console.broadcast('onebot-sandbox/scene-mutated', { spaceId, revision })
    })
  })

  const resolveControl = (input: { spaceId?: string } | undefined, mutation: boolean) => {
    if (!input?.spaceId) return control
    if (!testSpaces) throw new Error('AI 测试空间服务不可用')
    return mutation ? testSpaces.requireUserControl(input.spaceId) : testSpaces.getControl(input.spaceId)
  }
  const withoutSpaceId = <Input extends { spaceId?: string }>(input: Input): Omit<Input, 'spaceId'> => {
    const { spaceId: _spaceId, ...rest } = input
    return rest
  }
  const getWorkspace = (input: SpaceScoped<GetSandboxWorkspaceInput> = {}): SandboxWorkspaceState => {
    assertNoLegacyRpcFields(input)
    const activeControl = resolveControl(input, false)
    const snapshot = activeControl.getSnapshot()
    if (input.operatorId && !snapshot.participants.some(({ id }) => id === input.operatorId)) {
      throw new Error(`参与者不存在：${input.operatorId}`)
    }
    const visibleParticipantId = input.operatorId ?? getSandboxUsers(snapshot)[0]?.id ?? snapshot.participants[0]?.id
    const visibleSnapshot = visibleParticipantId ? activeControl.getVisibleSnapshot(visibleParticipantId, input.messageLimit) : snapshot
    const visibleConversationIds = new Set(visibleSnapshot.conversations.map(({ id }) => id))
    return {
      snapshot: visibleSnapshot,
      chatLunaStates: activeControl.getChatLunaStates().filter(({ conversationId }) => visibleConversationIds.has(conversationId)),
      appearance,
      persistence: control.getPersistenceStatus(),
    }
  }

  console.addListener('onebot-sandbox/workspace', (input) => getWorkspace(input), { authority: 4 })
  console.addListener('onebot-sandbox/message-history', (input) => resolveControl(input, false).getMessageHistory(assertInteractionInput(withoutSpaceId(input)) as GetMessageHistoryInput), { authority: 4 })
  console.addListener('onebot-sandbox/send-message', (input) => {
    // 消息同步落库后立即返回，机器人投递在后台继续；派发失败已写入调试记录与日志。
    const { delivery } = resolveControl(input, true).startMessageSend(assertInteractionInput(withoutSpaceId(input)) as SendMessageInput)
    delivery.catch(() => {})
    return getWorkspace({ spaceId: input.spaceId, operatorId: input.operatorId })
  }, { authority: 4 })
  console.addListener('onebot-sandbox/send-media-message', (input) => {
    const { delivery } = resolveControl(input, true).startMediaMessageSend(assertInteractionInput(withoutSpaceId(input)) as SendMediaMessageInput)
    delivery.catch(() => {})
    return getWorkspace({ spaceId: input.spaceId, operatorId: input.operatorId })
  }, { authority: 4 })
  console.addListener('onebot-sandbox/recall-message', async (input) => {
    await resolveControl(input, true).recallMessage(assertInteractionInput(withoutSpaceId(input)) as RecallMessageInput)
    return getWorkspace({ spaceId: input.spaceId, operatorId: input.operatorId })
  }, { authority: 4 })
  console.addListener('onebot-sandbox/media-content', (input) => resolveControl(input, false).getMediaContent(assertInteractionInput(withoutSpaceId(input)) as GetMediaContentInput), { authority: 4 })
  console.addListener('onebot-sandbox/set-group-announcement', (input) => {
    resolveControl(input, true).setGroupAnnouncement(assertInteractionInput(withoutSpaceId(input)) as SetGroupAnnouncementInput)
    return getWorkspace({ spaceId: input.spaceId, operatorId: input.operatorId })
  }, { authority: 4 })
  console.addListener('onebot-sandbox/delete-group-announcement', (input) => {
    resolveControl(input, true).deleteGroupAnnouncement(assertInteractionInput(withoutSpaceId(input)) as DeleteGroupAnnouncementInput)
    return getWorkspace({ spaceId: input.spaceId, operatorId: input.operatorId })
  }, { authority: 4 })
  console.addListener('onebot-sandbox/manage-environment', (input) => {
    const activeControl = resolveControl(input, true)
    const command = assertEnvironmentInput(withoutSpaceId(input) as ManageSandboxEnvironmentInput)
    switch (command.action) {
      case 'create-user':
        activeControl.createUser(command.data)
        break
      case 'update-user':
        activeControl.updateUser(command.data)
        break
      case 'delete-user':
        activeControl.deleteUser(command.data)
        break
      case 'create-bot':
        activeControl.createBot(command.data)
        break
      case 'update-bot':
        activeControl.updateBot(command.data)
        break
      case 'delete-bot':
        activeControl.deleteBot(command.data)
        break
      case 'create-group':
        activeControl.createGroup(command.data)
        break
      case 'update-group':
        activeControl.updateGroup(command.data)
        break
      case 'delete-group':
        activeControl.deleteGroup(command.data)
        break
    }
    return getWorkspace({ spaceId: input.spaceId })
  }, { authority: 4 })
  console.addListener('onebot-sandbox/friend-action', async (input) => {
    await resolveControl(input, true).performFriendAction(assertInteractionInput(withoutSpaceId(input)) as PerformFriendActionInput)
    return getWorkspace({ spaceId: input.spaceId, operatorId: input.operatorId })
  }, { authority: 4 })
  console.addListener('onebot-sandbox/group-action', async (input) => {
    await resolveControl(input, true).performGroupAction(assertInteractionInput(withoutSpaceId(input)) as PerformGroupActionInput)
    return getWorkspace({ spaceId: input.spaceId, operatorId: input.operatorId })
  }, { authority: 4 })
  console.addListener('onebot-sandbox/bot-deliveries', (input = {}) => resolveControl(input, false).getBotDeliveries(assertInteractionInput(withoutSpaceId(input)) as GetSandboxBotDeliveriesInput), { authority: 4 })
  console.addListener('onebot-sandbox/debug-records', (input = {}) => resolveControl(input, false).getOneBotDebugRecords(withoutSpaceId(input)), { authority: 4 })
  console.addListener('onebot-sandbox/clear-debug-records', (input = {}) => ({ cleared: resolveControl(input, true).clearOneBotDebugRecords() }), { authority: 4 })
  if (mcp) {
    console.addListener('onebot-sandbox/mcp-credentials', () => mcp.listCredentials(), { authority: 4 })
    console.addListener('onebot-sandbox/create-mcp-credential', (input) => mcp.createCredential(input.name, input.scopes), { authority: 4 })
    console.addListener('onebot-sandbox/set-mcp-credential-enabled', (input) => mcp.setCredentialEnabled(input.id, input.enabled), { authority: 4 })
    console.addListener('onebot-sandbox/revoke-mcp-credential', (input) => mcp.revokeCredential(input.id), { authority: 4 })
  }
  if (testSpaces) {
    console.addListener('onebot-sandbox/test-spaces', () => testSpaces.listSpaces()
      .map((space) => ({ ...space, snapshot: trimSnapshotMessages(space.snapshot, 10) })), { authority: 4 })
    console.addListener('onebot-sandbox/create-test-space', ({ name }) => {
      const space = testSpaces.createSpace({ controllerId: 'console', name })
      return testSpaces.takeOver(space.id)
    }, { authority: 4 })
    console.addListener('onebot-sandbox/take-over-test-space', ({ spaceId }) => testSpaces.takeOver(spaceId), { authority: 4 })
    console.addListener('onebot-sandbox/return-test-space', ({ spaceId }) => testSpaces.returnControl(spaceId), { authority: 4 })
    console.addListener('onebot-sandbox/terminate-test-space', ({ spaceId }) => testSpaces.terminateSpace(spaceId), { authority: 4 })
    console.addListener('onebot-sandbox/reactivate-test-space', ({ spaceId }) => testSpaces.reactivateSpace(spaceId), { authority: 4 })
    console.addListener('onebot-sandbox/delete-test-space', ({ spaceId }) => testSpaces.deleteSpace(spaceId), { authority: 4 })
  }
}

declare module '@koishijs/console' {
  interface Events {
    'onebot-sandbox/workspace'(input?: SpaceScoped<GetSandboxWorkspaceInput>): SandboxWorkspaceState
    'onebot-sandbox/message-history'(input: SpaceScoped<GetMessageHistoryInput>): SandboxMessageHistory
    'onebot-sandbox/send-message'(input: SpaceScoped<SendMessageInput>): SandboxWorkspaceState
    'onebot-sandbox/send-media-message'(input: SpaceScoped<SendMediaMessageInput>): SandboxWorkspaceState
    'onebot-sandbox/recall-message'(input: SpaceScoped<RecallMessageInput>): Promise<SandboxWorkspaceState>
    'onebot-sandbox/media-content'(input: SpaceScoped<GetMediaContentInput>): SandboxMediaContent
    'onebot-sandbox/set-group-announcement'(input: SpaceScoped<SetGroupAnnouncementInput>): SandboxWorkspaceState
    'onebot-sandbox/delete-group-announcement'(input: SpaceScoped<DeleteGroupAnnouncementInput>): SandboxWorkspaceState
    'onebot-sandbox/manage-environment'(input: SpaceScoped<ManageSandboxEnvironmentInput>): SandboxWorkspaceState
    'onebot-sandbox/friend-action'(input: SpaceScoped<PerformFriendActionInput>): Promise<SandboxWorkspaceState>
    'onebot-sandbox/group-action'(input: SpaceScoped<PerformGroupActionInput>): Promise<SandboxWorkspaceState>
    'onebot-sandbox/bot-deliveries'(input?: SpaceScoped<GetSandboxBotDeliveriesInput>): SandboxBotDelivery[]
    'onebot-sandbox/debug-records'(input?: SpaceScoped<GetSandboxOneBotDebugRecordsInput>): SandboxOneBotDebugRecord[]
    'onebot-sandbox/clear-debug-records'(input?: { spaceId?: string }): ClearSandboxOneBotDebugRecordsResult
    'onebot-sandbox/mcp-credentials'(): Array<{ id: string; name: string; scopes: SandboxMcpScope[]; enabled: boolean; createdAt: string }>
    'onebot-sandbox/create-mcp-credential'(input: { name: string; scopes: SandboxMcpScope[] }): { id: string; name: string; scopes: SandboxMcpScope[]; enabled: boolean; createdAt: string; token: string }
    'onebot-sandbox/set-mcp-credential-enabled'(input: { id: string; enabled: boolean }): void
    'onebot-sandbox/revoke-mcp-credential'(input: { id: string }): void
    'onebot-sandbox/test-spaces'(): SandboxTestSpaceSummary[]
    'onebot-sandbox/create-test-space'(input: { name?: string }): SandboxTestSpaceSummary
    'onebot-sandbox/take-over-test-space'(input: { spaceId: string }): SandboxTestSpaceSummary
    'onebot-sandbox/return-test-space'(input: { spaceId: string }): SandboxTestSpaceSummary
    'onebot-sandbox/terminate-test-space'(input: { spaceId: string }): SandboxTestSpaceSummary
    'onebot-sandbox/reactivate-test-space'(input: { spaceId: string }): SandboxTestSpaceSummary
    'onebot-sandbox/delete-test-space'(input: { spaceId: string }): void
  }
}
