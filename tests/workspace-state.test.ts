import { describe, expect, it } from 'vitest'
import type { SandboxSnapshot } from '../src/types'
import {
  loadWorkspacePreferences,
  resolveDetailsPreferenceAfterLayoutChange,
  resolveDetailsVisibility,
  resolveWorkspaceSelection,
  saveWorkspacePreferences,
  toggleDetailsPreference,
} from '../client/workspace-state'

const snapshot: SandboxSnapshot = {
  revision: 0,
  users: [
    { id: '10001', name: '测试用户' },
    { id: '10002', name: '协作用户' },
  ],
  bots: [{
    id: '20001',
    name: 'OneBot Sandbox',
    implementation: 'napcat',
    enabled: true,
  }],
  groups: [],
  conversations: [
    { id: 'private:10001:20001', type: 'direct', userId: '10001', botId: '20001', messageIds: [] },
    { id: 'private:10002:20001', type: 'direct', userId: '10002', botId: '20001', messageIds: [] },
  ],
  messages: [],
  friendships: [],
  requests: [],
}

describe('WebQQ 浏览器工作台状态', () => {
  it('右侧栏默认跟随宽度并允许三点按钮显式切换', () => {
    expect(resolveDetailsVisibility('auto', true)).toBe(true)
    expect(resolveDetailsVisibility('auto', false)).toBe(false)
    expect(resolveDetailsVisibility('closed', true)).toBe(false)
    expect(resolveDetailsVisibility('open', false)).toBe(true)
    expect(toggleDetailsPreference(true)).toBe('closed')
    expect(toggleDetailsPreference(false)).toBe('open')
  })

  it('浏览器跨越响应式断点时同步右侧栏状态', () => {
    expect(resolveDetailsPreferenceAfterLayoutChange(false)).toBe('closed')
    expect(resolveDetailsPreferenceAfterLayoutChange(true)).toBe('open')
  })

  it('只在浏览器存储中保存当前用户、活动会话和当前视图', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    }

    saveWorkspacePreferences(storage, {
      currentUserId: '10002',
      activeConversationId: 'private:10002:20001',
      currentView: 'profile',
    })

    expect(loadWorkspacePreferences(storage)).toEqual({
      currentUserId: '10002',
      activeConversationId: 'private:10002:20001',
      currentView: 'profile',
    })
    expect(snapshot.users[0].id).toBe('10001')
  })

  it('恢复无效选择时回退到存在的用户和该用户会话', () => {
    expect(resolveWorkspaceSelection(snapshot, {
      currentUserId: 'deleted-user',
      activeConversationId: 'deleted-conversation',
      currentView: 'messages',
    })).toEqual({
      currentUserId: '10001',
      activeConversationId: 'private:10001:20001',
      currentView: 'messages',
    })
  })
})
