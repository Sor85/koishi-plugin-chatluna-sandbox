import { App } from '@koishijs/core'
import { afterEach, describe, expect, it } from 'vitest'
import { SandboxControlService, SandboxRuntimeBotRegistry } from '../src/control-service'
import { MemoryModelRequestPersistence, KoishiDatabaseModelRequestPersistence } from '../src/persistence'
import type { SandboxModelRequestRecord } from '../src/types'
import { SandboxTestSpaceService } from '../src/test-spaces'

const runningApps: App[] = []

afterEach(async () => {
  await Promise.all(runningApps.splice(0).map((app) => app.stop()))
})

describe('模型请求记录持久化与生命周期', () => {
  it('Database 服务晚到时合并历史与启动期请求，且不会用空状态覆盖历史', async () => {
    const historical: SandboxModelRequestRecord = {
      id: 'historical',
      sequence: 7,
      createdAt: '2026-08-13T00:00:00.000Z',
      status: 'success',
      durationMs: 5,
      model: 'historical-model',
      attribution: 'attributed',
      entities: { scopeId: 'main' },
      requestBodyAvailable: false,
      responseBodyStatus: 'unavailable',
    }
    let database: {
      get: (table: 'onebot-sandbox.model-requests', query: { scopeId: string }) => Promise<Array<{
        scopeId: string
        nextSequence: number
        records: SandboxModelRequestRecord[]
        updatedAt: Date
      }>>
      upsert: (table: 'onebot-sandbox.model-requests', rows: Array<{
        scopeId: string
        nextSequence: number
        records: SandboxModelRequestRecord[]
        updatedAt: Date
      }>) => Promise<void>
      remove: (table: 'onebot-sandbox.model-requests', query: { scopeId: string }) => Promise<void>
    } | undefined
    const writes: Array<{ nextSequence: number, records: SandboxModelRequestRecord[] }> = []
    const persistence = new KoishiDatabaseModelRequestPersistence('main', () => database)
    const app = new App()
    runningApps.push(app)
    const control = new SandboxControlService(app, { modelRequestPersistence: persistence })

    control.recordModelRequest({
      status: 'success', durationMs: 1, model: 'startup-model',
      attribution: 'attributed', entities: { scopeId: 'main' }, requestBodyAvailable: false,
    })
    setTimeout(() => {
      database = {
        get: async () => [{
          scopeId: 'main',
          nextSequence: 8,
          records: [historical],
          updatedAt: new Date(),
        }],
        upsert: async (_table, rows) => {
          writes.push({ nextSequence: rows[0]!.nextSequence, records: structuredClone(rows[0]!.records) })
        },
        remove: async () => {},
      }
    }, 30)

    await control.waitForPersistence()
    expect(control.getModelRequestRecords().records.map(({ id, model, sequence }) => ({ id, model, sequence }))).toEqual([
      expect.objectContaining({ model: 'startup-model', sequence: 8 }),
      { id: 'historical', model: 'historical-model', sequence: 7 },
    ])
    expect(writes.at(-1)).toMatchObject({
      nextSequence: 9,
      records: [
        expect.objectContaining({ id: 'historical', sequence: 7 }),
        expect.objectContaining({ model: 'startup-model', sequence: 8 }),
      ],
    })
  })

  it('共享内存 Adapter 后跨控制服务实例恢复记录，且 sequence 不回退', async () => {
    const app = new App()
    runningApps.push(app)
    const persistence = new MemoryModelRequestPersistence('main')
    const first = new SandboxControlService(app, { modelRequestPersistence: persistence })
    await first.waitForPersistence()
    first.recordModelRequest({
      status: 'success', durationMs: 1, model: 'first',
      attribution: 'attributed', entities: { scopeId: 'main' }, requestBodyAvailable: false,
    })
    first.recordModelRequest({
      status: 'success', durationMs: 2, model: 'second',
      attribution: 'attributed', entities: { scopeId: 'main' }, requestBodyAvailable: false,
    })
    await first.waitForPersistence()

    const second = new SandboxControlService(app, { modelRequestPersistence: persistence })
    await second.waitForPersistence()
    expect(second.getModelRequestRecords().records.map(({ model, sequence }) => ({ model, sequence }))).toEqual([
      { model: 'second', sequence: 2 },
      { model: 'first', sequence: 1 },
    ])
    second.recordModelRequest({
      status: 'success', durationMs: 3, model: 'third',
      attribution: 'attributed', entities: { scopeId: 'main' }, requestBodyAvailable: false,
    })
    expect(second.getModelRequestRecords().records[0]).toMatchObject({ model: 'third', sequence: 3 })
  })

  it('重置场景只清理对应空间记录，完成空间仍保留记录', async () => {
    const app = new App()
    runningApps.push(app)
    const runtimeBots = new SandboxRuntimeBotRegistry()
    const stores = new Map<string, MemoryModelRequestPersistence>()
    const main = new SandboxControlService(app, { runtimeBots, modelRequestPersistence: new MemoryModelRequestPersistence('main') })
    const spaces = new SandboxTestSpaceService(app, runtimeBots, undefined, undefined, (scopeId) => {
      const existing = stores.get(scopeId)
      if (existing) return existing
      const created = new MemoryModelRequestPersistence(scopeId)
      stores.set(scopeId, created)
      return created
    })
    const space = spaces.createSpace({ name: '请求空间' })
    main.recordModelRequest({
      status: 'success', durationMs: 1, model: 'main-model',
      attribution: 'attributed', entities: { scopeId: 'main' }, requestBodyAvailable: false,
    })
    space.control.recordModelRequest({
      status: 'success', durationMs: 1, model: 'space-model',
      attribution: 'attributed', entities: { scopeId: space.id }, requestBodyAvailable: false,
    })

    space.control.resetScene()
    expect(space.control.getModelRequestRecords().records).toEqual([])
    expect(main.getModelRequestRecords().records).toHaveLength(1)

    space.control.recordModelRequest({
      status: 'success', durationMs: 1, model: 'kept-after-complete',
      attribution: 'attributed', entities: { scopeId: space.id }, requestBodyAvailable: false,
    })
    spaces.completeSpace(space.id)
    expect(space.control.getModelRequestRecords().records).toHaveLength(1)
  })

  it('删除测试空间时清理其独立模型请求记录', async () => {
    const app = new App()
    runningApps.push(app)
    const runtimeBots = new SandboxRuntimeBotRegistry()
    const stores = new Map<string, MemoryModelRequestPersistence>()
    const spaces = new SandboxTestSpaceService(app, runtimeBots, undefined, undefined, (scopeId) => {
      const existing = stores.get(scopeId)
      if (existing) return existing
      const created = new MemoryModelRequestPersistence(scopeId)
      stores.set(scopeId, created)
      return created
    })
    const space = spaces.createSpace({ name: '待删空间' })
    const control = spaces.getControl(space.id)
    control.recordModelRequest({
      status: 'success', durationMs: 1, model: 'doomed',
      attribution: 'attributed', entities: { scopeId: space.id }, requestBodyAvailable: false,
    })
    await control.waitForPersistence()
    spaces.deleteSpace(space.id)
    await control.waitForPersistence()

    const recreated = new SandboxControlService(app, {
      modelRequestPersistence: stores.get(space.id),
      runtimeActive: false,
    })
    await recreated.waitForPersistence()
    expect(recreated.getModelRequestRecords().records).toEqual([])
  })
})
