import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type {} from '@koishijs/console'
import { lookupChatLunaUsage, type ChatLunaUsageLookup } from './chatluna-usage'
import { listConversationIds } from './conversation-resolution'
import { buildSandboxModelRequestTrajectoryFromStore } from './model-request-trajectory'
import type { SandboxControlService } from './control-service'
import type { ListSandboxMcpCallRecordsInput, SandboxMcpCallRecordsPage } from './mcp/call-records'
import type { SandboxMcpService } from './mcp/service'
import type { SandboxMcpCallRecord, SandboxMcpCapabilityCatalog, SandboxMcpScope } from './mcp/types'
import type {
  LocateSandboxPresetExpressionInput,
  LocateSandboxPresetExpressionResult,
  ReadSandboxPresetInput,
  SandboxPresetDocument,
  SandboxPresetService,
} from './presets'
import type {
  CreatePresetInput,
  DeletePresetInput,
  PresetDocumentKind,
  RenamePresetInput,
  SavePresetInput,
} from './presets'
import { trimSnapshotMessages, type SandboxTestSpaceService, type SandboxTestSpaceSummary } from './test-spaces'
import {
  DEFAULT_MODEL_REQUEST_PAGE_SIZE,
  MAIN_MODEL_REQUEST_SCOPE_ID,
  MAX_MODEL_REQUEST_PAGE_SIZE,
  mergeModelRequestRecordPages,
  type SandboxModelRequestStore,
} from './model-request'
import type {
  DeleteGroupAnnouncementInput,
  ClearSandboxOneBotDebugRecordsResult,
  ClearSandboxModelRequestRecordsResult,
  GetForwardMessageInput,
  GetMediaContentInput,
  GetMessageHistoryInput,
  GetSandboxBotDeliveriesInput,
  GetSandboxOneBotDebugRecordInput,
  GetSandboxOneBotDebugRecordsInput,
  GetSandboxModelRequestRecordsInput,
  GetSandboxWorkspaceInput,
  ListSandboxModelRequestRecordsInput,
  ReadSandboxModelRequestRecordInput,
  ReadSandboxModelRequestTrajectoryInput,
  SandboxConsoleModelRequestDetail,
  SandboxConsoleModelRequestListItem,
  SandboxModelRequestRecordsPage,
  SandboxModelRequestScope,
  SandboxModelRequestTrajectory,
  SandboxModelRequestSource,
  ManageSandboxEnvironmentInput,
  PerformFriendActionInput,
  PerformGroupActionInput,
  RecallMessageInput,
  ClearConversationMessagesInput,
  BranchConversationInstanceInput,
  CreateConversationInstanceInput,
  DeleteConversationInstanceInput,
  RenameConversationInstanceInput,
  SearchConversationMessagesInput,
  SetMessageReactionInput,
  SandboxAppearance,
  SandboxBotDelivery,
  SandboxConsoleOneBotDebugRecord,
  SandboxEntitySource,
  SandboxForward,
  SandboxMediaContent,
  SandboxMessageHistory,
  SandboxMessageSearchResult,
  SandboxConversationInstanceResult,
  SandboxOneBotDebugRecordsPage,
  SandboxWorkspaceState,
  SendForwardMessageInput,
  SendMediaMessageInput,
  SendMessageInput,
  SetGroupAnnouncementInput,
} from './types'
import { getSandboxUsers } from './types'

type ChatLunaUsageSource = ChatLunaUsageLookup | (() => ChatLunaUsageLookup | undefined)

function resolveChatLunaUsage(source: ChatLunaUsageSource | undefined): ChatLunaUsageLookup | undefined {
  return typeof source === 'function' ? source() : source
}

type SpaceScoped<Input> = Input & { spaceId?: string }

interface ConsoleEventMap {
  'chatluna-sandbox/workspace': (input?: SpaceScoped<GetSandboxWorkspaceInput>) => Promise<SandboxWorkspaceState>
  'chatluna-sandbox/message-history': (input: SpaceScoped<GetMessageHistoryInput>) => Promise<SandboxMessageHistory>
  'chatluna-sandbox/search-conversation-messages': (input: SpaceScoped<SearchConversationMessagesInput>) => Promise<SandboxMessageSearchResult>
  'chatluna-sandbox/send-message': (input: SpaceScoped<SendMessageInput>) => Promise<SandboxWorkspaceState>
  'chatluna-sandbox/create-conversation-instance': (input: SpaceScoped<CreateConversationInstanceInput>) => Promise<SandboxConversationInstanceResult>
  'chatluna-sandbox/branch-conversation-instance': (input: SpaceScoped<BranchConversationInstanceInput>) => Promise<SandboxConversationInstanceResult>
  'chatluna-sandbox/rename-conversation-instance': (input: SpaceScoped<RenameConversationInstanceInput>) => Promise<SandboxWorkspaceState>
  'chatluna-sandbox/delete-conversation-instance': (input: SpaceScoped<DeleteConversationInstanceInput>) => Promise<SandboxWorkspaceState>
  'chatluna-sandbox/send-media-message': (input: SpaceScoped<SendMediaMessageInput>) => Promise<SandboxWorkspaceState>
  'chatluna-sandbox/send-forward-message': (input: SpaceScoped<SendForwardMessageInput>) => Promise<SandboxWorkspaceState>
  'chatluna-sandbox/get-forward-message': (input: SpaceScoped<GetForwardMessageInput>) => Promise<SandboxForward>
  'chatluna-sandbox/recall-message': (input: SpaceScoped<RecallMessageInput>) => Promise<SandboxWorkspaceState>
  'chatluna-sandbox/clear-conversation-messages': (input: SpaceScoped<ClearConversationMessagesInput>) => Promise<SandboxWorkspaceState>
  'chatluna-sandbox/set-message-reaction': (input: SpaceScoped<SetMessageReactionInput>) => Promise<SandboxWorkspaceState>
  'chatluna-sandbox/media-content': (input: SpaceScoped<GetMediaContentInput>) => Promise<SandboxMediaContent>
  'chatluna-sandbox/set-group-announcement': (input: SpaceScoped<SetGroupAnnouncementInput>) => Promise<SandboxWorkspaceState>
  'chatluna-sandbox/delete-group-announcement': (input: SpaceScoped<DeleteGroupAnnouncementInput>) => Promise<SandboxWorkspaceState>
  'chatluna-sandbox/manage-environment': (input: SpaceScoped<ManageSandboxEnvironmentInput>) => Promise<SandboxWorkspaceState>
  'chatluna-sandbox/friend-action': (input: SpaceScoped<PerformFriendActionInput>) => Promise<SandboxWorkspaceState>
  'chatluna-sandbox/group-action': (input: SpaceScoped<PerformGroupActionInput>) => Promise<SandboxWorkspaceState>
  'chatluna-sandbox/bot-deliveries': (input?: SpaceScoped<GetSandboxBotDeliveriesInput>) => Promise<SandboxBotDelivery[]>
  'chatluna-sandbox/debug-records': (input?: SpaceScoped<GetSandboxOneBotDebugRecordsInput>) => Promise<SandboxOneBotDebugRecordsPage<SandboxConsoleOneBotDebugRecord>>
  'chatluna-sandbox/debug-record': (input: SpaceScoped<GetSandboxOneBotDebugRecordInput>) => Promise<SandboxConsoleOneBotDebugRecord>
  'chatluna-sandbox/clear-debug-records': (input?: { spaceId?: string }) => Promise<ClearSandboxOneBotDebugRecordsResult>
  'chatluna-sandbox/model-request-records': (input: ListSandboxModelRequestRecordsInput) => Promise<SandboxModelRequestRecordsPage<SandboxConsoleModelRequestListItem>>
  'chatluna-sandbox/model-request-record': (input: ReadSandboxModelRequestRecordInput) => Promise<SandboxConsoleModelRequestDetail>
  'chatluna-sandbox/model-request-trajectory': (input: ReadSandboxModelRequestTrajectoryInput) => Promise<SandboxModelRequestTrajectory>
  'chatluna-sandbox/clear-model-request-records': (input: SandboxModelRequestScope) => Promise<ClearSandboxModelRequestRecordsResult>
  'chatluna-sandbox/preset-catalog': (input?: { kind?: PresetDocumentKind }) => Promise<SandboxPresetDocument[]>
  'chatluna-sandbox/preset-read': (input: ReadSandboxPresetInput) => Promise<SandboxPresetDocument>
  'chatluna-sandbox/preset-create': (input: CreatePresetInput) => Promise<SandboxPresetDocument>
  'chatluna-sandbox/preset-save': (input: SavePresetInput) => Promise<SandboxPresetDocument>
  'chatluna-sandbox/preset-rename': (input: RenamePresetInput) => Promise<SandboxPresetDocument>
  'chatluna-sandbox/preset-delete': (input: DeletePresetInput) => Promise<{ deleted: true }>
  'chatluna-sandbox/preset-locate-expression': (input: LocateSandboxPresetExpressionInput) => Promise<LocateSandboxPresetExpressionResult>
  'chatluna-sandbox/mcp-call-records': (input?: ListSandboxMcpCallRecordsInput) => SandboxMcpCallRecordsPage
  'chatluna-sandbox/mcp-call-record': (input: { recordId: string }) => SandboxMcpCallRecord
  'chatluna-sandbox/clear-mcp-call-records': () => { cleared: number }
  'chatluna-sandbox/mcp-activity': () => { running: boolean }
  'chatluna-sandbox/mcp-capabilities': () => SandboxMcpCapabilityCatalog
  'chatluna-sandbox/mcp-credentials': () => Array<{ id: string; name: string; scopes: SandboxMcpScope[]; enabled: boolean; createdAt: string; token?: string }>
  'chatluna-sandbox/create-mcp-credential': (input: { name: string; scopes: SandboxMcpScope[] }) => { id: string; name: string; scopes: SandboxMcpScope[]; enabled: boolean; createdAt: string; token: string }
  'chatluna-sandbox/update-mcp-credential': (input: { id: string; name?: string; scopes?: SandboxMcpScope[] }) => { id: string; name: string; scopes: SandboxMcpScope[]; enabled: boolean; createdAt: string; token?: string }
  'chatluna-sandbox/rotate-mcp-credential-token': (input: { id: string }) => { id: string; name: string; scopes: SandboxMcpScope[]; enabled: boolean; createdAt: string; token: string }
  'chatluna-sandbox/set-mcp-credential-enabled': (input: { id: string; enabled: boolean }) => void
  'chatluna-sandbox/revoke-mcp-credential': (input: { id: string }) => void
  'chatluna-sandbox/test-spaces': () => SandboxTestSpaceSummary[]
  'chatluna-sandbox/create-test-space': (input: { name?: string }) => SandboxTestSpaceSummary
  'chatluna-sandbox/take-over-test-space': (input: { spaceId: string }) => SandboxTestSpaceSummary
  'chatluna-sandbox/return-test-space': (input: { spaceId: string }) => SandboxTestSpaceSummary
  'chatluna-sandbox/terminate-test-space': (input: { spaceId: string }) => SandboxTestSpaceSummary
  'chatluna-sandbox/reactivate-test-space': (input: { spaceId: string }) => SandboxTestSpaceSummary
  'chatluna-sandbox/delete-test-space': (input: { spaceId: string }) => void
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
  const installedRoot = resolve(workspace, 'node_modules/koishi-plugin-chatluna-sandbox')
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
  unattributedModelRequests?: SandboxModelRequestStore,
  chatlunaUsage?: ChatLunaUsageSource,
  presets?: SandboxPresetService,
) {
  console.addEntry(resolveConsoleEntry())

  // 场景变更实时广播给 WebQQ：发送消息不再等待机器人处理完成，机器人回复靠此通知前端刷新。
  control.onSceneMutation(({ revision }) => {
    void console.broadcast('chatluna-sandbox/scene-mutated', { revision })
  })
  testSpaces?.onSpaceCreated((spaceId, spaceControl) => {
    spaceControl.onSceneMutation(({ revision }) => {
      void console.broadcast('chatluna-sandbox/scene-mutated', { spaceId, revision })
    })
  })

  const resolveControl = (input: { spaceId?: string } | undefined, mutation: boolean) => {
    if (!input?.spaceId) return control
    if (!testSpaces) throw new Error('AI 测试空间服务不可用')
    return mutation ? testSpaces.requireUserControl(input.spaceId) : testSpaces.getControl(input.spaceId)
  }
  const resolveReadyControl = async (input: { spaceId?: string } | undefined, mutation: boolean) => {
    const activeControl = resolveControl(input, mutation)
    await activeControl.waitForSceneReady()
    return activeControl
  }
  const withoutSpaceId = <Input extends { spaceId?: string }>(input: Input): Omit<Input, 'spaceId'> => {
    const { spaceId: _spaceId, ...rest } = input
    return rest
  }
  const mainSource: SandboxEntitySource = { type: 'main', name: '主环境' }
  const getDebugPage = async (
    activeControl: SandboxControlService,
    source: SandboxEntitySource,
    input: GetSandboxOneBotDebugRecordsInput,
  ): Promise<SandboxOneBotDebugRecordsPage<SandboxConsoleOneBotDebugRecord>> => {
    const page = await activeControl.getOneBotDebugRecords(input)
    return {
      ...page,
      records: page.records.map((record) => ({ ...record, source })),
    }
  }
  const listDebugRecords = async (
    input: SpaceScoped<GetSandboxOneBotDebugRecordsInput> = {},
  ): Promise<SandboxOneBotDebugRecordsPage<SandboxConsoleOneBotDebugRecord>> => {
    const query = withoutSpaceId(input)
    if (input.spaceId) {
      if (!testSpaces) throw new Error('AI 测试空间服务不可用')
      const space = testSpaces.getSpace(input.spaceId)
      const spaceControl = testSpaces.getControl(space.id)
      await spaceControl.waitForPersistence()
      return getDebugPage(spaceControl, {
        type: 'test-space',
        spaceId: space.id,
        name: space.name,
      }, query)
    }
    // 联邦视图必须等各空间恢复完成，避免把“仍在加载”误报成空历史。
    const spaceControls = (testSpaces?.listSpaces() ?? []).map((space) => ({
      space,
      control: testSpaces!.getControl(space.id),
    }))
    await Promise.all([control.waitForPersistence(), ...spaceControls.map(({ control: activeControl }) => activeControl.waitForPersistence())])
    // 联邦视图跨多个独立 sequence，仅聚合首页；精确游标分页必须带 spaceId。
    const pages = await Promise.all([
      getDebugPage(control, mainSource, { ...query, beforeSequence: undefined }),
      ...spaceControls.map(({ space, control: activeControl }) => getDebugPage(activeControl, {
        type: 'test-space',
        spaceId: space.id,
        name: space.name,
      }, { ...query, beforeSequence: undefined })),
    ])
    const limit = Math.min(Math.max(Number(query.limit ?? 50) || 50, 1), 200)
    const sign = query.order === 'asc' ? 1 : -1
    const records = pages
      .flatMap(({ records: items }) => items)
      .sort((left, right) => sign * (left.createdAt.localeCompare(right.createdAt) || left.sequence - right.sequence))
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
  const getDebugRecord = async (input: SpaceScoped<GetSandboxOneBotDebugRecordInput>): Promise<SandboxConsoleOneBotDebugRecord> => {
    const query = withoutSpaceId(input)
    if (input.spaceId) {
      if (!testSpaces) throw new Error('AI 测试空间服务不可用')
      const space = testSpaces.getSpace(input.spaceId)
      const spaceControl = testSpaces.getControl(space.id)
      await spaceControl.waitForPersistence()
      return {
        ...await spaceControl.getOneBotDebugRecord(query),
        source: { type: 'test-space', spaceId: space.id, name: space.name },
      }
    }
    await control.waitForPersistence()
    try {
      return { ...await control.getOneBotDebugRecord(query), source: mainSource }
    } catch (error) {
      for (const space of testSpaces?.listSpaces() ?? []) {
        try {
          const spaceControl = testSpaces!.getControl(space.id)
          await spaceControl.waitForPersistence()
          return {
            ...await spaceControl.getOneBotDebugRecord(query),
            source: { type: 'test-space', spaceId: space.id, name: space.name },
          }
        } catch {
          // 继续在其他空间查找。
        }
      }
      throw error
    }
  }
  const clearDebugRecords = async (input: { spaceId?: string } = {}): Promise<ClearSandboxOneBotDebugRecordsResult> => {
    if (input.spaceId) return { cleared: await resolveControl(input, true).clearOneBotDebugRecords() }
    let cleared = await control.clearOneBotDebugRecords()
    for (const space of testSpaces?.listSpaces() ?? []) {
      // 主调试页展示的是联邦视图，清理必须覆盖运行中的 AI 空间，不能要求用户先接管。
      cleared += await testSpaces!.getControl(space.id).clearOneBotDebugRecords()
    }
    return { cleared }
  }
  const getWorkspace = async (input: SpaceScoped<GetSandboxWorkspaceInput> = {}): Promise<SandboxWorkspaceState> => {
    assertNoLegacyRpcFields(input)
    const activeControl = await resolveReadyControl(input, false)
    const snapshot = activeControl.getSnapshot()
    if (input.operatorId && !snapshot.participants.some(({ id }) => id === input.operatorId)) {
      throw new Error(`参与者不存在：${input.operatorId}`)
    }
    const visibleParticipantId = input.operatorId ?? getSandboxUsers(snapshot)[0]?.id ?? snapshot.participants[0]?.id
    const visibleSnapshot = visibleParticipantId ? activeControl.getVisibleSnapshot(visibleParticipantId, input.messageLimit) : snapshot
    const visibleConversationIds = listConversationIds(visibleSnapshot)
    return {
      snapshot: visibleSnapshot,
      chatLunaStates: activeControl.getChatLunaStates().filter(({ conversationId }) => visibleConversationIds.has(conversationId)),
      appearance,
      persistence: control.getPersistenceStatus(),
    }
  }

  // Koishi 的 Events 映射规模较大，直接调用泛型 addListener 会让 TypeScript
  // 展开整个事件联合并触发 TS2590；这里保留事件名约束，回调由各领域函数自身类型校验。
  const registerListener = console.addListener.bind(console) as (
    event: keyof ConsoleEventMap,
    callback: (...args: any[]) => any,
    options: { authority: number },
  ) => unknown
  const workspaceListener = (input?: SpaceScoped<GetSandboxWorkspaceInput>) => getWorkspace(input)
  registerListener('chatluna-sandbox/workspace', workspaceListener, { authority: 4 })
  registerListener('chatluna-sandbox/message-history', async (input) => (await resolveReadyControl(input, false)).getMessageHistory(assertInteractionInput(withoutSpaceId(input)) as GetMessageHistoryInput), { authority: 4 })
  registerListener('chatluna-sandbox/search-conversation-messages', async (input) => (
    await resolveReadyControl(input, false)
  ).searchConversationMessages(assertInteractionInput(withoutSpaceId(input)) as SearchConversationMessagesInput), { authority: 4 })
  registerListener('chatluna-sandbox/create-conversation-instance', async (input) => {
    // 与其余变更端点同口径返回完整工作区状态，外加新会话 ID，客户端一次请求完成状态替换与选中。
    const { conversationId } = (await resolveReadyControl(input, true))
      .createConversationInstance(assertInteractionInput(withoutSpaceId(input)) as CreateConversationInstanceInput)
    return { ...await getWorkspace({ spaceId: input.spaceId, operatorId: input.operatorId }), conversationId }
  }, { authority: 4 })
  registerListener('chatluna-sandbox/branch-conversation-instance', async (input) => {
    const { conversationId } = (await resolveReadyControl(input, true))
      .branchConversationInstance(assertInteractionInput(withoutSpaceId(input)) as BranchConversationInstanceInput)
    return { ...await getWorkspace({ spaceId: input.spaceId, operatorId: input.operatorId }), conversationId }
  }, { authority: 4 })
  registerListener('chatluna-sandbox/rename-conversation-instance', async (input) => {
    (await resolveReadyControl(input, true))
      .renameConversationInstance(assertInteractionInput(withoutSpaceId(input)) as RenameConversationInstanceInput)
    return getWorkspace({ spaceId: input.spaceId, operatorId: input.operatorId })
  }, { authority: 4 })
  registerListener('chatluna-sandbox/delete-conversation-instance', async (input) => {
    (await resolveReadyControl(input, true))
      .deleteConversationInstance(assertInteractionInput(withoutSpaceId(input)) as DeleteConversationInstanceInput)
    return getWorkspace({ spaceId: input.spaceId, operatorId: input.operatorId })
  }, { authority: 4 })
  registerListener('chatluna-sandbox/send-message', async (input) => {
    // 消息同步落库后立即返回，机器人投递在后台继续；派发失败已写入调试记录与日志。
    const { delivery } = (await resolveReadyControl(input, true)).startMessageSend(assertInteractionInput(withoutSpaceId(input)) as SendMessageInput)
    delivery.catch(() => {})
    return getWorkspace({ spaceId: input.spaceId, operatorId: input.operatorId })
  }, { authority: 4 })
  registerListener('chatluna-sandbox/send-media-message', async (input) => {
    const { delivery } = (await resolveReadyControl(input, true)).startMediaMessageSend(assertInteractionInput(withoutSpaceId(input)) as SendMediaMessageInput)
    delivery.catch(() => {})
    return getWorkspace({ spaceId: input.spaceId, operatorId: input.operatorId })
  }, { authority: 4 })
  registerListener('chatluna-sandbox/send-forward-message', async (input) => {
    // 合并转发领域路径会等待机器人投递，保证返回的工作区已包含外层 forward 卡片。
    await (await resolveReadyControl(input, true)).sendForwardMessage(assertInteractionInput(withoutSpaceId(input)) as SendForwardMessageInput)
    return getWorkspace({ spaceId: input.spaceId, operatorId: input.operatorId })
  }, { authority: 4 })
  registerListener('chatluna-sandbox/get-forward-message', async (input) => (
    await resolveReadyControl(input, false)
  ).getForwardMessage(assertInteractionInput(withoutSpaceId(input)) as GetForwardMessageInput), { authority: 4 })
  registerListener('chatluna-sandbox/recall-message', async (input) => {
    await (await resolveReadyControl(input, true)).recallMessage(assertInteractionInput(withoutSpaceId(input)) as RecallMessageInput)
    return getWorkspace({ spaceId: input.spaceId, operatorId: input.operatorId })
  }, { authority: 4 })
  registerListener('chatluna-sandbox/clear-conversation-messages', async (input) => {
    (await resolveReadyControl(input, true)).clearConversationMessages(assertInteractionInput(withoutSpaceId(input)) as ClearConversationMessagesInput)
    return getWorkspace({ spaceId: input.spaceId, operatorId: input.operatorId })
  }, { authority: 4 })
  registerListener('chatluna-sandbox/set-message-reaction', async (input) => {
    await (await resolveReadyControl(input, true)).setMessageReaction(assertInteractionInput(withoutSpaceId(input)) as SetMessageReactionInput)
    return getWorkspace({ spaceId: input.spaceId, operatorId: input.operatorId })
  }, { authority: 4 })
  registerListener('chatluna-sandbox/media-content', async (input) => (await resolveReadyControl(input, false)).getMediaContent(assertInteractionInput(withoutSpaceId(input)) as GetMediaContentInput), { authority: 4 })
  registerListener('chatluna-sandbox/set-group-announcement', async (input) => {
    (await resolveReadyControl(input, true)).setGroupAnnouncement(assertInteractionInput(withoutSpaceId(input)) as SetGroupAnnouncementInput)
    return getWorkspace({ spaceId: input.spaceId, operatorId: input.operatorId })
  }, { authority: 4 })
  registerListener('chatluna-sandbox/delete-group-announcement', async (input) => {
    (await resolveReadyControl(input, true)).deleteGroupAnnouncement(assertInteractionInput(withoutSpaceId(input)) as DeleteGroupAnnouncementInput)
    return getWorkspace({ spaceId: input.spaceId, operatorId: input.operatorId })
  }, { authority: 4 })
  registerListener('chatluna-sandbox/manage-environment', async (input) => {
    const activeControl = await resolveReadyControl(input, true)
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
  registerListener('chatluna-sandbox/friend-action', async (input) => {
    await (await resolveReadyControl(input, true)).performFriendAction(assertInteractionInput(withoutSpaceId(input)) as PerformFriendActionInput)
    return getWorkspace({ spaceId: input.spaceId, operatorId: input.operatorId })
  }, { authority: 4 })
  registerListener('chatluna-sandbox/group-action', async (input) => {
    await (await resolveReadyControl(input, true)).performGroupAction(assertInteractionInput(withoutSpaceId(input)) as PerformGroupActionInput)
    return getWorkspace({ spaceId: input.spaceId, operatorId: input.operatorId })
  }, { authority: 4 })
  registerListener('chatluna-sandbox/bot-deliveries', async (input = {}) => (await resolveReadyControl(input, false)).getBotDeliveries(assertInteractionInput(withoutSpaceId(input)) as GetSandboxBotDeliveriesInput), { authority: 4 })
  const requireUnattributedModelRequests = () => {
    if (!unattributedModelRequests) throw new Error('未归属模型请求库不可用')
    return unattributedModelRequests
  }
  const resolveModelRequestSource = (input: SandboxModelRequestScope): SandboxModelRequestSource => {
    if (input.scope === 'unattributed') return { type: 'unattributed', name: '未归属' }
    if (input.scope === 'all') return { type: 'main', name: '全部空间' }
    if (input.scope === 'main' || input.spaceId === MAIN_MODEL_REQUEST_SCOPE_ID) return { type: 'main', name: '主环境' }
    if (input.scope !== 'space' || !input.spaceId?.trim()) throw new Error('必须指定 all、main、space 或 unattributed')
    if (!testSpaces) throw new Error('AI 测试空间服务不可用')
    const space = testSpaces.getSpace(input.spaceId)
    return { type: 'test-space', spaceId: space.id, name: space.name }
  }
  const resolveModelRequestControl = (input: SandboxModelRequestScope) => {
    if (input.scope === 'unattributed' || input.scope === 'all') return
    if (input.scope === 'main') return control
    if (input.scope !== 'space' || !input.spaceId?.trim()) throw new Error('必须指定 all、main、space 或 unattributed')
    if (input.spaceId === MAIN_MODEL_REQUEST_SCOPE_ID) return control
    if (!testSpaces) throw new Error('AI 测试空间服务不可用')
    return testSpaces.getControl(input.spaceId)
  }
  const listAttributedModelRequestPages = (input: GetSandboxModelRequestRecordsInput) => {
    const query: GetSandboxModelRequestRecordsInput = {
      botId: input.botId,
      conversationId: input.conversationId,
      interactionId: input.interactionId,
      model: input.model,
      errorsOnly: input.errorsOnly,
      order: input.order,
      limit: input.limit,
      beforeCreatedAt: input.beforeCreatedAt,
      beforeId: input.beforeId,
    }
    const withSource = (
      page: SandboxModelRequestRecordsPage,
      source: SandboxModelRequestSource,
    ): SandboxModelRequestRecordsPage<SandboxConsoleModelRequestListItem> => ({
      ...page,
      records: page.records.map((record) => ({ ...record, source })),
    })
    return Promise.all([
      control.getModelRequestRecords(query).then((page) => withSource(page, { type: 'main', name: '主环境' })),
      ...(testSpaces?.listSpaces() ?? []).map((space) => testSpaces!.getControl(space.id)
        .getModelRequestRecords(query)
        .then((page) => withSource(page, { type: 'test-space', spaceId: space.id, name: space.name }))),
    ])
  }
  const listModelRequestRecords = async (input: ListSandboxModelRequestRecordsInput): Promise<SandboxModelRequestRecordsPage<SandboxConsoleModelRequestListItem>> => {
    if (input.scope === 'all') {
      const limit = Math.min(Math.max(Number(input.limit ?? DEFAULT_MODEL_REQUEST_PAGE_SIZE) || DEFAULT_MODEL_REQUEST_PAGE_SIZE, 1), MAX_MODEL_REQUEST_PAGE_SIZE)
      return mergeModelRequestRecordPages(await listAttributedModelRequestPages(input), limit, input.order === 'asc' ? 'asc' : 'desc')
    }
    const source = resolveModelRequestSource(input)
    const page = input.scope === 'unattributed'
      ? await requireUnattributedModelRequests().getRecords(input)
      : await resolveModelRequestControl(input)!.getModelRequestRecords(input)
    return {
      ...page,
      records: page.records.map((record) => ({ ...record, source })),
    }
  }
  const readModelRequestRecord = async (input: ReadSandboxModelRequestRecordInput): Promise<SandboxConsoleModelRequestDetail> => {
    if (input.scope === 'all') {
      try {
        return { ...await control.getModelRequestRecord(input), source: { type: 'main', name: '主环境' } }
      } catch (error) {
        for (const space of testSpaces?.listSpaces() ?? []) {
          try {
            return {
              ...await testSpaces!.getControl(space.id).getModelRequestRecord(input),
              source: { type: 'test-space', spaceId: space.id, name: space.name },
            }
          } catch {
            // 继续在其他已归属空间查找。
          }
        }
        throw error
      }
    }
    const source = resolveModelRequestSource(input)
    if (input.scope === 'unattributed') {
      const record = await requireUnattributedModelRequests().getRecord(input.recordId)
      if (!record) throw new Error(`模型请求记录不存在：${input.recordId}`)
      return { ...record, source }
    }
    return { ...await resolveModelRequestControl(input)!.getModelRequestRecord(input), source }
  }
  const getModelRequestRecord = async (input: ReadSandboxModelRequestRecordInput): Promise<SandboxConsoleModelRequestDetail> => {
    const detail = await readModelRequestRecord(input)
    // 可选服务可能晚于本插件加载或被热重载；详情读取时再解析，避免永久缓存初始化阶段的 undefined。
    const usage = await lookupChatLunaUsage(resolveChatLunaUsage(chatlunaUsage), detail)
    return usage ? { ...detail, usage } : detail
  }
  const getModelRequestTrajectory = async (input: ReadSandboxModelRequestTrajectoryInput): Promise<SandboxModelRequestTrajectory> => {
    const detail = await readModelRequestRecord(input)
    const store = input.scope === 'all'
      ? detail.source.type === 'main'
        ? control.getModelRequestStore()
        : detail.source.type === 'test-space'
          ? testSpaces?.getControl(detail.source.spaceId).getModelRequestStore()
          : undefined
      : input.scope === 'unattributed'
        ? requireUnattributedModelRequests()
        : resolveModelRequestControl(input)?.getModelRequestStore()
    return buildSandboxModelRequestTrajectoryFromStore({ record: detail, mode: input.mode, store })
  }
  const clearModelRequestRecords = async (input: SandboxModelRequestScope): Promise<ClearSandboxModelRequestRecordsResult> => {
    if (input.scope === 'all') throw new Error('全部空间视图不支持一次性清理')
    if (input.scope === 'unattributed') return { cleared: await requireUnattributedModelRequests().clear() }
    return { cleared: await resolveModelRequestControl(input)!.clearModelRequestRecords() }
  }

  registerListener('chatluna-sandbox/debug-records', listDebugRecords, { authority: 4 })
  registerListener('chatluna-sandbox/debug-record', getDebugRecord, { authority: 4 })
  registerListener('chatluna-sandbox/clear-debug-records', clearDebugRecords, { authority: 4 })
  registerListener('chatluna-sandbox/model-request-records', listModelRequestRecords, { authority: 4 })
  registerListener('chatluna-sandbox/model-request-record', getModelRequestRecord, { authority: 4 })
  registerListener('chatluna-sandbox/model-request-trajectory', getModelRequestTrajectory, { authority: 4 })
  registerListener('chatluna-sandbox/clear-model-request-records', clearModelRequestRecords, { authority: 4 })
  if (presets) {
    registerListener('chatluna-sandbox/preset-catalog', (input = {}) => presets.catalog(input.kind), { authority: 4 })
    registerListener('chatluna-sandbox/preset-read', (input) => presets.read(input), { authority: 4 })
    registerListener('chatluna-sandbox/preset-create', (input) => presets.create(input), { authority: 4 })
    registerListener('chatluna-sandbox/preset-save', (input) => presets.save(input), { authority: 4 })
    registerListener('chatluna-sandbox/preset-rename', (input) => presets.rename(input), { authority: 4 })
    registerListener('chatluna-sandbox/preset-delete', (input) => presets.delete(input), { authority: 4 })
    registerListener('chatluna-sandbox/preset-locate-expression', (input) => presets.locateExpression(input), { authority: 4 })
  }
  if (mcp) {
    mcp.onActivity((running) => {
      void console.broadcast('chatluna-sandbox/mcp-activity', { running })
    })
    registerListener('chatluna-sandbox/mcp-activity', () => ({ running: mcp.isActivityRunning() }), { authority: 4 })
    registerListener('chatluna-sandbox/mcp-capabilities', () => mcp.getCapabilityCatalog(), { authority: 4 })
    registerListener('chatluna-sandbox/mcp-call-records', (input = {}) => mcp.listCallRecords(input), { authority: 4 })
    registerListener('chatluna-sandbox/mcp-call-record', (input) => mcp.getCallRecord(input.recordId), { authority: 4 })
    registerListener('chatluna-sandbox/clear-mcp-call-records', () => mcp.clearCallRecords(), { authority: 4 })
    registerListener('chatluna-sandbox/mcp-credentials', () => mcp.listCredentials(), { authority: 4 })
    registerListener('chatluna-sandbox/create-mcp-credential', (input) => mcp.createCredential(input.name, input.scopes), { authority: 4 })
    registerListener('chatluna-sandbox/update-mcp-credential', (input) => mcp.updateCredential(input.id, input), { authority: 4 })
    registerListener('chatluna-sandbox/rotate-mcp-credential-token', (input) => mcp.rotateCredentialToken(input.id), { authority: 4 })
    registerListener('chatluna-sandbox/set-mcp-credential-enabled', (input) => mcp.setCredentialEnabled(input.id, input.enabled), { authority: 4 })
    registerListener('chatluna-sandbox/revoke-mcp-credential', (input) => mcp.revokeCredential(input.id), { authority: 4 })
  }
  if (testSpaces) {
    registerListener('chatluna-sandbox/test-spaces', () => testSpaces.listSpaces()
      .map((space) => ({ ...space, snapshot: trimSnapshotMessages(space.snapshot, 10) })), { authority: 4 })
    registerListener('chatluna-sandbox/create-test-space', ({ name }) => {
      const space = testSpaces.createSpace({ name })
      return testSpaces.takeOver(space.id)
    }, { authority: 4 })
    registerListener('chatluna-sandbox/take-over-test-space', ({ spaceId }) => testSpaces.takeOver(spaceId), { authority: 4 })
    registerListener('chatluna-sandbox/return-test-space', ({ spaceId }) => testSpaces.returnControl(spaceId), { authority: 4 })
    registerListener('chatluna-sandbox/terminate-test-space', ({ spaceId }) => testSpaces.terminateSpace(spaceId), { authority: 4 })
    registerListener('chatluna-sandbox/reactivate-test-space', ({ spaceId }) => testSpaces.reactivateSpace(spaceId), { authority: 4 })
    registerListener('chatluna-sandbox/delete-test-space', ({ spaceId }) => testSpaces.deleteSpace(spaceId), { authority: 4 })
  }
}

declare module '@koishijs/console' {
  interface Events {
    'chatluna-sandbox/workspace'(input?: SpaceScoped<GetSandboxWorkspaceInput>): Promise<SandboxWorkspaceState>
    'chatluna-sandbox/message-history'(input: SpaceScoped<GetMessageHistoryInput>): Promise<SandboxMessageHistory>
    'chatluna-sandbox/search-conversation-messages'(input: SpaceScoped<SearchConversationMessagesInput>): Promise<SandboxMessageSearchResult>
    'chatluna-sandbox/send-message'(input: SpaceScoped<SendMessageInput>): Promise<SandboxWorkspaceState>
    'chatluna-sandbox/create-conversation-instance'(input: SpaceScoped<CreateConversationInstanceInput>): Promise<SandboxConversationInstanceResult>
    'chatluna-sandbox/branch-conversation-instance'(input: SpaceScoped<BranchConversationInstanceInput>): Promise<SandboxConversationInstanceResult>
    'chatluna-sandbox/rename-conversation-instance'(input: SpaceScoped<RenameConversationInstanceInput>): Promise<SandboxWorkspaceState>
    'chatluna-sandbox/delete-conversation-instance'(input: SpaceScoped<DeleteConversationInstanceInput>): Promise<SandboxWorkspaceState>
    'chatluna-sandbox/send-media-message'(input: SpaceScoped<SendMediaMessageInput>): Promise<SandboxWorkspaceState>
    'chatluna-sandbox/send-forward-message'(input: SpaceScoped<SendForwardMessageInput>): Promise<SandboxWorkspaceState>
    'chatluna-sandbox/get-forward-message'(input: SpaceScoped<GetForwardMessageInput>): Promise<SandboxForward>
    'chatluna-sandbox/recall-message'(input: SpaceScoped<RecallMessageInput>): Promise<SandboxWorkspaceState>
    'chatluna-sandbox/clear-conversation-messages'(input: SpaceScoped<ClearConversationMessagesInput>): Promise<SandboxWorkspaceState>
    'chatluna-sandbox/set-message-reaction'(input: SpaceScoped<SetMessageReactionInput>): Promise<SandboxWorkspaceState>
    'chatluna-sandbox/media-content'(input: SpaceScoped<GetMediaContentInput>): Promise<SandboxMediaContent>
    'chatluna-sandbox/set-group-announcement'(input: SpaceScoped<SetGroupAnnouncementInput>): Promise<SandboxWorkspaceState>
    'chatluna-sandbox/delete-group-announcement'(input: SpaceScoped<DeleteGroupAnnouncementInput>): Promise<SandboxWorkspaceState>
    'chatluna-sandbox/manage-environment'(input: SpaceScoped<ManageSandboxEnvironmentInput>): Promise<SandboxWorkspaceState>
    'chatluna-sandbox/friend-action'(input: SpaceScoped<PerformFriendActionInput>): Promise<SandboxWorkspaceState>
    'chatluna-sandbox/group-action'(input: SpaceScoped<PerformGroupActionInput>): Promise<SandboxWorkspaceState>
    'chatluna-sandbox/bot-deliveries'(input?: SpaceScoped<GetSandboxBotDeliveriesInput>): Promise<SandboxBotDelivery[]>
    'chatluna-sandbox/debug-records'(input?: SpaceScoped<GetSandboxOneBotDebugRecordsInput>): Promise<SandboxOneBotDebugRecordsPage<SandboxConsoleOneBotDebugRecord>>
    'chatluna-sandbox/debug-record'(input: SpaceScoped<GetSandboxOneBotDebugRecordInput>): Promise<SandboxConsoleOneBotDebugRecord>
    'chatluna-sandbox/clear-debug-records'(input?: { spaceId?: string }): Promise<ClearSandboxOneBotDebugRecordsResult>
    'chatluna-sandbox/model-request-records'(input: ListSandboxModelRequestRecordsInput): Promise<SandboxModelRequestRecordsPage<SandboxConsoleModelRequestListItem>>
    'chatluna-sandbox/model-request-record'(input: ReadSandboxModelRequestRecordInput): Promise<SandboxConsoleModelRequestDetail>
    'chatluna-sandbox/model-request-trajectory'(input: ReadSandboxModelRequestTrajectoryInput): Promise<SandboxModelRequestTrajectory>
    'chatluna-sandbox/clear-model-request-records'(input: SandboxModelRequestScope): Promise<ClearSandboxModelRequestRecordsResult>
    'chatluna-sandbox/preset-catalog'(input?: { kind?: PresetDocumentKind }): Promise<SandboxPresetDocument[]>
    'chatluna-sandbox/preset-read'(input: ReadSandboxPresetInput): Promise<SandboxPresetDocument>
    'chatluna-sandbox/preset-create'(input: CreatePresetInput): Promise<SandboxPresetDocument>
    'chatluna-sandbox/preset-save'(input: SavePresetInput): Promise<SandboxPresetDocument>
    'chatluna-sandbox/preset-rename'(input: RenamePresetInput): Promise<SandboxPresetDocument>
    'chatluna-sandbox/preset-delete'(input: DeletePresetInput): Promise<{ deleted: true }>
    'chatluna-sandbox/preset-locate-expression'(input: LocateSandboxPresetExpressionInput): Promise<LocateSandboxPresetExpressionResult>
    'chatluna-sandbox/mcp-call-records'(input?: ListSandboxMcpCallRecordsInput): SandboxMcpCallRecordsPage
    'chatluna-sandbox/mcp-call-record'(input: { recordId: string }): SandboxMcpCallRecord
    'chatluna-sandbox/clear-mcp-call-records'(): { cleared: number }
    'chatluna-sandbox/mcp-activity'(): { running: boolean }
    'chatluna-sandbox/mcp-capabilities'(): SandboxMcpCapabilityCatalog
    'chatluna-sandbox/mcp-credentials'(): Array<{ id: string; name: string; scopes: SandboxMcpScope[]; enabled: boolean; createdAt: string; token?: string }>
    'chatluna-sandbox/create-mcp-credential'(input: { name: string; scopes: SandboxMcpScope[] }): { id: string; name: string; scopes: SandboxMcpScope[]; enabled: boolean; createdAt: string; token: string }
    'chatluna-sandbox/update-mcp-credential'(input: { id: string; name?: string; scopes?: SandboxMcpScope[] }): { id: string; name: string; scopes: SandboxMcpScope[]; enabled: boolean; createdAt: string; token?: string }
    'chatluna-sandbox/rotate-mcp-credential-token'(input: { id: string }): { id: string; name: string; scopes: SandboxMcpScope[]; enabled: boolean; createdAt: string; token: string }
    'chatluna-sandbox/set-mcp-credential-enabled'(input: { id: string; enabled: boolean }): void
    'chatluna-sandbox/revoke-mcp-credential'(input: { id: string }): void
    'chatluna-sandbox/test-spaces'(): SandboxTestSpaceSummary[]
    'chatluna-sandbox/create-test-space'(input: { name?: string }): SandboxTestSpaceSummary
    'chatluna-sandbox/take-over-test-space'(input: { spaceId: string }): SandboxTestSpaceSummary
    'chatluna-sandbox/return-test-space'(input: { spaceId: string }): SandboxTestSpaceSummary
    'chatluna-sandbox/terminate-test-space'(input: { spaceId: string }): SandboxTestSpaceSummary
    'chatluna-sandbox/reactivate-test-space'(input: { spaceId: string }): SandboxTestSpaceSummary
    'chatluna-sandbox/delete-test-space'(input: { spaceId: string }): void
  }
}
