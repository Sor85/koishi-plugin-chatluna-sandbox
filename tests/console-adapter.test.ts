import { App } from '@koishijs/core'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { registerConsole, type SandboxConsoleRegistrar } from '../src/console'
import { SandboxControlService } from '../src/control-service'
import type { SandboxAppearance } from '../src/types'

const appearance: SandboxAppearance = {
  enableWebQQFrostedGlass: true,
  webQQChatStyle: 'tim',
  webQQTimBubbleTail: true,
  webQQColorMode: 'auto',
  webQQAccentColor: '#2563eb',
}

const runningApps: App[] = []
const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(runningApps.splice(0).map((app) => app.stop()))
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('Koishi 控制台适配器', () => {
  it('注册 Vue 页面入口并通过共享服务返回消息闭环结果', async () => {
    const app = new App()
    const mediaDirectory = await mkdtemp(join(tmpdir(), 'onebot-sandbox-console-media-'))
    temporaryDirectories.push(mediaDirectory)
    let control: SandboxControlService | undefined
    app.plugin((ctx) => {
      control = new SandboxControlService(ctx, { mediaDirectory })
    })
    runningApps.push(app)

    app.middleware((session) => `回复：${session.content}`)
    await app.start()
    if (!control) throw new Error('沙盒控制服务未注册')

    const entries: Array<{ dev: string; prod: string }> = []
    const listeners = new Map<string, unknown>()
    const consoleRegistrar: SandboxConsoleRegistrar = {
      addEntry(entry) {
        entries.push(entry)
      },
      addListener(event, callback) {
        listeners.set(event, callback)
      },
    }

    registerConsole(consoleRegistrar, control, appearance)

    expect(entries).toEqual([{
      dev: expect.stringContaining('client/index.ts'),
      prod: expect.stringContaining('dist'),
    }])

    const snapshotListener = listeners.get('onebot-sandbox/workspace')
    const historyListener = listeners.get('onebot-sandbox/message-history')
    const sendMessageListener = listeners.get('onebot-sandbox/send-message')
    const sendMediaMessageListener = listeners.get('onebot-sandbox/send-media-message')
    const getMediaContentListener = listeners.get('onebot-sandbox/media-content')
    const setGroupAnnouncementListener = listeners.get('onebot-sandbox/set-group-announcement')
    const deleteGroupAnnouncementListener = listeners.get('onebot-sandbox/delete-group-announcement')
    const manageEnvironmentListener = listeners.get('onebot-sandbox/manage-environment')
    const friendActionListener = listeners.get('onebot-sandbox/friend-action')
    const groupActionListener = listeners.get('onebot-sandbox/group-action')
    if (typeof snapshotListener !== 'function'
      || typeof historyListener !== 'function'
      || typeof sendMessageListener !== 'function'
      || typeof sendMediaMessageListener !== 'function'
      || typeof getMediaContentListener !== 'function'
      || typeof setGroupAnnouncementListener !== 'function'
      || typeof deleteGroupAnnouncementListener !== 'function'
      || typeof manageEnvironmentListener !== 'function'
      || typeof friendActionListener !== 'function'
      || typeof groupActionListener !== 'function') {
      throw new Error('控制台监听器未注册')
    }

    const initialWorkspace = snapshotListener({ operatorId: '10001' })
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

    const snapshot = await sendMessageListener({
      operatorId: '10001',
      conversationId: 'private:10001:20001',
      content: '控制台消息',
    })
    expect(snapshot.snapshot.messages.map(({ content }: { content: string }) => content)).toEqual([
      '控制台消息',
      '回复：控制台消息',
    ])

    const mediaWorkspace = await sendMediaMessageListener({
      operatorId: '10001',
      conversationId: 'private:10001:20001',
      fileName: '控制台图片.png',
      mimeType: 'image/png',
      dataBase64: Buffer.from('console-image').toString('base64'),
    })
    const media = mediaWorkspace.snapshot.messages.find(({ media }: { media?: unknown[] }) => media?.length)?.media?.[0]
    expect(media).toEqual(expect.objectContaining({ name: '控制台图片.png', type: 'image' }))
    expect(getMediaContentListener({ operatorId: '10001', mediaId: media.id })).toEqual(expect.objectContaining({
      id: media.id,
      dataBase64: 'Y29uc29sZS1pbWFnZQ==',
    }))

    const otherWorkspace = snapshotListener({ operatorId: '10002' })
    expect(otherWorkspace.snapshot.conversations.every((conversation: { type: string; participantIds?: readonly string[]; groupId?: string }) => conversation.type === 'direct'
      ? conversation.participantIds?.includes('10002')
      : otherWorkspace.snapshot.groups.find(({ id }: { id: string }) => id === conversation.groupId)?.members
        .some(({ participantId }: { participantId: string }) => participantId === '10002'))).toBe(true)
    expect(otherWorkspace.snapshot.messages).toEqual([])

    const history = historyListener({
      operatorId: '10001',
      conversationId: 'private:10001:20001',
      limit: 1,
    })
    expect(history.messages).toHaveLength(1)
    expect(history.nextBeforeMessageId).toBeDefined()

    const updated = setGroupAnnouncementListener({
      operatorId: '10001',
      groupId: '30001',
      content: '控制台发布的公告',
    })
    expect(updated.snapshot.groups[0].announcements[0].content).toBe('控制台发布的公告')
    const removed = deleteGroupAnnouncementListener({
      operatorId: '10001',
      groupId: '30001',
      announcementId: updated.snapshot.groups[0].announcements[0].id,
    })
    expect(removed.snapshot.groups[0].announcements.some(({ content }: { content: string }) => content === '控制台发布的公告')).toBe(false)

    const managed = manageEnvironmentListener({
      action: 'create-user',
      data: { id: '10099', name: '控制台用户' },
    })
    expect(managed.snapshot.participants).toContainEqual({ kind: 'user', id: '10099', name: '控制台用户' })

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

    const botWorkspace = snapshotListener({ operatorId: '20001' })
    expect(botWorkspace.snapshot.conversations.length).toBeGreaterThan(0)
    expect(botWorkspace.snapshot.conversations.every((conversation: { type: string; participantIds?: readonly string[]; groupId?: string }) => conversation.type === 'direct'
      ? conversation.participantIds?.includes('20001')
      : botWorkspace.snapshot.groups.find(({ id }: { id: string }) => id === conversation.groupId)?.members
        .some(({ participantId }: { participantId: string }) => participantId === '20001'))).toBe(true)
    const botConversationUserIds = new Set(botWorkspace.snapshot.conversations.flatMap((conversation: { type: string; participantIds?: readonly string[] }) => conversation.type === 'direct'
      ? conversation.participantIds?.filter((id) => id !== '20001') ?? []
      : []))
    expect(['10001', '10002', '10003'].every((userId) => botConversationUserIds.has(userId))).toBe(true)

    const afterCurrentUserDeleted = manageEnvironmentListener({
      operatorId: '10001',
      action: 'delete-user',
      data: { id: '10001' },
    })
    expect(afterCurrentUserDeleted.snapshot.participants.some(({ id }: { id: string }) => id === '10001')).toBe(false)
    expect(afterCurrentUserDeleted.snapshot.conversations.every((conversation: { type: string; participantIds?: readonly string[]; groupId?: string }) => conversation.type === 'direct'
      ? conversation.participantIds?.includes('10002')
      : afterCurrentUserDeleted.snapshot.groups.find(({ id }: { id: string }) => id === conversation.groupId)?.members
        .some(({ participantId }: { participantId: string }) => participantId === '10002'))).toBe(true)
  })
})
