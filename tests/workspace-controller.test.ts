import { describe, expect, it, vi } from 'vitest'
import type { SandboxSnapshot, SandboxWorkspaceState } from '../src/types'
import { createFakeWorkspacePort } from '../client/webqq/fake-workspace-port'
import { createWorkspaceController } from '../client/webqq/workspace-controller'

const snapshot: SandboxSnapshot = {
  revision: 7,
  participants: [
    { kind: 'user', id: '10001', name: '测试用户1' },
    { kind: 'user', id: '10002', name: '测试用户2' },
    { kind: 'bot', id: '20001', name: 'Koishi', implementation: 'napcat', enabled: true },
  ],
  groups: [{
    id: '30001',
    name: '测试群',
    announcements: [],
    members: [
      { participantId: '10001', role: 'owner' },
      { participantId: '10002', role: 'member' },
      { participantId: '20001', role: 'admin' },
    ],
  }],
  conversations: [
    { id: 'private:10001:20001', type: 'direct', participantIds: ['10001', '20001'], messageIds: ['message-1'] },
    { id: 'private:10001:10002', type: 'direct', participantIds: ['10001', '10002'], messageIds: [] },
    { id: 'group:30001', type: 'group', groupId: '30001', messageIds: [] },
    { id: 'private:10002:20001', type: 'direct', participantIds: ['10002', '20001'], messageIds: [] },
  ],
  messages: [{
    id: 'message-1',
    authorId: '10001',
    conversationId: 'private:10001:20001',
    content: '基准消息',
    createdAt: '2026-07-23T00:00:00.000Z',
  }],
  forwards: [],
  friendships: [],
  requests: [{
    id: 'friend-request-1',
    type: 'friend',
    requesterId: '10002',
    targetId: '10001',
    status: 'pending',
    createdAt: '2026-07-23T00:00:00.000Z',
  }, {
    id: 'group-request-1',
    type: 'group',
    requesterId: '10002',
    groupId: '30001',
    status: 'pending',
    createdAt: '2026-07-23T00:00:00.000Z',
  }],
}

const workspace: SandboxWorkspaceState = {
  snapshot,
  persistence: { mode: 'memory', available: true, persisted: false },
  chatLunaStates: [{
    botParticipantId: '20001',
    conversationId: 'private:10001:20001',
    thinking: true,
    usage: { inputTokens: 12, outputTokens: 5, totalTokens: 17 },
    updatedAt: '2026-07-23T00:00:01.000Z',
  }, {
    botParticipantId: '20001',
    conversationId: 'group:30001',
    thinking: false,
    usage: { inputTokens: 20, outputTokens: 8, totalTokens: 28 },
    updatedAt: '2026-07-23T00:00:02.000Z',
  }],
  appearance: {
    enableWebQQFrostedGlass: true,
    webQQTimBubbleTail: true,
    webQQColorMode: 'auto',
    webQQAccentColor: '#2563eb',
    webQQMarkRecalledMessages: true,
  },
}

function createStorage(value?: string) {
  const values = new Map<string, string>()
  if (value) values.set('chatluna-sandbox.workspace', value)
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, nextValue: string) => values.set(key, nextValue),
    read: (key: string) => values.get(key),
  }
}

describe('WebQQ 工作区控制模块', () => {
  it('加载保存的选择并让四个区域模型观察同一修订', async () => {
    const port = createFakeWorkspacePort(workspace)
    const storage = createStorage(JSON.stringify({
      currentOperatorId: '10001',
      activeConversationId: 'private:10001:20001',
      currentView: 'messages',
    }))
    const controller = createWorkspaceController(port, storage)

    await controller.load()

    expect(port.calls).toEqual([{
      operation: 'getWorkspace',
      input: { operatorId: '10001' },
    }])
    expect(controller.currentOperatorId.value).toBe('10001')
    expect(controller.activeConversationId.value).toBe('private:10001:20001')
    expect(controller.sidebar.value).toMatchObject({ revision: 7, currentView: 'messages' })
    expect(controller.chat.value).toMatchObject({ revision: 7, messages: [{ id: 'message-1' }] })
    expect(controller.chat.value.chatLunaStates).toEqual([
      expect.objectContaining({ botParticipantId: '20001', conversationId: 'private:10001:20001' }),
    ])
    expect(controller.composer.value).toMatchObject({ revision: 7, currentOperator: { id: '10001' } })
    expect(controller.details.value).toMatchObject({ revision: 7, bot: { id: '20001' } })
  })

  it('切换会话时同步聊天区域并保存浏览器选择', async () => {
    const port = createFakeWorkspacePort(workspace)
    const storage = createStorage()
    const controller = createWorkspaceController(port, storage)
    await controller.load()

    controller.selectConversation('group:30001')

    expect(controller.activeConversationId.value).toBe('group:30001')
    expect(controller.chat.value).toMatchObject({
      revision: 7,
      conversation: { id: 'group:30001' },
      messages: [],
      forwards: [],
    })
    expect(JSON.parse(storage.read('chatluna-sandbox.workspace') ?? '{}')).toEqual({
      currentOperatorId: '10001',
      activeConversationId: 'group:30001',
      currentView: 'messages',
    })
  })

  it('快速切换会话时只显示当前逻辑会话的 ChatLuna 状态', async () => {
    const controller = createWorkspaceController(createFakeWorkspacePort(workspace), createStorage())
    await controller.load()

    controller.selectConversation('group:30001')
    expect(controller.chat.value.chatLunaStates).toEqual([
      expect.objectContaining({
        conversationId: 'group:30001',
        usage: { inputTokens: 20, outputTokens: 8, totalTokens: 28 },
      }),
    ])

    controller.selectConversation('private:10001:20001')
    expect(controller.chat.value.chatLunaStates).toEqual([
      expect.objectContaining({
        conversationId: 'private:10001:20001',
        usage: { inputTokens: 12, outputTokens: 5, totalTokens: 17 },
      }),
    ])

    controller.selectConversation('private:10001:10002')
    expect(controller.chat.value.chatLunaStates).toEqual([])
  })

  it('进入普通用户私聊时发送控件仍保留机器人参与者', async () => {
    const controller = createWorkspaceController(createFakeWorkspacePort(workspace), createStorage())
    await controller.load()

    controller.selectConversation('private:10001:10002')

    expect(controller.composer.value.participants.map(({ id }) => id)).toEqual(['10001', '10002', '20001'])
  })

  it('切换当前操作者时加载对应参与者的可见会话', async () => {
    const port = createFakeWorkspacePort(workspace)
    const controller = createWorkspaceController(port, createStorage())
    await controller.load()

    await controller.selectOperator('10002')

    expect(port.calls.at(-1)).toEqual({
      operation: 'getWorkspace',
      input: { operatorId: '10002' },
    })
    expect(controller.currentOperatorId.value).toBe('10002')
    expect(controller.activeConversationId.value).toBe('private:10001:10002')

    await controller.selectOperator('20001')

    expect(port.calls.at(-1)).toEqual({
      operation: 'getWorkspace',
      input: { operatorId: '20001' },
    })
    expect(controller.currentOperatorId.value).toBe('20001')
    expect(controller.composer.value.currentOperator).toMatchObject({ id: '20001', type: 'bot' })
    expect(controller.chat.value.chatLunaStates).toEqual([
      expect.objectContaining({ botParticipantId: '20001', conversationId: 'private:10001:20001' }),
    ])
    expect(controller.sidebar.value.conversations
      .flatMap((conversation) => conversation.type === 'direct'
        ? conversation.participantIds.find((id) => id !== '20001') ?? []
        : [])).toEqual(['10001', '10002'])
    for (const conversationId of ['private:10001:20001', 'private:10002:20001']) {
      controller.selectConversation(conversationId)
      expect(controller.chat.value.conversation?.id).toBe(conversationId)
    }
    controller.selectConversation('group:30001')
    expect(controller.chat.value.chatLunaStates).toEqual([
      expect.objectContaining({ botParticipantId: '20001', conversationId: 'group:30001' }),
    ])
  })

  it('机器人作为当前操作者时所有工作区命令都使用机器人参与者 ID', async () => {
    const port = createFakeWorkspacePort(workspace)
    const controller = createWorkspaceController(port, createStorage())
    await controller.load()
    await controller.selectOperator('20001')

    await controller.sendMessage({ conversationId: 'private:10001:20001', content: '机器人消息' })
    await controller.sendMediaMessage({ conversationId: 'private:10001:20001', media: [{ fileName: 'bot.txt', mimeType: 'text/plain', dataBase64: '' }] })
    await controller.sendForwardMessage({ conversationId: 'private:10001:20001', messageIds: ['message-1'] })
    await controller.getForwardMessage({ forwardId: 'forward-1' })
    await controller.getMediaContent('media-1')
    await controller.loadMessageHistory({ conversationId: 'private:10001:20001', limit: 10 })
    await controller.setGroupAnnouncement({ groupId: '30001', content: '机器人公告' })
    await controller.deleteGroupAnnouncement({ groupId: '30001', announcementId: 'announcement-1' })
    await controller.manageEnvironment({ action: 'create-user', data: { id: '10099', name: '新用户' } })
    await controller.handleRelationshipRequest('friend-request-1', true)

    expect(port.calls.slice(-10).map(({ input }) => Reflect.get(input as object, 'operatorId')).filter(Boolean)).toEqual(Array(9).fill('20001'))
  })

  it('端口拒绝操作者切换时保留全部区域模型并返回规范化错误', async () => {
    const port = createFakeWorkspacePort(workspace)
    const controller = createWorkspaceController(port, createStorage())
    await controller.load()
    const regionsBeforeFailure = [
      controller.sidebar.value,
      controller.chat.value,
      controller.composer.value,
      controller.details.value,
    ]
    port.rejectNext('getWorkspace', new Error('RPC 暂不可用'))

    await expect(controller.selectOperator('10002')).rejects.toMatchObject({
      name: 'WorkspaceControllerError',
      message: 'RPC 暂不可用',
    })

    expect(controller.currentOperatorId.value).toBe('10001')
    expect([
      controller.sidebar.value,
      controller.chat.value,
      controller.composer.value,
      controller.details.value,
    ]).toEqual(regionsBeforeFailure)
  })

  it('无效浏览器选择回退到首个用户及其首个会话', async () => {
    const storage = createStorage(JSON.stringify({
      currentOperatorId: 'deleted-user',
      activeConversationId: 'deleted-conversation',
      currentView: 'contacts',
    }))
    const controller = createWorkspaceController(createFakeWorkspacePort(workspace), storage)

    await controller.load()

    expect(controller.currentOperatorId.value).toBe('10001')
    expect(controller.activeConversationId.value).toBe('private:10001:20001')
    expect(controller.currentView.value).toBe('contacts')
    expect(JSON.parse(storage.read('chatluna-sandbox.workspace') ?? '{}')).toEqual({
      currentOperatorId: '10001',
      activeConversationId: 'private:10001:20001',
      currentView: 'contacts',
    })
  })

  it('保存的参与者加载失败时保留无参数工作区 fallback', async () => {
    const port = createFakeWorkspacePort(workspace)
    port.rejectNext('getWorkspace', new Error('参与者不存在'))
    const controller = createWorkspaceController(port, createStorage(JSON.stringify({
      currentOperatorId: '10001',
      currentView: 'messages',
    })))

    await controller.load()

    expect(port.calls).toEqual([
      { operation: 'getWorkspace', input: { operatorId: '10001' } },
      { operation: 'getWorkspace', input: undefined },
    ])
    expect(controller.sidebar.value.revision).toBe(7)
  })

  it('收到机器人异步回复修订后主动刷新当前会话', async () => {
    const port = createFakeWorkspacePort(workspace)
    const controller = createWorkspaceController(port, createStorage(JSON.stringify({
      currentOperatorId: '10001',
      activeConversationId: 'private:10001:20001',
      currentView: 'messages',
    })))
    await controller.load()
    port.calls.length = 0
    port.workspaceResult = {
      ...workspace,
      snapshot: {
        ...workspace.snapshot,
        revision: 8,
        messages: [...workspace.snapshot.messages, {
          id: 'message-bot-reply',
          authorId: '20001',
          conversationId: 'private:10001:20001',
          content: '异步机器人回复',
          createdAt: '2026-07-23T00:00:02.000Z',
        }],
        conversations: workspace.snapshot.conversations.map((conversation) => conversation.id === 'private:10001:20001'
          ? { ...conversation, messageIds: [...conversation.messageIds, 'message-bot-reply'] }
          : conversation),
      },
    }

    controller.notifySceneRevision(8)

    await vi.waitFor(() => {
      expect(controller.chat.value.messages.map(({ content }) => content)).toEqual(['基准消息', '异步机器人回复'])
    })
    expect(port.calls).toEqual([{
      operation: 'getWorkspace',
      input: { operatorId: '10001' },
    }])
    expect([
      controller.sidebar.value.revision,
      controller.chat.value.revision,
      controller.composer.value.revision,
      controller.details.value.revision,
    ]).toEqual([8, 8, 8, 8])
  })

  it('等待态广播不改变场景修订时仍刷新聊天区域', async () => {
    const port = createFakeWorkspacePort(workspace)
    const controller = createWorkspaceController(port, createStorage(JSON.stringify({
      currentOperatorId: '10001',
      activeConversationId: 'private:10001:20001',
      currentView: 'messages',
    })))
    await controller.load()
    port.calls.length = 0
    port.workspaceResult = {
      ...workspace,
      chatLunaStates: [{
        botParticipantId: '20001',
        conversationId: 'private:10001:20001',
        thinking: true,
        updatedAt: '2026-07-23T00:00:03.000Z',
      }],
    }

    controller.notifySceneRevision(workspace.snapshot.revision)

    await vi.waitFor(() => {
      expect(controller.chat.value.chatLunaStates).toEqual([
        expect.objectContaining({ conversationId: 'private:10001:20001', thinking: true }),
      ])
    })
    expect(port.calls).toEqual([{
      operation: 'getWorkspace',
      input: { operatorId: '10001' },
    }])
  })

  it('刷新期间到达的等待态广播合并成一次后续刷新', async () => {
    const port = createFakeWorkspacePort(workspace)
    const controller = createWorkspaceController(port, createStorage(JSON.stringify({
      currentOperatorId: '10001',
      activeConversationId: 'private:10001:20001',
      currentView: 'messages',
    })))
    await controller.load()
    port.calls.length = 0

    // 拉取挂起期间到达的多次广播必须合并成一次后续拉取，而不是每条广播一次请求。
    let releaseFirst = () => {}
    const firstPending = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const getWorkspace = port.getWorkspace.bind(port)
    let calls = 0
    port.getWorkspace = async (input?: Parameters<typeof getWorkspace>[0]) => {
      calls += 1
      if (calls === 1) await firstPending
      return getWorkspace(input)
    }

    controller.notifySceneRevision(workspace.snapshot.revision)
    await vi.waitFor(() => {
      expect(calls).toBe(1)
    })
    controller.notifySceneRevision(workspace.snapshot.revision)
    controller.notifySceneRevision(workspace.snapshot.revision)
    releaseFirst()

    await vi.waitFor(() => {
      expect(calls).toBe(2)
    })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(calls).toBe(2)
  })

  it('替换工作区时四个区域模型原子观察同一修订', async () => {
    const controller = createWorkspaceController(createFakeWorkspacePort(workspace), createStorage())
    await controller.load()
    const nextWorkspace: SandboxWorkspaceState = {
      ...workspace,
      snapshot: {
        ...workspace.snapshot,
        revision: 8,
        messages: [...workspace.snapshot.messages, {
          id: 'message-2',
          authorId: '20001',
          conversationId: 'private:10001:20001',
          content: '同步回复',
          createdAt: '2026-07-23T00:00:01.000Z',
        }],
        conversations: workspace.snapshot.conversations.map((conversation) => conversation.id === 'private:10001:20001'
          ? { ...conversation, messageIds: [...conversation.messageIds, 'message-2'] }
          : conversation),
      },
    }

    controller.replaceWorkspace(nextWorkspace)

    expect([
      controller.sidebar.value.revision,
      controller.chat.value.revision,
      controller.composer.value.revision,
      controller.details.value.revision,
    ]).toEqual([8, 8, 8, 8])
    expect(controller.chat.value.messages.map(({ id }) => id)).toEqual(['message-1', 'message-2'])
  })

  it('好友命令失败时保留区域模型并返回规范化错误', async () => {
    const port = createFakeWorkspacePort(workspace)
    const controller = createWorkspaceController(port, createStorage())
    await controller.load()
    const regionsBeforeFailure = [
      controller.sidebar.value,
      controller.chat.value,
      controller.composer.value,
      controller.details.value,
    ]
    port.rejectNext('performFriendAction', new Error('好友操作被拒绝'))

    await expect(controller.performFriendAction({
      action: 'request',
      targetId: '10002',
    })).rejects.toMatchObject({
      name: 'WorkspaceControllerError',
      message: '好友操作被拒绝',
    })

    expect(port.calls.at(-1)).toEqual({
      operation: 'performFriendAction',
      input: {
        action: 'request',
        operatorId: '10001',
        targetId: '10002',
      },
    })
    expect([
      controller.sidebar.value,
      controller.chat.value,
      controller.composer.value,
      controller.details.value,
    ]).toEqual(regionsBeforeFailure)
  })

  it('群组命令失败时保留区域模型并返回规范化错误', async () => {
    const port = createFakeWorkspacePort(workspace)
    const controller = createWorkspaceController(port, createStorage())
    await controller.load()
    const regionsBeforeFailure = [
      controller.sidebar.value,
      controller.chat.value,
      controller.composer.value,
      controller.details.value,
    ]
    port.rejectNext('performGroupAction', new Error('群组操作被拒绝'))

    await expect(controller.performGroupAction({
      action: 'set-name',
      groupId: '30001',
      name: '新群名称',
    })).rejects.toMatchObject({
      name: 'WorkspaceControllerError',
      message: '群组操作被拒绝',
    })

    expect(port.calls.at(-1)).toEqual({
      operation: 'performGroupAction',
      input: {
        action: 'set-name',
        operatorId: '10001',
        groupId: '30001',
        name: '新群名称',
      },
    })
    expect([
      controller.sidebar.value,
      controller.chat.value,
      controller.composer.value,
      controller.details.value,
    ]).toEqual(regionsBeforeFailure)
  })

  it('处理关系申请时按申请类型调用对应端口', async () => {
    const port = createFakeWorkspacePort(workspace)
    const controller = createWorkspaceController(port, createStorage())
    await controller.load()

    await controller.handleRelationshipRequest('friend-request-1', true)
    await controller.handleRelationshipRequest('group-request-1', false)

    expect(port.calls.slice(-2)).toEqual([{
      operation: 'performFriendAction',
      input: {
        action: 'handle-request',
        operatorId: '10001',
        requestId: 'friend-request-1',
        approve: true,
      },
    }, {
      operation: 'performGroupAction',
      input: {
        action: 'handle-request',
        operatorId: '10001',
        requestId: 'group-request-1',
        approve: false,
      },
    }])
  })

  it('好友与群组命令成功后原子同步四个区域模型', async () => {
    const port = createFakeWorkspacePort(workspace)
    const controller = createWorkspaceController(port, createStorage())
    await controller.load()
    port.workspaceResult = {
      ...workspace,
      snapshot: {
        ...workspace.snapshot,
        revision: 8,
        friendships: [{
          id: 'friendship-1',
          participantIds: ['10001', '10002'],
          remarks: {},
          createdAt: '2026-07-23T00:00:01.000Z',
        }],
      },
    }

    await controller.performFriendAction({ action: 'request', targetId: '10002' })

    expect([
      controller.sidebar.value.revision,
      controller.chat.value.revision,
      controller.composer.value.revision,
      controller.details.value.revision,
    ]).toEqual([8, 8, 8, 8])

    controller.selectConversation('group:30001')
    port.workspaceResult = {
      ...port.workspaceResult,
      snapshot: {
        ...port.workspaceResult.snapshot,
        revision: 9,
        groups: port.workspaceResult.snapshot.groups.map((group) => group.id === '30001'
          ? { ...group, name: '新群名称' }
          : group),
      },
    }

    await controller.performGroupAction({ action: 'set-name', groupId: '30001', name: '新群名称' })

    expect([
      controller.sidebar.value.revision,
      controller.chat.value.revision,
      controller.composer.value.revision,
      controller.details.value.revision,
    ]).toEqual([9, 9, 9, 9])
    expect(controller.details.value.group?.name).toBe('新群名称')
  })

  it('发送文本消息时注入当前用户并同步四个区域模型', async () => {
    const port = createFakeWorkspacePort(workspace)
    const controller = createWorkspaceController(port, createStorage())
    await controller.load()
    port.workspaceResult = {
      ...workspace,
      snapshot: {
        ...workspace.snapshot,
        revision: 8,
      },
    }

    await controller.sendMessage({
      conversationId: 'private:10001:20001',
      content: '控制模块发送',
    })

    expect(port.calls.at(-1)).toEqual({
      operation: 'sendMessage',
      input: {
        operatorId: '10001',
        conversationId: 'private:10001:20001',
        content: '控制模块发送',
      },
    })
    expect([
      controller.sidebar.value.revision,
      controller.chat.value.revision,
      controller.composer.value.revision,
      controller.details.value.revision,
    ]).toEqual([8, 8, 8, 8])
  })

  it('媒体消息失败时保留工作区并返回规范化错误', async () => {
    const port = createFakeWorkspacePort(workspace)
    const controller = createWorkspaceController(port, createStorage())
    await controller.load()
    const revisionBeforeFailure = controller.chat.value.revision
    port.rejectNext('sendMediaMessage', new Error('媒体发送被拒绝'))

    await expect(controller.sendMediaMessage({
      conversationId: 'private:10001:20001',
      media: [{ fileName: 'fixture.png', mimeType: 'image/png', dataBase64: 'ZmFrZQ==' }],
    })).rejects.toMatchObject({
      name: 'WorkspaceControllerError',
      message: '媒体发送被拒绝',
    })

    expect(port.calls.at(-1)).toEqual({
      operation: 'sendMediaMessage',
      input: {
        operatorId: '10001',
        conversationId: 'private:10001:20001',
        media: [{ fileName: 'fixture.png', mimeType: 'image/png', dataBase64: 'ZmFrZQ==' }],
      },
    })
    expect(controller.chat.value.revision).toBe(revisionBeforeFailure)
  })

  it('媒体内容通过端口加载并注入当前用户', async () => {
    const port = createFakeWorkspacePort(workspace)
    const controller = createWorkspaceController(port, createStorage())
    await controller.load()

    const content = await controller.getMediaContent('media-1')

    expect(port.calls.at(-1)).toEqual({
      operation: 'getMediaContent',
      input: {
        operatorId: '10001',
        mediaId: 'media-1',
      },
    })
    expect(content).toEqual(port.mediaContentResult)
  })

  it('加载历史消息时保持旧消息前置和分页状态', async () => {
    const port = createFakeWorkspacePort(workspace)
    const controller = createWorkspaceController(port, createStorage())
    await controller.load()
    port.historyResult = {
      messages: [{
        id: 'message-0',
        authorId: '20001',
        conversationId: 'private:10001:20001',
        content: '更早的消息',
        createdAt: '2026-07-22T23:59:59.000Z',
        forwardId: 'forward-history-1',
      }],
      forwards: [{
        id: 'forward-history-1',
        authorId: '20001',
        createdAt: '2026-07-22T23:59:59.000Z',
        nodes: [{
          userId: '20001',
          nickname: 'Koishi',
          content: '更早的消息',
          createdAt: '2026-07-22T23:59:59.000Z',
          sourceMessageId: 'message-0',
        }],
      }],
      nextBeforeMessageId: 'message-before-0',
    }

    await controller.loadMessageHistory({
      conversationId: 'private:10001:20001',
      beforeMessageId: 'message-1',
      limit: 50,
    })

    expect(port.calls.at(-1)).toEqual({
      operation: 'getMessageHistory',
      input: {
        operatorId: '10001',
        conversationId: 'private:10001:20001',
        beforeMessageId: 'message-1',
        limit: 50,
      },
    })
    expect(controller.chat.value.messages.map(({ id }) => id)).toEqual(['message-0', 'message-1'])
    expect(controller.chat.value.conversation?.messageIds).toEqual(['message-0', 'message-1'])
    expect(controller.chat.value.conversation?.hasMoreMessages).toBe(true)
    expect(controller.chat.value.forwards).toEqual([
      expect.objectContaining({ id: 'forward-history-1' }),
    ])
  })

  it('搜索会话消息时注入当前操作者并直接返回命中摘要', async () => {
    const port = createFakeWorkspacePort(workspace)
    const controller = createWorkspaceController(port, createStorage())
    await controller.load()
    port.searchResult = {
      hits: [{
        messageId: 'message-1',
        authorId: '20001',
        createdAt: '2026-07-23T00:00:00.000Z',
        summary: '基准消息',
      }],
      nextBeforeMessageId: 'message-0',
    }

    const result = await controller.searchConversationMessages({
      conversationId: 'private:10001:20001',
      query: '基准',
      createdAtStart: '2026-07-23T00:00:00.000Z',
      createdAtEnd: '2026-07-24T00:00:00.000Z',
      limit: 20,
      beforeMessageId: 'message-2',
    })

    expect(port.calls.at(-1)).toEqual({
      operation: 'searchConversationMessages',
      input: {
        operatorId: '10001',
        conversationId: 'private:10001:20001',
        query: '基准',
        createdAtStart: '2026-07-23T00:00:00.000Z',
        createdAtEnd: '2026-07-24T00:00:00.000Z',
        limit: 20,
        beforeMessageId: 'message-2',
      },
    })
    expect(result).toEqual(port.searchResult)
    expect(controller.chat.value.messages.map(({ id }) => id)).toEqual(['message-1'])
  })

  it('发送合并转发与按需读取详情都注入当前操作者', async () => {
    const port = createFakeWorkspacePort(workspace)
    const controller = createWorkspaceController(port, createStorage())
    await controller.load()
    port.workspaceResult = {
      ...workspace,
      snapshot: {
        ...workspace.snapshot,
        revision: 8,
        messages: [...workspace.snapshot.messages, {
          id: 'message-forward',
          authorId: '10001',
          conversationId: 'private:10001:20001',
          content: '测试用户1：基准消息',
          createdAt: '2026-07-23T00:00:03.000Z',
          forwardId: 'forward-1',
        }],
        conversations: workspace.snapshot.conversations.map((conversation) => conversation.id === 'private:10001:20001'
          ? { ...conversation, messageIds: [...conversation.messageIds, 'message-forward'] }
          : conversation),
        forwards: [{
          id: 'forward-1',
          authorId: '10001',
          createdAt: '2026-07-23T00:00:03.000Z',
          nodes: [{
            userId: '10001',
            nickname: '测试用户1',
            content: '基准消息',
            createdAt: '2026-07-23T00:00:00.000Z',
            sourceMessageId: 'message-1',
          }],
        }],
      },
    }

    await controller.sendForwardMessage({
      conversationId: 'private:10001:20001',
      messageIds: ['message-1'],
    })
    expect(port.calls.at(-1)).toEqual({
      operation: 'sendForwardMessage',
      input: {
        operatorId: '10001',
        conversationId: 'private:10001:20001',
        messageIds: ['message-1'],
      },
    })
    expect(controller.chat.value.forwards).toEqual([
      expect.objectContaining({ id: 'forward-1' }),
    ])

    port.forwardResult = {
      id: 'forward-nested',
      authorId: '10001',
      createdAt: '2026-07-23T00:00:04.000Z',
      nodes: [{
        userId: '10001',
        nickname: '测试用户1',
        content: '嵌套',
        createdAt: '2026-07-23T00:00:04.000Z',
        forwardId: 'forward-1',
      }],
    }
    const nested = await controller.getForwardMessage({ forwardId: 'forward-nested' })
    expect(port.calls.at(-1)).toEqual({
      operation: 'getForwardMessage',
      input: {
        operatorId: '10001',
        forwardId: 'forward-nested',
      },
    })
    expect(nested.id).toBe('forward-nested')
    expect(controller.workspace.value.snapshot.forwards).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'forward-1' }),
      expect.objectContaining({ id: 'forward-nested' }),
    ]))
  })

  it('群公告新增和删除通过端口更新工作区', async () => {
    const port = createFakeWorkspacePort(workspace)
    const controller = createWorkspaceController(port, createStorage())
    await controller.load()
    port.workspaceResult = {
      ...workspace,
      snapshot: {
        ...workspace.snapshot,
        revision: 8,
      },
    }

    await controller.setGroupAnnouncement({ groupId: '30001', content: '控制模块公告' })

    expect(port.calls.at(-1)).toEqual({
      operation: 'setGroupAnnouncement',
      input: {
        operatorId: '10001',
        groupId: '30001',
        content: '控制模块公告',
      },
    })
    expect(controller.details.value.revision).toBe(8)

    port.workspaceResult = {
      ...port.workspaceResult,
      snapshot: {
        ...port.workspaceResult.snapshot,
        revision: 9,
      },
    }
    await controller.deleteGroupAnnouncement({ groupId: '30001', announcementId: 'announcement-1' })

    expect(port.calls.at(-1)).toEqual({
      operation: 'deleteGroupAnnouncement',
      input: {
        operatorId: '10001',
        groupId: '30001',
        announcementId: 'announcement-1',
      },
    })
    expect(controller.details.value.revision).toBe(9)
  })

  it('环境管理删除当前用户后应用现有选择 fallback', async () => {
    const port = createFakeWorkspacePort(workspace)
    const controller = createWorkspaceController(port, createStorage())
    await controller.load()
    port.workspaceResult = {
      ...workspace,
      snapshot: {
        ...workspace.snapshot,
        revision: 8,
        participants: workspace.snapshot.participants.filter(({ id }) => id !== '10001'),
        conversations: workspace.snapshot.conversations.filter((conversation) => conversation.type !== 'direct'
          || !conversation.participantIds.includes('10001')),
      },
    }

    await controller.manageEnvironment({ action: 'delete-user', data: { id: '10001' } })

    expect(port.calls.at(-1)).toEqual({
      operation: 'manageEnvironment',
      input: { action: 'delete-user', data: { id: '10001' } },
    })
    expect(controller.currentOperatorId.value).toBe('10002')
    expect(controller.currentOperatorId.value).toBe('10002')
    expect(controller.activeConversationId.value).toBe('group:30001')
    expect([
      controller.sidebar.value.revision,
      controller.chat.value.revision,
      controller.composer.value.revision,
      controller.details.value.revision,
    ]).toEqual([8, 8, 8, 8])
  })

  it('空环境可以创建首个用户并自动选择为当前操作者', async () => {
    const emptyWorkspace: SandboxWorkspaceState = {
      ...workspace,
      snapshot: {
        ...workspace.snapshot,
        revision: 0,
        participants: [],
        groups: [],
        conversations: [],
        messages: [],
        forwards: [],
        friendships: [],
        requests: [],
      },
      chatLunaStates: [],
    }
    const port = createFakeWorkspacePort(emptyWorkspace)
    const controller = createWorkspaceController(port, createStorage())
    await controller.load()
    port.workspaceResult = {
      ...emptyWorkspace,
      snapshot: {
        ...emptyWorkspace.snapshot,
        revision: 1,
        participants: [{ kind: 'user', id: '10099', name: '新用户' }],
      },
    }

    await controller.manageEnvironment({ action: 'create-user', data: { id: '10099', name: '新用户' } })

    expect(port.calls.at(-1)).toEqual({
      operation: 'manageEnvironment',
      input: { action: 'create-user', data: { id: '10099', name: '新用户' } },
    })
    expect(controller.currentOperatorId.value).toBe('10099')
  })

  it('环境管理失败时保留 Console RPC 返回的具体原因', async () => {
    const port = createFakeWorkspacePort(workspace)
    const controller = createWorkspaceController(port, createStorage())
    await controller.load()
    port.rejectNext('manageEnvironment', 'Error: 群组必须有一个群主\n    at SandboxControlService.validateGroupMembers')

    await expect(controller.manageEnvironment({
      action: 'update-group',
      data: {
        id: '30001',
        name: '测试群',
        members: snapshot.groups[0]!.members.map((member) => ({ ...member, role: 'member' })),
      },
    })).rejects.toMatchObject({
      name: 'WorkspaceControllerError',
      message: '群组必须有一个群主',
    })

    expect(controller.currentOperatorId.value).toBe('10001')
    expect(controller.activeConversationId.value).toBe('private:10001:20001')
    expect(controller.sidebar.value.revision).toBe(7)
  })

  it('环境管理失败时保留工作区和当前选择', async () => {
    const port = createFakeWorkspacePort(workspace)
    const controller = createWorkspaceController(port, createStorage())
    await controller.load()
    port.rejectNext('manageEnvironment', new Error('环境操作被拒绝'))

    await expect(controller.manageEnvironment({
      action: 'create-user',
      data: { id: '10099', name: '失败用户' },
    })).rejects.toMatchObject({
      name: 'WorkspaceControllerError',
      message: '环境操作被拒绝',
    })

    expect(controller.currentOperatorId.value).toBe('10001')
    expect(controller.activeConversationId.value).toBe('private:10001:20001')
    expect(controller.sidebar.value.revision).toBe(7)
  })
})
