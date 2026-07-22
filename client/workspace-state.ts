import type { SandboxSnapshot } from '../src/types'

export type SandboxWorkspaceView = 'messages' | 'contacts' | 'profile'
export type SandboxDetailsPreference = 'auto' | 'open' | 'closed'

export interface SandboxWorkspacePreferences {
  currentUserId?: string
  activeConversationId?: string
  currentView: SandboxWorkspaceView
}

interface WorkspaceStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const STORAGE_KEY = 'onebot-sandbox.workspace'
const DEFAULT_PREFERENCES: SandboxWorkspacePreferences = {
  currentView: 'messages',
}
const WORKSPACE_VIEWS = new Set<SandboxWorkspaceView>(['messages', 'contacts', 'profile'])

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
    return {
      currentUserId: typeof value.currentUserId === 'string' ? value.currentUserId : undefined,
      activeConversationId: typeof value.activeConversationId === 'string' ? value.activeConversationId : undefined,
      currentView: WORKSPACE_VIEWS.has(value.currentView as SandboxWorkspaceView)
        ? value.currentView as SandboxWorkspaceView
        : DEFAULT_PREFERENCES.currentView,
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
  const currentUser = snapshot.users.find(({ id }) => id === preferences.currentUserId) ?? snapshot.users[0]
  const conversations = currentUser
    ? snapshot.conversations.filter(({ userId }) => userId === currentUser.id)
    : []
  const activeConversation = conversations.find(({ id }) => id === preferences.activeConversationId)
    ?? conversations[0]

  return {
    currentUserId: currentUser?.id,
    activeConversationId: activeConversation?.id,
    currentView: preferences.currentView,
  }
}
