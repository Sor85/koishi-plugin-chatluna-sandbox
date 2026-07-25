import { App } from '@koishijs/core'
import { afterEach, describe, expect, it } from 'vitest'
import { registerConsole, type SandboxConsoleRegistrar } from '../src/console'
import { SandboxControlService } from '../src/control-service'
import type { SandboxAppearance } from '../src/types'

const appearance: SandboxAppearance = {
  enableWebQQFrostedGlass: true,
  webQQChatStyle: 'tim',
  webQQTimBubbleTail: true,
  webQQColorMode: 'auto',
  webQQAccentColor: '#2563eb',
}

const runningApps: App[] = []

afterEach(async () => {
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
    }
    registerConsole(consoleRegistrar, control, appearance)

    const listRecords = listeners.get('onebot-sandbox/debug-records')
    const clearRecords = listeners.get('onebot-sandbox/clear-debug-records')
    expect(listRecords).toBeTypeOf('function')
    expect(clearRecords).toBeTypeOf('function')
    if (typeof listRecords !== 'function' || typeof clearRecords !== 'function') throw new Error('调试记录监听器未注册')
    expect(listeners.has('onebot-sandbox/replay-debug-record')).toBe(false)
    expect(Reflect.apply(listRecords, undefined, [{ direction: 'action', type: 'get_login_info' }])).toEqual([
      expect.objectContaining({ type: 'get_login_info', status: 'success' }),
    ])
    expect(Reflect.apply(clearRecords, undefined, [])).toEqual({ cleared: 1 })
    expect(Reflect.apply(listRecords, undefined, [{}])).toEqual([])
  })
})
