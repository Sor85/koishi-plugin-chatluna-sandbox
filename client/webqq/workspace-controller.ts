import { computed, readonly, ref, type DeepReadonly } from 'vue'
import type {
  DeleteGroupAnnouncementInput,
  GetForwardMessageInput,
  GetMessageHistoryInput,
  GetSandboxOneBotDebugRecordsInput,
  ManageSandboxEnvironmentInput,
  RecallMessageInput,
  ClearConversationMessagesInput,
  SearchConversationMessagesInput,
  SetMessageReactionInput,
  SandboxAppearance,
  SandboxBotProfile,
  SandboxChatLunaState,
  SandboxConsoleOneBotDebugRecord,
  SandboxConversation,
  SandboxForward,
  SandboxFriendAction,
  SandboxGroup,
  SandboxGroupAction,
  SandboxMessage,
  SandboxModelRequestDetail,
  SandboxModelRequestListItem,
  SandboxModelRequestTrajectory,
  SandboxParticipant,
  SandboxSnapshot,
  SandboxWorkspaceState,
  SendForwardMessageInput,
  SendMediaMessageInput,
  SendMessageInput,
  SetGroupAnnouncementInput,
} from '../../src/types'
import {
  loadWorkspacePreferences,
  resolveWorkspaceSelection,
  saveWorkspacePreferences,
  type SandboxWorkspaceView,
} from './workspace-state'
import type { WorkspacePort } from './workspace-port'
import type {
  LocateSandboxPresetExpressionInput,
  LocateSandboxPresetExpressionResult,
  ReadSandboxPresetInput,
  SandboxPresetDocument,
} from '../../src/presets'
import type {
  CreatePresetInput,
  DeletePresetInput,
  RenamePresetInput,
  SavePresetInput,
} from '../../src/presets'
import { getVisibleRecentConversations } from './relationship-directory'
import type { ListSandboxMcpCallRecordsInput } from '../../src/mcp/call-records'
import type { SandboxMcpCallRecord, SandboxMcpCallRecordListItem } from '../../src/mcp/types'
import {
  emptyModelRequestCapacity,
  type ClearModelRequestRecordsQuery,
  type ModelRequestRecordQuery,
  type ModelRequestRecordsPageState,
  type ModelRequestRecordsQuery,
  type ModelRequestTrajectoryQuery,
} from './model-request-query'

type WorkspaceStorage = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export class WorkspaceControllerError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WorkspaceControllerError'
  }
}

function workspaceErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : error && typeof error === 'object' && 'message' in error
        ? String(error.message ?? '')
        : ''
  return message.trim().split(/\r?\n/, 1)[0]?.replace(/^Error:\s*/, '') || fallback
}

function normalizeWorkspaceError(error: unknown, fallback: string) {
  return new WorkspaceControllerError(workspaceErrorMessage(error, fallback))
}

export type WorkspaceParticipant = SandboxParticipant & { type: SandboxParticipant['kind'] }

export interface SidebarWorkspaceModel {
  readonly revision: number
  readonly currentView: SandboxWorkspaceView
  readonly currentOperator?: DeepReadonly<WorkspaceParticipant>
  readonly activeConversationId?: string
  readonly conversations: readonly DeepReadonly<SandboxConversation>[]
}

export interface ChatWorkspaceModel {
  readonly revision: number
  readonly currentOperator?: DeepReadonly<WorkspaceParticipant>
  readonly conversation?: DeepReadonly<SandboxConversation>
  readonly messages: readonly DeepReadonly<SandboxMessage>[]
  // 当前会话消息直接引用的合并转发资源，供列表预览与后续详情展开。
  readonly forwards: readonly DeepReadonly<SandboxForward>[]
  readonly chatLunaStates: readonly DeepReadonly<SandboxChatLunaState>[]
}

export interface ComposerWorkspaceModel {
  readonly revision: number
  readonly currentOperator?: DeepReadonly<WorkspaceParticipant>
  readonly conversation?: DeepReadonly<SandboxConversation>
  readonly participants: readonly DeepReadonly<WorkspaceParticipant>[]
}

export interface DetailsWorkspaceModel {
  readonly revision: number
  readonly currentOperator?: DeepReadonly<WorkspaceParticipant>
  readonly conversation?: DeepReadonly<SandboxConversation>
  readonly bot?: DeepReadonly<SandboxBotProfile>
  readonly group?: DeepReadonly<SandboxGroup>
}

const defaultAppearance: SandboxAppearance = {
  enableSandboxFrostedGlass: true,
  sandboxTimBubbleTail: true,
  sandboxColorMode: 'auto',
  sandboxAccentColor: '#2563eb',
  sandboxMarkRecalledMessages: true,
}

const emptySnapshot: SandboxSnapshot = {
  revision: 0,
  participants: [],
  groups: [],
  conversations: [],
  messages: [],
  forwards: [],
  friendships: [],
  requests: [],
}

export function createWorkspaceController(port: WorkspacePort, storage: WorkspaceStorage) {
  const workspaceState = ref<SandboxWorkspaceState>({
    snapshot: emptySnapshot,
    chatLunaStates: [],
    appearance: defaultAppearance,
    persistence: { mode: 'memory', available: true, persisted: false },
  })
  const currentOperatorIdState = ref<string>()
  const activeConversationIdState = ref<string>()
  const currentViewState = ref<SandboxWorkspaceView>('messages')
  const hiddenRecentConversationsState = ref<Record<string, Record<string, string>>>({})
  const oneBotDebugRecordsState = ref<SandboxConsoleOneBotDebugRecord[]>([])
  const modelRequestRecordsState = ref<SandboxModelRequestListItem[]>([])
  const modelRequestRecordState = ref<SandboxModelRequestDetail>()
  const modelRequestTrajectoryState = ref<SandboxModelRequestTrajectory>()
  const presetCatalogState = ref<SandboxPresetDocument[]>([])
  const presetDocumentState = ref<SandboxPresetDocument>()
  const presetLocateResultState = ref<LocateSandboxPresetExpressionResult>()
  const mcpCallRecordsState = ref<SandboxMcpCallRecordListItem[]>([])
  const mcpCallRecordState = ref<SandboxMcpCallRecord>()
  const modelRequestRecordsPageState = ref<ModelRequestRecordsPageState>({
    hasMore: false,
    capacity: emptyModelRequestCapacity,
  })

  const snapshot = computed(() => workspaceState.value.snapshot)
  const currentOperator = computed<WorkspaceParticipant | undefined>(() => {
    const participant = snapshot.value.participants.find(({ id }) => id === currentOperatorIdState.value)
    return participant ? { ...participant, type: participant.kind } : undefined
  })
  const conversations = computed(() => {
    const operatorId = currentOperatorIdState.value
    return snapshot.value.conversations.filter((conversation) => conversation.type === 'direct'
      ? conversation.participantIds.includes(operatorId ?? '')
      : snapshot.value.groups.find(({ id }) => id === conversation.groupId)?.members
        .some(({ participantId }) => participantId === operatorId))
  })
  const visibleRecentConversations = computed(() => getVisibleRecentConversations(
    conversations.value,
    currentOperatorIdState.value
      ? hiddenRecentConversationsState.value[currentOperatorIdState.value]
      : undefined,
  ))
  const activeConversation = computed(() => conversations.value.find(({ id }) => id === activeConversationIdState.value))
  const activeMessages = computed(() => {
    const ids = new Set(activeConversation.value?.messageIds ?? [])
    return snapshot.value.messages.filter(({ id }) => ids.has(id))
  })
  // 仅暴露当前会话消息直接引用的转发资源；嵌套详情通过 getForwardMessage 按需加载。
  const activeForwards = computed(() => {
    const visibleForwardIds = new Set(activeMessages.value.flatMap(({ forwardId }) => forwardId ? [forwardId] : []))
    return (snapshot.value.forwards ?? []).filter(({ id }) => visibleForwardIds.has(id))
  })
  const activeChatLunaStates = computed(() => workspaceState.value.chatLunaStates
    .filter(({ conversationId }) => conversationId === activeConversation.value?.id))
  const activeBot = computed(() => {
    const conversation = activeConversation.value
    const botId = conversation?.type === 'direct'
      ? conversation.participantIds.find((id) => snapshot.value.participants.some((participant) => participant.kind === 'bot' && participant.id === id))
      : undefined
    return snapshot.value.participants.find((participant): participant is SandboxBotProfile => participant.kind === 'bot' && participant.id === botId)
  })
  const activeGroup = computed(() => snapshot.value.groups.find(({ id }) => id === activeConversation.value?.groupId))
  const participants = computed<WorkspaceParticipant[]>(() => snapshot.value.participants
    .map((participant) => ({ ...participant, type: participant.kind })))

  const sidebar = computed<SidebarWorkspaceModel>(() => ({
    revision: snapshot.value.revision,
    currentView: currentViewState.value,
    currentOperator: currentOperator.value,
    activeConversationId: activeConversationIdState.value,
    conversations: visibleRecentConversations.value,
  }))
  const chat = computed<ChatWorkspaceModel>(() => ({
    revision: snapshot.value.revision,
    currentOperator: currentOperator.value,
    conversation: activeConversation.value,
    messages: activeMessages.value,
    forwards: activeForwards.value,
    chatLunaStates: activeChatLunaStates.value,
  }))
  const composer = computed<ComposerWorkspaceModel>(() => ({
    revision: snapshot.value.revision,
    currentOperator: currentOperator.value,
    conversation: activeConversation.value,
    participants: participants.value,
  }))
  const details = computed<DetailsWorkspaceModel>(() => ({
    revision: snapshot.value.revision,
    currentOperator: currentOperator.value,
    conversation: activeConversation.value,
    bot: activeBot.value,
    group: activeGroup.value,
  }))

  function saveSelection() {
    saveWorkspacePreferences(storage, {
      currentOperatorId: currentOperatorIdState.value,
      activeConversationId: activeConversationIdState.value,
      currentView: currentViewState.value,
      ...(Object.keys(hiddenRecentConversationsState.value).length
        ? { hiddenRecentConversations: hiddenRecentConversationsState.value }
        : {}),
    })
  }

  function applySelection(preferences: ReturnType<typeof resolveWorkspaceSelection>) {
    currentOperatorIdState.value = preferences.currentOperatorId
    activeConversationIdState.value = preferences.activeConversationId
    currentViewState.value = preferences.currentView
    hiddenRecentConversationsState.value = preferences.hiddenRecentConversations ?? {}
  }

  function replaceWorkspace(nextWorkspace: SandboxWorkspaceState) {
    const previousOperatorId = currentOperatorIdState.value
    const previousConversationId = activeConversationIdState.value
    workspaceState.value = nextWorkspace
    const selection = resolveWorkspaceSelection(snapshot.value, {
      currentOperatorId: previousOperatorId,
      activeConversationId: previousConversationId,
      currentView: currentViewState.value,
      hiddenRecentConversations: hiddenRecentConversationsState.value,
    })
    applySelection(selection)
    saveSelection()
  }

  async function load() {
    const preferences = loadWorkspacePreferences(storage)
    let nextWorkspace: SandboxWorkspaceState
    try {
      nextWorkspace = preferences.currentOperatorId
        ? await port.getWorkspace({ operatorId: preferences.currentOperatorId })
        : await port.getWorkspace()
    } catch {
      nextWorkspace = await port.getWorkspace()
    }
    workspaceState.value = nextWorkspace
    applySelection(resolveWorkspaceSelection(snapshot.value, preferences))
    saveSelection()
  }

  function selectConversation(conversationId: string) {
    const operatorId = currentOperatorIdState.value
    if (operatorId && hiddenRecentConversationsState.value[operatorId]?.[conversationId] !== undefined) {
      const { [conversationId]: _, ...remaining } = hiddenRecentConversationsState.value[operatorId]!
      const { [operatorId]: __, ...otherOperators } = hiddenRecentConversationsState.value
      hiddenRecentConversationsState.value = Object.keys(remaining).length
        ? { ...otherOperators, [operatorId]: remaining }
        : otherOperators
    }
    activeConversationIdState.value = conversationId
    currentViewState.value = 'messages'
    saveSelection()
  }

  function removeRecentConversation(conversationId: string) {
    const operatorId = currentOperatorIdState.value
    const conversation = conversations.value.find(({ id }) => id === conversationId)
    if (!operatorId || !conversation) return
    // “删除会话”只移除当前操作者的最近入口；记录最后一条消息作为水位，
    // 新消息到达后会话会自动重新出现，且不会破坏逻辑会话和历史消息。
    hiddenRecentConversationsState.value = {
      ...hiddenRecentConversationsState.value,
      [operatorId]: {
        ...hiddenRecentConversationsState.value[operatorId],
        [conversationId]: conversation.messageIds.at(-1) ?? '',
      },
    }
    if (activeConversationIdState.value === conversationId) {
      activeConversationIdState.value = visibleRecentConversations.value[0]?.id
    }
    saveSelection()
  }

  function selectView(view: SandboxWorkspaceView) {
    currentViewState.value = view
    saveSelection()
  }

  async function selectOperator(participantId: string) {
    if (!snapshot.value.participants.some(({ id }) => id === participantId)) return
    let nextWorkspace: SandboxWorkspaceState
    try {
      nextWorkspace = await port.getWorkspace({ operatorId: participantId })
    } catch (error) {
      throw normalizeWorkspaceError(error, '切换当前操作者失败')
    }
    workspaceState.value = nextWorkspace
    const selection = resolveWorkspaceSelection(snapshot.value, {
      currentOperatorId: participantId,
      currentView: 'messages',
      hiddenRecentConversations: hiddenRecentConversationsState.value,
    })
    applySelection(selection)
    currentOperatorIdState.value = participantId
    saveSelection()
  }

  function getCurrentOperatorId() {
    const operatorId = currentOperatorIdState.value
    if (!operatorId) throw new WorkspaceControllerError('当前操作者不可用')
    return operatorId
  }

  async function performFriendAction(input: SandboxFriendAction) {
    const operatorId = currentOperatorIdState.value
    if (!operatorId) throw new WorkspaceControllerError('当前操作者不可用')
    try {
      replaceWorkspace(await port.performFriendAction({ ...input, operatorId }))
    } catch (error) {
      throw normalizeWorkspaceError(error, '好友操作失败')
    }
  }

  async function sendMessage(input: Omit<SendMessageInput, 'operatorId'>) {
    const operatorId = getCurrentOperatorId()
    try {
      replaceWorkspace(await port.sendMessage({ ...input, operatorId }))
    } catch (error) {
      throw normalizeWorkspaceError(error, '发送失败')
    }
  }

  async function sendMediaMessage(input: Omit<SendMediaMessageInput, 'operatorId'>) {
    const operatorId = getCurrentOperatorId()
    try {
      replaceWorkspace(await port.sendMediaMessage({ ...input, operatorId }))
    } catch (error) {
      throw normalizeWorkspaceError(error, '发送失败')
    }
  }

  async function sendForwardMessage(input: Omit<SendForwardMessageInput, 'operatorId'>) {
    const operatorId = getCurrentOperatorId()
    try {
      replaceWorkspace(await port.sendForwardMessage({ ...input, operatorId }))
    } catch (error) {
      throw normalizeWorkspaceError(error, '合并转发失败')
    }
  }

  async function getForwardMessage(input: Omit<GetForwardMessageInput, 'operatorId'>) {
    const operatorId = getCurrentOperatorId()
    try {
      const forward = await port.getForwardMessage({ ...input, operatorId })
      // 按需详情也并入本地快照，避免重复 RPC 与列表预览丢失嵌套资源。
      if (!(snapshot.value.forwards ?? []).some(({ id }) => id === forward.id)) {
        replaceWorkspace({
          ...workspaceState.value,
          snapshot: {
            ...snapshot.value,
            forwards: [...(snapshot.value.forwards ?? []), forward],
          },
        })
      }
      return forward
    } catch (error) {
      throw normalizeWorkspaceError(error, '读取合并转发失败')
    }
  }

  async function recallMessage(input: Omit<RecallMessageInput, 'operatorId'>) {
    const operatorId = getCurrentOperatorId()
    try {
      replaceWorkspace(await port.recallMessage({ ...input, operatorId }))
    } catch (error) {
      throw normalizeWorkspaceError(error, '撤回失败')
    }
  }

  async function clearConversationMessages(input: Omit<ClearConversationMessagesInput, 'operatorId'>) {
    const operatorId = getCurrentOperatorId()
    try {
      replaceWorkspace(await port.clearConversationMessages({ ...input, operatorId }))
    } catch (error) {
      throw normalizeWorkspaceError(error, '清空会话记录失败')
    }
  }

  async function setMessageReaction(input: Omit<SetMessageReactionInput, 'operatorId'>) {
    const operatorId = getCurrentOperatorId()
    try {
      replaceWorkspace(await port.setMessageReaction({ ...input, operatorId }))
    } catch (error) {
      throw normalizeWorkspaceError(error, '贴表情失败')
    }
  }

  // 服务端场景变更广播的落地点：发送 RPC 已即时返回，机器人稍后写入的回复和等待态靠这里刷新。
  // 等待态不写入场景快照，广播修订会等于当前修订，因此不能按修订大小决定是否拉取；
  // 改为每次广播都标记一次待刷新，并把刷新期间到达的广播合并成一次后续拉取，避免广播风暴导致并发请求。
  let mutationRefreshTask: Promise<void> | undefined
  let pendingRefresh = false
  function notifySceneRevision(_revision: number) {
    pendingRefresh = true
    if (mutationRefreshTask) return
    // 异步任务体可能同步结束；先完成变量赋值再执行，避免已完成的 Promise 被写回后永久阻塞后续广播。
    mutationRefreshTask = Promise.resolve().then(async () => {
      try {
        while (pendingRefresh) {
          pendingRefresh = false
          const operatorId = currentOperatorIdState.value
          try {
            const nextWorkspace = operatorId
              ? await port.getWorkspace({ operatorId })
              : await port.getWorkspace()
            // 并发的用户操作 RPC 可能已带回更新的工作区，旧响应不能回退状态。
            if (nextWorkspace.snapshot.revision >= snapshot.value.revision) replaceWorkspace(nextWorkspace)
          } catch {
            // 刷新失败保持现状，下一次场景变更广播会再次触发。
          }
        }
      } finally {
        mutationRefreshTask = undefined
      }
    })
  }

  async function getMediaContent(mediaId: string) {
    const operatorId = getCurrentOperatorId()
    try {
      return await port.getMediaContent({ operatorId, mediaId })
    } catch (error) {
      throw normalizeWorkspaceError(error, '加载媒体失败')
    }
  }

  async function loadMessageHistory(input: Omit<GetMessageHistoryInput, 'operatorId'>) {
    const operatorId = getCurrentOperatorId()
    try {
      const history = await port.getMessageHistory({ ...input, operatorId })
      const knownIds = new Set(snapshot.value.messages.map(({ id }) => id))
      const knownForwardIds = new Set((snapshot.value.forwards ?? []).map(({ id }) => id))
      replaceWorkspace({
        ...workspaceState.value,
        snapshot: {
          ...snapshot.value,
          conversations: snapshot.value.conversations.map((conversation) => conversation.id === input.conversationId ? {
            ...conversation,
            messageIds: [...history.messages.map(({ id }) => id), ...conversation.messageIds],
            hasMoreMessages: !!history.nextBeforeMessageId,
          } : conversation),
          messages: [...history.messages.filter(({ id }) => !knownIds.has(id)), ...snapshot.value.messages],
          forwards: [
            ...(snapshot.value.forwards ?? []),
            ...(history.forwards ?? []).filter(({ id }) => !knownForwardIds.has(id)),
          ],
        },
      })
    } catch (error) {
      throw normalizeWorkspaceError(error, '读取历史消息失败')
    }
  }

  // 搜索只返回命中摘要，不改快照；定位历史消息仍走 loadMessageHistory。
  async function searchConversationMessages(input: Omit<SearchConversationMessagesInput, 'operatorId'>) {
    const operatorId = getCurrentOperatorId()
    try {
      return await port.searchConversationMessages({ ...input, operatorId })
    } catch (error) {
      throw normalizeWorkspaceError(error, '搜索会话消息失败')
    }
  }

  async function setGroupAnnouncement(input: Omit<SetGroupAnnouncementInput, 'operatorId'>) {
    const operatorId = getCurrentOperatorId()
    try {
      replaceWorkspace(await port.setGroupAnnouncement({ ...input, operatorId }))
    } catch (error) {
      throw normalizeWorkspaceError(error, '发布群公告失败')
    }
  }

  async function deleteGroupAnnouncement(input: Omit<DeleteGroupAnnouncementInput, 'operatorId'>) {
    const operatorId = getCurrentOperatorId()
    try {
      replaceWorkspace(await port.deleteGroupAnnouncement({ ...input, operatorId }))
    } catch (error) {
      throw normalizeWorkspaceError(error, '删除群公告失败')
    }
  }

  async function manageEnvironment(input: ManageSandboxEnvironmentInput) {
    try {
      const operatorId = currentOperatorIdState.value
      const managedWorkspace = await port.manageEnvironment(input)
      const deletesCurrentOperator = (input.action === 'delete-user' || input.action === 'delete-bot')
        && input.data.id === operatorId
      // Koishi send 会把缺省 RPC 入参传成 null；空环境创建首个参与者或删除当前操作者时，直接使用管理接口返回的 fallback 工作区。
      replaceWorkspace(operatorId && !deletesCurrentOperator
        ? await port.getWorkspace({ operatorId })
        : managedWorkspace)
    } catch (error) {
      throw normalizeWorkspaceError(error, '环境管理失败')
    }
  }

  async function performGroupAction(input: SandboxGroupAction) {
    const operatorId = currentOperatorIdState.value
    if (!operatorId) throw new WorkspaceControllerError('当前操作者不可用')
    try {
      replaceWorkspace(await port.performGroupAction({ ...input, operatorId }))
    } catch (error) {
      throw normalizeWorkspaceError(error, '群组操作失败')
    }
  }

  async function loadOneBotDebugRecords(input: GetSandboxOneBotDebugRecordsInput = {}) {
    try {
      const page = await port.getOneBotDebugRecords(input)
      oneBotDebugRecordsState.value = page.records
    } catch (error) {
      throw normalizeWorkspaceError(error, '读取 OneBot 调试记录失败')
    }
  }

  async function clearOneBotDebugRecords() {
    try {
      await port.clearOneBotDebugRecords()
      oneBotDebugRecordsState.value = []
    } catch (error) {
      throw normalizeWorkspaceError(error, '清理 OneBot 调试记录失败')
    }
  }

  async function loadModelRequestRecords(input: ModelRequestRecordsQuery, mode: 'replace' | 'append' = 'replace') {
    try {
      const page = await port.getModelRequestRecords(input)
      modelRequestRecordsState.value = mode === 'append'
        ? [...modelRequestRecordsState.value, ...page.records]
        : page.records
      modelRequestRecordsPageState.value = {
        hasMore: page.hasMore,
        nextCursor: page.nextCursor,
        nextCreatedAt: page.nextCreatedAt,
        nextId: page.nextId,
        earliestCursor: page.earliestCursor,
        capacity: page.capacity,
      }
    } catch (error) {
      throw normalizeWorkspaceError(error, '读取模型请求记录失败')
    }
  }

  async function loadModelRequestRecord(input: ModelRequestRecordQuery) {
    try {
      modelRequestRecordState.value = await port.getModelRequestRecord(input)
      return modelRequestRecordState.value
    } catch (error) {
      throw normalizeWorkspaceError(error, '读取模型请求详情失败')
    }
  }

  async function loadModelRequestTrajectory(input: ModelRequestTrajectoryQuery) {
    try {
      modelRequestTrajectoryState.value = await port.getModelRequestTrajectory(input)
    } catch (error) {
      throw normalizeWorkspaceError(error, '读取模型请求轨迹失败')
    }
  }

  async function clearModelRequestRecords(input: ClearModelRequestRecordsQuery) {
    try {
      await port.clearModelRequestRecords(input)
      modelRequestRecordsState.value = []
      modelRequestRecordState.value = undefined
      modelRequestTrajectoryState.value = undefined
      modelRequestRecordsPageState.value = {
        hasMore: false,
        capacity: emptyModelRequestCapacity,
      }
    } catch (error) {
      throw normalizeWorkspaceError(error, '清理模型请求记录失败')
    }
  }

  async function loadPresetCatalog() {
    try {
      presetCatalogState.value = await port.getPresetCatalog()
    } catch (error) {
      throw normalizeWorkspaceError(error, '读取预设目录失败')
    }
  }

  async function readPreset(input: ReadSandboxPresetInput) {
    try {
      presetDocumentState.value = await port.readPreset(input)
      return presetDocumentState.value
    } catch (error) {
      throw normalizeWorkspaceError(error, '读取预设失败')
    }
  }

  async function createPreset(input: CreatePresetInput) {
    try {
      const document = await port.createPreset(input)
      upsertPreset(document)
      presetDocumentState.value = document
      return document
    } catch (error) {
      throw normalizeWorkspaceError(error, '创建预设失败')
    }
  }

  async function savePreset(input: SavePresetInput) {
    try {
      const document = await port.savePreset(input)
      upsertPreset(document)
      presetDocumentState.value = document
      return document
    } catch (error) {
      throw normalizeWorkspaceError(error, '保存预设失败')
    }
  }

  async function renamePreset(input: RenamePresetInput) {
    try {
      const document = await port.renamePreset(input)
      presetCatalogState.value = presetCatalogState.value.filter(({ kind, fileName }) => (
        kind !== input.kind || fileName !== input.fileName
      ))
      upsertPreset(document)
      presetDocumentState.value = document
      return document
    } catch (error) {
      throw normalizeWorkspaceError(error, '重命名预设失败')
    }
  }

  async function deletePreset(input: DeletePresetInput) {
    try {
      const result = await port.deletePreset(input)
      presetCatalogState.value = presetCatalogState.value.filter(({ kind, fileName }) => (
        kind !== input.kind || fileName !== input.fileName
      ))
      if (presetDocumentState.value?.kind === input.kind && presetDocumentState.value.fileName === input.fileName) {
        presetDocumentState.value = undefined
      }
      return result
    } catch (error) {
      throw normalizeWorkspaceError(error, '删除预设失败')
    }
  }

  async function loadMcpCallRecords(input: ListSandboxMcpCallRecordsInput = {}) {
    try {
      const page = await port.getMcpCallRecords(input)
      mcpCallRecordsState.value = page.records
    } catch (error) {
      throw normalizeWorkspaceError(error, '读取 MCP 调用记录失败')
    }
  }

  async function loadMcpCallRecord(input: { recordId: string }) {
    try {
      mcpCallRecordState.value = await port.getMcpCallRecord(input)
      return mcpCallRecordState.value
    } catch (error) {
      throw normalizeWorkspaceError(error, '读取 MCP 调用详情失败')
    }
  }

  async function clearMcpCallRecords() {
    try {
      await port.clearMcpCallRecords()
      mcpCallRecordsState.value = []
      mcpCallRecordState.value = undefined
    } catch (error) {
      throw normalizeWorkspaceError(error, '清理 MCP 调用记录失败')
    }
  }

  async function locatePresetExpression(input: LocateSandboxPresetExpressionInput) {
    try {
      const result = await port.locatePresetExpression(input)
      presetLocateResultState.value = result
      return result
    } catch (error) {
      throw normalizeWorkspaceError(error, '定位预设表达式失败')
    }
  }

  function upsertPreset(document: SandboxPresetDocument) {
    presetCatalogState.value = [
      ...presetCatalogState.value.filter(({ kind, fileName }) => (
        kind !== document.kind || fileName !== document.fileName
      )),
      document,
    ].sort((left, right) => left.kind.localeCompare(right.kind) || left.fileName.localeCompare(right.fileName))
  }

  async function handleRelationshipRequest(requestId: string, approve: boolean) {
    const operatorId = getCurrentOperatorId()
    const request = snapshot.value.requests.find(({ id }) => id === requestId)
    if (!request) throw new WorkspaceControllerError('关系申请不存在')
    try {
      const nextWorkspace = request.type === 'group'
        ? await port.performGroupAction({ action: 'handle-request', requestId, approve, operatorId })
        : await port.performFriendAction({ action: 'handle-request', requestId, approve, operatorId })
      replaceWorkspace(nextWorkspace)
    } catch (error) {
      throw normalizeWorkspaceError(error, '处理关系申请失败')
    }
  }

  return {
    workspace: computed<SandboxWorkspaceState>(() => workspaceState.value),
    currentOperatorId: readonly(currentOperatorIdState),
    activeConversationId: readonly(activeConversationIdState),
    currentView: readonly(currentViewState),
    oneBotDebugRecords: readonly(oneBotDebugRecordsState),
    modelRequestRecords: readonly(modelRequestRecordsState),
    modelRequestRecord: readonly(modelRequestRecordState),
    modelRequestTrajectory: readonly(modelRequestTrajectoryState),
    modelRequestRecordsPage: readonly(modelRequestRecordsPageState),
    presetCatalog: readonly(presetCatalogState),
    presetDocument: readonly(presetDocumentState),
    presetLocateResult: readonly(presetLocateResultState),
    mcpCallRecords: readonly(mcpCallRecordsState),
    mcpCallRecord: readonly(mcpCallRecordState),
    sidebar,
    chat,
    composer,
    deleteGroupAnnouncement,
    details,
    getMediaContent,
    handleRelationshipRequest,
    load,
    loadMessageHistory,
    searchConversationMessages,
    loadOneBotDebugRecords,
    loadModelRequestRecords,
    loadModelRequestRecord,
    loadModelRequestTrajectory,
    loadPresetCatalog,
    loadMcpCallRecords,
    loadMcpCallRecord,
    readPreset,
    createPreset,
    savePreset,
    renamePreset,
    deletePreset,
    locatePresetExpression,
    manageEnvironment,
    notifySceneRevision,
    performFriendAction,
    performGroupAction,
    clearOneBotDebugRecords,
    clearModelRequestRecords,
    clearMcpCallRecords,
    recallMessage,
    clearConversationMessages,
    removeRecentConversation,
    setMessageReaction,
    replaceWorkspace,
    selectConversation,
    selectOperator,
    selectView,
    sendForwardMessage,
    getForwardMessage,
    sendMediaMessage,
    sendMessage,
    setGroupAnnouncement,
  }
}
