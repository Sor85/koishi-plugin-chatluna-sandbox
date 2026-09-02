import { describe, expect, it } from 'vitest'
import { buildWorkspaceThumbnailModels } from '../client/test-space/thumbnail-model'
import type { SandboxAppearance, SandboxSnapshot } from '../src/types'

const appearance: SandboxAppearance = {
  enableSandboxFrostedGlass: false,
  sandboxTimBubbleTail: false,
  sandboxColorMode: 'auto',
  sandboxAccentColor: '#3b82f6',
  sandboxMarkRecalledMessages: true,
}

/**
 * 缩略图的会话列表与工作台侧栏共用一份会话树投影，因此这里逐项钉住投影口径：
 * 换一份实现（例如复用侧栏那个 module）时，这些断言就是它的回归网。
 *
 * 缩略图的输入规则与侧栏不同，这条差别也在下面钉住：它只取根会话，且私聊按参与关系
 * 而不是好友关系判定——缩略图是工作台的小幅预览，不做可见性收窄。
 */
function scene(overrides: Partial<SandboxSnapshot> = {}): SandboxSnapshot {
  return {
    revision: 3,
    participants: [
      { kind: 'user', id: '10001', name: '测试用户1' },
      { kind: 'user', id: '10002', name: '测试用户2' },
      { kind: 'bot', id: '20001', name: 'Koishi', implementation: 'napcat', enabled: true, avatar: 'https://example.com/bot.png' },
    ],
    groups: [
      {
        id: '30001',
        name: '测试群',
        avatar: 'https://example.com/group.png',
        announcements: [],
        members: [
          { participantId: '10001', role: 'admin' },
          { participantId: '20001', role: 'member' },
        ],
      },
      {
        id: '30002',
        name: '只读群',
        announcements: [],
        members: [{ participantId: '10001', role: 'member' }],
      },
    ],
    conversations: [
      { id: 'private:10001:20001', type: 'direct', participantIds: ['10001', '20001'], messageIds: ['m1'] },
      { id: 'private:10001:10002', type: 'direct', participantIds: ['10001', '10002'], messageIds: [] },
      { id: 'group:30001', type: 'group', groupId: '30001', messageIds: ['m2'] },
      { id: 'group:30002', type: 'group', groupId: '30002', messageIds: ['m3'] },
    ],
    // 会话实例存在但不该出现在缩略图里。
    conversationInstances: [
      { id: 'instance-1', rootConversationId: 'private:10001:20001', title: '换一种问法', messageIds: ['m1'] },
    ],
    messages: [
      { id: 'm1', authorId: '10001', conversationId: 'private:10001:20001', content: '<at id="20001"/> 在吗', createdAt: '2026-08-29T02:00:00.000Z' },
      {
        id: 'm2',
        authorId: '10001',
        conversationId: 'group:30001',
        content: '说错了',
        createdAt: '2026-08-29T03:00:00.000Z',
        lifecycle: { status: 'recalled', operatorId: '10002', recalledAt: '2026-08-29T03:01:00.000Z' },
      },
      { id: 'm3', authorId: '10002', conversationId: 'group:30002', content: '看这里', createdAt: '2026-08-29T04:00:00.000Z' },
    ],
    forwards: [],
    // 私聊 10001↔10002 故意没有好友关系。
    friendships: [{ id: 'friend:10001:20001', participantIds: ['10001', '20001'], remarks: {}, createdAt: '' }],
    requests: [],
    ...overrides,
  }
}

function conversations(source = scene()) {
  return buildWorkspaceThumbnailModels(source, appearance, 'light').sidebar.conversations
}

describe('缩略图的会话列表投影', () => {
  it('只画根会话，会话实例不出现也不作为子项挂上去', () => {
    expect(conversations().map(({ id, kind, children }) => ({ id, kind, childCount: children.length }))).toEqual([
      { id: 'private:10001:20001', kind: 'root', childCount: 0 },
      { id: 'private:10001:10002', kind: 'root', childCount: 0 },
      { id: 'group:30001', kind: 'root', childCount: 0 },
      { id: 'group:30002', kind: 'root', childCount: 0 },
    ])
  })

  it('私聊按参与关系而不是好友关系收进列表', () => {
    // 10001 与 10002 之间没有好友关系，缩略图仍然画这一行。
    expect(conversations().map(({ id }) => id)).toContain('private:10001:10002')
  })

  it('标题取群名或联系人名，头像与头像种类按群组和机器人判定', () => {
    expect(conversations().map(({ id, title, avatar, avatarKind }) => ({ id, title, avatar, avatarKind }))).toEqual([
      { id: 'private:10001:20001', title: 'Koishi', avatar: 'https://example.com/bot.png', avatarKind: 'bot' },
      { id: 'private:10001:10002', title: '测试用户2', avatar: undefined, avatarKind: 'user' },
      { id: 'group:30001', title: '测试群', avatar: 'https://example.com/group.png', avatarKind: 'group' },
      { id: 'group:30002', title: '只读群', avatar: undefined, avatarKind: 'group' },
    ])
  })

  it('预览取最后一条消息：at 元素换成名字、撤回取事件文案、没有消息取「开始一段新对话」', () => {
    expect(conversations().map(({ id, preview }) => ({ id, preview }))).toEqual([
      { id: 'private:10001:20001', preview: '@Koishi 在吗' },
      { id: 'private:10001:10002', preview: '开始一段新对话' },
      { id: 'group:30001', preview: '测试用户2 撤回了一条消息' },
      { id: 'group:30002', preview: '看这里' },
    ])
  })

  it('时间按时分取自各自最后一条消息，没有消息时为空串', () => {
    const rows = conversations()

    expect(rows[0]?.time).toMatch(/^\d{2}:\d{2}$/)
    expect(rows[1]?.time).toBe('')
    // 三条消息各差一小时，取错来源就会相等。
    expect(new Set(rows.map(({ time }) => time)).size).toBe(4)
  })

  it('群角色取当前操作者在群里的角色，私聊没有角色', () => {
    expect(conversations().map(({ id, actorRole }) => ({ id, actorRole }))).toEqual([
      { id: 'private:10001:20001', actorRole: undefined },
      { id: 'private:10001:10002', actorRole: undefined },
      { id: 'group:30001', actorRole: 'admin' },
      { id: 'group:30002', actorRole: 'member' },
    ])
  })

  it('右键入口的目标与文案按群组、机器人与用户区分', () => {
    expect(conversations().map(({ entityTarget, entityLabel }) => ({ entityTarget, entityLabel }))).toEqual([
      { entityTarget: { type: 'bot', id: '20001' }, entityLabel: '机器人' },
      { entityTarget: { type: 'user', id: '10002' }, entityLabel: '用户' },
      { entityTarget: { type: 'group', id: '30001' }, entityLabel: '群组' },
      { entityTarget: { type: 'group', id: '30002' }, entityLabel: '群组' },
    ])
  })

  it('头像引用原样带出，媒体解析不在这一层发生', () => {
    const withMediaReference = scene({
      participants: [
        { kind: 'user', id: '10001', name: '测试用户1' },
        { kind: 'bot', id: '20001', name: 'Koishi', implementation: 'napcat', enabled: true, avatar: 'sandbox-media://0123456789abcdef0123456789abcdef' },
      ],
      groups: [],
      conversations: [{ id: 'private:10001:20001', type: 'direct', participantIds: ['10001', '20001'], messageIds: [] }],
      conversationInstances: [],
      messages: [],
    })

    expect(conversations(withMediaReference).map(({ avatar }) => avatar))
      .toEqual(['sandbox-media://0123456789abcdef0123456789abcdef'])
  })

  it('没有参与者时会话列表为空', () => {
    const empty = scene({ participants: [], groups: [], conversations: [], conversationInstances: [], messages: [], friendships: [] })

    expect(conversations(empty)).toEqual([])
  })
})

describe('缩略图的转发目标「最近」一列', () => {
  it('逐项取自会话行，副标题就是会话行的预览', () => {
    const { chatPane, sidebar } = buildWorkspaceThumbnailModels(scene(), appearance, 'light')

    expect(chatPane.forwardTargets.recent).toEqual(sidebar.conversations.map(({ id, title, preview, avatar, avatarKind }) => ({
      conversationId: id,
      title,
      subtitle: preview,
      avatar,
      avatarKind,
    })))
  })
})
