import { mkdtempSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { App, h, Universal } from '@koishijs/core'
import { afterEach, describe, expect, it } from 'vitest'
import { SandboxControlService } from '../src/control-service'
import { MAX_MEDIA_SIZE } from '../src/media-storage'
import { getOneBotMessageSequence } from '../src/onebot-profiles'

const runningApps: App[] = []
const runningServers: Server[] = []

afterEach(async () => {
  await Promise.all(runningApps.splice(0).map((app) => app.stop()))
  await Promise.all(runningServers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  })))
})

async function createMediaServer(): Promise<string> {
  const server = createServer((request, response) => {
    if (request.url === '/sticker') {
      const content = Buffer.from('remote-sticker')
      response.writeHead(200, {
        'content-type': 'image/png; charset=binary',
        'content-length': String(content.length),
      })
      response.end(content)
      return
    }
    if (request.url === '/text') {
      response.writeHead(200, { 'content-type': 'text/plain' })
      response.end('not an image')
      return
    }
    if (request.url === '/too-large') {
      response.writeHead(200, {
        'content-type': 'image/png',
        'content-length': String(MAX_MEDIA_SIZE + 1),
      })
      response.end()
      return
    }
    response.writeHead(404)
    response.end()
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })
  runningServers.push(server)
  const address = server.address() as AddressInfo
  return `http://127.0.0.1:${address.port}`
}

async function createControl() {
  const app = new App()
  let control: SandboxControlService | undefined
  app.plugin((ctx) => {
    // 不传 mediaDirectory 时所有测试进程共享仓库内同一媒体目录，而控制服务构造/销毁都会 clear()
    // 该目录，vitest 并行跑测试文件时会互相删掉对方刚写入的媒体文件，造成偶发 ENOENT。
    control = new SandboxControlService(ctx, { mediaDirectory: mkdtempSync(join(tmpdir(), 'onebot-bridge-media-')) })
  })
  runningApps.push(app)
  await app.start()
  if (!control) throw new Error('沙盒控制服务未注册')
  return { app, control }
}

describe('Koishi 与 OneBot 机器人桥接', () => {
  it('后置中间件回复会写回原会话，并保留图片消息段', async () => {
    const { app, control } = await createControl()
    const imageSource = `data:image/png;base64,${Buffer.from('reply-image').toString('base64')}`
    app.middleware((session, next) => next(async (nextMiddleware) => {
      if (session.selfId !== '20001' || session.userId !== '10001') return nextMiddleware?.()
      await session.sendQueued(h.image(imageSource), 0)
    }))

    await control.sendMessage({
      operatorId: '10001',
      conversationId: 'private:10001:20001',
      content: '触发机器人回复',
    })

    const messages = control.getSnapshot().messages
    expect(messages).toHaveLength(2)
    expect(messages[1]).toMatchObject({
      authorId: '20001',
      conversationId: 'private:10001:20001',
      content: '[图片] image.png',
      media: [expect.objectContaining({
        type: 'image',
        name: 'image.png',
        mimeType: 'image/png',
        reference: expect.stringMatching(/^sandbox-media:\/\//),
      })],
    })
    expect(control.getMediaContent({ operatorId: '10001', mediaId: messages[1].media![0].id })).toMatchObject({
      mimeType: 'image/png',
      dataBase64: Buffer.from('reply-image').toString('base64'),
    })
    await expect(control.bot.internal._request('get_friend_msg_history', {
      user_id: 10001,
      message_seq: 0,
      count: 30,
    })).resolves.toMatchObject({
      data: {
        messages: [
          expect.objectContaining({ message: [{ type: 'text', data: { text: '触发机器人回复' } }] }),
          expect.objectContaining({ message: [{ type: 'image', data: expect.objectContaining({ url: expect.stringMatching(/^sandbox-media:\/\//) }) }] }),
        ],
      },
    })
  })

  it('机器人发送的 execute 组件先执行命令再写入图片结果', async () => {
    const { app, control } = await createControl()
    const imageSource = `data:image/png;base64,${Buffer.from('execute-image').toString('base64')}`
    app.command('sandbox.execute-test').action(() => h.image(imageSource))
    app.middleware((session) => {
      if (session.content === '触发 execute') return '<execute>sandbox.execute-test</execute>'
    })

    await control.sendMessage({
      operatorId: '10001',
      conversationId: 'private:10001:20001',
      content: '触发 execute',
    })

    expect(control.getSnapshot().messages).toEqual([
      expect.objectContaining({ content: '触发 execute', authorId: '10001' }),
      expect.objectContaining({
        content: '[图片] image.png',
        authorId: '20001',
        media: [expect.objectContaining({
          type: 'image',
          mimeType: 'image/png',
          reference: expect.stringMatching(/^sandbox-media:\/\//),
        })],
      }),
    ])
  })

  it('群聊消息提供昵称唤醒所需的标准 Session 字段', async () => {
    const { app, control } = await createControl()
    let captured: {
      guildId?: string
      channelId?: string
      isDirect?: boolean
      selfId?: string
      userId?: string
      content?: string
      text?: string
    } | undefined
    app.middleware((session) => {
      if (session.channelId !== 'group:30001') return
      captured = {
        guildId: session.guildId,
        channelId: session.channelId,
        isDirect: session.isDirect,
        selfId: session.selfId,
        userId: session.userId,
        content: session.content,
        text: (session.elements ?? []).filter(({ type }) => type === 'text').map(({ attrs }) => attrs.content ?? '').join(''),
      }
      if (captured.text?.startsWith('宁宁')) return '群聊昵称回复'
    })

    await control.sendMessage({
      operatorId: '10001',
      conversationId: 'group:30001',
      content: '宁宁你好',
    })

    expect(captured).toEqual({
      guildId: '30001',
      channelId: 'group:30001',
      isDirect: false,
      selfId: '20001',
      userId: '10001',
      content: '宁宁你好',
      text: '宁宁你好',
    })
    expect(control.getSnapshot().messages.at(-1)).toMatchObject({
      authorId: '20001',
      conversationId: 'group:30001',
      content: '群聊昵称回复',
    })
  })

  it('多个机器人始终使用各自真实 selfId 处理协议事件与 action', async () => {
    const { app, control } = await createControl()
    control.createBot({ id: '20002', name: '第二机器人', implementation: 'llbot', enabled: true })
    const secondBot = control.getRuntimeBot('20002')
    const group = control.getSnapshot().groups[0]
    control.updateGroup({
      id: group.id,
      name: group.name,
      members: [...group.members, { participantId: '20002', role: 'admin' }],
    })
    const received: Array<{ selfId?: string; rawSelfId?: number; messageId?: string }> = []
    app.middleware((session) => {
      received.push({
        selfId: session.selfId,
        rawSelfId: (session as typeof session & { onebot?: { self_id?: number } }).onebot?.self_id,
        messageId: session.messageId,
      })
    })

    expect(secondBot.selfId).toBe('20002')
    await expect(secondBot.internal._request('get_login_info', {})).resolves.toEqual({
      status: 'ok',
      retcode: 0,
      data: { user_id: 20002, nickname: '第二机器人' },
    })
    const sent = await control.sendMessage({ operatorId: '10001', conversationId: 'group:30001', content: '多机器人事件' })
    expect(received).toEqual(expect.arrayContaining([
      { selfId: '20001', rawSelfId: 20001, messageId: sent.messageId },
      { selfId: '20002', rawSelfId: 20002, messageId: sent.messageId },
    ]))

    await secondBot.internal._request('set_qq_profile', { nickname: '第二机器人新昵称' })
    expect(control.getSnapshot().participants.find(({ id }) => id === '20002')).toMatchObject({ name: '第二机器人新昵称' })
    expect(control.getSnapshot().participants.find(({ id }) => id === '20001')).toMatchObject({ name: 'Koishi' })

    const privateResult = await secondBot.internal._request('send_private_msg', { user_id: 10001, message: '机器人主动私聊' }) as {
      data: { message_id: number }
    }
    expect(control.getSnapshot().messages.find(({ id }) => getOneBotMessageSequence(id) === privateResult.data.message_id)).toMatchObject({
      authorId: '20002',
      conversationId: 'private:10001:20002',
    })
  })

  it('机器人注册为在线 OneBot Bot，并通过 action 修改共享资料', async () => {
    const { control } = await createControl()
    const bot = control.bot

    expect(bot.platform).toBe('onebot')
    expect(bot.selfId).toBe('20001')
    expect(bot.status).toBe(Universal.Status.ONLINE)
    expect(await bot.internal._request('get_status', {})).toEqual({
      status: 'ok',
      retcode: 0,
      data: { online: true, good: true },
    })
    await expect((bot.internal as unknown as { get_status(): Promise<unknown> }).get_status()).resolves.toMatchObject({ status: 'ok', retcode: 0 })
    expect(await bot.internal._request('get_login_info', {})).toEqual({
      status: 'ok',
      retcode: 0,
      data: { user_id: 20001, nickname: 'Koishi' },
    })

    await bot.internal._request('set_qq_profile', { nickname: '新 Koishi' })
    await bot.internal._request('set_qq_avatar', { file: 'https://example.com/koishi.png' })

    expect(control.getSnapshot().participants.find(({ id }) => id === '20001')).toMatchObject({
      kind: 'bot',
      id: '20001',
      name: '新 Koishi',
      avatar: 'https://example.com/koishi.png',
    })
    expect(bot.user).toMatchObject({
      id: '20001',
      name: '新 Koishi',
      avatar: 'https://example.com/koishi.png',
    })

    control.updateBot({ id: '20001', name: '新 Koishi', implementation: 'napcat', enabled: false })
    await expect(bot.internal._request('get_status', {})).resolves.toMatchObject({ data: { online: false, good: false } })
    await expect(bot.sendPrivateMessage('10001', '离线消息')).rejects.toThrow('机器人已离线')
  })

  it('标准 Koishi 查询与 OneBot 查询读取同一批好友和群资料', async () => {
    const { control } = await createControl()
    const bot = control.bot

    await expect(bot.getUser('10001')).resolves.toMatchObject({ id: '10001', name: '测试用户1', isBot: false })
    await expect(bot.getFriendList()).resolves.toMatchObject({
      data: expect.arrayContaining([expect.objectContaining({ user: expect.objectContaining({ id: '10001', name: '测试用户1' }) })]),
    })
    await expect(bot.getGuildList()).resolves.toEqual({ data: [{ id: '30001', name: '测试群' }] })
    await expect(bot.getGuildMember('30001', '10002')).resolves.toMatchObject({
      user: { id: '10002', name: '测试用户2', isBot: false },
      nick: '测试用户2',
      roles: [{ id: 'admin', name: '管理员' }],
    })

    await expect(bot.internal._request('get_friend_list', {})).resolves.toMatchObject({
      status: 'ok',
      retcode: 0,
      data: expect.arrayContaining([expect.objectContaining({ user_id: 10001, nickname: '测试用户1' })]),
    })
    await expect(bot.internal._request('get_group_list', {})).resolves.toEqual({
      status: 'ok',
      retcode: 0,
      data: [{ group_id: 30001, group_name: '测试群', member_count: 4, max_member_count: 4 }],
    })
    await expect(bot.internal._request('get_group_member_info', { group_id: 30001, user_id: 10002 })).resolves.toMatchObject({
      status: 'ok',
      retcode: 0,
      data: { group_id: 30001, user_id: 10002, nickname: '测试用户2', card: '测试用户2', role: 'admin' },
    })
    await expect(bot.internal.getGroupMemberList('group:30001')).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ group_id: 30001, user_id: 10002, role: 'admin' }),
    ]))
    await expect(bot.internal.getGroupMemberInfo('group:30001', 10002)).resolves.toMatchObject({
      group_id: 30001,
      user_id: 10002,
      role: 'admin',
    })
    await expect(bot.internal._request('get_version_info', {})).resolves.toEqual({
      status: 'ok',
      retcode: 0,
      data: { app_name: 'NapCat.Onebot', app_version: 'sandbox-2026.07.24', protocol_version: 'v11' },
    })
  })

  it('标准与原始消息 action 写入、读取并撤回同一共享消息', async () => {
    const { control } = await createControl()
    const bot = control.bot

    const [standardMessageId] = await bot.sendPrivateMessage('10001', '标准私聊消息')
    await expect(bot.getMessage('private:10001:20001', standardMessageId)).resolves.toMatchObject({
      id: standardMessageId,
      content: '标准私聊消息',
      user: { id: '20001', name: 'Koishi', isBot: true },
    })

    const privateResult = await bot.internal._request('send_private_msg', { user_id: 10001, message: '原始私聊消息' }) as {
      data: { message_id: number }
    }
    await expect(bot.internal._request('get_msg', { message_id: privateResult.data.message_id })).resolves.toMatchObject({
      status: 'ok',
      retcode: 0,
      data: { message_id: privateResult.data.message_id, message_type: 'private', raw_message: '原始私聊消息' },
    })

    const groupResult = await bot.internal._request('send_group_msg', { group_id: 30001, message: [{ type: 'text', data: { text: '群广播' } }] }) as {
      data: { message_id: number }
    }
    expect(control.getSnapshot().messages.filter(({ content }) => content === '群广播')).toHaveLength(1)

    await bot.internal._request('delete_msg', { message_id: groupResult.data.message_id })
    expect(control.getSnapshot().messages.find(({ id }) => getOneBotMessageSequence(id) === groupResult.data.message_id)).toEqual(expect.objectContaining({
      content: '群广播',
      lifecycle: expect.objectContaining({ status: 'recalled', operatorId: '20001' }),
    }))
    await bot.deleteMessage('private:10001:20001', standardMessageId)
    expect(control.getSnapshot().messages.find(({ id }) => id === standardMessageId)).toEqual(expect.objectContaining({
      lifecycle: expect.objectContaining({ status: 'recalled', operatorId: '20001' }),
    }))
    await expect(bot.internal._request('get_msg', { message_id: groupResult.data.message_id }))
      .rejects.toThrow(/消息已撤回|消息不存在/)
  })

  it('OneBot 数字 MessageId 支持查询、引用与图片消息闭环', async () => {
    const { control } = await createControl()
    const bot = control.bot
    const imageBase64 = Buffer.from('onebot-image').toString('base64')
    const quoted = await control.sendMessage({
      operatorId: '10001',
      conversationId: 'group:30001',
      content: '需要引用的消息',
    })
    const quotedSequence = getOneBotMessageSequence(quoted.messageId)

    await expect(bot.internal._request('get_msg', { message_id: quotedSequence })).resolves.toMatchObject({
      status: 'ok',
      data: { message_id: quotedSequence, raw_message: '需要引用的消息' },
    })

    const groupResult = await bot.internal._request('send_group_msg', {
      group_id: 30001,
      message: [
        { type: 'reply', data: { id: String(quotedSequence) } },
        { type: 'text', data: { text: '带图片的引用回复' } },
        { type: 'image', data: { file: `data:image/png;base64,${imageBase64}` } },
      ],
    }) as { data: { message_id: number } }
    const groupMessage = control.getSnapshot().messages.find(({ id }) => getOneBotMessageSequence(id) === groupResult.data.message_id)
    expect(groupMessage).toMatchObject({
      authorId: '20001',
      conversationId: 'group:30001',
      content: '带图片的引用回复',
      replyToMessageId: quoted.messageId,
      media: [expect.objectContaining({ type: 'image', mimeType: 'image/png' })],
    })
    expect(groupMessage?.content).not.toContain('[CQ:image]')
    await expect(bot.internal._request('get_msg', { message_id: groupResult.data.message_id })).resolves.toMatchObject({
      data: {
        message_id: groupResult.data.message_id,
        message: [
          { type: 'reply', data: { id: String(quotedSequence) } },
          { type: 'image', data: expect.objectContaining({ file: expect.stringMatching(/^sandbox-media:\/\//) }) },
          { type: 'text', data: { text: '带图片的引用回复' } },
        ],
      },
    })

    const privateResult = await bot.internal._request('send_private_msg', {
      user_id: 10001,
      message: [{ type: 'image', data: { file: `base64://${imageBase64}` } }],
    }) as { data: { message_id: number } }
    const privateMessage = control.getSnapshot().messages.find(({ id }) => getOneBotMessageSequence(id) === privateResult.data.message_id)
    expect(privateMessage).toMatchObject({
      authorId: '20001',
      conversationId: 'private:10001:20001',
      content: '[图片] image.png',
      media: [expect.objectContaining({ type: 'image', mimeType: 'image/png' })],
    })

    const sourceReference = groupMessage?.media?.[0].reference
    expect(sourceReference).toMatch(/^sandbox-media:\/\//)
    const copyResult = await bot.internal._request('send_group_msg', {
      group_id: 30001,
      message: [{ type: 'image', data: { file: sourceReference } }],
    }) as { data: { message_id: number } }
    const copiedMessage = control.getSnapshot().messages.find(({ id }) => getOneBotMessageSequence(id) === copyResult.data.message_id)
    expect(copiedMessage?.media?.[0]).toMatchObject({ type: 'image', mimeType: 'image/png' })
    expect(copiedMessage?.media?.[0].id).not.toBe(groupMessage?.media?.[0].id)

    const [quotedReplyId] = await bot.sendMessage('group:30001', [
      h('quote', { id: quoted.messageId }),
      h.text('标准 Koishi 引用'),
    ])
    expect(control.getSnapshot().messages.find(({ id }) => id === quotedReplyId)).toMatchObject({
      replyToMessageId: quoted.messageId,
      content: '标准 Koishi 引用',
    })

    const mediaServer = await createMediaServer()
    const remoteResult = await bot.internal._request('send_group_msg', {
      group_id: 30001,
      message: [{ type: 'sticker', data: { url: `${mediaServer}/sticker` } }],
    }) as { data: { message_id: number } }
    const remoteMessage = control.getSnapshot().messages.find(({ id }) => getOneBotMessageSequence(id) === remoteResult.data.message_id)
    expect(remoteMessage).toMatchObject({
      content: '[图片] image.png',
      media: [expect.objectContaining({ type: 'image', mimeType: 'image/png', size: 14 })],
    })
    expect(remoteMessage?.content).not.toContain('[CQ:sticker]')
    const remoteMedia = remoteMessage?.media?.[0]
    if (!remoteMedia) throw new Error('远程表情未写入媒体')
    expect(Buffer.from(control.getMediaContent({ operatorId: '20001', mediaId: remoteMedia.id }).dataBase64, 'base64').toString()).toBe('remote-sticker')
    await expect(bot.internal._request('get_msg', { message_id: remoteResult.data.message_id })).resolves.toMatchObject({
      data: {
        message_id: remoteResult.data.message_id,
        message: [{ type: 'image', data: expect.objectContaining({ file: remoteMedia.reference }) }],
      },
    })

    const beforeFailure = control.getSnapshot().messages.length
    for (const [path, error] of [
      ['/missing', '下载远程媒体失败'],
      ['/text', '媒体类型不匹配'],
      ['/too-large', '媒体大小不能超过 10 MB'],
    ] as const) {
      await expect(bot.internal._request('send_group_msg', {
        group_id: 30001,
        message: [{ type: 'image', data: { file: `${mediaServer}${path}` } }],
      })).rejects.toThrow(error)
      expect(control.getSnapshot().messages).toHaveLength(beforeFailure)
    }
  })

  it('机器人通过标准方法和 OneBot action 处理申请与群管理', async () => {
    const { control } = await createControl()
    const bot = control.bot
    control.createUser({ id: '10004', name: '申请用户' })
    await control.performFriendAction({ action: 'delete', operatorId: '10004', targetId: '20001' })
    const friendRequest = await control.performFriendAction({ action: 'request', operatorId: '10004', targetId: '20001' })
    if (!friendRequest.requestId) throw new Error('好友申请未创建')

    await bot.handleFriendRequest(friendRequest.requestId, true, '申请用户')
    expect(control.getSnapshot().friendships.some(({ participantIds }) => participantIds.includes('10004') && participantIds.includes('20001'))).toBe(true)

    const groupRequest = await control.performGroupAction({ action: 'request-join', operatorId: '10004', groupId: '30001' })
    if (!groupRequest.requestId) throw new Error('入群申请未创建')
    await bot.handleGuildMemberRequest(groupRequest.requestId, true)
    expect(control.getSnapshot().groups[0].members).toContainEqual({ participantId: '10004', role: 'member' })

    await bot.internal._request('set_group_card', { group_id: 30001, user_id: 10003, card: '新成员名片' })
    await bot.internal._request('set_group_name', { group_id: 30001, group_name: '机器人管理群' })
    expect(control.getSnapshot().groups[0]).toMatchObject({
      name: '机器人管理群',
      members: expect.arrayContaining([expect.objectContaining({ participantId: '10003', card: '新成员名片' })]),
    })

    await bot.kickGuildMember('30001', '10003')
    expect(control.getSnapshot().groups[0].members.some(({ participantId }) => participantId === '10003')).toBe(false)
  })

  it('关系和成员变化同时产生标准 Koishi 事件与 OneBot 原始数据', async () => {
    const { app, control } = await createControl()
    const standardEvents: Array<{ type?: string; userId?: string; guildId?: string; rawType?: string }> = []
    const rawNotices: string[] = []
    const listen = (name: string) => {
      ;(app.on as unknown as (name: string, listener: (session: unknown) => void) => void)(name, (session) => {
        const value = session as { type?: string; userId?: string; guildId?: string; onebot?: { notice_type?: string; request_type?: string } }
        standardEvents.push({
          type: value.type,
          userId: value.userId,
          guildId: value.guildId,
          rawType: value.onebot?.notice_type ?? value.onebot?.request_type,
        })
      })
    }
    for (const name of ['friend-request', 'guild-request', 'guild-member-added', 'guild-member-updated', 'guild-updated', 'guild-member-removed']) listen(name)
    ;(app.on as unknown as (name: string, listener: (session: unknown) => void) => void)('notice', (session) => {
      const value = session as { onebot?: { notice_type?: string } }
      if (value.onebot?.notice_type) rawNotices.push(value.onebot.notice_type)
    })

    control.createUser({ id: '10004', name: '申请用户' })
    await control.performFriendAction({ action: 'delete', operatorId: '10004', targetId: '20001' })
    await control.performFriendAction({ action: 'request', operatorId: '10004', targetId: '20001' })
    const groupRequest = await control.performGroupAction({ action: 'request-join', operatorId: '10004', groupId: '30001' })
    if (!groupRequest.requestId) throw new Error('入群申请未创建')
    await control.bot.handleGuildMemberRequest(groupRequest.requestId, true)
    await control.bot.internal._request('set_group_card', { group_id: 30001, user_id: 10003, card: '新名片' })
    await control.bot.internal._request('set_group_name', { group_id: 30001, group_name: '新群名称' })
    await control.bot.kickGuildMember('30001', '10003')

    expect(standardEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'friend-request', userId: '10004', rawType: 'friend' }),
      expect.objectContaining({ type: 'guild-request', userId: '10004', guildId: '30001', rawType: 'group' }),
      expect.objectContaining({ type: 'guild-member-added', userId: '10004', guildId: '30001', rawType: 'group_increase' }),
      expect.objectContaining({ type: 'guild-member-updated', userId: '10003', guildId: '30001', rawType: 'group_card' }),
      expect.objectContaining({ type: 'guild-updated', guildId: '30001', rawType: 'group_name' }),
      expect.objectContaining({ type: 'guild-member-removed', userId: '10003', guildId: '30001', rawType: 'group_decrease' }),
    ]))
    expect(rawNotices).toEqual(expect.arrayContaining(['group_increase', 'group_card', 'group_name', 'group_decrease']))
  })

  it('NapCat 扩展群管理与合并转发 action 走沙盒域逻辑', async () => {
    const { control } = await createControl()
    const bot = control.bot
    control.createGroup({ id: '30002', name: '扩展测试群', members: [
      { participantId: '10001', role: 'owner' },
      { participantId: '20001', role: 'admin' },
      { participantId: '10003', role: 'member' },
    ] })

    await expect(bot.internal._request('set_group_ban', { group_id: 30002, user_id: 10003, duration: 600 })).resolves.toMatchObject({ status: 'ok' })
    await expect(bot.internal._request('set_group_special_title', { group_id: 30002, user_id: 10003, special_title: '头衔' })).rejects.toThrow('只有群主可以设置专属头衔')

    const sent = await bot.internal._request('send_group_msg', { group_id: 30002, message: '表情回应目标' }) as { data: { message_id: number } }
    await expect(bot.internal._request('set_msg_emoji_like', { message_id: sent.data.message_id, emoji_id: '128077' })).resolves.toMatchObject({ status: 'ok' })

    await bot.internal._request('send_forward_msg', { group_id: 30002, messages: [
      { type: 'node', data: { user_id: 20001, nickname: 'Koishi', content: '第一段' } },
      { type: 'node', data: { user_id: 20001, nickname: 'Koishi', content: [{ type: 'text', data: { text: '第二段' } }] } },
    ] })
    expect(control.getSnapshot().messages.at(-1)).toMatchObject({ authorId: '20001', content: '第一段\n第二段' })

    await expect(bot.internal._request('set_group_leave', { group_id: 30002 })).resolves.toMatchObject({ status: 'ok' })
    expect(control.getSnapshot().groups.find(({ id }) => id === '30002')!.members.some(({ participantId }) => participantId === '20001')).toBe(false)
  })

  it('群头衔、禁言与表情回应写入沙盒领域状态', async () => {
    const { control } = await createControl()
    const bot = control.bot
    control.createGroup({ id: '30003', name: '状态测试群', members: [
      { participantId: '20001', role: 'owner' },
      { participantId: '10001', role: 'admin' },
      { participantId: '10003', role: 'member' },
    ] })
    const getMember = (participantId: string) => control.getSnapshot().groups
      .find(({ id }) => id === '30003')!.members.find((member) => member.participantId === participantId)!

    await expect(bot.internal._request('set_group_special_title', { group_id: 30003, user_id: 10003, special_title: '荣誉成员' }))
      .resolves.toMatchObject({ status: 'ok' })
    expect(getMember('10003').title).toBe('荣誉成员')
    await expect(bot.internal._request('get_group_member_info', { group_id: 30003, user_id: 10003 }))
      .resolves.toMatchObject({ data: { title: '荣誉成员', shut_up_timestamp: 0 } })
    await bot.internal._request('set_group_special_title', { group_id: 30003, user_id: 10003, special_title: '' })
    expect(getMember('10003').title).toBeUndefined()

    await bot.internal._request('set_group_ban', { group_id: 30003, user_id: 10003, duration: 600 })
    const shutList = await bot.internal._request('get_group_shut_list', { group_id: 30003 }) as {
      data: Array<{ user_id: number; shut_up_timestamp: number }>
    }
    expect(shutList.data).toHaveLength(1)
    expect(shutList.data[0].user_id).toBe(10003)
    expect(shutList.data[0].shut_up_timestamp).toBeGreaterThan(Math.floor(Date.now() / 1000))
    await bot.internal._request('set_group_ban', { group_id: 30003, user_id: 10003, duration: 0 })
    await expect(bot.internal._request('get_group_shut_list', { group_id: 30003 })).resolves.toMatchObject({ data: [] })

    const sent = await bot.internal._request('send_group_msg', { group_id: 30003, message: '回应目标' }) as { data: { message_id: number } }
    await bot.internal._request('set_msg_emoji_like', { message_id: sent.data.message_id, emoji_id: '128077' })
    expect(control.getSnapshot().messages.at(-1)!.reactions).toEqual([{ emojiId: '128077', participantIds: ['20001'] }])
    await bot.internal._request('set_msg_emoji_like', { message_id: sent.data.message_id, emoji_id: '128077', set: false })
    expect(control.getSnapshot().messages.at(-1)!.reactions).toBeUndefined()
  })

  it('专属头衔只有群主可以授予且随场景替换保留', async () => {
    const { control } = await createControl()
    control.createGroup({ id: '30004', name: '头衔权限群', members: [
      { participantId: '10001', role: 'owner' },
      { participantId: '20001', role: 'admin' },
      { participantId: '10003', role: 'member' },
    ] })

    await expect(control.bot.internal._request('set_group_special_title', { group_id: 30004, user_id: 10003, special_title: '头衔' }))
      .rejects.toThrow('只有群主可以设置专属头衔')

    await control.performGroupAction({ action: 'set-title', operatorId: '10001', groupId: '30004', targetId: '10003', title: ' 元老 ' })
    const snapshot = control.getSnapshot()
    expect(snapshot.groups.find(({ id }) => id === '30004')!.members
      .find(({ participantId }) => participantId === '10003')!.title).toBe('元老')

    control.replaceScene(snapshot)
    expect(control.getSnapshot().groups.find(({ id }) => id === '30004')!.members
      .find(({ participantId }) => participantId === '10003')!.title).toBe('元老')
  })

  it('camelCase 便捷方法映射到真实 OneBot action 而不是未知 action', async () => {
    const { control } = await createControl()

    await expect(control.bot.internal.getGroupInfo(30001)).resolves.toMatchObject({
      group_id: 30001,
      group_name: '测试群',
    })
    expect(control.getOneBotDebugRecords({ direction: 'action' })[0]).toMatchObject({
      type: 'get_group_info',
      resolvedType: 'get_group_info',
      status: 'success',
    })
  })
})
