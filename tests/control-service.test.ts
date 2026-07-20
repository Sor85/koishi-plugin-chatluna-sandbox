import { App, Universal } from '@koishijs/core'
import { afterEach, describe, expect, it } from 'vitest'
import { SandboxControlService } from '../src/control-service'

const runningApps: App[] = []

afterEach(async () => {
  await Promise.all(runningApps.splice(0).map((app) => app.stop()))
})

describe('模拟 QQ 环境消息闭环', () => {
  it('普通用户发送文本后，被测插件收到正确 Session 并回复到同一会话', async () => {
    const app = new App()
    let control: SandboxControlService | undefined
    app.plugin((ctx) => {
      control = new SandboxControlService(ctx)
    })
    runningApps.push(app)

    let receivedSession: {
      platform: string | undefined
      selfId: string | undefined
      userId: string | undefined
      channelId: string | undefined
      content: string | undefined
    } | undefined

    app.middleware((session) => {
      receivedSession = {
        platform: session.platform,
        selfId: session.selfId,
        userId: session.userId,
        channelId: session.channelId,
        content: session.content,
      }
      return `收到：${session.content}`
    })

    await app.start()

    if (!control) throw new Error('沙盒控制服务未注册')

    const initial = control.getSnapshot()
    expect(initial.users.map(({ id }) => id)).toEqual(['10001', '10002', '10003', '10004'])
    expect(initial.bots).toContainEqual(expect.objectContaining({ id: '20001', name: 'OneBot Sandbox' }))
    expect(initial.groups[0]).toMatchObject({
      id: '30001',
      name: 'OneBot 测试群',
      members: [
        { participantId: '10001', role: 'owner' },
        { participantId: '10003', role: 'admin' },
        { participantId: '10002', role: 'member' },
        { participantId: '20001', role: 'member' },
      ],
    })
    expect(initial.conversations).toContainEqual(expect.objectContaining({
      id: 'private:10001:20001',
      type: 'direct',
      messageIds: [],
    }))
    expect(initial.conversations).toContainEqual(expect.objectContaining({
      id: 'group:30001:10001:20001',
      type: 'group',
      groupId: '30001',
      messageIds: [],
    }))

    await control.sendMessage({
      actorUserId: '10001',
      botId: '20001',
      conversationId: 'private:10001:20001',
      content: '你好',
    })

    expect(receivedSession).toEqual({
      platform: 'onebot',
      selfId: '20001',
      userId: '10001',
      channelId: 'private:10001:20001',
      content: '你好',
    })
    expect(control.getSnapshot().messages).toEqual([
      expect.objectContaining({
        authorId: '10001',
        conversationId: 'private:10001:20001',
        content: '你好',
      }),
      expect.objectContaining({
        authorId: '20001',
        conversationId: 'private:10001:20001',
        content: '收到：你好',
      }),
    ])
  })

  it('群成员可以发布公告并以群聊 Session 向插件发送消息', async () => {
    const app = new App()
    let control: SandboxControlService | undefined
    app.plugin((ctx) => {
      control = new SandboxControlService(ctx)
    })
    runningApps.push(app)

    let receivedSession: { channelId?: string, guildId?: string, channelType?: number } | undefined
    app.middleware((session) => {
      receivedSession = {
        channelId: session.channelId,
        guildId: session.guildId,
        channelType: session.event.channel?.type,
      }
    })
    await app.start()
    if (!control) throw new Error('沙盒控制服务未注册')

    control.setGroupAnnouncement({
      actorUserId: '10001',
      groupId: '30001',
      content: '新的群公告',
    })
    await control.sendMessage({
      actorUserId: '10001',
      botId: '20001',
      conversationId: 'group:30001:10001:20001',
      content: '群聊消息',
    })

    expect(control.getSnapshot().groups[0].announcements[0]).toMatchObject({
      authorId: '10001',
      content: '新的群公告',
    })
    const announcementId = control.getSnapshot().groups[0].announcements[0].id
    control.deleteGroupAnnouncement({
      actorUserId: '10001',
      groupId: '30001',
      announcementId,
    })
    expect(control.getSnapshot().groups[0].announcements.some(({ id }) => id === announcementId)).toBe(false)
    expect(receivedSession).toEqual({
      channelId: 'group:30001:10001:20001',
      guildId: '30001',
      channelType: Universal.Channel.Type.TEXT,
    })
  })
})
