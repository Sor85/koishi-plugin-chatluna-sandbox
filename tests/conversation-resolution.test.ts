import { describe, expect, it } from 'vitest'
import {
  ensureDirectRootConversation,
  ensureGroupRootConversation,
  findDirectRootConversation,
  findGroupRootConversation,
  findVisibleConversation,
  includesConversationParticipant,
  isConversationVisible,
  listConversationIds,
  listVisibleConversationIds,
  listVisibleRootConversations,
  projectVisibleConversations,
  pruneConversationMessageIds,
  removeConversations,
  requireConversation,
  requireVisibleConversation,
  resolveConversation,
  resolveConversationPeerId,
  resolveDirectConversationId,
  resolveGroupConversationId,
} from '../src/conversation-resolution'
import { SandboxDomainError, type SandboxSnapshot } from '../src/types'

function createScene(): SandboxSnapshot {
  return {
    revision: 1,
    participants: [
      { kind: 'user', id: '10001', name: '用户一' },
      { kind: 'user', id: '10002', name: '用户二' },
      { kind: 'bot', id: '20001', name: '机器人', implementation: 'napcat', enabled: true },
    ],
    groups: [{
      id: '30001',
      name: '测试群',
      members: [
        { participantId: '10001', role: 'owner' },
        { participantId: '20001', role: 'member' },
      ],
      announcements: [],
    }],
    conversations: [
      { id: 'private:10001:20001', type: 'direct', participantIds: ['10001', '20001'], messageIds: ['m1', 'm2'] },
      { id: 'private:10002:20001', type: 'direct', participantIds: ['10002', '20001'], messageIds: [] },
      { id: 'group:30001', type: 'group', groupId: '30001', messageIds: ['m3'] },
    ],
    messages: [],
    forwards: [],
    friendships: [{
      id: 'friend:10001:20001',
      participantIds: ['10001', '20001'],
      remarks: {},
      createdAt: '2026-01-01T00:00:00.000Z',
    }],
    requests: [],
  }
}

describe('会话解析', () => {
  it('把会话 ID 解析成统一结果，根会话解析到自己', () => {
    const scene = createScene()

    expect(resolveConversation(scene, 'private:10001:20001')).toEqual({
      id: 'private:10001:20001',
      kind: 'root',
      rootConversationId: 'private:10001:20001',
      type: 'direct',
      participantIds: ['10001', '20001'],
      messageIds: ['m1', 'm2'],
    })
    expect(resolveConversation(scene, 'group:30001')).toEqual({
      id: 'group:30001',
      kind: 'root',
      rootConversationId: 'group:30001',
      type: 'group',
      groupId: '30001',
      messageIds: ['m3'],
    })
    expect(resolveConversation(scene, 'private:10001:10002')).toBeUndefined()
  })

  it('会话不存在时按领域拒绝报出会话 ID', () => {
    const scene = createScene()

    expect(() => requireConversation(scene, 'group:39999')).toThrow(SandboxDomainError)
    expect(() => requireConversation(scene, 'group:39999')).toThrow('会话不存在：group:39999')
    expect(() => requireVisibleConversation(scene, '10001', 'private:10002:20001')).toThrow('会话不存在：private:10002:20001')
  })

  it('归属不要求好友关系，可见性要求好友关系仍然存在', () => {
    const scene = createScene()
    const conversation = requireConversation(scene, 'private:10001:20001')

    expect(includesConversationParticipant(scene, conversation, '10001')).toBe(true)
    expect(isConversationVisible(scene, '10001', conversation)).toBe(true)

    scene.friendships = []
    // 解除好友只撤销可见性，会话与历史消息仍然归属这一对参与者。
    expect(includesConversationParticipant(scene, conversation, '10001')).toBe(true)
    expect(isConversationVisible(scene, '10001', conversation)).toBe(false)
    expect(findVisibleConversation(scene, '10001', 'private:10001:20001')).toBeUndefined()
  })

  it('群聊可见性看群成员关系，退群后不再可见', () => {
    const scene = createScene()
    const conversation = requireConversation(scene, 'group:30001')

    expect(isConversationVisible(scene, '10001', conversation)).toBe(true)
    expect(isConversationVisible(scene, '10002', conversation)).toBe(false)

    scene.groups[0]!.members = scene.groups[0]!.members.filter(({ participantId }) => participantId !== '10001')
    expect(isConversationVisible(scene, '10001', conversation)).toBe(false)
  })

  it('按操作者列出可见会话，不可见的私聊不出现在任何列表里', () => {
    const scene = createScene()

    expect(listVisibleRootConversations(scene, '10001').map(({ id }) => id))
      .toEqual(['private:10001:20001', 'group:30001'])
    expect(listVisibleConversationIds(scene, '10002')).toEqual(new Set())
    expect(listConversationIds(scene))
      .toEqual(new Set(['private:10001:20001', 'private:10002:20001', 'group:30001']))
  })

  it('私聊对端由参与者对解析，群聊没有对端', () => {
    const scene = createScene()

    expect(resolveConversationPeerId(requireConversation(scene, 'private:10001:20001'), '10001')).toBe('20001')
    expect(resolveConversationPeerId(requireConversation(scene, 'private:10001:20001'), '20001')).toBe('10001')
    expect(resolveConversationPeerId(requireConversation(scene, 'group:30001'), '10001')).toBeUndefined()
  })

  it('按参与者对与群号定位根会话，尚未建立时给出规范 ID 且不写入场景', () => {
    const scene = createScene()

    expect(findDirectRootConversation(scene, '20001', '10001')?.id).toBe('private:10001:20001')
    expect(findGroupRootConversation(scene, '30001')?.id).toBe('group:30001')
    expect(findDirectRootConversation(scene, '10001', '10002')).toBeUndefined()

    expect(resolveDirectConversationId(scene, '10002', '10001')).toBe('private:10001:10002')
    expect(resolveGroupConversationId(scene, '39999')).toBe('group:39999')
    expect(listConversationIds(scene).has('private:10001:10002')).toBe(false)
  })

  it('确保根会话存在是幂等的，参与者对按规范顺序写入', () => {
    const scene = createScene()

    expect(ensureDirectRootConversation(scene, '20001', '10001').id).toBe('private:10001:20001')
    expect(scene.conversations).toHaveLength(3)

    const created = ensureDirectRootConversation(scene, '10002', '10001')
    expect(created).toEqual({
      id: 'private:10001:10002',
      kind: 'root',
      rootConversationId: 'private:10001:10002',
      type: 'direct',
      participantIds: ['10001', '10002'],
      messageIds: [],
    })
    expect(ensureGroupRootConversation(scene, '39999').id).toBe('group:39999')
    expect(ensureGroupRootConversation(scene, '39999').id).toBe('group:39999')
    expect(listConversationIds(scene).size).toBe(5)
  })

  it('删除会话只动会话集合，并把被删除的 ID 交给调用方做级联清理', () => {
    const scene = createScene()

    const removed = removeConversations(scene, (conversation) => conversation.groupId === '30001')
    expect(removed).toEqual(new Set(['group:30001']))
    expect(listConversationIds(scene).has('group:30001')).toBe(false)
    expect(removeConversations(scene, () => false)).toEqual(new Set())
  })

  it('淘汰消息后从所有会话摘掉引用', () => {
    const scene = createScene()

    pruneConversationMessageIds(scene, new Set(['m1', 'm3']))

    expect(resolveConversation(scene, 'private:10001:20001')?.messageIds).toEqual(['m2'])
    expect(resolveConversation(scene, 'group:30001')?.messageIds).toEqual([])
  })

  it('可见会话投影按上限截断消息并标注还有更多', () => {
    const scene = createScene()

    const projection = projectVisibleConversations(scene, '10001', 1)

    expect(projection.conversations.map(({ id }) => id)).toEqual(['private:10001:20001', 'group:30001'])
    expect(projection.conversations[0]).toMatchObject({ messageIds: ['m2'], hasMoreMessages: true })
    expect(projection.conversations[1]).toMatchObject({ messageIds: ['m3'], hasMoreMessages: false })
    expect(projection.messageIds).toEqual(new Set(['m2', 'm3']))
  })
})
