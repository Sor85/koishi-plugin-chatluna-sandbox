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
  return { app, control }
}

describe('模拟 QQ 环境好友关系', () => {
  it('普通用户审批好友申请后可以设置本地备注并删除关系', async () => {
    const { control } = await createControl()

    const request = await control.performFriendAction({
      action: 'request',
      actorUserId: '10001',
      targetId: '10002',
      comment: '一起测试',
    })
    if (!request.requestId) throw new Error('好友申请未创建')
    expect(control.getSnapshot().friendships.some(({ participantIds }) => participantIds.includes('10001') && participantIds.includes('10002'))).toBe(false)

    await control.performFriendAction({ action: 'handle-request', actorUserId: '10002', requestId: request.requestId, approve: true })
    await control.performFriendAction({ action: 'set-remark', actorUserId: '10001', targetId: '10002', remark: '测试搭档' })
    const friendship = control.getSnapshot().friendships.find(({ participantIds }) => participantIds.includes('10001') && participantIds.includes('10002'))
    expect(friendship?.remarks).toEqual({ '10001': '测试搭档' })
    expect(control.getSnapshot().users.find(({ id }) => id === '10002')?.name).toBe('协作用户')

    await control.performFriendAction({ action: 'delete', actorUserId: '10001', targetId: '10002' })
    expect(control.getSnapshot().friendships.some(({ participantIds }) => participantIds.includes('10001') && participantIds.includes('10002'))).toBe(false)
  })

  it('发给机器人的申请只能由 OneBot action 审批，并向机器人派发戳一戳和删除事件', async () => {
    const { app, control } = await createControl()
    const notices: Array<{ type?: string; noticeType?: string; userId?: number; targetId?: number }> = []
    ;(app.on as unknown as (name: string, listener: (session: unknown) => void) => void)('notice', (session) => {
      const value = session as { type?: string; onebot?: { notice_type?: string; user_id?: number; target_id?: number } }
      notices.push({
        type: value.type,
        noticeType: value.onebot?.notice_type,
        userId: value.onebot?.user_id,
        targetId: value.onebot?.target_id,
      })
    })

    const request = control.getSnapshot().requests.find(({ type, targetId }) => type === 'friend' && targetId === '20001')
    if (!request) throw new Error('默认机器人好友申请不存在')
    await expect(control.performFriendAction({ action: 'handle-request', actorUserId: '10004', requestId: request.id, approve: true }))
      .rejects.toThrow('机器人申请必须由机器人处理')

    await control.bot.internal.set_friend_add_request({ flag: request.id, approve: true, remark: '申请用户' })
    expect(control.getSnapshot().friendships.some(({ participantIds }) => participantIds.includes('10004') && participantIds.includes('20001'))).toBe(true)
    expect(control.getSnapshot().conversations.some(({ id }) => id === 'private:10004:20001')).toBe(true)

    await control.performFriendAction({ action: 'poke', actorUserId: '10004', targetId: '20001' })
    await control.performFriendAction({ action: 'delete', actorUserId: '10004', targetId: '20001' })
    expect(notices).toEqual([
      { type: 'notice', noticeType: 'notify', userId: 10004, targetId: 20001 },
      { type: 'notice', noticeType: 'friend_del', userId: 10004, targetId: 20001 },
    ])
  })

  it('无好友关系时拒绝互动且不产生部分状态', async () => {
    const { control } = await createControl()
    const before = control.getSnapshot()

    await expect(control.performFriendAction({ action: 'poke', actorUserId: '10001', targetId: '10002' }))
      .rejects.toThrow('好友关系不存在')

    expect(control.getSnapshot()).toEqual(before)
  })

  it('双方已有待处理申请时拒绝反向重复申请', async () => {
    const { control } = await createControl()
    await control.performFriendAction({ action: 'request', actorUserId: '10001', targetId: '10002' })
    const before = control.getSnapshot()

    await expect(control.performFriendAction({ action: 'request', actorUserId: '10002', targetId: '10001' }))
      .rejects.toThrow('双方已有待处理的好友申请')

    expect(control.getSnapshot()).toEqual(before)
  })
})
