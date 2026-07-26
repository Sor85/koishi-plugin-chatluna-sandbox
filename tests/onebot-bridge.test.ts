import { App, h, Universal } from '@koishijs/core'
import { afterEach, describe, expect, it } from 'vitest'
import { SandboxControlService } from '../src/control-service'

const runningApps: App[] = []

afterEach(async () => {
  await Promise.all(runningApps.splice(0).map((app) => app.stop()))
})

async function createControl() {
  const app = new App()
  let control: SandboxControlService | undefined
  app.plugin((ctx) => {
    control = new SandboxControlService(ctx)
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
      data: { message_id: string }
    }
    expect(control.getSnapshot().messages.find(({ id }) => id === privateResult.data.message_id)).toMatchObject({
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
      data: { message_id: string }
    }
    await expect(bot.internal._request('get_msg', { message_id: privateResult.data.message_id })).resolves.toMatchObject({
      status: 'ok',
      retcode: 0,
      data: { message_id: privateResult.data.message_id, message_type: 'private', raw_message: '原始私聊消息' },
    })

    const groupResult = await bot.internal._request('send_group_msg', { group_id: 30001, message: [{ type: 'text', data: { text: '群广播' } }] }) as {
      data: { message_id: string }
    }
    expect(control.getSnapshot().messages.filter(({ content }) => content === '群广播')).toHaveLength(1)

    await bot.internal._request('delete_msg', { message_id: groupResult.data.message_id })
    expect(control.getSnapshot().messages.some(({ content }) => content === '群广播')).toBe(false)
    await bot.deleteMessage('private:10001:20001', standardMessageId)
    expect(control.getSnapshot().messages.some(({ id }) => id === standardMessageId)).toBe(false)
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

    const sent = await bot.internal._request('send_group_msg', { group_id: 30002, message: '表情回应目标' }) as { data: { message_id: string } }
    await expect(bot.internal._request('set_msg_emoji_like', { message_id: sent.data.message_id, emoji_id: '128077' })).resolves.toMatchObject({ status: 'ok' })

    await bot.internal._request('send_forward_msg', { group_id: 30002, messages: [
      { type: 'node', data: { user_id: 20001, nickname: 'Koishi', content: '第一段' } },
      { type: 'node', data: { user_id: 20001, nickname: 'Koishi', content: [{ type: 'text', data: { text: '第二段' } }] } },
    ] })
    expect(control.getSnapshot().messages.at(-1)).toMatchObject({ authorId: '20001', content: '第一段\n第二段' })

    await expect(bot.internal._request('set_group_leave', { group_id: 30002 })).resolves.toMatchObject({ status: 'ok' })
    expect(control.getSnapshot().groups.find(({ id }) => id === '30002')!.members.some(({ participantId }) => participantId === '20001')).toBe(false)
  })
})
