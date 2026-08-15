import type { SandboxSnapshot } from '../../src/types'

export type SandboxWorkspaceView = 'messages' | 'contacts' | 'profile' | 'debug' | 'model-requests' | 'spaces'
export type SandboxDetailsPreference = 'auto' | 'open' | 'closed'

export interface SandboxWorkspacePreferences {
  currentOperatorId?: string
  activeConversationId?: string
  currentView: SandboxWorkspaceView
  hiddenRecentConversations?: Record<string, Record<string, string>>
}

interface WorkspaceStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const STORAGE_KEY = 'chatluna-sandbox.workspace'
const DEFAULT_PREFERENCES: SandboxWorkspacePreferences = {
  currentView: 'messages',
}
const WORKSPACE_VIEWS = new Set<SandboxWorkspaceView>(['messages', 'contacts', 'profile', 'debug', 'model-requests'])

function readHiddenRecentConversations(value: unknown): Record<string, Record<string, string>> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return
  const result: Record<string, Record<string, string>> = {}
  for (const [operatorId, entries] of Object.entries(value)) {
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) continue
    const hidden = Object.fromEntries(Object.entries(entries)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
    if (Object.keys(hidden).length) result[operatorId] = hidden
  }
  return Object.keys(result).length ? result : undefined
}

export function resolveDetailsVisibility(preference: SandboxDetailsPreference, wideLayout: boolean) {
  if (preference === 'open') return true
  if (preference === 'closed') return false
  return wideLayout
}

export function toggleDetailsPreference(visible: boolean): SandboxDetailsPreference {
  return visible ? 'closed' : 'open'
}

export function resolveDetailsPreferenceAfterLayoutChange(wideLayout: boolean): SandboxDetailsPreference {
  return wideLayout ? 'open' : 'closed'
}

export function loadWorkspacePreferences(storage: Pick<WorkspaceStorage, 'getItem'>): SandboxWorkspacePreferences {
  try {
    const value = JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}') as Partial<SandboxWorkspacePreferences>
    const hiddenRecentConversations = readHiddenRecentConversations(value.hiddenRecentConversations)
    return {
      currentOperatorId: typeof value.currentOperatorId === 'string' ? value.currentOperatorId : undefined,
      activeConversationId: typeof value.activeConversationId === 'string' ? value.activeConversationId : undefined,
      currentView: WORKSPACE_VIEWS.has(value.currentView as SandboxWorkspaceView)
        ? value.currentView as SandboxWorkspaceView
        : DEFAULT_PREFERENCES.currentView,
      ...(hiddenRecentConversations ? { hiddenRecentConversations } : {}),
    }
  } catch {
    return { ...DEFAULT_PREFERENCES }
  }
}

export function saveWorkspacePreferences(
  storage: Pick<WorkspaceStorage, 'setItem'>,
  preferences: SandboxWorkspacePreferences,
) {
  storage.setItem(STORAGE_KEY, JSON.stringify(preferences))
}

export function resolveWorkspaceSelection(
  snapshot: SandboxSnapshot,
  preferences: SandboxWorkspacePreferences,
): SandboxWorkspacePreferences {
  const currentOperator = snapshot.participants.find(({ id }) => id === preferences.currentOperatorId)
    ?? snapshot.participants.find(({ kind }) => kind === 'user')
    ?? snapshot.participants[0]
  const conversations = currentOperator
    ? snapshot.conversations.filter((conversation) => conversation.type === 'direct'
      ? conversation.participantIds.includes(currentOperator.id)
      : snapshot.groups.find(({ id }) => id === conversation.groupId)?.members
        .some(({ participantId }) => participantId === currentOperator.id))
    : []
  const activeConversation = conversations.find(({ id }) => id === preferences.activeConversationId)
    ?? conversations[0]

  return {
    currentOperatorId: currentOperator?.id,
    activeConversationId: activeConversation?.id,
    currentView: preferences.currentView,
    ...(preferences.hiddenRecentConversations
      ? { hiddenRecentConversations: preferences.hiddenRecentConversations }
      : {}),
  }
}
