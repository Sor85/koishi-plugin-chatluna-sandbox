import { computed, readonly, ref, type DeepReadonly } from 'vue'
import type {
  DeleteGroupAnnouncementInput,
  GetForwardMessageInput,
  GetMessageHistoryInput,
  GetSandboxOneBotDebugRecordsInput,
  ManageSandboxEnvironmentInput,
  RecallMessageInput,
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
  enableWebQQFrostedGlass: true,
  webQQTimBubbleTail: true,
  webQQColorMode: 'auto',
  webQQAccentColor: '#2563eb',
  webQQMarkRecalledMessages: true,
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
  const oneBotDebugRecordsState = ref<SandboxConsoleOneBotDebugRecord[]>([])

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
      nextWorkspace = await port.getWorkspace({ operatorId: participantId })
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
    sidebar,
    chat,
    composer,
    deleteGroupAnnouncement,
    details,
    getMediaContent,
    handleRelationshipRequest,
    load,
    loadMessageHistory,
    loadOneBotDebugRecords,
    manageEnvironment,
    notifySceneRevision,
    performFriendAction,
    performGroupAction,
    clearOneBotDebugRecords,
    recallMessage,
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
