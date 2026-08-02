import { App } from '@koishijs/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { registerConsole, type SandboxConsoleRegistrar } from '../src/console'
import { SandboxControlService, SandboxRuntimeBotRegistry } from '../src/control-service'
import { SandboxTestSpaceService } from '../src/test-spaces'
import type { SandboxAppearance } from '../src/types'

const appearance: SandboxAppearance = {
  enableWebQQFrostedGlass: true,
  webQQTimBubbleTail: true,
  webQQColorMode: 'auto',
  webQQAccentColor: '#2563eb',
  webQQMarkRecalledMessages: true,
}

const runningApps: App[] = []

afterEach(async () => {
  vi.useRealTimers()
  await Promise.all(runningApps.splice(0).map((app) => app.stop()))
})

describe('OneBot 调试 Console 协议', () => {
  it('只暴露筛选查询和清理，不提供记录重放入口', async () => {
    const app = new App()
    let control: SandboxControlService | undefined
    app.plugin((ctx) => {
      control = new SandboxControlService(ctx)
    })
    runningApps.push(app)
    await app.start()
    if (!control) throw new Error('沙盒控制服务未注册')
    await control.bot.internal._request('get_login_info', {})

    const listeners = new Map<string, unknown>()
    const consoleRegistrar: SandboxConsoleRegistrar = {
      addEntry() {},
      addListener(event, callback) {
        listeners.set(event, callback)
      },
      broadcast() {},
    }
    registerConsole(consoleRegistrar, control, appearance)

    const listRecords = listeners.get('onebot-sandbox/debug-records')
    const getRecord = listeners.get('onebot-sandbox/debug-record')
    const clearRecords = listeners.get('onebot-sandbox/clear-debug-records')
    expect(listRecords).toBeTypeOf('function')
    expect(getRecord).toBeTypeOf('function')
    expect(clearRecords).toBeTypeOf('function')
    if (typeof listRecords !== 'function' || typeof getRecord !== 'function' || typeof clearRecords !== 'function') {
      throw new Error('调试记录监听器未注册')
    }
    expect(listeners.has('onebot-sandbox/replay-debug-record')).toBe(false)
    const page = Reflect.apply(listRecords, undefined, [{ direction: 'action', action: 'get_login_info' }]) as {
      records: Array<{ id: string, requestedAction: string }>
      hasMore: boolean
      capacity: { recordCount: number }
    }
    expect(page).toMatchObject({
      records: [expect.objectContaining({ requestedAction: 'get_login_info', action: 'get_login_info', status: 'success' })],
      hasMore: false,
      capacity: expect.objectContaining({ recordCount: 1 }),
    })
    expect(Reflect.apply(getRecord, undefined, [{ recordId: page.records[0]!.id }])).toMatchObject({
      id: page.records[0]!.id,
      requestedAction: 'get_login_info',
      source: { type: 'main', name: '主环境' },
    })
    expect(Reflect.apply(clearRecords, undefined, [])).toEqual({ cleared: 1 })
    expect(Reflect.apply(listRecords, undefined, [{}])).toMatchObject({ records: [], hasMore: false })
  })

  it('在主环境汇总并清理所有测试空间调试记录，同时保留显式空间读取', () => {
    vi.useFakeTimers()
    const app = new App()
    runningApps.push(app)
    const runtimeBots = new SandboxRuntimeBotRegistry()
    const control = new SandboxControlService(app, { runtimeBots })
    const spaces = new SandboxTestSpaceService(app, runtimeBots)
    const first = spaces.createSpace({ name: '空间 A' })
    const listeners = new Map<string, (...args: any[]) => any>()
    const registrar: SandboxConsoleRegistrar = {
      addEntry() {},
      addListener(event, callback) { listeners.set(event, callback as never) },
      broadcast() {},
    }
    registerConsole(registrar, control, appearance, undefined, spaces)

    vi.setSystemTime(new Date('2026-07-30T10:00:00.000Z'))
    control.recordOneBotDebug({
      botId: '20001', implementation: 'napcat', direction: 'action',
      requestedAction: 'main-action', action: 'main-action',
      status: 'success', durationMs: 1,
    })
    vi.setSystemTime(new Date('2026-07-30T10:00:01.000Z'))
    first.control.recordOneBotDebug({
      botId: '21001', implementation: 'llbot', direction: 'event',
      requestedAction: 'space-event', action: 'space-event',
      status: 'success', durationMs: 2,
    })

    expect(listeners.get('onebot-sandbox/debug-records')?.({})).toMatchObject({
      records: [
        { requestedAction: 'space-event', source: { type: 'test-space', spaceId: first.id, name: '空间 A' } },
        { requestedAction: 'main-action', source: { type: 'main', name: '主环境' } },
      ],
    })
    expect(listeners.get('onebot-sandbox/debug-records')?.({ spaceId: first.id })).toMatchObject({
      records: [
        { requestedAction: 'space-event', source: { type: 'test-space', spaceId: first.id, name: '空间 A' } },
      ],
    })
    expect(listeners.get('onebot-sandbox/clear-debug-records')?.({})).toEqual({ cleared: 2 })
    expect(control.getOneBotDebugRecords()).toMatchObject({ records: [], hasMore: false })
    expect(first.control.getOneBotDebugRecords()).toMatchObject({ records: [], hasMore: false })
  })
})
