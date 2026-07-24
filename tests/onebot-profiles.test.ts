import { App } from '@koishijs/core'
import type { Session } from 'koishi'
import { afterEach, describe, expect, it } from 'vitest'
import { SandboxControlService } from '../src/control-service'
import { getOneBotProfileBaseline } from '../src/onebot-profiles'

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
  return control
}

describe('OneBot 实现配置', () => {
  it('维护带快照日期和来源版本的独立能力基线', () => {
    const napcat = getOneBotProfileBaseline('napcat')
    const llbot = getOneBotProfileBaseline('llbot')

    expect(napcat).toMatchObject({
      id: 'napcat',
      label: 'NapCat',
      snapshotDate: '2026-07-24',
      sourceRevision: '33546b936e008c017b2b9c1c41a0bb4f9e86c5be',
    })
    expect(llbot).toMatchObject({
      id: 'llbot',
      label: 'LLBot',
      snapshotDate: '2026-07-24',
      sourceRevision: 'd6e2f485b8164597d04a2907d307739ecfcf4a55',
    })
    expect(napcat.capabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'get_version_info', description: expect.any(String), surface: 'standard', supported: true }),
      expect.objectContaining({ action: 'set_qq_profile', description: expect.any(String), surface: 'native', supported: true }),
      expect.objectContaining({ action: 'send_poke', aliases: ['friend_poke', 'group_poke'], description: expect.stringContaining('戳一戳') }),
    ]))
    expect(llbot.capabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'get_version_info', description: expect.any(String), surface: 'standard', supported: true }),
      expect.objectContaining({ action: 'set_qq_avatar', description: expect.any(String), surface: 'native', supported: true }),
      expect.objectContaining({ action: 'send_poke', aliases: ['friend_poke', 'group_poke'], description: expect.stringContaining('戳一戳') }),
    ]))
    expect(napcat.capabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'group.notice.delete', action: '_del_group_notice', handler: 'delete_group_notice', supported: true }),
      expect.objectContaining({ id: 'group.member.kick-batch', action: 'set_group_kick_members', handler: 'batch_kick_group_members', supported: true }),
    ]))
    expect(llbot.capabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'group.notice.delete', action: '_delete_group_notice', handler: 'delete_group_notice', supported: true }),
      expect.objectContaining({ id: 'group.member.kick-batch', action: 'batch_delete_group_member', handler: 'batch_kick_group_members', supported: true }),
    ]))
    expect(napcat.capabilities.filter(({ supported }) => supported).map(({ action }) => action))
      .not.toEqual(llbot.capabilities.filter(({ supported }) => supported).map(({ action }) => action))
  })

  it('同一领域能力按实现配置接受各自 action 与参数名', async () => {
    const control = await createControl()
    control.createBot({ id: '20002', name: 'LLBot 机器人', implementation: 'llbot', enabled: true })
    control.createUser({ id: '10004', name: 'NapCat 待移除成员' })
    control.createUser({ id: '10005', name: 'LLBot 待移除成员' })
    const group = control.getSnapshot().groups[0]
    control.updateGroup({
      id: group.id,
      name: group.name,
      members: [
        ...group.members,
        { participantId: '20002', role: 'admin' },
        { participantId: '10004', role: 'member' },
        { participantId: '10005', role: 'member' },
      ],
    })

    const firstAnnouncementId = control.getSnapshot().groups[0].announcements[0].id
    await control.bot.internal._request('_del_group_notice', { group_id: 30001, notice_id: firstAnnouncementId })
    control.setGroupAnnouncement({ operatorId: '20002', groupId: '30001', content: 'LLBot 公告' })
    const secondAnnouncementId = control.getSnapshot().groups[0].announcements[0].id
    await control.getRuntimeBot('20002').internal._request('_delete_group_notice', { group_id: 30001, notice_id: secondAnnouncementId })

    await control.bot.internal._request('set_group_kick_members', { group_id: 30001, user_id: [10004] })
    await control.getRuntimeBot('20002').internal._request('batch_delete_group_member', { group_id: 30001, user_ids: [10005] })

    const updatedGroup = control.getSnapshot().groups[0]
    expect(updatedGroup.announcements).toHaveLength(0)
    expect(updatedGroup.members.map(({ participantId }) => participantId)).not.toContain('10004')
    expect(updatedGroup.members.map(({ participantId }) => participantId)).not.toContain('10005')
  })

  it('按机器人实现配置生成版本返回并隔离能力覆盖', async () => {
    const control = await createControl()
    control.createBot({
      id: '20002',
      name: 'LLBot 机器人',
      implementation: 'llbot',
      enabled: true,
      disabledCapabilities: ['set_qq_profile'],
    })
    control.createBot({ id: '20003', name: 'NapCat 机器人', implementation: 'napcat', enabled: true })

    await expect(control.bot.internal._request('get_version_info', {})).resolves.toMatchObject({
      data: { app_name: 'NapCat.Onebot', protocol_version: 'v11' },
    })
    await expect(control.getRuntimeBot('20002').internal._request('get_version_info', {})).resolves.toMatchObject({
      data: { app_name: 'LLOneBot', protocol_version: 'v11' },
    })
    await expect(control.getRuntimeBot('20002').internal._request('set_qq_profile', { nickname: '不可修改' }))
      .rejects.toThrow('能力已被禁用：set_qq_profile')
    await expect(control.getRuntimeBot('20003').internal._request('set_qq_profile', { nickname: '已修改' }))
      .resolves.toMatchObject({ status: 'ok', retcode: 0 })
    expect(control.getSnapshot().participants.find(({ id }) => id === '20003')).toMatchObject({ name: '已修改' })
  })

  it('按接收机器人实现配置生成原始消息字段', async () => {
    const control = await createControl()
    control.createBot({ id: '20002', name: 'LLBot 机器人', implementation: 'llbot', enabled: true })
    const group = control.getSnapshot().groups[0]
    control.updateGroup({
      id: group.id,
      name: group.name,
      members: [...group.members, { participantId: '20002', role: 'admin' }],
    })
    const events: Array<Record<string, unknown>> = []
    for (const botId of ['20001', '20002']) {
      control.getRuntimeBot(botId).ctx.on('middleware', (session: Session) => {
        if (session.selfId === botId) events.push((session as typeof session & { onebot: Record<string, unknown> }).onebot)
      })
    }

    await control.sendMessage({ operatorId: '10001', conversationId: 'group:30001', content: '实现字段' })

    const napcatEvent = events.find(({ self_id }) => self_id === 20001)
    const llbotEvent = events.find(({ self_id }) => self_id === 20002)
    expect(napcatEvent).toEqual(expect.objectContaining({
      message_id: expect.any(Number),
      message_seq: expect.any(Number),
      real_id: expect.any(Number),
      message_format: 'array',
      font: 0,
    }))
    expect(llbotEvent).toEqual(expect.objectContaining({
      message_id: napcatEvent?.message_id,
      message_seq: napcatEvent?.message_seq,
      message_format: 'array',
      font: 0,
    }))
    expect(llbotEvent).not.toHaveProperty('real_id')
  })

  it('能力矩阵解释禁用能力与未实现 action', async () => {
    const control = await createControl()
    control.updateBot({
      id: '20001',
      name: 'Koishi',
      implementation: 'napcat',
      enabled: true,
      disabledCapabilities: ['set_qq_avatar'],
    })

    expect(control.getBotCapabilities('20001')).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: 'set_qq_avatar',
        surface: 'native',
        supported: false,
        reason: '已被机器人能力覆盖禁用',
      }),
    ]))
    await expect(control.bot.internal._request('set_qq_avatar', { file: 'https://example.com/avatar.png' }))
      .rejects.toThrow('能力已被禁用：set_qq_avatar')
    await expect(control.bot.internal._request('host_only_action', {}))
      .rejects.toThrow('NapCat 基线不支持 OneBot action：host_only_action')
  })

  it('bot.internal 具名方法不会绕过能力覆盖', async () => {
    const control = await createControl()
    control.updateBot({
      id: '20001',
      name: 'Koishi',
      implementation: 'napcat',
      enabled: true,
      disabledCapabilities: ['set_friend_add_request', 'set_group_add_request'],
    })

    await expect(control.bot.internal.set_friend_add_request({ flag: 'missing', approve: true }))
      .rejects.toThrow('能力已被禁用：set_friend_add_request')
    await expect(control.bot.internal.set_group_add_request({ flag: 'missing', sub_type: 'add', approve: true }))
      .rejects.toThrow('能力已被禁用：set_group_add_request')
  })

  it('原生 poke 方法别名复用同一会话交互', async () => {
    const control = await createControl()

    await control.bot.internal._request('group_poke', { group_id: 30001, user_id: 10001 })
    const message = control.getSnapshot().messages.at(-1)

    expect(message).toMatchObject({
      conversationId: 'group:30001',
      authorId: '20001',
      event: { type: 'poke', targetId: '10001' },
    })
  })
})
