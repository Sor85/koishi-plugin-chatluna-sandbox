import { describe, expect, it } from 'vitest'
import {
  createConversationInstance,
  ensureDirectRootConversation,
  ensureGroupRootConversation,
  findDirectRootConversation,
  findGroupRootConversation,
  findVisibleConversation,
  includesConversationParticipant,
  isConversationVisible,
  listConversationIds,
  listConversationInstances,
  listConversations,
  listRootConversationInstances,
  listRootConversations,
  listVisibleConversationIds,
  listVisibleRootConversations,
  normalizeSceneConversationInstances,
  projectVisibleConversations,
  pruneConversationMessageIds,
  removeConversationInstance,
  removeConversations,
  requireConversation,
  requireVisibleConversation,
  resolveConversation,
  renameConversationInstance,
  resolveConversationPeerId,
  resolveDirectConversationId,
  resolveGroupConversationId,
  resolveRootConversationId,
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

describe('会话实例解析', () => {
  it('实例解析出自己的消息与标题，私聊参与者对来自根会话', () => {
    const scene = createScene()

    const instance = createConversationInstance(scene, { id: 'instance-1', rootConversationId: 'private:10001:20001', title: '换一种问法' })

    expect(resolveConversation(scene, instance.id)).toEqual({
      id: instance.id,
      kind: 'instance',
      rootConversationId: 'private:10001:20001',
      type: 'direct',
      participantIds: ['10001', '20001'],
      title: '换一种问法',
      messageIds: [],
    })
    // 参与者对不复制到实例上，只从根会话读。
    expect(scene.conversationInstances).toEqual([
      { id: instance.id, rootConversationId: 'private:10001:20001', title: '换一种问法', messageIds: [] },
    ])
  })

  it('群组的实例仍然是群会话，群号来自根会话', () => {
    const scene = createScene()

    const instance = createConversationInstance(scene, { id: 'instance-2', rootConversationId: 'group:30001', title: '群里再试一次' })

    expect(resolveConversation(scene, instance.id)).toMatchObject({ type: 'group', groupId: '30001' })
    expect(resolveConversationPeerId(resolveConversation(scene, instance.id)!, '10001')).toBeUndefined()
  })

  it('从实例再创建实例归一化到同一个根会话，不产生第三层', () => {
    const scene = createScene()
    const first = createConversationInstance(scene, { id: 'instance-3', rootConversationId: 'private:10001:20001', title: '第一条支线' })

    const second = createConversationInstance(scene, { id: 'instance-4', rootConversationId: first.id, title: '第二条支线' })

    expect(second.rootConversationId).toBe('private:10001:20001')
    expect(resolveRootConversationId(scene, second.id)).toBe('private:10001:20001')
    expect(listRootConversationInstances(scene, 'private:10001:20001').map(({ id }) => id)).toEqual([first.id, second.id])
    // 从实例出发也能问出「这条根会话下有哪些实例」。
    expect(listRootConversationInstances(scene, first.id).map(({ id }) => id)).toEqual([first.id, second.id])
  })

  it('根会话不存在时拒绝创建实例，空名称同样拒绝', () => {
    const scene = createScene()

    expect(() => createConversationInstance(scene, { id: 'instance-5', rootConversationId: 'group:39999', title: '无主实例' }))
      .toThrow('会话不存在：group:39999')
    expect(() => createConversationInstance(scene, { id: 'instance-6', rootConversationId: 'group:30001', title: '   ' }))
      .toThrow('会话名称不能为空')
    expect(listConversationInstances(scene)).toEqual([])
  })

  it('实例可见性完全继承根会话，不引入所有权维度', () => {
    const scene = createScene()
    const instance = createConversationInstance(scene, { id: 'instance-7', rootConversationId: 'private:10001:20001', title: '支线' })

    // 根会话的两个参与者都看得到实例：实例不是某个操作者的私有草稿。
    expect(listVisibleConversationIds(scene, '10001').has(instance.id)).toBe(true)
    expect(listVisibleConversationIds(scene, '20001').has(instance.id)).toBe(true)
    expect(listVisibleConversationIds(scene, '10002').has(instance.id)).toBe(false)

    scene.friendships = []
    expect(listVisibleConversationIds(scene, '10001').has(instance.id)).toBe(false)
  })

  it('实例不出现在根会话集合里，需要全部会话的路径显式合并两个集合', () => {
    const scene = createScene()
    const instance = createConversationInstance(scene, { id: 'instance-8', rootConversationId: 'group:30001', title: '支线' })

    expect(listRootConversations(scene).map(({ id }) => id))
      .toEqual(['private:10001:20001', 'private:10002:20001', 'group:30001'])
    expect(listVisibleRootConversations(scene, '10001').map(({ id }) => id))
      .toEqual(['private:10001:20001', 'group:30001'])
    expect(listConversationIds(scene).has(instance.id)).toBe(true)
  })

  it('实例集合缺失或形状不对时按空集合解析，不炸在读取路径上', () => {
    const scene = createScene()
    delete scene.conversationInstances

    expect(listConversationInstances(scene)).toEqual([])
    expect(listConversations(scene).map(({ id }) => id)).toEqual(listRootConversations(scene).map(({ id }) => id))
    // 半成品导入可以带来任意 JSON：非数组同样归一成空集合，而不是让 find 抛类型错误。
    Reflect.set(scene, 'conversationInstances', '不是数组')
    expect(listConversationInstances(scene)).toEqual([])
    expect(normalizeSceneConversationInstances(scene).conversationInstances).toEqual([])
  })

  it('删除根会话连带删除它的实例，删除实例不动根会话', () => {
    const scene = createScene()
    const kept = createConversationInstance(scene, { id: 'instance-9', rootConversationId: 'private:10001:20001', title: '保留' })
    const dropped = createConversationInstance(scene, { id: 'instance-10', rootConversationId: 'group:30001', title: '连带删除' })

    expect(removeConversations(scene, ({ groupId }) => groupId === '30001'))
      .toEqual(new Set(['group:30001', dropped.id]))
    expect(listConversationInstances(scene).map(({ id }) => id)).toEqual([kept.id])

    expect(removeConversations(scene, ({ id }) => id === kept.id)).toEqual(new Set([kept.id]))
    expect(listConversationInstances(scene)).toEqual([])
    expect(listRootConversations(scene).map(({ id }) => id))
      .toEqual(['private:10001:20001', 'private:10002:20001'])
  })

  it('空实例是合法状态：淘汰掉最后一条消息不删除实例本身', () => {
    const scene = createScene()
    const instance = createConversationInstance(scene, {
      id: 'instance-12',
      rootConversationId: 'group:30001',
      title: '只有一条消息',
      messageIds: ['m9'],
    })

    pruneConversationMessageIds(scene, new Set(['m9']))

    expect(resolveConversation(scene, instance.id)).toMatchObject({ messageIds: [] })
  })

  it('可见会话投影把根会话的实例一起投影出来', () => {
    const scene = createScene()
    const instance = createConversationInstance(scene, {
      id: 'instance-13',
      rootConversationId: 'private:10001:20001',
      title: '支线',
      messageIds: ['m7', 'm8'],
    })

    const projection = projectVisibleConversations(scene, '10001', 1)

    expect(projection.conversationInstances).toEqual([
      { id: instance.id, rootConversationId: 'private:10001:20001', title: '支线', messageIds: ['m8'], hasMoreMessages: true },
    ])
    expect(projection.messageIds).toEqual(new Set(['m2', 'm3', 'm8']))
  })

  it('改名只对会话实例开放，根会话的名字由参与者关系决定', () => {
    const scene = createScene()
    const instance = createConversationInstance(scene, { id: 'instance-11', rootConversationId: 'group:30001', title: '新会话' })

    renameConversationInstance(scene, instance.id, '  换个名字  ')
    expect(resolveConversation(scene, instance.id)?.title).toBe('换个名字')

    expect(() => renameConversationInstance(scene, 'group:30001', '群会话改名'))
      .toThrow('会话实例不存在：group:30001')
    expect(() => renameConversationInstance(scene, instance.id, '  ')).toThrow('会话名称不能为空')
  })

  it('删除只对会话实例开放，根会话不可删除', () => {
    const scene = createScene()
    const removed = createConversationInstance(scene, {
      id: 'instance-14',
      rootConversationId: 'private:10001:20001',
      title: '要删掉的支线',
      messageIds: ['m7'],
    })
    const kept = createConversationInstance(scene, { id: 'instance-15', rootConversationId: 'private:10001:20001', title: '留下的支线' })

    expect(removeConversationInstance(scene, removed.id)).toEqual(new Set([removed.id]))
    expect(listConversationInstances(scene).map(({ id }) => id)).toEqual([kept.id])

    // 根会话的存在由参与者关系与群组决定，删除它不是一个合法的实例操作。
    expect(() => removeConversationInstance(scene, 'private:10001:20001'))
      .toThrow('会话实例不存在：private:10001:20001')
    expect(() => removeConversationInstance(scene, removed.id))
      .toThrow(`会话实例不存在：${removed.id}`)
    expect(listRootConversations(scene).map(({ id }) => id))
      .toEqual(['private:10001:20001', 'private:10002:20001', 'group:30001'])
  })
})
