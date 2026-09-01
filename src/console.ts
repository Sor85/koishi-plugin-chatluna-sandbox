import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type {} from '@koishijs/console'
import { lookupChatLunaUsage, type ChatLunaUsageLookup } from './chatluna-usage'
import { listConversationIds } from './conversation-resolution'
import { buildSandboxModelRequestTrajectoryFromStore } from './model-request-trajectory'
import type {
  SandboxConsoleBroadcasts,
  SandboxConsoleEvents,
  SpaceScoped,
} from './console-contract'
import type { SandboxControlService } from './control-service'
import type { SandboxMcpService } from './mcp/service'
import type { SandboxPresetService } from './presets'
import { trimSnapshotMessages, type SandboxTestSpaceService } from './test-spaces'
import {
  DEFAULT_MODEL_REQUEST_PAGE_SIZE,
  MAIN_MODEL_REQUEST_SCOPE_ID,
  MAX_MODEL_REQUEST_PAGE_SIZE,
  type SandboxModelRequestStore,
} from './model-request'
import { createScopeDirectory, type SceneScope } from './scope-directory'
import type {
  ClearSandboxOneBotDebugRecordsResult,
  ClearSandboxModelRequestRecordsResult,
  DeleteGroupAnnouncementInput,
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
  SandboxConsoleOneBotDebugRecord,
  SandboxEntitySource,
  GetForwardMessageInput,
  GetMediaContentInput,
  GetMessageHistoryInput,
  SandboxOneBotDebugRecordsPage,
  SandboxWorkspaceState,
  SendForwardMessageInput,
  SendMediaMessageInput,
  SendMessageInput,
  SetGroupAnnouncementInput,
} from './types'
import { getSandboxUsers, SandboxDomainError } from './types'

type ChatLunaUsageSource = ChatLunaUsageLookup | (() => ChatLunaUsageLookup | undefined)

function resolveChatLunaUsage(source: ChatLunaUsageSource | undefined): ChatLunaUsageLookup | undefined {
  return typeof source === 'function' ? source() : source
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
  addListener<Event extends keyof SandboxConsoleEvents>(
    event: Event,
    callback: SandboxConsoleEvents[Event],
    options: { authority: number },
  ): unknown
  broadcast<Channel extends keyof SandboxConsoleBroadcasts>(
    type: Channel,
    body: SandboxConsoleBroadcasts[Channel],
  ): unknown
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
  /**
   * 「谁是全部记录域」的唯一答案。三个可选服务的判空在此被吸收一次，之后不再出现。
   *
   * 由本函数入口包装而不是由插件入口传入：两处消费方（这里与测试控制服务）从同样三个输入
   * 派生，内容不可能漂移，而改成入口统一创建要动两个函数的签名与二十多处测试调用点。
   */
  const scopes = createScopeDirectory({ control, testSpaces, unattributedModelRequests })
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
  /**
   * 记录域目录只提供标识、名字与是不是主环境；投影成哪种来源形状留在这里。
   *
   * 来源形状属于 Console 契约的出参，让枚举模块去产出它等于把出参声明搬出契约。
   * `SandboxModelRequestSource` 是本类型的超集（多一个未归属），因此两种记录共用这一处投影。
   */
  const sceneSource = (scope: SceneScope): SandboxEntitySource => (scope.kind === 'main'
    ? mainSource
    : { type: 'test-space', spaceId: scope.id, name: scope.name })
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
    // 联邦视图跨多个独立 sequence，仅聚合首页；精确游标分页必须带 spaceId，因此不声明续页游标。
    return scopes.federate(
      (scope) => getDebugPage(scope.control, sceneSource(scope), { ...query, beforeSequence: undefined }),
      {
        limit: Math.min(Math.max(Number(query.limit ?? 50) || 50, 1), 200),
        order: query.order === 'asc' ? 'asc' : 'desc',
        tieBreak: ({ sequence }) => sequence,
      },
    )
  }
  const getDebugRecord = async (input: SpaceScoped<GetSandboxOneBotDebugRecordInput>): Promise<SandboxConsoleOneBotDebugRecord> => {
    const query = withoutSpaceId(input)
    if (input.spaceId) {
      if (!testSpaces) throw new Error('AI 测试空间服务不可用')
      const space = testSpaces.getSpace(input.spaceId)
      const spaceControl = testSpaces.getControl(space.id)
      await spaceControl.waitForPersistence()
      return {
        ...await spaceControl.getOneBotDebugStore().requireRecord(query.recordId, query.includeLargeValues === true),
        source: { type: 'test-space', spaceId: space.id, name: space.name },
      }
    }
    const hit = await scopes.findFirst((scope) => scope.control.findOneBotDebugRecord(query))
    if (!hit) throw new SandboxDomainError(`调试记录不存在：${query.recordId}`)
    return { ...hit.value, source: sceneSource(hit.scope) }
  }
  const clearDebugRecords = async (input: { spaceId?: string } = {}): Promise<ClearSandboxOneBotDebugRecordsResult> => {
    if (input.spaceId) return { cleared: await resolveControl(input, true).clearOneBotDebugRecords() }
    // 主调试页展示的是联邦视图，清理必须覆盖运行中的 AI 空间，不能要求用户先接管。
    const cleared = await scopes.forEachScene(({ control: scopeControl }) => scopeControl.clearOneBotDebugRecords())
    return { cleared: cleared.reduce((total, count) => total + count, 0) }
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
    event: keyof SandboxConsoleEvents,
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
  /**
   * 联邦读取用的查询：`beforeSequence` 与 `spaceId` 刻意不透传。
   *
   * 序号是每个记录域各自独立的计数，跨记录域的精确游标没有意义；联邦续页只用时间与记录标识。
   */
  const federatedModelRequestQuery = (input: GetSandboxModelRequestRecordsInput): GetSandboxModelRequestRecordsInput => ({
    botId: input.botId,
    conversationId: input.conversationId,
    interactionId: input.interactionId,
    model: input.model,
    errorsOnly: input.errorsOnly,
    order: input.order,
    limit: input.limit,
    beforeCreatedAt: input.beforeCreatedAt,
    beforeId: input.beforeId,
  })
  const listModelRequestRecords = async (input: ListSandboxModelRequestRecordsInput): Promise<SandboxModelRequestRecordsPage<SandboxConsoleModelRequestListItem>> => {
    if (input.scope === 'all') {
      const query = federatedModelRequestQuery(input)
      // 「全部」排除未归属不写在这里：联邦读取本来就只遍历拥有场景的记录域。
      const { next, ...page } = await scopes.federate(async (scope) => {
        const scopePage = await scope.control.getModelRequestRecords(query)
        return { ...scopePage, records: scopePage.records.map((record) => ({ ...record, source: sceneSource(scope) })) }
      }, {
        limit: Math.min(Math.max(Number(input.limit ?? DEFAULT_MODEL_REQUEST_PAGE_SIZE) || DEFAULT_MODEL_REQUEST_PAGE_SIZE, 1), MAX_MODEL_REQUEST_PAGE_SIZE),
        order: input.order === 'asc' ? 'asc' : 'desc',
        tieBreak: ({ id }) => id,
        // 时间与记录标识的组合跨记录域全局可比，WebQQ 的「加载更多」正在用它续页。
        nextCursor: ({ createdAt, id }) => ({ nextCreatedAt: createdAt, nextId: id }),
      })
      return { ...page, ...next }
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
      const hit = await scopes.findFirst((scope) => scope.control.getModelRequestStore().getRecord(input.recordId))
      if (!hit) throw new SandboxDomainError(`模型请求记录不存在：${input.recordId}`)
      return { ...hit.value, source: sceneSource(hit.scope) }
    }
    const source = resolveModelRequestSource(input)
    if (input.scope === 'unattributed') {
      return { ...await requireUnattributedModelRequests().requireRecord(input.recordId), source }
    }
    return { ...await resolveModelRequestControl(input)!.getModelRequestStore().requireRecord(input.recordId), source }
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

/**
 * 对 `@koishijs/console` 的模块增强从契约派生：`Events` 直接继承契约映射，
 * 因此端点名与签名不在这里第二次出现。属性函数类型对方法签名位置可赋值，
 * Koishi 的 `addListener` 与 `send` 因此照旧拿到逐端点的精确签名。
 */
declare module '@koishijs/console' {
  interface Events extends SandboxConsoleEvents {}
}
