import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ref } from 'vue'
import {
  buildConversationTree,
  toRecentForwardTargets,
} from '../client/webqq/conversation-tree'
import { createFakeWorkspacePort } from '../client/webqq/fake-workspace-port'
import { createTestWorkspaceController } from './helpers/workspace-controller'
import { createWorkspaceLayout } from '../client/webqq/workspace-layout'
import { createWebqqWorkspaceShell } from '../client/webqq/workspace-shell'
import { listVisibleConversations } from '../src/conversation-resolution'
import type { SandboxSnapshot, SandboxWorkspaceState } from '../src/types'

function scene(overrides: Partial<SandboxSnapshot> = {}): SandboxSnapshot {
  return {
    revision: 1,
    participants: [
      { kind: 'user', id: '10001', name: '测试用户1' },
      { kind: 'bot', id: '20001', name: 'Koishi', implementation: 'napcat', enabled: true },
    ],
    groups: [{
      id: '30001',
      name: '测试群',
      announcements: [],
      members: [
        { participantId: '10001', role: 'owner' },
        { participantId: '20001', role: 'admin' },
      ],
    }],
    conversations: [
      { id: 'private:10001:20001', type: 'direct', participantIds: ['10001', '20001'], messageIds: [] },
      { id: 'group:30001', type: 'group', groupId: '30001', messageIds: [] },
    ],
    conversationInstances: [],
    messages: [],
    forwards: [],
    friendships: [{ id: 'friend:10001:20001', participantIds: ['10001', '20001'], remarks: {}, createdAt: '' }],
    requests: [],
    ...overrides,
  }
}

function buildTree(source: SandboxSnapshot, operatorId = '10001', resolveAvatar?: (avatar?: string) => string | undefined) {
  return buildConversationTree({
    scene: source,
    conversations: listVisibleConversations(source, operatorId),
    operatorId,
    resolveAvatar,
  })
}

function createWorkspace(source: SandboxSnapshot): SandboxWorkspaceState {
  return {
    snapshot: source,
    chatLunaStates: [],
    persistence: { mode: 'memory', available: true, persisted: false },
    appearance: {
      enableSandboxFrostedGlass: true,
      sandboxTimBubbleTail: true,
      sandboxColorMode: 'auto',
      sandboxAccentColor: '#2563eb',
      sandboxMarkRecalledMessages: true,
    },
  }
}

async function createShell(source: SandboxSnapshot) {
  const values = new Map<string, string>()
  const controller = createTestWorkspaceController({ workspace: createFakeWorkspacePort(createWorkspace(source)) }, {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  })
  await controller.load()
  // 外壳在 setup 里注册 onMounted 做首屏加载；直接调用工厂时该钩子是空操作，Vue 会为此打一条 warn。
  const warn = console.warn
  console.warn = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].includes('onMounted is called when there is no active component')) return
    warn(...args)
  }
  try {
    return createWebqqWorkspaceShell(controller, createWorkspaceLayout(ref(true)), () => undefined)
  } finally {
    console.warn = warn
  }
}

describe('侧栏会话树投影', () => {
  it('顶层只有根会话，会话实例挂到所属根会话下', () => {
    const tree = buildTree(scene({
      conversationInstances: [
        { id: 'instance-1', rootConversationId: 'private:10001:20001', title: '换一种问法', messageIds: [] },
        { id: 'instance-2', rootConversationId: 'group:30001', title: '群里再问一次', messageIds: [] },
      ],
    }))

    expect(tree.map(({ id, kind }) => ({ id, kind }))).toEqual([
      { id: 'private:10001:20001', kind: 'root' },
      { id: 'group:30001', kind: 'root' },
    ])
    // 实例只挂在自己的根会话下，不污染别的会话。
    expect(tree.map(({ children }) => children.map(({ id, kind }) => ({ id, kind })))).toEqual([
      [{ id: 'instance-1', kind: 'instance' }],
      [{ id: 'instance-2', kind: 'instance' }],
    ])
  })

  it('层级严格两层：实例子项自己不再挂子项', () => {
    const tree = buildTree(scene({
      conversationInstances: [
        { id: 'instance-1', rootConversationId: 'private:10001:20001', title: '换一种问法', messageIds: [] },
      ],
    }))

    expect(tree[0]?.children[0]).not.toHaveProperty('children')
  })

  it('没有会话实例时每个根会话都给出空的子项列表', () => {
    expect(buildTree(scene()).map(({ children }) => children)).toEqual([[], []])
  })

  it('标题取实例名，缺实例名时取联系人名或群名', () => {
    const tree = buildTree(scene({
      conversationInstances: [
        { id: 'instance-1', rootConversationId: 'private:10001:20001', title: '换一种问法', messageIds: [] },
      ],
    }))

    expect(tree.map(({ title }) => title)).toEqual(['Koishi', '测试群'])
    expect(tree[0]?.children.map(({ title }) => title)).toEqual(['换一种问法'])
  })

  it('预览取拼接后的最后一条消息', () => {
    const tree = buildTree(scene({
      conversations: [
        { id: 'private:10001:20001', type: 'direct', participantIds: ['10001', '20001'], messageIds: ['message-1'] },
        { id: 'group:30001', type: 'group', groupId: '30001', messageIds: [] },
      ],
      conversationInstances: [
        // 分支物化后带着继承前缀：预览取拼接结果的最后一条，因此是实例自有的那条。
        { id: 'instance-1', rootConversationId: 'private:10001:20001', title: '换一种问法', messageIds: ['message-1', 'message-2'] },
      ],
      messages: [
        { id: 'message-1', authorId: '10001', conversationId: 'private:10001:20001', content: '根会话消息', createdAt: '2026-08-29T02:00:00.000Z' },
        { id: 'message-2', authorId: '10001', conversationId: 'instance-1', content: '分支里的提问', createdAt: '2026-08-29T03:00:00.000Z' },
      ],
    }))

    expect(tree[0]?.preview).toBe('根会话消息')
    expect(tree[0]?.children.map(({ preview }) => preview)).toEqual(['分支里的提问'])
  })

  it('预览里的 at 元素格式化成参与者名字', () => {
    const tree = buildTree(scene({
      conversations: [
        { id: 'private:10001:20001', type: 'direct', participantIds: ['10001', '20001'], messageIds: [] },
        { id: 'group:30001', type: 'group', groupId: '30001', messageIds: ['message-1'] },
      ],
      messages: [
        { id: 'message-1', authorId: '10001', conversationId: 'group:30001', content: '<at id="20001"/> 在吗', createdAt: '2026-08-29T02:00:00.000Z' },
      ],
    }))

    expect(tree[1]?.preview).toBe('@Koishi 在吗')
  })

  it('最后一条被撤回时预览取撤回事件文案', () => {
    const tree = buildTree(scene({
      conversations: [
        { id: 'private:10001:20001', type: 'direct', participantIds: ['10001', '20001'], messageIds: ['message-1'] },
        { id: 'group:30001', type: 'group', groupId: '30001', messageIds: [] },
      ],
      messages: [{
        id: 'message-1',
        authorId: '10001',
        conversationId: 'private:10001:20001',
        content: '说错了',
        createdAt: '2026-08-29T02:00:00.000Z',
        lifecycle: { status: 'recalled', operatorId: '10001', recalledAt: '2026-08-29T02:01:00.000Z' },
      }],
    }))

    expect(tree[0]?.preview).toBe('测试用户1 撤回了一条消息')
  })

  it('一条消息都没有时预览是「开始一段新对话」', () => {
    const tree = buildTree(scene({
      conversationInstances: [
        { id: 'instance-1', rootConversationId: 'private:10001:20001', title: '再试一次', messageIds: [] },
      ],
    }))

    expect(tree[0]?.preview).toBe('开始一段新对话')
    expect(tree[0]?.children.map(({ preview }) => preview)).toEqual(['开始一段新对话'])
  })

  it('时间按 zh-CN 时分取自各自最后一条消息，没有消息时为空串', () => {
    const tree = buildTree(scene({
      conversations: [
        { id: 'private:10001:20001', type: 'direct', participantIds: ['10001', '20001'], messageIds: ['message-1'] },
        { id: 'group:30001', type: 'group', groupId: '30001', messageIds: [] },
      ],
      conversationInstances: [
        { id: 'instance-1', rootConversationId: 'private:10001:20001', title: '换一种问法', messageIds: ['message-2'] },
        { id: 'instance-2', rootConversationId: 'private:10001:20001', title: '再试一次', messageIds: [] },
      ],
      messages: [
        { id: 'message-1', authorId: '10001', conversationId: 'private:10001:20001', content: '根会话消息', createdAt: '2026-08-29T02:00:00.000Z' },
        { id: 'message-2', authorId: '10001', conversationId: 'instance-1', content: '实例里的提问', createdAt: '2026-08-29T03:00:00.000Z' },
      ],
    }))
    const [withMessages, empty] = tree[0]?.children ?? []

    expect(tree[0]?.time).toMatch(/^\d{2}:\d{2}$/)
    // 子项的时间来自实例自己的最后一条消息：两条消息相隔一小时，取错来源就相等。
    expect(withMessages?.time).toMatch(/^\d{2}:\d{2}$/)
    expect(withMessages?.time).not.toBe(tree[0]?.time)
    expect(empty?.time).toBe('')
    expect(tree[1]?.time).toBe('')
  })

  it('头像种类按群组与机器人判定', () => {
    const tree = buildTree(scene({
      participants: [
        { kind: 'user', id: '10001', name: '测试用户1' },
        { kind: 'user', id: '10002', name: '测试用户2' },
        { kind: 'bot', id: '20001', name: 'Koishi', implementation: 'napcat', enabled: true },
      ],
      conversations: [
        { id: 'private:10001:20001', type: 'direct', participantIds: ['10001', '20001'], messageIds: [] },
        { id: 'private:10001:10002', type: 'direct', participantIds: ['10001', '10002'], messageIds: [] },
        { id: 'group:30001', type: 'group', groupId: '30001', messageIds: [] },
      ],
      friendships: [
        { id: 'friend:10001:20001', participantIds: ['10001', '20001'], remarks: {}, createdAt: '' },
        { id: 'friend:10001:10002', participantIds: ['10001', '10002'], remarks: {}, createdAt: '' },
      ],
    }))

    expect(tree.map(({ id, avatarKind, entityLabel, entityTarget }) => ({ id, avatarKind, entityLabel, entityTarget }))).toEqual([
      { id: 'private:10001:20001', avatarKind: 'bot', entityLabel: '机器人', entityTarget: { type: 'bot', id: '20001' } },
      { id: 'private:10001:10002', avatarKind: 'user', entityLabel: '用户', entityTarget: { type: 'user', id: '10002' } },
      { id: 'group:30001', avatarKind: 'group', entityLabel: '群组', entityTarget: { type: 'group', id: '30001' } },
    ])
  })

  it('群角色取当前操作者在群里的角色，私聊没有角色', () => {
    const asOwner = buildTree(scene())
    const asAdmin = buildTree(scene({
      participants: [
        { kind: 'user', id: '10001', name: '测试用户1' },
        { kind: 'user', id: '10002', name: '测试用户2' },
      ],
      groups: [{
        id: '30001',
        name: '测试群',
        announcements: [],
        members: [
          { participantId: '10001', role: 'owner' },
          { participantId: '10002', role: 'admin' },
        ],
      }],
      conversations: [{ id: 'group:30001', type: 'group', groupId: '30001', messageIds: [] }],
      friendships: [],
    }), '10002')

    expect(asOwner.map(({ id, actorRole }) => ({ id, actorRole }))).toEqual([
      { id: 'private:10001:20001', actorRole: undefined },
      { id: 'group:30001', actorRole: 'owner' },
    ])
    expect(asAdmin.map(({ actorRole }) => actorRole)).toEqual(['admin'])
  })

  it('群号只在群聊行上给出，私聊行没有群号', () => {
    expect(buildTree(scene()).map(({ id, groupId }) => ({ id, groupId }))).toEqual([
      { id: 'private:10001:20001', groupId: undefined },
      { id: 'group:30001', groupId: '30001' },
    ])
  })

  it('头像经注入的解析函数处理，省略时保留原始引用', () => {
    const withAvatars = scene({
      participants: [
        { kind: 'user', id: '10001', name: '测试用户1' },
        { kind: 'bot', id: '20001', name: 'Koishi', implementation: 'napcat', enabled: true, avatar: 'sandbox-media://bot' },
      ],
      groups: [{
        id: '30001',
        name: '测试群',
        avatar: 'sandbox-media://group',
        announcements: [],
        members: [{ participantId: '10001', role: 'owner' }],
      }],
    })

    expect(buildTree(withAvatars, '10001', (avatar) => `resolved:${avatar}`).map(({ avatar }) => avatar))
      .toEqual(['resolved:sandbox-media://bot', 'resolved:sandbox-media://group'])
    expect(buildTree(withAvatars).map(({ avatar }) => avatar))
      .toEqual(['sandbox-media://bot', 'sandbox-media://group'])
  })

  it('没有当前操作者时会话树为空', () => {
    expect(buildConversationTree({ scene: scene(), conversations: [] })).toEqual([])
  })
})

describe('转发目标的「最近」一列', () => {
  it('逐项取自会话树的根会话行，副标题就是会话树的预览', () => {
    const tree = buildTree(scene({
      conversations: [
        { id: 'private:10001:20001', type: 'direct', participantIds: ['10001', '20001'], messageIds: ['message-1'] },
        { id: 'group:30001', type: 'group', groupId: '30001', messageIds: [] },
      ],
      messages: [
        { id: 'message-1', authorId: '10001', conversationId: 'private:10001:20001', content: '根会话消息', createdAt: '2026-08-29T02:00:00.000Z' },
      ],
    }), '10001', (avatar) => `resolved:${avatar}`)

    expect(toRecentForwardTargets(tree)).toEqual([
      { conversationId: 'private:10001:20001', title: 'Koishi', subtitle: '根会话消息', avatar: 'resolved:undefined', avatarKind: 'bot' },
      { conversationId: 'group:30001', title: '测试群', subtitle: '开始一段新对话', avatar: 'resolved:undefined', avatarKind: 'group' },
    ])
  })

  it('会话实例不进转发目标，只有根会话行可作为转发目标', () => {
    const tree = buildTree(scene({
      conversationInstances: [
        { id: 'instance-1', rootConversationId: 'private:10001:20001', title: '换一种问法', messageIds: [] },
      ],
    }))

    expect(toRecentForwardTargets(tree).map(({ conversationId }) => conversationId))
      .toEqual(['private:10001:20001', 'group:30001'])
  })
})

describe('会话树投影只有一份实现', () => {
  it('工作台外壳的转发目标「最近」一列与它给侧栏的会话树是同一份投影', async () => {
    const source = scene({
      conversations: [
        { id: 'private:10001:20001', type: 'direct', participantIds: ['10001', '20001'], messageIds: ['message-1'] },
        { id: 'group:30001', type: 'group', groupId: '30001', messageIds: [] },
      ],
      conversationInstances: [
        { id: 'instance-1', rootConversationId: 'private:10001:20001', title: '换一种问法', messageIds: [] },
      ],
      messages: [
        { id: 'message-1', authorId: '10001', conversationId: 'private:10001:20001', content: '根会话消息', createdAt: '2026-08-29T02:00:00.000Z' },
      ],
    })
    const shell = await createShell(source)

    // 从外壳的 interface 上观察复用：预览口径变了，这一列必然跟着变，不会各自漂移。
    expect(shell.chatPaneModel.value.forwardTargets.recent)
      .toEqual(toRecentForwardTargets(shell.sidebarModel.value.conversations))
    // 会话实例不进转发目标，因此这一列只有根会话那两行。
    expect(shell.chatPaneModel.value.forwardTargets.recent.map(({ conversationId }) => conversationId))
      .toEqual(['private:10001:20001', 'group:30001'])
  })

  // 否定式的「已删除实现」守卫（ADR-0073）：投影或它的任一口径搬回工作台外壳时这里变红。
  it('工作台外壳里不再有会话树投影的实现', () => {
    const shell = readFileSync(resolve('client/webqq/workspace-shell.ts'), 'utf8')

    expect(shell).not.toContain('toSidebarConversation')
    expect(shell).not.toContain('开始一段新对话')
    expect(shell).not.toContain("Intl.DateTimeFormat('zh-CN'")
  })
})
