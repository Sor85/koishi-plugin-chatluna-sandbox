import { App } from '@koishijs/core'
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
  return control
}

describe('类型化账号资料', () => {
  it('环境管理写入的账号资料与好友备注、群成员资料保持独立', async () => {
    const control = await createControl()

    control.createUser({
      id: '10088',
      name: '资料用户',
      profile: {
        personalNote: '环境签名',
        sex: 'female',
        age: 21,
        qid: 'qid-user',
        level: 48,
        loginDays: 120,
        city: '上海',
        country: '中国',
        birthdayYear: 2004,
        birthdayMonth: 5,
        birthdayDay: 18,
        labels: ['测试'],
        isVip: true,
        isYearsVip: false,
        vipLevel: 2,
      },
    })
    control.updateUser({
      id: '10088',
      name: '资料用户',
      profile: {
        personalNote: '更新后的签名',
        sex: 'female',
        age: 22,
      },
    })
    control.createGroup({
      id: '30088',
      name: '资料群',
      members: [
        {
          participantId: '10088',
          card: '群内名片',
          role: 'owner',
          title: '元老',
          area: '浦东',
          joinTime: 1_700_000_000,
          lastSentTime: 1_700_000_100,
          level: '12',
        },
        { participantId: '20001', role: 'admin' },
      ],
    })
    await control.performFriendAction({
      action: 'set-remark',
      operatorId: '20001',
      targetId: '10088',
      remark: '机器人备注',
    })

    const user = control.getSnapshot().participants.find(({ id }) => id === '10088')
    expect(user).toMatchObject({
      kind: 'user',
      id: '10088',
      name: '资料用户',
      profile: {
        personalNote: '更新后的签名',
        sex: 'female',
        age: 22,
      },
    })
    // 更新后未显式携带的可选字段不保留虚构默认值，也不回落到旧备注。
    expect(user && 'profile' in user ? user.profile : undefined).toEqual({
      personalNote: '更新后的签名',
      sex: 'female',
      age: 22,
    })
    expect(control.getSnapshot().friendships.find(({ participantIds }) => participantIds.includes('10088') && participantIds.includes('20001'))?.remarks)
      .toEqual({ '20001': '机器人备注' })
    expect(control.getSnapshot().groups.find(({ id }) => id === '30088')?.members.find(({ participantId }) => participantId === '10088'))
      .toMatchObject({
        card: '群内名片',
        title: '元老',
        area: '浦东',
        joinTime: 1_700_000_000,
        lastSentTime: 1_700_000_100,
        level: '12',
      })
  })

  it('set_qq_profile 两端可写昵称和签名，性别仅 NapCat 可写', async () => {
    const control = await createControl()
    control.createBot({ id: '20088', name: 'LLBot 资料机器人', implementation: 'llbot', enabled: true })

    await control.bot.internal._request('set_qq_profile', {
      nickname: 'NapCat 新昵称',
      personal_note: 'NapCat 签名',
      sex: 1,
    })
    expect(control.getSnapshot().participants.find(({ id }) => id === '20001')).toMatchObject({
      name: 'NapCat 新昵称',
      profile: { personalNote: 'NapCat 签名', sex: 'male' },
    })

    const llbot = control.getRuntimeBot('20088')
    await llbot.internal._request('set_qq_profile', {
      nickname: 'LLBot 新昵称',
      personal_note: 'LLBot 签名',
    })
    expect(control.getSnapshot().participants.find(({ id }) => id === '20088')).toMatchObject({
      name: 'LLBot 新昵称',
      profile: { personalNote: 'LLBot 签名' },
    })
    await expect(llbot.internal._request('set_qq_profile', {
      nickname: 'LLBot 新昵称',
      sex: 2,
    })).rejects.toThrow(/不支持修改性别|性别/)

    // LLOneBot 拒绝性别写入后，不得静默改掉已有签名或昵称。
    expect(control.getSnapshot().participants.find(({ id }) => id === '20088')).toMatchObject({
      name: 'LLBot 新昵称',
      profile: { personalNote: 'LLBot 签名' },
    })
  })

  it('OneBot 查询按实现字段名读回已建模资料，且不返回未建模 raw JSON', async () => {
    const control = await createControl()
    control.updateUser({
      id: '10001',
      name: '测试用户1',
      profile: {
        personalNote: '用户签名',
        sex: 'male',
        age: 20,
        qid: 'qid-10001',
        level: 36,
        loginDays: 88,
        regTime: 1_600_000_000,
        city: '杭州',
        country: '中国',
        birthdayYear: 2005,
        birthdayMonth: 1,
        birthdayDay: 2,
        labels: ['沙盒'],
        isVip: true,
        isYearsVip: true,
        vipLevel: 3,
      },
    })
    control.updateGroup({
      id: '30001',
      name: '测试群',
      members: [
        {
          participantId: '10001',
          card: '群主名片',
          role: 'owner',
          title: '群主头衔',
          area: '西湖',
          joinTime: 1_650_000_000,
          lastSentTime: 1_660_000_000,
          level: '5',
          unfriendly: false,
          titleExpireTime: 0,
          cardChangeable: true,
        },
        { participantId: '10002', card: '测试用户2', role: 'admin' },
        { participantId: '10003', card: '测试用户3', role: 'member' },
        { participantId: '20001', card: 'Koishi', role: 'admin' },
      ],
    })
    control.updateBot({
      id: '20001',
      name: 'Koishi',
      implementation: 'napcat',
      enabled: true,
      profile: { personalNote: '机器人签名', sex: 'unknown' },
    })

    await expect(control.bot.internal._request('get_login_info', {})).resolves.toEqual({
      status: 'ok',
      retcode: 0,
      data: {
        user_id: 20001,
        nickname: 'Koishi',
        long_nick: '机器人签名',
        sex: 'unknown',
      },
    })

    await expect(control.bot.internal._request('get_stranger_info', { user_id: 10001 })).resolves.toEqual({
      status: 'ok',
      retcode: 0,
      data: {
        user_id: 10001,
        nickname: '测试用户1',
        sex: 'male',
        age: 20,
        qid: 'qid-10001',
        level: 36,
        login_days: 88,
        reg_time: 1_600_000_000,
        long_nick: '用户签名',
        city: '杭州',
        country: '中国',
        birthday_year: 2005,
        birthday_month: 1,
        birthday_day: 2,
        labels: ['沙盒'],
        is_vip: true,
        is_years_vip: true,
        vip_level: 3,
      },
    })

    await expect(control.bot.internal._request('get_friend_list', {})).resolves.toMatchObject({
      status: 'ok',
      retcode: 0,
      data: expect.arrayContaining([
        expect.objectContaining({
          user_id: 10001,
          nickname: '测试用户1',
          long_nick: '用户签名',
          sex: 'male',
          age: 20,
          remark: '',
        }),
      ]),
    })

    await expect(control.bot.internal._request('get_group_member_info', {
      group_id: 30001,
      user_id: 10001,
    })).resolves.toEqual({
      status: 'ok',
      retcode: 0,
      data: {
        group_id: 30001,
        user_id: 10001,
        nickname: '测试用户1',
        card: '群主名片',
        sex: 'male',
        age: 20,
        area: '西湖',
        join_time: 1_650_000_000,
        last_sent_time: 1_660_000_000,
        level: '5',
        role: 'owner',
        unfriendly: false,
        title: '群主头衔',
        title_expire_time: 0,
        card_changeable: true,
        shut_up_timestamp: 0,
      },
    })
  })

  it('导入导出与场景替换保留类型化资料', async () => {
    const control = await createControl()
    control.updateUser({
      id: '10001',
      name: '测试用户1',
      profile: { personalNote: '导出签名', sex: 'female', age: 19 },
    })
    const exported = control.getSnapshot()
    const second = await createControl()
    second.replaceScene(structuredClone(exported))
    expect(second.getSnapshot().participants.find(({ id }) => id === '10001')).toMatchObject({
      profile: { personalNote: '导出签名', sex: 'female', age: 19 },
    })
  })
})
