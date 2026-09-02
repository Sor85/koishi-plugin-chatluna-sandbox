import { computed, readonly, ref, type DeepReadonly } from 'vue'
import type {
  DeleteGroupAnnouncementInput,
  GetForwardMessageInput,
  GetMessageHistoryInput,
  GetSandboxOneBotDebugRecordInput,
  GetSandboxOneBotDebugRecordsInput,
  ManageSandboxEnvironmentInput,
  RecallMessageInput,
  ClearConversationMessagesInput,
  BranchConversationInstanceInput,
  CreateConversationInstanceInput,
  DeleteConversationInstanceInput,
  RenameConversationInstanceInput,
  SearchConversationMessagesInput,
  SetMessageReactionInput,
  SandboxAppearance,
  SandboxBotProfile,
  SandboxChatLunaState,
  SandboxConsoleOneBotDebugRecord,
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
} from './state'
import type { WorkspacePort } from './port'
import type { OneBotDebugPort } from '#client/onebot-debug/port'
import type { ModelRequestPort } from '#client/model-request/port'
import type { PresetPort } from '#client/preset/port'
import type { TestCallRecordPort } from '#client/test-call/port'
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
import {
  includesConversationParticipant,
  listConversations,
  readConversationMessageIds,
  type ResolvedConversation,
} from '../../src/conversation-resolution'
import type { ListSandboxTestCallRecordsInput } from '../../src/mcp/call-records'
import type { SandboxTestCallRecord, SandboxTestCallRecordListItem } from '../../src/mcp/types'
import {
  emptyModelRequestCapacity,
  type ClearModelRequestRecordsQuery,
  type ModelRequestRecordQuery,
  type ModelRequestRecordsPageState,
  type ModelRequestRecordsQuery,
  type ModelRequestTrajectoryQuery,
} from '#client/model-request/query'

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
  readonly conversations: readonly DeepReadonly<ResolvedConversation>[]
}

export interface ChatWorkspaceModel {
  readonly revision: number
  readonly currentOperator?: DeepReadonly<WorkspaceParticipant>
  readonly conversation?: DeepReadonly<ResolvedConversation>
  readonly messages: readonly DeepReadonly<SandboxMessage>[]
  // 当前会话消息直接引用的合并转发资源，供列表预览与后续详情展开。
  readonly forwards: readonly DeepReadonly<SandboxForward>[]
  readonly chatLunaStates: readonly DeepReadonly<SandboxChatLunaState>[]
}

export interface ComposerWorkspaceModel {
  readonly revision: number
  readonly currentOperator?: DeepReadonly<WorkspaceParticipant>
  readonly conversation?: DeepReadonly<ResolvedConversation>
  readonly participants: readonly DeepReadonly<WorkspaceParticipant>[]
}

export interface DetailsWorkspaceModel {
  readonly revision: number
  readonly currentOperator?: DeepReadonly<WorkspaceParticipant>
  readonly conversation?: DeepReadonly<ResolvedConversation>
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

/**
 * 控制器按能力收若干道端口。它仍然是一个 module——工作台状态与选择解析住在这里——但
 * 每道能力的通信各走自己那道窄端口，加一道能力不会让别的消费方的 interface 跟着变宽。
 */
export interface WorkspaceControllerPorts {
  workspace: WorkspacePort
  oneBotDebug: OneBotDebugPort
  modelRequest: ModelRequestPort
  preset: PresetPort
  testCallRecord: TestCallRecordPort
}

export function createWorkspaceController(ports: WorkspaceControllerPorts, storage: WorkspaceStorage) {
  const {
    workspace: workspacePort,
    oneBotDebug: oneBotDebugPort,
    modelRequest: modelRequestPort,
    preset: presetPort,
    testCallRecord: testCallRecordPort,
  } = ports
  const workspaceState = ref<SandboxWorkspaceState>({
    snapshot: emptySnapshot,
    chatLunaStates: [],
    appearance: defaultAppearance,
    persistence: { mode: 'memory', available: true, persisted: false },
  })
  const currentOperatorIdState = ref<string>()
  const activeConversationIdState = ref<string>()
  const currentViewState = ref<SandboxWorkspaceView>('messages')
  const oneBotDebugRecordsState = ref<SandboxConsoleOneBotDebugRecord[]>([])
  const oneBotDebugRecordState = ref<SandboxConsoleOneBotDebugRecord>()
  const modelRequestRecordsState = ref<SandboxModelRequestListItem[]>([])
  const modelRequestRecordState = ref<SandboxModelRequestDetail>()
  const modelRequestTrajectoryState = ref<SandboxModelRequestTrajectory>()
  const presetCatalogState = ref<SandboxPresetDocument[]>([])
  const presetDocumentState = ref<SandboxPresetDocument>()
  const presetLocateResultState = ref<LocateSandboxPresetExpressionResult>()
  const testCallRecordsState = ref<SandboxTestCallRecordListItem[]>([])
  const testCallRecordState = ref<SandboxTestCallRecord>()
  const modelRequestRecordsPageState = ref<ModelRequestRecordsPageState>({
    hasMore: false,
    capacity: emptyModelRequestCapacity,
  })

  const snapshot = computed(() => workspaceState.value.snapshot)
  const currentOperator = computed<WorkspaceParticipant | undefined>(() => {
    const participant = snapshot.value.participants.find(({ id }) => id === currentOperatorIdState.value)
    return participant ? { ...participant, type: participant.kind } : undefined
  })
  // 根会话与会话实例一起列出：会话实例的可见性完全继承根会话，聊天区与侧栏都要能寻址到它。
  const conversations = computed(() => {
    const operatorId = currentOperatorIdState.value
    if (!operatorId) return []
    return listConversations(snapshot.value)
      .filter((conversation) => includesConversationParticipant(snapshot.value, conversation, operatorId))
  })
  const activeConversation = computed(() => conversations.value.find(({ id }) => id === activeConversationIdState.value))
  const activeMessages = computed(() => {
    const conversation = activeConversation.value
    const ids = new Set(conversation ? readConversationMessageIds(snapshot.value, conversation.id) : [])
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
      ? conversation.participantIds?.find((id) => snapshot.value.participants.some((participant) => participant.kind === 'bot' && participant.id === id))
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
    conversations: conversations.value,
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
    })
  }

  function applySelection(preferences: ReturnType<typeof resolveWorkspaceSelection>) {
    currentOperatorIdState.value = preferences.currentOperatorId
    activeConversationIdState.value = preferences.activeConversationId
    currentViewState.value = preferences.currentView
  }

  function replaceWorkspace(nextWorkspace: SandboxWorkspaceState) {
    const previousOperatorId = currentOperatorIdState.value
    const previousConversationId = activeConversationIdState.value
    workspaceState.value = nextWorkspace
    const selection = resolveWorkspaceSelection(snapshot.value, {
      currentOperatorId: previousOperatorId,
      activeConversationId: previousConversationId,
      currentView: currentViewState.value,
    })
    applySelection(selection)
    saveSelection()
  }

  async function load() {
    const preferences = loadWorkspacePreferences(storage)
    let nextWorkspace: SandboxWorkspaceState
    try {
      nextWorkspace = preferences.currentOperatorId
        ? await workspacePort.getWorkspace({ operatorId: preferences.currentOperatorId })
        : await workspacePort.getWorkspace()
    } catch {
      nextWorkspace = await workspacePort.getWorkspace()
    }
    workspaceState.value = nextWorkspace
    applySelection(resolveWorkspaceSelection(snapshot.value, preferences))
    saveSelection()
  }

  function selectConversation(conversationId: string) {
    activeConversationIdState.value = conversationId
    currentViewState.value = 'messages'
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
      nextWorkspace = await workspacePort.getWorkspace({ operatorId: participantId })
    } catch (error) {
      throw normalizeWorkspaceError(error, '切换当前操作者失败')
    }
    workspaceState.value = nextWorkspace
    const selection = resolveWorkspaceSelection(snapshot.value, {
      currentOperatorId: participantId,
      currentView: 'messages',
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
      replaceWorkspace(await workspacePort.performFriendAction({ ...input, operatorId }))
    } catch (error) {
      throw normalizeWorkspaceError(error, '好友操作失败')
    }
  }

  /**
   * 新建会话实例。端点一次返回完整工作区状态与新会话 ID，因此这里只发一次请求，
   * 不再紧跟一次工作区读取。
   */
  async function createConversationInstance(input: Omit<CreateConversationInstanceInput, 'operatorId'>) {
    const operatorId = getCurrentOperatorId()
    try {
      const { conversationId, ...workspace } = await workspacePort.createConversationInstance({ ...input, operatorId })
      replaceWorkspace(workspace)
      selectConversation(conversationId)
      return conversationId
    } catch (error) {
      throw normalizeWorkspaceError(error, '创建会话失败')
    }
  }

  /** 从某条消息分叉出一个会话实例，与新建同口径：一次请求完成状态替换与选中。 */
  async function branchConversationInstance(input: Omit<BranchConversationInstanceInput, 'operatorId'>) {
    const operatorId = getCurrentOperatorId()
    try {
      const { conversationId, ...workspace } = await workspacePort.branchConversationInstance({ ...input, operatorId })
      replaceWorkspace(workspace)
      selectConversation(conversationId)
      return conversationId
    } catch (error) {
      throw normalizeWorkspaceError(error, '创建会话分支失败')
    }
  }

  /** 给一个会话实例改名。改名不改变选中，端点返回的状态里侧栏与聊天区标题一起更新。 */
  async function renameConversationInstance(input: Omit<RenameConversationInstanceInput, 'operatorId'>) {
    const operatorId = getCurrentOperatorId()
    try {
      replaceWorkspace(await workspacePort.renameConversationInstance({ ...input, operatorId }))
    } catch (error) {
      throw normalizeWorkspaceError(error, '重命名会话失败')
    }
  }

  /**
   * 删除一个会话实例。被删的实例可能正被选中，选中回退交给 {@link replaceWorkspace}：
   * 它按新状态重解析选择，不需要这里再猜下一个该选谁。
   */
  async function deleteConversationInstance(input: Omit<DeleteConversationInstanceInput, 'operatorId'>) {
    const operatorId = getCurrentOperatorId()
    try {
      replaceWorkspace(await workspacePort.deleteConversationInstance({ ...input, operatorId }))
    } catch (error) {
      throw normalizeWorkspaceError(error, '删除会话失败')
    }
  }

  async function sendMessage(input: Omit<SendMessageInput, 'operatorId'>) {
    const operatorId = getCurrentOperatorId()
    try {
      replaceWorkspace(await workspacePort.sendMessage({ ...input, operatorId }))
    } catch (error) {
      throw normalizeWorkspaceError(error, '发送失败')
    }
  }

  async function sendMediaMessage(input: Omit<SendMediaMessageInput, 'operatorId'>) {
    const operatorId = getCurrentOperatorId()
    try {
      replaceWorkspace(await workspacePort.sendMediaMessage({ ...input, operatorId }))
    } catch (error) {
      throw normalizeWorkspaceError(error, '发送失败')
    }
  }

  async function sendForwardMessage(input: Omit<SendForwardMessageInput, 'operatorId'>) {
    const operatorId = getCurrentOperatorId()
    try {
      replaceWorkspace(await workspacePort.sendForwardMessage({ ...input, operatorId }))
    } catch (error) {
      throw normalizeWorkspaceError(error, '合并转发失败')
    }
  }

  async function getForwardMessage(input: Omit<GetForwardMessageInput, 'operatorId'>) {
    const operatorId = getCurrentOperatorId()
    try {
      const forward = await workspacePort.getForwardMessage({ ...input, operatorId })
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
      replaceWorkspace(await workspacePort.recallMessage({ ...input, operatorId }))
    } catch (error) {
      throw normalizeWorkspaceError(error, '撤回失败')
    }
  }

  async function clearConversationMessages(input: Omit<ClearConversationMessagesInput, 'operatorId'>) {
    const operatorId = getCurrentOperatorId()
    try {
      replaceWorkspace(await workspacePort.clearConversationMessages({ ...input, operatorId }))
    } catch (error) {
      throw normalizeWorkspaceError(error, '清空会话记录失败')
    }
  }

  async function setMessageReaction(input: Omit<SetMessageReactionInput, 'operatorId'>) {
    const operatorId = getCurrentOperatorId()
    try {
      replaceWorkspace(await workspacePort.setMessageReaction({ ...input, operatorId }))
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
              ? await workspacePort.getWorkspace({ operatorId })
              : await workspacePort.getWorkspace()
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
      return await workspacePort.getMediaContent({ operatorId, mediaId })
    } catch (error) {
      throw normalizeWorkspaceError(error, '加载媒体失败')
    }
  }

  async function loadMessageHistory(input: Omit<GetMessageHistoryInput, 'operatorId'>) {
    const operatorId = getCurrentOperatorId()
    try {
      const history = await workspacePort.getMessageHistory({ ...input, operatorId })
      const knownIds = new Set(snapshot.value.messages.map(({ id }) => id))
      const knownForwardIds = new Set((snapshot.value.forwards ?? []).map(({ id }) => id))
      // 历史页要合并回被读的那个会话行，而它可能是根会话也可能是会话实例。快照里的实例行
      // 携带的是拼接后的列表（继承前缀已物化、分叉点已去掉），因此往它前面接一页就是对的；
      // 只改根会话行会让分支翻不动历史，往上翻到继承前缀时停在分界处。
      const prepend = <T extends { id: string, messageIds: string[] }>(rows: T[]) => rows
        .map((row) => row.id === input.conversationId ? {
          ...row,
          messageIds: [...history.messages.map(({ id }) => id), ...row.messageIds],
          hasMoreMessages: !!history.nextBeforeMessageId,
        } : row)
      replaceWorkspace({
        ...workspaceState.value,
        snapshot: {
          ...snapshot.value,
          conversations: prepend(snapshot.value.conversations),
          conversationInstances: prepend(snapshot.value.conversationInstances ?? []),
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
      return await workspacePort.searchConversationMessages({ ...input, operatorId })
    } catch (error) {
      throw normalizeWorkspaceError(error, '搜索会话消息失败')
    }
  }

  async function setGroupAnnouncement(input: Omit<SetGroupAnnouncementInput, 'operatorId'>) {
    const operatorId = getCurrentOperatorId()
    try {
      replaceWorkspace(await workspacePort.setGroupAnnouncement({ ...input, operatorId }))
    } catch (error) {
      throw normalizeWorkspaceError(error, '发布群公告失败')
    }
  }

  async function deleteGroupAnnouncement(input: Omit<DeleteGroupAnnouncementInput, 'operatorId'>) {
    const operatorId = getCurrentOperatorId()
    try {
      replaceWorkspace(await workspacePort.deleteGroupAnnouncement({ ...input, operatorId }))
    } catch (error) {
      throw normalizeWorkspaceError(error, '删除群公告失败')
    }
  }

  async function manageEnvironment(input: ManageSandboxEnvironmentInput) {
    try {
      const operatorId = currentOperatorIdState.value
      const managedWorkspace = await workspacePort.manageEnvironment(input)
      const deletesCurrentOperator = (input.action === 'delete-user' || input.action === 'delete-bot')
        && input.data.id === operatorId
      // Koishi send 会把缺省 RPC 入参传成 null；空环境创建首个参与者或删除当前操作者时，直接使用管理接口返回的 fallback 工作区。
      replaceWorkspace(operatorId && !deletesCurrentOperator
        ? await workspacePort.getWorkspace({ operatorId })
        : managedWorkspace)
    } catch (error) {
      throw normalizeWorkspaceError(error, '环境管理失败')
    }
  }

  async function performGroupAction(input: SandboxGroupAction) {
    const operatorId = currentOperatorIdState.value
    if (!operatorId) throw new WorkspaceControllerError('当前操作者不可用')
    try {
      replaceWorkspace(await workspacePort.performGroupAction({ ...input, operatorId }))
    } catch (error) {
      throw normalizeWorkspaceError(error, '群组操作失败')
    }
  }

  async function loadOneBotDebugRecords(input: GetSandboxOneBotDebugRecordsInput = {}) {
    try {
      const page = await oneBotDebugPort.getOneBotDebugRecords(input)
      oneBotDebugRecordsState.value = page.records
    } catch (error) {
      throw normalizeWorkspaceError(error, '读取 OneBot 调试记录失败')
    }
  }

  async function loadOneBotDebugRecord(input: GetSandboxOneBotDebugRecordInput & { spaceId?: string }) {
    try {
      oneBotDebugRecordState.value = await oneBotDebugPort.getOneBotDebugRecord(input)
      return oneBotDebugRecordState.value
    } catch (error) {
      throw normalizeWorkspaceError(error, '读取 OneBot 调试详情失败')
    }
  }

  async function clearOneBotDebugRecords() {
    try {
      await oneBotDebugPort.clearOneBotDebugRecords()
      oneBotDebugRecordsState.value = []
      oneBotDebugRecordState.value = undefined
    } catch (error) {
      throw normalizeWorkspaceError(error, '清理 OneBot 调试记录失败')
    }
  }

  async function loadModelRequestRecords(input: ModelRequestRecordsQuery, mode: 'replace' | 'append' = 'replace') {
    try {
      const page = await modelRequestPort.getModelRequestRecords(input)
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
      modelRequestRecordState.value = await modelRequestPort.getModelRequestRecord(input)
      return modelRequestRecordState.value
    } catch (error) {
      throw normalizeWorkspaceError(error, '读取模型请求详情失败')
    }
  }

  async function loadModelRequestTrajectory(input: ModelRequestTrajectoryQuery) {
    try {
      modelRequestTrajectoryState.value = await modelRequestPort.getModelRequestTrajectory(input)
    } catch (error) {
      throw normalizeWorkspaceError(error, '读取模型请求轨迹失败')
    }
  }

  async function clearModelRequestRecords(input: ClearModelRequestRecordsQuery) {
    try {
      await modelRequestPort.clearModelRequestRecords(input)
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
      presetCatalogState.value = await presetPort.getPresetCatalog()
    } catch (error) {
      throw normalizeWorkspaceError(error, '读取预设目录失败')
    }
  }

  async function readPreset(input: ReadSandboxPresetInput) {
    try {
      presetDocumentState.value = await presetPort.readPreset(input)
      return presetDocumentState.value
    } catch (error) {
      throw normalizeWorkspaceError(error, '读取预设失败')
    }
  }

  async function createPreset(input: CreatePresetInput) {
    try {
      const document = await presetPort.createPreset(input)
      upsertPreset(document)
      presetDocumentState.value = document
      return document
    } catch (error) {
      throw normalizeWorkspaceError(error, '创建预设失败')
    }
  }

  async function savePreset(input: SavePresetInput) {
    try {
      const document = await presetPort.savePreset(input)
      upsertPreset(document)
      presetDocumentState.value = document
      return document
    } catch (error) {
      throw normalizeWorkspaceError(error, '保存预设失败')
    }
  }

  async function renamePreset(input: RenamePresetInput) {
    try {
      const document = await presetPort.renamePreset(input)
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
      const result = await presetPort.deletePreset(input)
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

  async function loadTestCallRecords(input: ListSandboxTestCallRecordsInput = {}) {
    try {
      const page = await testCallRecordPort.getTestCallRecords(input)
      testCallRecordsState.value = page.records
    } catch (error) {
      throw normalizeWorkspaceError(error, '读取测试调用记录失败')
    }
  }

  async function loadTestCallRecord(input: { recordId: string }) {
    try {
      testCallRecordState.value = await testCallRecordPort.getTestCallRecord(input)
      return testCallRecordState.value
    } catch (error) {
      throw normalizeWorkspaceError(error, '读取测试调用详情失败')
    }
  }

  async function clearTestCallRecords() {
    try {
      await testCallRecordPort.clearTestCallRecords()
      testCallRecordsState.value = []
      testCallRecordState.value = undefined
    } catch (error) {
      throw normalizeWorkspaceError(error, '清理测试调用记录失败')
    }
  }

  async function locatePresetExpression(input: LocateSandboxPresetExpressionInput) {
    try {
      const result = await presetPort.locatePresetExpression(input)
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
        ? await workspacePort.performGroupAction({ action: 'handle-request', requestId, approve, operatorId })
        : await workspacePort.performFriendAction({ action: 'handle-request', requestId, approve, operatorId })
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
    oneBotDebugRecord: readonly(oneBotDebugRecordState),
    modelRequestRecords: readonly(modelRequestRecordsState),
    modelRequestRecord: readonly(modelRequestRecordState),
    modelRequestTrajectory: readonly(modelRequestTrajectoryState),
    modelRequestRecordsPage: readonly(modelRequestRecordsPageState),
    presetCatalog: readonly(presetCatalogState),
    presetDocument: readonly(presetDocumentState),
    presetLocateResult: readonly(presetLocateResultState),
    testCallRecords: readonly(testCallRecordsState),
    testCallRecord: readonly(testCallRecordState),
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
    loadOneBotDebugRecord,
    loadModelRequestRecords,
    loadModelRequestRecord,
    loadModelRequestTrajectory,
    loadPresetCatalog,
    loadTestCallRecords,
    loadTestCallRecord,
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
    clearTestCallRecords,
    recallMessage,
    clearConversationMessages,
    createConversationInstance,
    branchConversationInstance,
    renameConversationInstance,
    deleteConversationInstance,
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
