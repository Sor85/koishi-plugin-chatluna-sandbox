import { computed, readonly, ref, type DeepReadonly } from 'vue'
import type {
  SandboxAppearance,
  SandboxBotProfile,
  SandboxConversation,
  SandboxGroup,
  SandboxMessage,
  SandboxSnapshot,
  SandboxUser,
  SandboxWorkspaceState,
} from '../../src/types'
import {
  loadWorkspacePreferences,
  resolveWorkspaceSelection,
  saveWorkspacePreferences,
  type SandboxWorkspaceView,
} from '../workspace-state'
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

  return {
    workspace: computed<SandboxWorkspaceState>(() => workspaceState.value),
    currentUserId: readonly(currentUserIdState),
    currentOperatorId: readonly(currentOperatorIdState),
    activeConversationId: readonly(activeConversationIdState),
    currentView: readonly(currentViewState),
    sidebar,
    chat,
    composer,
    details,
    ensureOperator,
    load,
    replaceWorkspace,
    selectConversation,
    selectOperator,
    selectView,
  }
}
