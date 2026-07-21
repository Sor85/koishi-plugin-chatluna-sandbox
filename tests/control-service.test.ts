import { App, Universal } from '@koishijs/core'
import { mkdtemp, readdir, rm, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SandboxControlService } from '../src/control-service'

const runningApps: App[] = []
const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(runningApps.splice(0).map((app) => app.stop()))
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('模拟 QQ 环境消息闭环', () => {
  it('发送图片时只在场景保存安全引用，并生成 Koishi 与 OneBot 媒体消息', async () => {
    const app = new App()
    const mediaDirectory = await mkdtemp(join(tmpdir(), 'onebot-sandbox-media-'))
    temporaryDirectories.push(mediaDirectory)
    let control: SandboxControlService | undefined
    app.plugin((ctx) => {
      control = new SandboxControlService(ctx, { mediaDirectory })
    })
    runningApps.push(app)

    let receivedSession: {
      content?: string
      elementType?: string
      elementSource?: unknown
      rawMessage?: Array<{ type: string, data: Record<string, string> }>
    } | undefined
    app.middleware((session) => {
      const onebot = (session as typeof session & {
        onebot?: { message?: Array<{ type: string, data: Record<string, string> }> }
      }).onebot
      receivedSession = {
        content: session.content,
        elementType: session.elements?.[0]?.type,
        elementSource: session.elements?.[0]?.attrs.src,
        rawMessage: onebot?.message,
      }
    })
    await app.start()
    if (!control) throw new Error('沙盒控制服务未注册')

    const result = await control.sendMediaMessage({
      actorUserId: '10001',
      botId: '20001',
      conversationId: 'private:10001:20001',
      fileName: '测试图片.png',
      mimeType: 'image/png',
      dataBase64: Buffer.from('image-content').toString('base64'),
    })

    const message = control.getSnapshot().messages.find(({ id }) => id === result.messageId)
    expect(message).toEqual(expect.objectContaining({
      content: '[图片] 测试图片.png',
      media: [expect.objectContaining({
        type: 'image',
        name: '测试图片.png',
        mimeType: 'image/png',
        size: 13,
        reference: expect.stringMatching(/^sandbox-media:\/\//),
      })],
    }))
    expect(JSON.stringify(control.getSnapshot())).not.toContain('aW1hZ2UtY29udGVudA==')
    expect(receivedSession).toEqual(expect.objectContaining({
      content: expect.stringContaining('<img'),
      elementType: 'img',
      elementSource: message?.media?.[0].reference,
      rawMessage: [{ type: 'image', data: { file: message?.media?.[0].reference } }],
    }))
    expect(control.getMediaContent({
      actorUserId: '10001',
      mediaId: message?.media?.[0].id ?? '',
    }).dataBase64).toBe('aW1hZ2UtY29udGVudA==')
    await unlink(join(mediaDirectory, message?.media?.[0].id ?? ''))
    expect(() => control!.getMediaContent({
      actorUserId: '10001',
      mediaId: message?.media?.[0].id ?? '',
    })).toThrow('媒体文件不存在')
  })

  it('拒绝不支持或超限的媒体内容', async () => {
    const app = new App()
    const mediaDirectory = await mkdtemp(join(tmpdir(), 'onebot-sandbox-media-'))
    temporaryDirectories.push(mediaDirectory)
    let control: SandboxControlService | undefined
    app.plugin((ctx) => {
      control = new SandboxControlService(ctx, { mediaDirectory })
    })
    runningApps.push(app)
    await app.start()
    if (!control) throw new Error('沙盒控制服务未注册')

    const baseInput = {
      actorUserId: '10001',
      botId: '20001',
      conversationId: 'private:10001:20001',
      fileName: '测试文件.exe',
      dataBase64: Buffer.alloc(10 * 1024 * 1024 + 1).toString('base64'),
    }
    await expect(control.sendMediaMessage({ ...baseInput, mimeType: 'application/x-msdownload' }))
      .rejects.toThrow('不支持的媒体类型')
    await expect(control.sendMediaMessage({ ...baseInput, fileName: '测试文件.txt', mimeType: 'text/plain' }))
      .rejects.toThrow('媒体大小不能超过')
    expect(control.getSnapshot().messages).toEqual([])
    expect(await readdir(mediaDirectory)).toEqual([])
  })

  it('将文件、语音和视频映射为对应的 Koishi 元素与 OneBot 消息段', async () => {
    const app = new App()
    const mediaDirectory = await mkdtemp(join(tmpdir(), 'onebot-sandbox-media-'))
    temporaryDirectories.push(mediaDirectory)
    let control: SandboxControlService | undefined
    app.plugin((ctx) => {
      control = new SandboxControlService(ctx, { mediaDirectory })
    })
    runningApps.push(app)

    const received: Array<{ elementType?: string; onebotType?: string }> = []
    app.middleware((session) => {
      const onebot = (session as typeof session & {
        onebot?: { message?: Array<{ type: string }> }
      }).onebot
      received.push({
        elementType: session.elements?.[0]?.type,
        onebotType: onebot?.message?.[0]?.type,
      })
    })
    await app.start()
    if (!control) throw new Error('沙盒控制服务未注册')

    for (const media of [
      { fileName: '说明.txt', mimeType: 'text/plain' },
      { fileName: '语音.mp3', mimeType: 'audio/mpeg' },
      { fileName: '视频.mp4', mimeType: 'video/mp4' },
    ]) {
      await control.sendMediaMessage({
        actorUserId: '10001',
        botId: '20001',
        conversationId: 'private:10001:20001',
        ...media,
        dataBase64: Buffer.from(media.fileName).toString('base64'),
      })
    }

    expect(received).toEqual([
      { elementType: 'file', onebotType: 'file' },
      { elementType: 'audio', onebotType: 'record' },
      { elementType: 'video', onebotType: 'video' },
    ])
  })

  it('删除媒体消息所属会话并重新启动内存场景时清理媒体文件', async () => {
    const app = new App()
    const mediaDirectory = await mkdtemp(join(tmpdir(), 'onebot-sandbox-media-'))
    temporaryDirectories.push(mediaDirectory)
    let control: SandboxControlService | undefined
    app.plugin((ctx) => {
      control = new SandboxControlService(ctx, { mediaDirectory })
    })
    runningApps.push(app)
    await app.start()
    if (!control) throw new Error('沙盒控制服务未注册')

    await control.sendMediaMessage({
      actorUserId: '10001',
      botId: '20001',
      conversationId: 'private:10001:20001',
      fileName: '待清理图片.png',
      mimeType: 'image/png',
      dataBase64: Buffer.from('orphan-image').toString('base64'),
    })
    expect(await readdir(mediaDirectory)).toHaveLength(1)
    control.deleteUser({ id: '10001' })
    expect(await readdir(mediaDirectory)).toEqual([])

    await control.sendMediaMessage({
      actorUserId: '10002',
      botId: '20001',
      conversationId: 'private:10002:20001',
      fileName: '重启前图片.png',
      mimeType: 'image/png',
      dataBase64: Buffer.from('restart-image').toString('base64'),
    })
    expect(await readdir(mediaDirectory)).toHaveLength(1)

    const restartedApp = new App()
    restartedApp.plugin((ctx) => {
      new SandboxControlService(ctx, { mediaDirectory })
    })
    runningApps.push(restartedApp)
    expect(await readdir(mediaDirectory)).toEqual([])
  })

  it('只返回当前用户可见会话，并按会话有界读取历史', async () => {
    const app = new App()
    let control: SandboxControlService | undefined
    app.plugin((ctx) => {
      control = new SandboxControlService(ctx)
    })
    runningApps.push(app)
    await app.start()
    if (!control) throw new Error('沙盒控制服务未注册')

    control.recordBotMessage('private:10001:20001', '第一条')
    control.recordBotMessage('private:10001:20001', '第二条')
    control.recordBotMessage('private:10002:20001', '其他用户消息')

    const visible = control.getVisibleSnapshot('10001', 1)
    expect(visible.conversations.every(({ userId }) => userId === '10001')).toBe(true)
    expect(visible.messages.map(({ content }) => content)).toEqual(['第二条'])
    expect(visible.conversations.find(({ id }) => id === 'private:10001:20001')?.messageIds).toEqual([
      visible.messages[0].id,
    ])

    const latest = control.getMessageHistory({
      actorUserId: '10001',
      conversationId: 'private:10001:20001',
      limit: 1,
    })
    expect(latest.messages.map(({ content }) => content)).toEqual(['第二条'])
    expect(latest.nextBeforeMessageId).toBe(latest.messages[0].id)

    const previous = control.getMessageHistory({
      actorUserId: '10001',
      conversationId: 'private:10001:20001',
      beforeMessageId: latest.nextBeforeMessageId,
      limit: 1,
    })
    expect(previous.messages.map(({ content }) => content)).toEqual(['第一条'])
    expect(previous.nextBeforeMessageId).toBeUndefined()
    expect(() => control!.getMessageHistory({
      actorUserId: '10002',
      conversationId: 'private:10001:20001',
      limit: 20,
    })).toThrow('会话不存在')
  })

  it('保留回复关系并由目标机器人生成对应 Session 与回复', async () => {
    const app = new App()
    let control: SandboxControlService | undefined
    app.plugin((ctx) => {
      control = new SandboxControlService(ctx)
    })
    runningApps.push(app)

    const sessions: Array<{
      selfId?: string
      messageId?: string
      quoteId?: string
      rawSelfId?: number
      rawUserId?: number
      rawMessageType?: string
      rawMessage?: Array<{ type: string, data: Record<string, string> }>
    }> = []
    app.middleware((session) => {
      const onebot = (session as typeof session & {
        onebot?: {
          self_id?: number
          user_id?: number
          message_type?: string
          message?: Array<{ type: string, data: Record<string, string> }>
        }
      }).onebot
      sessions.push({
        selfId: session.selfId,
        messageId: session.messageId,
        quoteId: session.quote?.id,
        rawSelfId: onebot?.self_id,
        rawUserId: onebot?.user_id,
        rawMessageType: onebot?.message_type,
        rawMessage: onebot?.message,
      })
      return `回复：${session.content}`
    })
    await app.start()
    if (!control) throw new Error('沙盒控制服务未注册')

    control.createBot({ id: '20002', name: 'LLBot 测试机器人', implementation: 'llbot', enabled: true })
    const first = await control.sendMessage({
      actorUserId: '10001',
      botId: '20002',
      conversationId: 'private:10001:20002',
      content: '第一条',
    })
    const second = await control.sendMessage({
      actorUserId: '10001',
      botId: '20002',
      conversationId: 'private:10001:20002',
      content: '引用回复',
      replyToMessageId: first.messageId,
    })

    expect(sessions).toEqual([
      expect.objectContaining({ selfId: '20002', messageId: first.messageId, rawSelfId: 20002, rawUserId: 10001, rawMessageType: 'private' }),
      expect.objectContaining({
        selfId: '20002',
        messageId: second.messageId,
        quoteId: first.messageId,
        rawSelfId: 20002,
        rawUserId: 10001,
        rawMessageType: 'private',
        rawMessage: [
          { type: 'reply', data: { id: first.messageId } },
          { type: 'text', data: { text: '引用回复' } },
        ],
      }),
    ])
    expect(control.getSnapshot().messages).toContainEqual(expect.objectContaining({
      id: second.messageId,
      botId: '20002',
      replyToMessageId: first.messageId,
    }))
  })

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
    await expect(control.sendMessage({
      actorUserId: '10004',
      botId: '20001',
      conversationId: 'group:30001:10001:20001',
      content: '非成员消息',
    })).rejects.toThrow('会话不存在')
  })
})
