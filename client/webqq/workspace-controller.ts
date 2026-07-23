import { computed, readonly, ref, type DeepReadonly } from 'vue'
import type {
  DeleteGroupAnnouncementInput,
  GetMessageHistoryInput,
  ManageSandboxEnvironmentInput,
  SandboxAppearance,
  SandboxBotProfile,
  SandboxConversation,
  SandboxFriendAction,
  SandboxGroup,
  SandboxGroupAction,
  SandboxMessage,
  SandboxSnapshot,
  SandboxUser,
  SandboxWorkspaceState,
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

function normalizeWorkspaceError(error: unknown, fallback: string) {
  return new WorkspaceControllerError(error instanceof Error ? error.message : fallback)
}

export type WorkspaceParticipant = (SandboxUser & { type: 'user' }) | (SandboxBotProfile & { type: 'bot' })

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
  webQQChatStyle: 'tim',
  webQQTimBubbleTail: true,
  webQQColorMode: 'auto',
  webQQAccentColor: '#2563eb',
}

const emptySnapshot: SandboxSnapshot = {
  revision: 0,
  users: [],
  bots: [],
  groups: [],
  conversations: [],
  messages: [],
  friendships: [],
  requests: [],
}

export function createWorkspaceController(port: WorkspacePort, storage: WorkspaceStorage) {
  const workspaceState = ref<SandboxWorkspaceState>({
    snapshot: emptySnapshot,
    appearance: defaultAppearance,
  })
  const currentUserIdState = ref<string>()
  const currentOperatorIdState = ref<string>()
  const activeConversationIdState = ref<string>()
  const currentViewState = ref<SandboxWorkspaceView>('messages')

  const snapshot = computed(() => workspaceState.value.snapshot)
  const currentOperator = computed<WorkspaceParticipant | undefined>(() => {
    const user = snapshot.value.users.find(({ id }) => id === currentOperatorIdState.value)
    if (user) return { ...user, type: 'user' }
    const bot = snapshot.value.bots.find(({ id }) => id === currentOperatorIdState.value)
    return bot ? { ...bot, type: 'bot' } : undefined
  })
  const conversations = computed(() => snapshot.value.conversations.filter(({ userId }) => userId === currentUserIdState.value))
  const activeConversation = computed(() => conversations.value.find(({ id }) => id === activeConversationIdState.value))
  const activeMessages = computed(() => {
    const ids = new Set(activeConversation.value?.messageIds ?? [])
    return snapshot.value.messages.filter(({ id }) => ids.has(id))
  })
  const activeBot = computed(() => snapshot.value.bots.find(({ id }) => id === activeConversation.value?.botId))
  const activeGroup = computed(() => snapshot.value.groups.find(({ id }) => id === activeConversation.value?.groupId))
  const participants = computed<WorkspaceParticipant[]>(() => [
    ...snapshot.value.users.map((user) => ({ ...user, type: 'user' as const })),
    ...snapshot.value.bots
      .filter(({ id }) => id === activeConversation.value?.botId)
      .map((bot) => ({ ...bot, type: 'bot' as const })),
  ])

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
      currentUserId: currentUserIdState.value,
      activeConversationId: activeConversationIdState.value,
      currentView: currentViewState.value,
    })
  }

  function applySelection(preferences: ReturnType<typeof resolveWorkspaceSelection>) {
    currentUserIdState.value = preferences.currentUserId
    currentOperatorIdState.value = preferences.currentUserId
    activeConversationIdState.value = preferences.activeConversationId
    currentViewState.value = preferences.currentView
  }

  function replaceWorkspace(nextWorkspace: SandboxWorkspaceState) {
    const previousOperatorId = currentOperatorIdState.value
    workspaceState.value = nextWorkspace
    const selection = resolveWorkspaceSelection(snapshot.value, {
      currentUserId: currentUserIdState.value,
      activeConversationId: activeConversationIdState.value,
      currentView: currentViewState.value,
    })
    applySelection(selection)
    if (snapshot.value.bots.some(({ id }) => id === previousOperatorId)) currentOperatorIdState.value = previousOperatorId
    saveSelection()
  }

  async function load() {
    const preferences = loadWorkspacePreferences(storage)
    let nextWorkspace: SandboxWorkspaceState
    try {
      nextWorkspace = await port.getWorkspace({ actorUserId: preferences.currentUserId })
    } catch {
      // 已保存的参与者可能已被删除；保留旧页面的无参数 RPC fallback。
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
    if (snapshot.value.bots.some(({ id }) => id === participantId)) {
      currentOperatorIdState.value = participantId
      return
    }
    if (!snapshot.value.users.some(({ id }) => id === participantId)) return
    let nextWorkspace: SandboxWorkspaceState
    try {
      nextWorkspace = await port.getWorkspace({ actorUserId: participantId })
    } catch (error) {
      throw normalizeWorkspaceError(error, '切换当前操作者失败')
    }
    workspaceState.value = nextWorkspace
    const selection = resolveWorkspaceSelection(snapshot.value, {
      currentUserId: participantId,
      currentView: 'messages',
    })
    applySelection(selection)
    currentOperatorIdState.value = participantId
    saveSelection()
  }

  function ensureOperator(userId?: string, botId?: string) {
    if (currentOperatorIdState.value === userId || currentOperatorIdState.value === botId) return
    currentOperatorIdState.value = userId
  }

  function getCurrentUserId() {
    const actorUserId = currentUserIdState.value
    if (!actorUserId) throw new WorkspaceControllerError('当前用户不可用')
    return actorUserId
  }

  async function performFriendAction(input: SandboxFriendAction) {
    const actorUserId = currentOperatorIdState.value
    if (!actorUserId) throw new WorkspaceControllerError('当前操作者不可用')
    try {
      replaceWorkspace(await port.performFriendAction({ ...input, actorUserId }))
    } catch (error) {
      throw normalizeWorkspaceError(error, '好友操作失败')
    }
  }

  async function sendMessage(input: Omit<SendMessageInput, 'actorUserId'>) {
    const actorUserId = getCurrentUserId()
    try {
      replaceWorkspace(await port.sendMessage({ ...input, actorUserId }))
    } catch (error) {
      throw normalizeWorkspaceError(error, '发送失败')
    }
  }

  async function sendMediaMessage(input: Omit<SendMediaMessageInput, 'actorUserId'>) {
    const actorUserId = getCurrentUserId()
    try {
      replaceWorkspace(await port.sendMediaMessage({ ...input, actorUserId }))
    } catch (error) {
      throw normalizeWorkspaceError(error, '发送失败')
    }
  }

  async function getMediaContent(mediaId: string) {
    const actorUserId = getCurrentUserId()
    try {
      return await port.getMediaContent({ actorUserId, mediaId })
    } catch (error) {
      throw normalizeWorkspaceError(error, '加载媒体失败')
    }
  }

  async function loadMessageHistory(input: Omit<GetMessageHistoryInput, 'actorUserId'>) {
    const actorUserId = getCurrentUserId()
    try {
      const history = await port.getMessageHistory({ ...input, actorUserId })
      const knownIds = new Set(snapshot.value.messages.map(({ id }) => id))
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
        },
      })
    } catch (error) {
      throw normalizeWorkspaceError(error, '读取历史消息失败')
    }
  }

  async function setGroupAnnouncement(input: Omit<SetGroupAnnouncementInput, 'actorUserId'>) {
    const actorUserId = getCurrentUserId()
    try {
      replaceWorkspace(await port.setGroupAnnouncement({ ...input, actorUserId }))
    } catch (error) {
      throw normalizeWorkspaceError(error, '发布群公告失败')
    }
  }

  async function deleteGroupAnnouncement(input: Omit<DeleteGroupAnnouncementInput, 'actorUserId'>) {
    const actorUserId = getCurrentUserId()
    try {
      replaceWorkspace(await port.deleteGroupAnnouncement({ ...input, actorUserId }))
    } catch (error) {
      throw normalizeWorkspaceError(error, '删除群公告失败')
    }
  }

  async function manageEnvironment(input: ManageSandboxEnvironmentInput) {
    try {
      replaceWorkspace(await port.manageEnvironment({ ...input, actorUserId: currentUserIdState.value }))
    } catch (error) {
      throw normalizeWorkspaceError(error, '环境管理失败')
    }
  }

  async function performGroupAction(input: SandboxGroupAction) {
    const actorUserId = currentOperatorIdState.value
    if (!actorUserId) throw new WorkspaceControllerError('当前操作者不可用')
    try {
      replaceWorkspace(await port.performGroupAction({ ...input, actorUserId }))
    } catch (error) {
      throw normalizeWorkspaceError(error, '群组操作失败')
    }
  }

  async function handleRelationshipRequest(requestId: string, approve: boolean) {
    const actorUserId = getCurrentUserId()
    const request = snapshot.value.requests.find(({ id }) => id === requestId)
    if (!request) throw new WorkspaceControllerError('关系申请不存在')
    try {
      const nextWorkspace = request.type === 'group'
        ? await port.performGroupAction({ action: 'handle-request', requestId, approve, actorUserId })
        : await port.performFriendAction({ action: 'handle-request', requestId, approve, actorUserId })
      replaceWorkspace(nextWorkspace)
    } catch (error) {
      throw normalizeWorkspaceError(error, '处理关系申请失败')
    }
  }

  return {
    workspace: computed<SandboxWorkspaceState>(() => workspaceState.value),
    currentUserId: readonly(currentUserIdState),
    currentOperatorId: readonly(currentOperatorIdState),
    activeConversationId: readonly(activeConversationIdState),
    currentView: readonly(currentViewState),
    sidebar,
    chat,
    composer,
    deleteGroupAnnouncement,
    details,
    ensureOperator,
    getMediaContent,
    handleRelationshipRequest,
    load,
    loadMessageHistory,
    manageEnvironment,
    performFriendAction,
    performGroupAction,
    replaceWorkspace,
    selectConversation,
    selectOperator,
    selectView,
    sendMediaMessage,
    sendMessage,
    setGroupAnnouncement,
  }
}
