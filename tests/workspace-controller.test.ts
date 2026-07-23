import { describe, expect, it } from 'vitest'
import type { SandboxSnapshot, SandboxWorkspaceState } from '../src/types'
import { createFakeWorkspacePort } from '../client/webqq/fake-workspace-port'
import { createWorkspaceController } from '../client/webqq/workspace-controller'

const snapshot: SandboxSnapshot = {
  revision: 7,
  users: [
    { id: '10001', name: '测试用户1' },
    { id: '10002', name: '测试用户2' },
  ],
  bots: [{
    id: '20001',
    name: 'Koishi',
    implementation: 'napcat',
    enabled: true,
  }],
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
    { id: 'private:10001:20001', type: 'direct', userId: '10001', botId: '20001', messageIds: ['message-1'] },
    { id: 'group:30001:10001:20001', type: 'group', userId: '10001', botId: '20001', groupId: '30001', messageIds: [] },
    { id: 'private:10002:20001', type: 'direct', userId: '10002', botId: '20001', messageIds: [] },
  ],
  messages: [{
    id: 'message-1',
    authorId: '10001',
    botId: '20001',
    conversationId: 'private:10001:20001',
    content: '基准消息',
    createdAt: '2026-07-23T00:00:00.000Z',
  }],
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
  appearance: {
    enableWebQQFrostedGlass: true,
    webQQChatStyle: 'tim',
    webQQTimBubbleTail: true,
    webQQColorMode: 'auto',
    webQQAccentColor: '#2563eb',
  },
}

function createStorage(value?: string) {
  const values = new Map<string, string>()
  if (value) values.set('onebot-sandbox.workspace', value)
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
      currentUserId: '10001',
      activeConversationId: 'private:10001:20001',
      currentView: 'messages',
    }))
    const controller = createWorkspaceController(port, storage)

    await controller.load()

    expect(port.calls).toEqual([{
      operation: 'getWorkspace',
      input: { actorUserId: '10001' },
    }])
    expect(controller.currentOperatorId.value).toBe('10001')
    expect(controller.activeConversationId.value).toBe('private:10001:20001')
    expect(controller.sidebar.value).toMatchObject({ revision: 7, currentView: 'messages' })
    expect(controller.chat.value).toMatchObject({ revision: 7, messages: [{ id: 'message-1' }] })
    expect(controller.composer.value).toMatchObject({ revision: 7, currentOperator: { id: '10001' } })
    expect(controller.details.value).toMatchObject({ revision: 7, bot: { id: '20001' } })
  })

  it('切换会话时同步聊天区域并保存浏览器选择', async () => {
    const port = createFakeWorkspacePort(workspace)
    const storage = createStorage()
    const controller = createWorkspaceController(port, storage)
    await controller.load()

    controller.selectConversation('group:30001:10001:20001')

    expect(controller.activeConversationId.value).toBe('group:30001:10001:20001')
    expect(controller.chat.value).toMatchObject({
      revision: 7,
      conversation: { id: 'group:30001:10001:20001' },
      messages: [],
    })
    expect(JSON.parse(storage.read('onebot-sandbox.workspace') ?? '{}')).toEqual({
      currentUserId: '10001',
      activeConversationId: 'group:30001:10001:20001',
      currentView: 'messages',
    })
  })

  it('切换当前操作者时保持用户与机器人现有加载语义', async () => {
    const port = createFakeWorkspacePort(workspace)
    const controller = createWorkspaceController(port, createStorage())
    await controller.load()

    await controller.selectOperator('10002')

    expect(port.calls.at(-1)).toEqual({
      operation: 'getWorkspace',
      input: { actorUserId: '10002' },
    })
    expect(controller.currentUserId.value).toBe('10002')
    expect(controller.currentOperatorId.value).toBe('10002')
    expect(controller.activeConversationId.value).toBe('private:10002:20001')

    const callCount = port.calls.length
    await controller.selectOperator('20001')

    expect(port.calls).toHaveLength(callCount)
    expect(controller.currentUserId.value).toBe('10002')
    expect(controller.currentOperatorId.value).toBe('20001')
    expect(controller.composer.value.currentOperator).toMatchObject({ id: '20001', type: 'bot' })
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
      currentUserId: 'deleted-user',
      activeConversationId: 'deleted-conversation',
      currentView: 'contacts',
    }))
    const controller = createWorkspaceController(createFakeWorkspacePort(workspace), storage)

    await controller.load()

    expect(controller.currentOperatorId.value).toBe('10001')
    expect(controller.activeConversationId.value).toBe('private:10001:20001')
    expect(controller.currentView.value).toBe('contacts')
    expect(JSON.parse(storage.read('onebot-sandbox.workspace') ?? '{}')).toEqual({
      currentUserId: '10001',
      activeConversationId: 'private:10001:20001',
      currentView: 'contacts',
    })
  })

  it('保存的参与者加载失败时保留无参数工作区 fallback', async () => {
    const port = createFakeWorkspacePort(workspace)
    port.rejectNext('getWorkspace', new Error('参与者不存在'))
    const controller = createWorkspaceController(port, createStorage(JSON.stringify({
      currentUserId: '10001',
      currentView: 'messages',
    })))

    await controller.load()

    expect(port.calls).toEqual([
      { operation: 'getWorkspace', input: { actorUserId: '10001' } },
      { operation: 'getWorkspace', input: undefined },
    ])
    expect(controller.sidebar.value.revision).toBe(7)
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
          botId: '20001',
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
        actorUserId: '10001',
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
        actorUserId: '10001',
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
        actorUserId: '10001',
        requestId: 'friend-request-1',
        approve: true,
      },
    }, {
      operation: 'performGroupAction',
      input: {
        action: 'handle-request',
        actorUserId: '10001',
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

    controller.selectConversation('group:30001:10001:20001')
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
      senderId: '20001',
      botId: '20001',
      conversationId: 'private:10001:20001',
      content: '控制模块发送',
    })

    expect(port.calls.at(-1)).toEqual({
      operation: 'sendMessage',
      input: {
        actorUserId: '10001',
        senderId: '20001',
        botId: '20001',
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
      senderId: '10001',
      botId: '20001',
      conversationId: 'private:10001:20001',
      fileName: 'fixture.png',
      mimeType: 'image/png',
      dataBase64: 'ZmFrZQ==',
    })).rejects.toMatchObject({
      name: 'WorkspaceControllerError',
      message: '媒体发送被拒绝',
    })

    expect(port.calls.at(-1)).toEqual({
      operation: 'sendMediaMessage',
      input: {
        actorUserId: '10001',
        senderId: '10001',
        botId: '20001',
        conversationId: 'private:10001:20001',
        fileName: 'fixture.png',
        mimeType: 'image/png',
        dataBase64: 'ZmFrZQ==',
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
        actorUserId: '10001',
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
        botId: '20001',
        conversationId: 'private:10001:20001',
        content: '更早的消息',
        createdAt: '2026-07-22T23:59:59.000Z',
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
        actorUserId: '10001',
        conversationId: 'private:10001:20001',
        beforeMessageId: 'message-1',
        limit: 50,
      },
    })
    expect(controller.chat.value.messages.map(({ id }) => id)).toEqual(['message-0', 'message-1'])
    expect(controller.chat.value.conversation?.messageIds).toEqual(['message-0', 'message-1'])
    expect(controller.chat.value.conversation?.hasMoreMessages).toBe(true)
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
        actorUserId: '10001',
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
        actorUserId: '10001',
        groupId: '30001',
        announcementId: 'announcement-1',
      },
    })
    expect(controller.details.value.revision).toBe(9)
  })
})
