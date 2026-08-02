import { existsSync } from 'node:fs'
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
  GetSandboxOneBotDebugRecordInput,
  GetSandboxOneBotDebugRecordsInput,
  GetSandboxWorkspaceInput,
  ManageSandboxEnvironmentInput,
  PerformFriendActionInput,
  PerformGroupActionInput,
  RecallMessageInput,
  SetMessageReactionInput,
  SandboxAppearance,
  SandboxBotDelivery,
  SandboxConsoleOneBotDebugRecord,
  SandboxEntitySource,
  SandboxMediaContent,
  SandboxMessageHistory,
  SandboxOneBotDebugRecordsPage,
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
  'onebot-sandbox/set-message-reaction': (input: SpaceScoped<SetMessageReactionInput>) => Promise<SandboxWorkspaceState>
  'onebot-sandbox/media-content': (input: SpaceScoped<GetMediaContentInput>) => SandboxMediaContent
  'onebot-sandbox/set-group-announcement': (input: SpaceScoped<SetGroupAnnouncementInput>) => SandboxWorkspaceState
  'onebot-sandbox/delete-group-announcement': (input: SpaceScoped<DeleteGroupAnnouncementInput>) => SandboxWorkspaceState
  'onebot-sandbox/manage-environment': (input: SpaceScoped<ManageSandboxEnvironmentInput>) => Promise<SandboxWorkspaceState>
  'onebot-sandbox/friend-action': (input: SpaceScoped<PerformFriendActionInput>) => Promise<SandboxWorkspaceState>
  'onebot-sandbox/group-action': (input: SpaceScoped<PerformGroupActionInput>) => Promise<SandboxWorkspaceState>
  'onebot-sandbox/bot-deliveries': (input?: SpaceScoped<GetSandboxBotDeliveriesInput>) => SandboxBotDelivery[]
  'onebot-sandbox/debug-records': (input?: SpaceScoped<GetSandboxOneBotDebugRecordsInput>) => SandboxOneBotDebugRecordsPage<SandboxConsoleOneBotDebugRecord>
  'onebot-sandbox/debug-record': (input: SpaceScoped<GetSandboxOneBotDebugRecordInput>) => SandboxConsoleOneBotDebugRecord
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

export function resolveConsoleEntry(workspace = process.cwd()): { dev: string; prod: string } {
  const installedRoot = resolve(workspace, 'node_modules/koishi-plugin-onebot-sandbox')
  // 本地软链接会让 __dirname 指向仓库真实路径，Koishi Console 因路径不含 node_modules 而拒绝资源。
  // 优先保留工作区内的安装入口，使安全检查看到合法包路径；普通安装和测试仍回退到模块目录。
  const packageRoot = existsSync(resolve(installedRoot, 'package.json'))
    ? installedRoot
    : resolve(__dirname, '..')
  return {
    dev: resolve(packageRoot, 'client/index.ts'),
    prod: resolve(packageRoot, 'dist'),
  }
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
  console.addEntry(resolveConsoleEntry())

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
  const mainSource: SandboxEntitySource = { type: 'main', name: '主环境' }
  const getDebugPage = (
    activeControl: SandboxControlService,
    source: SandboxEntitySource,
    input: GetSandboxOneBotDebugRecordsInput,
  ): SandboxOneBotDebugRecordsPage<SandboxConsoleOneBotDebugRecord> => {
    const page = activeControl.getOneBotDebugRecords(input)
    return {
      ...page,
      records: page.records.map((record) => ({ ...record, source })),
    }
  }
  const listDebugRecords = (
    input: SpaceScoped<GetSandboxOneBotDebugRecordsInput> = {},
  ): SandboxOneBotDebugRecordsPage<SandboxConsoleOneBotDebugRecord> => {
    const query = withoutSpaceId(input)
    if (input.spaceId) {
      if (!testSpaces) throw new Error('AI 测试空间服务不可用')
      const space = testSpaces.getSpace(input.spaceId)
      return getDebugPage(testSpaces.getControl(space.id), {
        type: 'test-space',
        spaceId: space.id,
        name: space.name,
      }, query)
    }
    // 联邦视图跨多个独立 sequence，仅聚合首页；精确游标分页必须带 spaceId。
    const pages = [
      getDebugPage(control, mainSource, { ...query, beforeSequence: undefined }),
      ...(testSpaces?.listSpaces() ?? []).map((space) => getDebugPage(testSpaces!.getControl(space.id), {
        type: 'test-space',
        spaceId: space.id,
        name: space.name,
      }, { ...query, beforeSequence: undefined })),
    ]
    const limit = Math.min(Math.max(Number(query.limit ?? 50) || 50, 1), 200)
    const records = pages
      .flatMap(({ records: items }) => items)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.sequence - left.sequence)
      .slice(0, limit)
    const capacity = pages.reduce((summary, page) => ({
      recordCount: summary.recordCount + page.capacity.recordCount,
      totalBytes: summary.totalBytes + page.capacity.totalBytes,
      maxRecords: summary.maxRecords + page.capacity.maxRecords,
      maxBytes: summary.maxBytes + page.capacity.maxBytes,
    }), { recordCount: 0, totalBytes: 0, maxRecords: 0, maxBytes: 0 })
    return {
      records,
      hasMore: pages.some(({ hasMore }) => hasMore) || pages.flatMap(({ records: items }) => items).length > limit,
      earliestCursor: pages
        .map(({ earliestCursor }) => earliestCursor)
        .filter((value): value is number => typeof value === 'number')
        .sort((left, right) => left - right)[0],
      capacity,
    }
  }
  const getDebugRecord = (input: SpaceScoped<GetSandboxOneBotDebugRecordInput>): SandboxConsoleOneBotDebugRecord => {
    const query = withoutSpaceId(input)
    if (input.spaceId) {
      if (!testSpaces) throw new Error('AI 测试空间服务不可用')
      const space = testSpaces.getSpace(input.spaceId)
      return {
        ...testSpaces.getControl(space.id).getOneBotDebugRecord(query),
        source: { type: 'test-space', spaceId: space.id, name: space.name },
      }
    }
    try {
      return { ...control.getOneBotDebugRecord(query), source: mainSource }
    } catch (error) {
      for (const space of testSpaces?.listSpaces() ?? []) {
        try {
          return {
            ...testSpaces!.getControl(space.id).getOneBotDebugRecord(query),
            source: { type: 'test-space', spaceId: space.id, name: space.name },
          }
        } catch {
          // 继续在其他空间查找。
        }
      }
      throw error
    }
  }
  const clearDebugRecords = (input: { spaceId?: string } = {}): ClearSandboxOneBotDebugRecordsResult => {
    if (input.spaceId) return { cleared: resolveControl(input, true).clearOneBotDebugRecords() }
    let cleared = control.clearOneBotDebugRecords()
    for (const space of testSpaces?.listSpaces() ?? []) {
      // 主调试页展示的是联邦视图，清理必须覆盖运行中的 AI 空间，不能要求用户先接管。
      cleared += testSpaces!.getControl(space.id).clearOneBotDebugRecords()
    }
    return { cleared }
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
  console.addListener('onebot-sandbox/set-message-reaction', async (input) => {
    await resolveControl(input, true).setMessageReaction(assertInteractionInput(withoutSpaceId(input)) as SetMessageReactionInput)
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
  console.addListener('onebot-sandbox/manage-environment', async (input) => {
    const activeControl = resolveControl(input, true)
    const command = assertEnvironmentInput(withoutSpaceId(input) as ManageSandboxEnvironmentInput)
    switch (command.action) {
      case 'create-user':
        activeControl.createUser({ ...command.data, avatar: await activeControl.importAvatar('user', command.data.id, command.data.avatar) })
        break
      case 'update-user':
        activeControl.updateUser(command.data.avatar === undefined ? command.data : { ...command.data, avatar: await activeControl.importAvatar('user', command.data.id, command.data.avatar) })
        break
      case 'delete-user':
        activeControl.deleteUser(command.data)
        break
      case 'create-bot':
        activeControl.createBot({ ...command.data, avatar: await activeControl.importAvatar('bot', command.data.id, command.data.avatar) })
        break
      case 'update-bot':
        activeControl.updateBot(command.data.avatar === undefined ? command.data : { ...command.data, avatar: await activeControl.importAvatar('bot', command.data.id, command.data.avatar) })
        break
      case 'delete-bot':
        activeControl.deleteBot(command.data)
        break
      case 'create-group':
        activeControl.createGroup({ ...command.data, avatar: await activeControl.importAvatar('group', command.data.id, command.data.avatar) })
        break
      case 'update-group':
        activeControl.updateGroup(command.data.avatar === undefined ? command.data : { ...command.data, avatar: await activeControl.importAvatar('group', command.data.id, command.data.avatar) })
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
  console.addListener('onebot-sandbox/debug-records', listDebugRecords, { authority: 4 })
  console.addListener('onebot-sandbox/debug-record', getDebugRecord, { authority: 4 })
  console.addListener('onebot-sandbox/clear-debug-records', clearDebugRecords, { authority: 4 })
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
      const space = testSpaces.createSpace({ name })
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
    'onebot-sandbox/set-message-reaction'(input: SpaceScoped<SetMessageReactionInput>): Promise<SandboxWorkspaceState>
    'onebot-sandbox/media-content'(input: SpaceScoped<GetMediaContentInput>): SandboxMediaContent
    'onebot-sandbox/set-group-announcement'(input: SpaceScoped<SetGroupAnnouncementInput>): SandboxWorkspaceState
    'onebot-sandbox/delete-group-announcement'(input: SpaceScoped<DeleteGroupAnnouncementInput>): SandboxWorkspaceState
    'onebot-sandbox/manage-environment'(input: SpaceScoped<ManageSandboxEnvironmentInput>): Promise<SandboxWorkspaceState>
    'onebot-sandbox/friend-action'(input: SpaceScoped<PerformFriendActionInput>): Promise<SandboxWorkspaceState>
    'onebot-sandbox/group-action'(input: SpaceScoped<PerformGroupActionInput>): Promise<SandboxWorkspaceState>
    'onebot-sandbox/bot-deliveries'(input?: SpaceScoped<GetSandboxBotDeliveriesInput>): SandboxBotDelivery[]
    'onebot-sandbox/debug-records'(input?: SpaceScoped<GetSandboxOneBotDebugRecordsInput>): SandboxOneBotDebugRecordsPage<SandboxConsoleOneBotDebugRecord>
    'onebot-sandbox/debug-record'(input: SpaceScoped<GetSandboxOneBotDebugRecordInput>): SandboxConsoleOneBotDebugRecord
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
