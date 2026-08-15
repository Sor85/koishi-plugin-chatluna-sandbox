import { App, Universal } from '@koishijs/core'
import { mkdtemp, mkdir, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { registerConsole, resolveConsoleEntry, type SandboxConsoleRegistrar } from '../src/console'
import { SandboxControlService } from '../src/control-service'
import type { SandboxAppearance } from '../src/types'

const appearance: SandboxAppearance = {
  enableWebQQFrostedGlass: true,
  webQQTimBubbleTail: true,
  webQQColorMode: 'auto',
  webQQAccentColor: '#2563eb',
  webQQMarkRecalledMessages: true,
}

const runningApps: App[] = []
const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(runningApps.splice(0).map((app) => app.stop()))
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('Koishi 控制台适配器', () => {
  it('本地软链接安装时保留 node_modules 资源路径', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'chatluna-sandbox-console-entry-'))
    temporaryDirectories.push(workspace)
    const packageDirectory = join(workspace, 'node_modules', 'koishi-plugin-chatluna-sandbox')
    await mkdir(join(workspace, 'node_modules'), { recursive: true })
    await symlink(resolve('.'), packageDirectory)

    expect(resolveConsoleEntry(workspace)).toEqual({
      dev: join(packageDirectory, 'client/index.ts'),
      prod: join(packageDirectory, 'dist'),
    })
  })

  it('注册 Vue 页面入口并通过共享服务返回消息闭环结果', async () => {
    const app = new App()
    const mediaDirectory = await mkdtemp(join(tmpdir(), 'chatluna-sandbox-console-media-'))
    temporaryDirectories.push(mediaDirectory)
    let control: SandboxControlService | undefined
    app.plugin((ctx) => {
      control = new SandboxControlService(ctx, { mediaDirectory })
    })
    runningApps.push(app)

    let middlewareCalls = 0
    app.middleware((session) => {
      middlewareCalls += 1
      return `回复：${session.content}`
    })
    await app.start()
    if (!control) throw new Error('沙盒控制服务未注册')

    const entries: Array<{ dev: string; prod: string }> = []
    const listeners = new Map<string, unknown>()
    const broadcasts: Array<{ type: string; body: unknown }> = []
    const consoleRegistrar: SandboxConsoleRegistrar = {
      addEntry(entry) {
        entries.push(entry)
      },
      addListener(event, callback) {
        listeners.set(event, callback)
      },
      broadcast(type, body) {
        broadcasts.push({ type, body })
      },
    }

    registerConsole(consoleRegistrar, control, appearance)

    const chatLunaSession = control.bot.session({
      type: 'message',
      user: { id: '10001', name: '测试用户1' },
      channel: { id: 'private:10001:20001', type: Universal.Channel.Type.DIRECT },
    })
    await (app.parallel as unknown as (event: string, ...args: unknown[]) => Promise<void>)(
      'chatluna/before-chat',
      'console:chatluna',
      {},
      {},
      {},
      chatLunaSession,
    )

    expect(entries).toEqual([{
      dev: expect.stringContaining('client/index.ts'),
      prod: expect.stringContaining('dist'),
    }])

    const snapshotListener = listeners.get('chatluna-sandbox/workspace')
    const historyListener = listeners.get('chatluna-sandbox/message-history')
    const searchConversationMessagesListener = listeners.get('chatluna-sandbox/search-conversation-messages')
    const sendMessageListener = listeners.get('chatluna-sandbox/send-message')
    const sendMediaMessageListener = listeners.get('chatluna-sandbox/send-media-message')
    const sendForwardMessageListener = listeners.get('chatluna-sandbox/send-forward-message')
    const getForwardMessageListener = listeners.get('chatluna-sandbox/get-forward-message')
    const getMediaContentListener = listeners.get('chatluna-sandbox/media-content')
    const setGroupAnnouncementListener = listeners.get('chatluna-sandbox/set-group-announcement')
    const deleteGroupAnnouncementListener = listeners.get('chatluna-sandbox/delete-group-announcement')
    const manageEnvironmentListener = listeners.get('chatluna-sandbox/manage-environment')
    const friendActionListener = listeners.get('chatluna-sandbox/friend-action')
    const groupActionListener = listeners.get('chatluna-sandbox/group-action')
    const botDeliveriesListener = listeners.get('chatluna-sandbox/bot-deliveries')
    if (typeof snapshotListener !== 'function'
      || typeof historyListener !== 'function'
      || typeof searchConversationMessagesListener !== 'function'
      || typeof sendMessageListener !== 'function'
      || typeof sendMediaMessageListener !== 'function'
      || typeof sendForwardMessageListener !== 'function'
      || typeof getForwardMessageListener !== 'function'
      || typeof getMediaContentListener !== 'function'
      || typeof setGroupAnnouncementListener !== 'function'
      || typeof deleteGroupAnnouncementListener !== 'function'
      || typeof manageEnvironmentListener !== 'function'
      || typeof friendActionListener !== 'function'
      || typeof groupActionListener !== 'function'
      || typeof botDeliveriesListener !== 'function') {
      throw new Error('控制台监听器未注册')
    }

    const initialWorkspace = await snapshotListener({ operatorId: '10001' })
    expect(initialWorkspace.persistence).toEqual({
      mode: 'memory',
      available: true,
      persisted: false,
    })
    expect(initialWorkspace.snapshot.participants.filter(({ kind }: { kind: string }) => kind === 'user').map(({ id }: { id: string }) => id)).toEqual([
      '10001',
      '10002',
      '10003',
    ])
    expect(initialWorkspace.snapshot.participants.filter(({ kind }: { kind: string }) => kind === 'bot').map(({ id }: { id: string }) => id)).toEqual(['20001'])
    expect(initialWorkspace.snapshot.groups.map(({ id }: { id: string }) => id)).toEqual(['30001'])
    expect(initialWorkspace.snapshot.conversations.every((conversation: { type: string; participantIds?: readonly string[]; groupId?: string }) => conversation.type === 'direct'
      ? conversation.participantIds?.includes('10001')
      : initialWorkspace.snapshot.groups.find(({ id }: { id: string }) => id === conversation.groupId)?.members
        .some(({ participantId }: { participantId: string }) => participantId === '10001'))).toBe(true)
    expect(initialWorkspace.appearance).toEqual(appearance)
    expect(initialWorkspace.chatLunaStates).toEqual([
      expect.objectContaining({
        botParticipantId: '20001',
        conversationId: 'private:10001:20001',
        thinking: true,
      }),
    ])

    const snapshot = await sendMessageListener({
      operatorId: '10001',
      conversationId: 'private:10001:20001',
      content: '控制台消息',
    })
    expect(await searchConversationMessagesListener({
      operatorId: '10001',
      conversationId: 'private:10001:20001',
      query: '控制台',
    })).toMatchObject({
      hits: [expect.objectContaining({
        summary: '控制台消息',
        authorId: '10001',
      })],
    })
    const sentMessage = control.getSnapshot().messages.find(({ content }) => content === '控制台消息')!
    expect(await searchConversationMessagesListener({
      operatorId: '10001',
      conversationId: 'private:10001:20001',
      query: '',
      createdAtStart: sentMessage.createdAt,
      createdAtEnd: new Date(new Date(sentMessage.createdAt).getTime() + 1).toISOString(),
    })).toMatchObject({
      hits: [expect.objectContaining({ summary: '控制台消息' })],
    })
    expect(await searchConversationMessagesListener({
      operatorId: '10001',
      conversationId: 'private:10001:20001',
      query: '   ',
    })).toEqual({ hits: [] })
    // 发送 RPC 即时返回，此刻只包含用户消息本体；机器人回复在后台派发完成后经场景广播刷新。
    expect(snapshot.snapshot.messages.map(({ content }: { content: string }) => content)).toEqual([
      '控制台消息',
    ])
    await vi.waitFor(() => {
      expect(control!.getSnapshot().messages.map(({ content }) => content)).toEqual([
        '控制台消息',
        '回复：控制台消息',
      ])
    })
    const replyRevision = control.getSnapshot().revision
    expect(broadcasts).toContainEqual({
      type: 'chatluna-sandbox/scene-mutated',
      body: { revision: replyRevision },
    })
    const refreshedWorkspace = await snapshotListener({ operatorId: '10001' })
    expect(refreshedWorkspace.snapshot.revision).toBe(replyRevision)
    expect(refreshedWorkspace.snapshot.messages.map(({ content }: { content: string }) => content)).toEqual([
      '控制台消息',
      '回复：控制台消息',
    ])
    expect(snapshot.snapshot.messages.every((message: Record<string, unknown>) => !('botId' in message))).toBe(true)
    expect(snapshot.snapshot.conversations.every((conversation: Record<string, unknown>) => !('userId' in conversation) && !('botId' in conversation))).toBe(true)
    const messageId = snapshot.snapshot.messages.find(({ content }: { content: string }) => content === '控制台消息')?.id
    expect(await botDeliveriesListener({ recipientBotId: '20001', messageId })).toEqual([
      expect.objectContaining({ recipientBotId: '20001', messageId }),
    ])
    await expect(botDeliveriesListener({ botId: '20001' })).rejects.toThrow('不支持旧 RPC 字段：botId')

    const mediaWorkspace = await sendMediaMessageListener({
      operatorId: '10001',
      conversationId: 'private:10001:20001',
      media: [{ fileName: '控制台图片.png', mimeType: 'image/png', dataBase64: Buffer.from('console-image').toString('base64') }],
    })
    const media = mediaWorkspace.snapshot.messages.find(({ media }: { media?: unknown[] }) => media?.length)?.media?.[0]
    expect(media).toEqual(expect.objectContaining({ name: '控制台图片.png', type: 'image' }))
    expect(await getMediaContentListener({ operatorId: '10001', mediaId: media.id })).toEqual(expect.objectContaining({
      id: media.id,
      dataBase64: 'Y29uc29sZS1pbWFnZQ==',
    }))
    // 发送 RPC 故意即时返回；删除参与者前等待媒体消息的后台投递结束，避免测试清理会话时留下异步回复。
    await vi.waitFor(() => {
      expect(control!.getBotDeliveries()).toHaveLength(2)
    })

    const sourceMessageId = snapshot.snapshot.messages.find(({ content }: { content: string }) => content === '控制台消息')?.id
    expect(sourceMessageId).toBeTruthy()
    const forwardWorkspace = await sendForwardMessageListener({
      operatorId: '10001',
      conversationId: 'private:10001:20001',
      messageIds: [sourceMessageId],
    })
    const forwardMessage = forwardWorkspace.snapshot.messages.find(({ forwardId }: { forwardId?: string }) => !!forwardId)
    expect(forwardMessage?.forwardId).toBeTruthy()
    expect(forwardWorkspace.snapshot.forwards).toContainEqual(expect.objectContaining({
      id: forwardMessage.forwardId,
    }))
    expect(await getForwardMessageListener({
      operatorId: '10001',
      forwardId: forwardMessage.forwardId,
    })).toMatchObject({
      id: forwardMessage.forwardId,
      nodes: [expect.objectContaining({ content: '控制台消息', sourceMessageId })],
    })
    const forwardHistory = await historyListener({
      operatorId: '10001',
      conversationId: 'private:10001:20001',
      limit: 50,
    })
    expect(forwardHistory.forwards).toContainEqual(expect.objectContaining({ id: forwardMessage.forwardId }))

    const otherWorkspace = await snapshotListener({ operatorId: '10002' })
    expect(otherWorkspace.snapshot.conversations.every((conversation: { type: string; participantIds?: readonly string[]; groupId?: string }) => conversation.type === 'direct'
      ? conversation.participantIds?.includes('10002')
      : otherWorkspace.snapshot.groups.find(({ id }: { id: string }) => id === conversation.groupId)?.members
        .some(({ participantId }: { participantId: string }) => participantId === '10002'))).toBe(true)
    expect(otherWorkspace.snapshot.messages).toEqual([])
    expect(otherWorkspace.chatLunaStates).toEqual([])

    const history = await historyListener({
      operatorId: '10001',
      conversationId: 'private:10001:20001',
      limit: 1,
    })
    expect(history.messages).toHaveLength(1)
    expect(history.nextBeforeMessageId).toBeDefined()

    const updated = await setGroupAnnouncementListener({
      operatorId: '10001',
      groupId: '30001',
      content: '控制台发布的公告',
    })
    expect(updated.snapshot.groups[0].announcements[0].content).toBe('控制台发布的公告')
    const removed = await deleteGroupAnnouncementListener({
      operatorId: '10001',
      groupId: '30001',
      announcementId: updated.snapshot.groups[0].announcements[0].id,
    })
    expect(removed.snapshot.groups[0].announcements.some(({ content }: { content: string }) => content === '控制台发布的公告')).toBe(false)

    const middlewareCallsBeforeManage = middlewareCalls
    const managed = await manageEnvironmentListener({
      action: 'create-user',
      data: { id: '10099', name: '控制台用户' },
    })
    expect(managed.snapshot.participants).toContainEqual(expect.objectContaining({ kind: 'user', id: '10099', name: '控制台用户' }))
    expect(middlewareCalls).toBe(middlewareCallsBeforeManage)

    const friendWorkspace = await friendActionListener({
      action: 'request',
      operatorId: '10001',
      targetId: '10002',
    })
    expect(friendWorkspace.snapshot.requests.some(({ requesterId, targetId }: { requesterId: string; targetId?: string }) => requesterId === '10001' && targetId === '10002')).toBe(true)

    const groupWorkspace = await groupActionListener({
      action: 'set-card',
      operatorId: '10002',
      groupId: '30001',
      targetId: '10002',
      card: '控制台群名片',
    })
    expect(groupWorkspace.snapshot.groups[0].members.find(({ participantId }: { participantId: string }) => participantId === '10002')?.card).toBe('控制台群名片')

    const botWorkspace = await snapshotListener({ operatorId: '20001' })
    expect(botWorkspace.snapshot.conversations.length).toBeGreaterThan(0)
    expect(botWorkspace.snapshot.conversations.every((conversation: { type: string; participantIds?: readonly string[]; groupId?: string }) => conversation.type === 'direct'
      ? conversation.participantIds?.includes('20001')
      : botWorkspace.snapshot.groups.find(({ id }: { id: string }) => id === conversation.groupId)?.members
        .some(({ participantId }: { participantId: string }) => participantId === '20001'))).toBe(true)
    const botConversationUserIds = new Set(botWorkspace.snapshot.conversations.flatMap((conversation: { type: string; participantIds?: readonly string[] }) => conversation.type === 'direct'
      ? conversation.participantIds?.filter((id) => id !== '20001') ?? []
      : []))
    expect(['10001', '10002', '10003'].every((userId) => botConversationUserIds.has(userId))).toBe(true)

    const afterCurrentUserDeleted = await manageEnvironmentListener({
      action: 'delete-user',
      data: { id: '10001' },
    })
    expect(afterCurrentUserDeleted.snapshot.participants.some(({ id }: { id: string }) => id === '10001')).toBe(false)
    expect(afterCurrentUserDeleted.snapshot.conversations.every((conversation: { type: string; participantIds?: readonly string[]; groupId?: string }) => conversation.type === 'direct'
      ? conversation.participantIds?.includes('10002')
      : afterCurrentUserDeleted.snapshot.groups.find(({ id }: { id: string }) => id === conversation.groupId)?.members
        .some(({ participantId }: { participantId: string }) => participantId === '10002'))).toBe(true)

    await expect(snapshotListener({ operatorId: '99999' })).rejects.toThrow('参与者不存在：99999')
    await expect(snapshotListener({ userId: '10001' })).rejects.toThrow('不支持旧 RPC 字段：userId')
    await expect(async () => sendMessageListener({
      operatorId: '10002',
      senderId: '10003',
      botId: '20001',
      conversationId: 'private:10002:20001',
      content: '伪造发送者',
    })).rejects.toThrow('不支持旧 RPC 字段：senderId')
    await expect(manageEnvironmentListener({
      operatorId: '10002',
      action: 'create-user',
      data: { id: '10100', name: '不应创建' },
    })).rejects.toThrow('环境管理不接受操作者字段：operatorId')
    expect(control.getSnapshot().participants.some(({ id }) => id === '10100')).toBe(false)
  })
})
