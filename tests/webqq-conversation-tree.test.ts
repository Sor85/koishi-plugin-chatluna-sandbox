import { ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { createFakeWorkspacePort } from '../client/webqq/fake-workspace-port'
import { createWorkspaceController } from '../client/webqq/workspace-controller'
import { createWorkspaceLayout } from '../client/webqq/workspace-layout'
import { createWebqqWorkspaceShell } from '../client/webqq/workspace-shell'
import type { SandboxSnapshot, SandboxWorkspaceState } from '../src/types'

const baseSnapshot: SandboxSnapshot = {
  revision: 3,
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
    { id: 'private:10001:20001', type: 'direct', participantIds: ['10001', '20001'], messageIds: ['message-1'] },
    { id: 'group:30001', type: 'group', groupId: '30001', messageIds: [] },
  ],
  conversationInstances: [],
  messages: [{
    id: 'message-1',
    authorId: '10001',
    conversationId: 'private:10001:20001',
    content: '根会话消息',
    createdAt: '2026-08-29T02:00:00.000Z',
  }],
  forwards: [],
  friendships: [{ id: 'friend:10001:20001', participantIds: ['10001', '20001'], remarks: {}, createdAt: '' }],
  requests: [],
}

function createWorkspace(snapshot: SandboxSnapshot): SandboxWorkspaceState {
  return {
    snapshot,
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

function createStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  }
}

async function createShell(snapshot: SandboxSnapshot) {
  const port = createFakeWorkspacePort(createWorkspace(snapshot))
  const controller = createWorkspaceController(port, createStorage())
  await controller.load()
  // 外壳在 setup 里注册 onMounted 做首屏加载；测试直接调用工厂时该钩子是空操作，
  // Vue 会为此打一条 warn。这里只吞掉这一条预期噪声，其余告警照常输出。
  const warn = console.warn
  console.warn = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].includes('onMounted is called when there is no active component')) return
    warn(...args)
  }
  const renamePrompts: Array<{ conversationId: string, value: string }> = []
  const overlayHost = {
    openEntity() {},
    openGroupAction() {},
    openRemark() {},
    openConversationRename(conversationId: string, value: string) {
      renamePrompts.push({ conversationId, value })
    },
    openProfile() {},
  }
  try {
    const shell = createWebqqWorkspaceShell(
      controller,
      createWorkspaceLayout(ref(true)),
      () => overlayHost,
    )
    return { controller, port, shell, renamePrompts }
  } finally {
    console.warn = warn
  }
}

describe('侧栏会话树投影', () => {
  it('没有会话实例时每个根会话都没有子项', async () => {
    const { shell } = await createShell(baseSnapshot)

    expect(shell.sidebarModel.value.conversations.map(({ id, kind, children }) => ({
      id,
      kind,
      childCount: children?.length ?? 0,
    }))).toEqual([
      { id: 'private:10001:20001', kind: 'root', childCount: 0 },
      { id: 'group:30001', kind: 'root', childCount: 0 },
    ])
  })

  it('会话实例作为所属根会话的子项出现，标题与预览来自实例自己的消息', async () => {
    const { shell } = await createShell({
      ...baseSnapshot,
      conversationInstances: [
        { id: 'instance-1', rootConversationId: 'private:10001:20001', title: '换一种问法', messageIds: ['message-2'] },
        { id: 'instance-2', rootConversationId: 'private:10001:20001', title: '再试一次', messageIds: [] },
      ],
      messages: [
        ...baseSnapshot.messages,
        {
          id: 'message-2',
          authorId: '10001',
          conversationId: 'instance-1',
          content: '实例里的提问',
          createdAt: '2026-08-29T03:00:00.000Z',
        },
      ],
    })

    const [directRoot, groupRoot] = shell.sidebarModel.value.conversations
    expect(directRoot).toMatchObject({ id: 'private:10001:20001', kind: 'root', preview: '根会话消息' })
    expect(directRoot?.children?.map(({ id, kind, title, preview }) => ({ id, kind, title, preview }))).toEqual([
      { id: 'instance-1', kind: 'instance', title: '换一种问法', preview: '实例里的提问' },
      { id: 'instance-2', kind: 'instance', title: '再试一次', preview: '开始一段新对话' },
    ])
    // 实例只挂在自己的根会话下，不污染别的会话。
    expect(groupRoot?.children).toEqual([])
    // 会话树的顶层只有根会话，实例不作为独立联系人出现。
    expect(shell.sidebarModel.value.conversations.map(({ id }) => id))
      .toEqual(['private:10001:20001', 'group:30001'])
  })

  it('会话行与实例子项各自显示自己最后一条消息的时间', async () => {
    const { shell } = await createShell({
      ...baseSnapshot,
      conversationInstances: [
        { id: 'instance-1', rootConversationId: 'private:10001:20001', title: '换一种问法', messageIds: ['message-2'] },
        { id: 'instance-2', rootConversationId: 'private:10001:20001', title: '再试一次', messageIds: [] },
      ],
      messages: [
        ...baseSnapshot.messages,
        {
          id: 'message-2',
          authorId: '10001',
          conversationId: 'instance-1',
          content: '实例里的提问',
          createdAt: '2026-08-29T03:00:00.000Z',
        },
      ],
    })

    const [directRoot, groupRoot] = shell.sidebarModel.value.conversations
    const [withMessages, empty] = directRoot?.children ?? []
    expect(directRoot?.time).toMatch(/^\d{2}:\d{2}$/)
    // 子项的时间来自实例自己的最后一条消息，不是根会话的：两条消息相隔一小时，取错来源就相等。
    expect(withMessages?.time).toMatch(/^\d{2}:\d{2}$/)
    expect(withMessages?.time).not.toBe(directRoot?.time)
    // 空实例与没有消息的根会话都没有时间可显示，界面因此不渲染空的时间元素。
    expect(empty?.time).toBe('')
    expect(groupRoot?.time).toBe('')
  })

  it('选中会话实例时聊天区标题用实例名，副标题指出它属于哪个根会话', async () => {
    const { controller, shell } = await createShell({
      ...baseSnapshot,
      conversationInstances: [
        { id: 'instance-1', rootConversationId: 'private:10001:20001', title: '换一种问法', messageIds: [] },
      ],
    })

    controller.selectConversation('instance-1')

    expect(shell.chatPaneModel.value).toMatchObject({
      conversationId: 'instance-1',
      title: '换一种问法',
      subtitle: 'Koishi · 在线 · 虚拟 OneBot 机器人',
    })

    controller.selectConversation('private:10001:20001')
    expect(shell.chatPaneModel.value).toMatchObject({
      conversationId: 'private:10001:20001',
      title: 'Koishi',
      subtitle: '在线 · 虚拟 OneBot 机器人',
    })
  })

  it('新建会话实例失败时把原因写进界面错误展示路径，不落进浏览器控制台', async () => {
    const { port, shell } = await createShell(baseSnapshot)
    port.rejectNext('createConversationInstance', new Error('会话不存在：private:10002:20001'))

    await shell.createConversationInstance('private:10002:20001')

    expect(shell.chatPaneModel.value.composer.externalError).toBe('会话不存在：private:10002:20001')
  })
})

describe('会话实例的重命名与删除', () => {
  const withInstance: SandboxSnapshot = {
    ...baseSnapshot,
    conversationInstances: [
      { id: 'instance-1', rootConversationId: 'private:10001:20001', title: '新会话', messageIds: [] },
    ],
  }

  it('重命名入口预填实例当前名字，根会话不打开对话框', async () => {
    const { shell, renamePrompts } = await createShell(withInstance)

    shell.openConversationRenameDialog('instance-1')
    expect(renamePrompts).toEqual([{ conversationId: 'instance-1', value: '新会话' }])

    // 根会话的名字由参与者关系决定，它没有可改的会话名。
    shell.openConversationRenameDialog('private:10001:20001')
    expect(renamePrompts).toHaveLength(1)
  })

  it('保存重命名走会话实例端点，失败时通知调用方并写进界面错误', async () => {
    const { port, shell } = await createShell(withInstance)
    let resolved = false

    await shell.saveConversationRename(
      { conversationId: 'instance-1', title: '换一种问法' },
      () => { resolved = true },
      () => {},
    )

    expect(resolved).toBe(true)
    expect(port.calls.at(-1)).toEqual({
      operation: 'renameConversationInstance',
      input: { operatorId: '10001', conversationId: 'instance-1', title: '换一种问法' },
    })

    port.rejectNext('renameConversationInstance', new Error('会话名称不能为空'))
    let rejected: unknown
    await shell.saveConversationRename({ conversationId: 'instance-1', title: '  ' }, () => {}, (error) => { rejected = error })

    expect((rejected as Error).message).toBe('会话名称不能为空')
    expect(shell.chatPaneModel.value.composer.externalError).toBe('会话名称不能为空')
  })

  it('侧栏子项的删除是领域删除，失败时把原因写进界面错误展示路径', async () => {
    const { port, shell } = await createShell(withInstance)

    await shell.deleteConversationInstance('instance-1')

    expect(port.calls.at(-1)).toEqual({
      operation: 'deleteConversationInstance',
      input: { operatorId: '10001', conversationId: 'instance-1' },
    })

    port.rejectNext('deleteConversationInstance', new Error('会话实例不存在：instance-1'))
    await shell.deleteConversationInstance('instance-1')

    expect(shell.chatPaneModel.value.composer.externalError).toBe('会话实例不存在：instance-1')
  })
})

describe('分支里的继承前缀只读', () => {
  // 投影把拼接结果物化进实例行并删掉分叉点，因此客户端拿到的实例行是「继承前缀 + 自有消息」
  // 的完整列表，而不是分叉点。夹具照这个形状写，否则测的是客户端二次展开来源链那条死路。
  const withBranch: SandboxSnapshot = {
    ...baseSnapshot,
    conversationInstances: [{
      id: 'instance-1',
      rootConversationId: 'private:10001:20001',
      title: '换一种问法',
      messageIds: ['message-1', 'message-2'],
    }],
    messages: [
      ...baseSnapshot.messages,
      {
        id: 'message-2',
        authorId: '10001',
        conversationId: 'instance-1',
        content: '分支里的提问',
        createdAt: '2026-08-29T03:00:00.000Z',
      },
    ],
  }

  it('贴表情带上当前会话，服务端因此能判定目标是不是继承前缀', async () => {
    const { controller, port, shell } = await createShell(withBranch)
    controller.selectConversation('instance-1')

    await shell.setMessageReaction('message-2', '76', true)

    // 少了会话这一项，服务端只能按消息归属判定，分支视图的只读约束就无从成立。
    expect(port.calls.at(-1)).toEqual({
      operation: 'setMessageReaction',
      input: { operatorId: '10001', conversationId: 'instance-1', messageId: 'message-2', emojiId: '76', enabled: true },
    })

    port.rejectNext('setMessageReaction', new Error('消息不存在：message-1'))
    await shell.setMessageReaction('message-1', '76', true)

    expect(shell.chatPaneModel.value.composer.externalError).toBe('消息不存在：message-1')
  })

  it('分支里的消息列表把继承前缀与自有消息一起给出，各自带着归属会话', async () => {
    const { controller, shell } = await createShell(withBranch)
    controller.selectConversation('instance-1')

    const { messageList } = shell.chatPaneModel.value
    // 只读判定的依据就是这里的归属会话：与当前会话不同的那一段是继承前缀。
    expect(messageList.messages.map(({ id, conversationId }) => ({ id, conversationId }))).toEqual([
      { id: 'message-1', conversationId: 'private:10001:20001' },
      { id: 'message-2', conversationId: 'instance-1' },
    ])
    expect(messageList.currentConversation?.id).toBe('instance-1')
  })
})
