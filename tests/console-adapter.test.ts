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

    const initialWorkspace = snapshotListener({ actorUserId: '10001' })
    expect(initialWorkspace.snapshot.users.map(({ id }: { id: string }) => id)).toEqual([
      '10001',
      '10002',
      '10003',
      '10004',
    ])
    expect(initialWorkspace.snapshot.bots.map(({ id }: { id: string }) => id)).toEqual(['20001'])
    expect(initialWorkspace.snapshot.groups.map(({ id }: { id: string }) => id)).toEqual(['30001'])
    expect(initialWorkspace.snapshot.conversations.every(({ userId }: { userId: string }) => userId === '10001')).toBe(true)
    expect(initialWorkspace.appearance).toEqual(appearance)

    const snapshot = await sendMessageListener({
      actorUserId: '10001',
      botId: '20001',
      conversationId: 'private:10001:20001',
      content: '控制台消息',
    })
    expect(snapshot.snapshot.messages.map(({ content }: { content: string }) => content)).toEqual([
      '控制台消息',
      '回复：控制台消息',
    ])

    const mediaWorkspace = await sendMediaMessageListener({
      actorUserId: '10001',
      botId: '20001',
      conversationId: 'private:10001:20001',
      fileName: '控制台图片.png',
      mimeType: 'image/png',
      dataBase64: Buffer.from('console-image').toString('base64'),
    })
    const media = mediaWorkspace.snapshot.messages.find(({ media }: { media?: unknown[] }) => media?.length)?.media?.[0]
    expect(media).toEqual(expect.objectContaining({ name: '控制台图片.png', type: 'image' }))
    expect(getMediaContentListener({ actorUserId: '10001', mediaId: media.id })).toEqual(expect.objectContaining({
      id: media.id,
      dataBase64: 'Y29uc29sZS1pbWFnZQ==',
    }))

    const otherWorkspace = snapshotListener({ actorUserId: '10002' })
    expect(otherWorkspace.snapshot.conversations.every(({ userId }: { userId: string }) => userId === '10002')).toBe(true)
    expect(otherWorkspace.snapshot.messages).toEqual([])

    const history = historyListener({
      actorUserId: '10001',
      conversationId: 'private:10001:20001',
      limit: 1,
    })
    expect(history.messages).toHaveLength(1)
    expect(history.nextBeforeMessageId).toBeDefined()

    const updated = setGroupAnnouncementListener({
      actorUserId: '10001',
      groupId: '30001',
      content: '控制台发布的公告',
    })
    expect(updated.snapshot.groups[0].announcements[0].content).toBe('控制台发布的公告')
    const removed = deleteGroupAnnouncementListener({
      actorUserId: '10001',
      groupId: '30001',
      announcementId: updated.snapshot.groups[0].announcements[0].id,
    })
    expect(removed.snapshot.groups[0].announcements.some(({ content }: { content: string }) => content === '控制台发布的公告')).toBe(false)

    const managed = manageEnvironmentListener({
      action: 'create-user',
      data: { id: '10099', name: '控制台用户' },
    })
    expect(managed.snapshot.users).toContainEqual({ id: '10099', name: '控制台用户' })

    const friendWorkspace = await friendActionListener({
      action: 'request',
      actorUserId: '10001',
      targetId: '10002',
    })
    expect(friendWorkspace.snapshot.requests.some(({ requesterId, targetId }: { requesterId: string; targetId?: string }) => requesterId === '10001' && targetId === '10002')).toBe(true)

    const groupWorkspace = await groupActionListener({
      action: 'set-card',
      actorUserId: '10002',
      groupId: '30001',
      targetId: '10002',
      card: '控制台群名片',
    })
    expect(groupWorkspace.snapshot.groups[0].members.find(({ participantId }: { participantId: string }) => participantId === '10002')?.card).toBe('控制台群名片')

    const afterCurrentUserDeleted = manageEnvironmentListener({
      actorUserId: '10001',
      action: 'delete-user',
      data: { id: '10001' },
    })
    expect(afterCurrentUserDeleted.snapshot.users.some(({ id }: { id: string }) => id === '10001')).toBe(false)
    expect(afterCurrentUserDeleted.snapshot.conversations.every(({ userId }: { userId: string }) => userId === '10002')).toBe(true)
  })
})
