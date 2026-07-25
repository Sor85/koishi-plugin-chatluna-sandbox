import { App } from '@koishijs/core'
import { afterEach, describe, expect, it } from 'vitest'
import { SandboxControlService, type SandboxControlServiceOptions } from '../src/control-service'

const runningApps: App[] = []

afterEach(async () => {
  await Promise.all(runningApps.splice(0).map((app) => app.stop()))
})

async function createControl(options: SandboxControlServiceOptions = {}) {
  const app = new App()
  let control: SandboxControlService | undefined
  app.plugin((ctx) => {
    control = new SandboxControlService(ctx, options)
  })
  runningApps.push(app)
  await app.start()
  if (!control) throw new Error('沙盒控制服务未注册')
  return { app, control }
}

describe('OneBot 调试记录', () => {
  it('记录机器人 action 的实现差异、结果与脱敏参数', async () => {
    const { control } = await createControl()
    await control.bot.internal._request('get_login_info', {
      access_token: 'secret-token',
      dataBase64: Buffer.from('binary').toString('base64'),
      message: '这是一段不应完整进入调试记录的消息正文'.repeat(8),
    })

    const [record] = control.getOneBotDebugRecords({ direction: 'action' })
    expect(record).toEqual(expect.objectContaining({
      botId: '20001',
      implementation: 'napcat',
      direction: 'action',
      type: 'get_login_info',
      status: 'success',
      resolvedType: 'get_login_info',
    }))
    expect(JSON.stringify(record.payload)).not.toContain('secret-token')
    expect(JSON.stringify(record.payload)).not.toContain(Buffer.from('binary').toString('base64'))
    expect(JSON.stringify(record.payload)).not.toContain('消息正文'.repeat(8))
    expect(record.result).toEqual(expect.objectContaining({
      status: 'ok',
      retcode: 0,
    }))

    control.createBot({ id: '20002', name: 'LLBot 测试机器人', implementation: 'llbot', enabled: true })
    await control.getRuntimeBot('20002').internal._request('get_version_info', {})
    expect(control.getOneBotDebugRecords({ botId: '20002' })).toContainEqual(expect.objectContaining({
      botId: '20002',
      implementation: 'llbot',
      type: 'get_version_info',
    }))
  })

  it('记录发送给机器人的原始 OneBot 事件且不写入场景快照', async () => {
    const { control } = await createControl()
    await control.sendMessage({
      operatorId: '10001',
      conversationId: 'private:10001:20001',
      content: '用于调试记录的私聊消息',
    })

    const [record] = control.getOneBotDebugRecords({ direction: 'event', type: 'message.private' })
    expect(record).toEqual(expect.objectContaining({
      botId: '20001',
      implementation: 'napcat',
      direction: 'event',
      type: 'message.private',
      status: 'success',
      entities: expect.objectContaining({
        userId: '10001',
      }),
    }))
    expect(record.payload).toEqual(expect.objectContaining({
      post_type: 'message',
      message_type: 'private',
    }))
    expect(JSON.stringify(record.payload)).not.toContain('用于调试记录的私聊消息')
    expect(control.getSnapshot()).not.toHaveProperty('oneBotDebugRecords')
  })

  it('错误记录提供 Logger 可关联 trace，并支持筛选和清理', async () => {
    const { control } = await createControl()

    await expect(control.bot.internal._request('host_only_action', { user_id: 10001 })).rejects.toThrow('不支持 OneBot action')

    const [record] = control.getOneBotDebugRecords({
      botId: '20001',
      direction: 'action',
      type: 'host_only_action',
      errorsOnly: true,
    })
    expect(record.error).toEqual({
      message: expect.stringContaining('不支持 OneBot action'),
      traceId: expect.any(String),
    })
    expect(control.clearOneBotDebugRecords()).toBe(1)
    expect(control.getOneBotDebugRecords()).toEqual([])
  })

  it('调试记录使用有界内存缓冲区', async () => {
    const { control } = await createControl({ debugRecordLimit: 2 })
    await control.bot.internal._request('get_status', {})
    await control.bot.internal._request('get_login_info', {})
    await control.bot.internal._request('get_version_info', {})

    expect(control.getOneBotDebugRecords().map(({ type }) => type)).toEqual([
      'get_version_info',
      'get_login_info',
    ])
  })
})
