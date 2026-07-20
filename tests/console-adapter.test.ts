import { App } from '@koishijs/core'
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

afterEach(async () => {
  await Promise.all(runningApps.splice(0).map((app) => app.stop()))
})

describe('Koishi 控制台适配器', () => {
  it('注册 Vue 页面入口并通过共享服务返回消息闭环结果', async () => {
    const app = new App()
    let control: SandboxControlService | undefined
    app.plugin((ctx) => {
      control = new SandboxControlService(ctx)
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
    const sendMessageListener = listeners.get('onebot-sandbox/send-message')
    const setGroupAnnouncementListener = listeners.get('onebot-sandbox/set-group-announcement')
    const deleteGroupAnnouncementListener = listeners.get('onebot-sandbox/delete-group-announcement')
    if (typeof snapshotListener !== 'function'
      || typeof sendMessageListener !== 'function'
      || typeof setGroupAnnouncementListener !== 'function'
      || typeof deleteGroupAnnouncementListener !== 'function') {
      throw new Error('控制台监听器未注册')
    }

    expect(snapshotListener()).toMatchObject({
      snapshot: {
        users: [{ id: '10001' }, { id: '10002' }],
        bots: [{ id: '20001' }],
        groups: [{ id: '30001' }],
      },
      appearance,
    })

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
  })
})
