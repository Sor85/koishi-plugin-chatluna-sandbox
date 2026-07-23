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
  SandboxParticipant,
  SandboxSnapshot,
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
  participants: [],
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
  const currentOperatorIdState = ref<string>()
  const activeConversationIdState = ref<string>()
  const currentViewState = ref<SandboxWorkspaceView>('messages')

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
      const operatorId = getCurrentOperatorId()
      await port.manageEnvironment(input)
      replaceWorkspace(await port.getWorkspace({ operatorId }))
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
    sidebar,
    chat,
    composer,
    deleteGroupAnnouncement,
    details,
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
