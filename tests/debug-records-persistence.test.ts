import { App } from '@koishijs/core'
import { afterEach, describe, expect, it } from 'vitest'
import { SandboxControlService, SandboxRuntimeBotRegistry } from '../src/control-service'
import { MemoryOneBotDebugPersistence } from '../src/persistence'
import { SandboxTestSpaceService } from '../src/test-spaces'

const runningApps: App[] = []

afterEach(async () => {
  await Promise.all(runningApps.splice(0).map((app) => app.stop()))
})

describe('OneBot 调试记录持久化与分页', () => {
  it('共享内存 Adapter 后跨控制服务实例恢复记录，且 sequence 不回退', async () => {
    const app = new App()
    runningApps.push(app)
    const persistence = new MemoryOneBotDebugPersistence('main')
    const first = new SandboxControlService(app, { debugPersistence: persistence })
    await first.waitForPersistence()
    await first.bot.internal._request('get_status', {})
    await first.bot.internal._request('get_login_info', {})
    await first.waitForPersistence()

    const second = new SandboxControlService(app, { debugPersistence: persistence })
    await second.waitForPersistence()
    const restored = second.getOneBotDebugRecords({ limit: 10 })
    expect(restored.records.map(({ requestedAction, sequence }) => ({ requestedAction, sequence }))).toEqual([
      { requestedAction: 'get_login_info', sequence: 2 },
      { requestedAction: 'get_status', sequence: 1 },
    ])

    await second.bot.internal._request('get_version_info', {})
    const afterAppend = second.getOneBotDebugRecords({ limit: 10 })
    expect(afterAppend.records[0]).toMatchObject({ requestedAction: 'get_version_info', sequence: 3 })
  })

  it('删除测试空间时清理其独立调试记录', async () => {
    const app = new App()
    runningApps.push(app)
    const runtimeBots = new SandboxRuntimeBotRegistry()
    const stores = new Map<string, MemoryOneBotDebugPersistence>()
    const spaces = new SandboxTestSpaceService(app, runtimeBots, undefined, (scopeId) => {
      const existing = stores.get(scopeId)
      if (existing) return existing
      const created = new MemoryOneBotDebugPersistence(scopeId)
      stores.set(scopeId, created)
      return created
    })
    const space = spaces.createSpace({ name: '调试空间' })
    const control = spaces.getControl(space.id)
    control.recordOneBotDebug({
      botId: '21001',
      implementation: 'napcat',
      direction: 'action',
      requestedAction: 'get_status',
      action: 'get_status',
      status: 'success',
      durationMs: 1,
    })
    expect(control.getOneBotDebugRecords().records).toHaveLength(1)
    await control.waitForPersistence()

    spaces.deleteSpace(space.id)
    await control.waitForPersistence()
    const recreated = new SandboxControlService(app, {
      debugPersistence: stores.get(space.id),
      runtimeActive: false,
    })
    await recreated.waitForPersistence()
    expect(recreated.getOneBotDebugRecords().records).toEqual([])
  })
})
