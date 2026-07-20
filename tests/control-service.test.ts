import { App } from '@koishijs/core'
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

    expect(control.getSnapshot()).toMatchObject({
      users: [
        { id: '10001', name: '测试用户' },
        { id: '10002', name: '协作用户' },
      ],
      bots: [{ id: '20001', name: 'OneBot Sandbox' }],
      conversations: [
        { id: 'private:10001:20001', messageIds: [] },
        { id: 'private:10002:20001', messageIds: [] },
      ],
    })

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
})
