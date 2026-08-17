import { App } from '@koishijs/core'
import { afterEach, describe, expect, it } from 'vitest'
import { registerConsole, type SandboxConsoleRegistrar } from '../src/console'
import { SandboxControlService, SandboxRuntimeBotRegistry } from '../src/control-service'
import { SandboxModelRequestStore } from '../src/model-request'
import { SandboxTestSpaceService } from '../src/test-spaces'
import type { SandboxAppearance } from '../src/types'
import type { ChatLunaUsageLookup } from '../src/chatluna-usage'

const appearance: SandboxAppearance = {
  enableSandboxFrostedGlass: true,
  sandboxTimBubbleTail: true,
  sandboxColorMode: 'auto',
  sandboxAccentColor: '#2563eb',
  sandboxMarkRecalledMessages: true,
}

const runningApps: App[] = []

afterEach(async () => {
  await Promise.all(runningApps.splice(0).map((app) => app.stop()))
})

describe('模型请求 Console 协议', () => {
  it('按分类读取和清理主环境、测试空间与未归属记录', async () => {
    const app = new App()
    runningApps.push(app)
    const runtimeBots = new SandboxRuntimeBotRegistry()
    const control = new SandboxControlService(app, { runtimeBots })
    const spaces = new SandboxTestSpaceService(app, runtimeBots)
    const space = spaces.createSpace({ name: '请求空间' })
    const unattributed = new SandboxModelRequestStore()
    const listeners = new Map<string, unknown>()
    const registrar: SandboxConsoleRegistrar = {
      addEntry() {},
      addListener(event, callback) {
        listeners.set(event, callback)
      },
      broadcast() {},
    }
    registerConsole(registrar, control, appearance, undefined, spaces, unattributed)

    const mainRecord = control.recordModelRequest({
      status: 'success', durationMs: 3, model: 'main-model',
      attribution: 'attributed', entities: { scopeId: 'main' }, requestBodyAvailable: false,
    })
    space.control.recordModelRequest({
      status: 'success', durationMs: 4, model: 'space-model',
      attribution: 'attributed', entities: { scopeId: space.id }, requestBodyAvailable: false,
    })
    const unattributedRecord = unattributed.append({
      status: 'error', durationMs: 5, model: 'lost-model',
      attribution: 'unattributed', entities: {}, requestBodyAvailable: true,
      requestBody: { model: 'lost-model', messages: [] },
      responseBodyStatus: 'complete', responseBodyFormat: 'json', responseStatus: 500,
      responseBodyRaw: JSON.stringify({ error: 'failed' }),
    })

    const listRecords = listeners.get('chatluna-sandbox/model-request-records')
    const getRecord = listeners.get('chatluna-sandbox/model-request-record')
    const getTrajectory = listeners.get('chatluna-sandbox/model-request-trajectory')
    const clearRecords = listeners.get('chatluna-sandbox/clear-model-request-records')
    if (typeof listRecords !== 'function' || typeof getRecord !== 'function' || typeof getTrajectory !== 'function' || typeof clearRecords !== 'function') {
      throw new Error('模型请求记录监听器未注册')
    }

    expect(Reflect.apply(listRecords, undefined, [{ scope: 'space', spaceId: 'main' }])).toMatchObject({
      records: [expect.objectContaining({ id: mainRecord.id, model: 'main-model' })],
    })
    expect(Reflect.apply(listRecords, undefined, [{ scope: 'space', spaceId: space.id }])).toMatchObject({
      records: [expect.objectContaining({ model: 'space-model' })],
    })
    const unattributedPage = Reflect.apply(listRecords, undefined, [{ scope: 'unattributed' }]) as { records: Array<{ id: string }> }
    expect(unattributedPage.records[0]).toMatchObject({ id: unattributedRecord.id, model: 'lost-model' })
    expect(unattributedPage.records[0]).not.toHaveProperty('requestBody')
    expect(unattributedPage.records[0]).not.toHaveProperty('responseBodyRaw')
    expect(await Reflect.apply(getRecord, undefined, [{ scope: 'unattributed', recordId: unattributedRecord.id }])).toMatchObject({
      id: unattributedRecord.id,
      requestBody: { model: 'lost-model', messages: [] },
      responseBodyStatus: 'complete',
      responseBodyFormat: 'json',
      responseStatus: 500,
      responseBodyRaw: JSON.stringify({ error: 'failed' }),
    })
    expect(Reflect.apply(getTrajectory, undefined, [{ scope: 'unattributed', recordId: unattributedRecord.id, mode: 'request' }])).toMatchObject({
      mode: 'request',
      records: [expect.objectContaining({ id: unattributedRecord.id })],
      rows: [expect.objectContaining({ kind: 'request', requestId: unattributedRecord.id })],
    })

    const allPage = Reflect.apply(listRecords, undefined, [{ scope: 'all' }]) as { records: Array<{ model: string, source: { type: string } }> }
    expect(allPage.records.map(({ model }) => model).sort()).toEqual(['main-model', 'space-model'])
    expect(allPage.records.some(({ source }) => source.type === 'unattributed')).toBe(false)
    expect(() => Reflect.apply(clearRecords, undefined, [{ scope: 'all' }])).toThrow('全部空间视图不支持一次性清理')

    expect(Reflect.apply(clearRecords, undefined, [{ scope: 'space', spaceId: space.id }])).toEqual({ cleared: 1 })
    expect(space.control.getModelRequestRecords().records).toEqual([])
    expect(control.getModelRequestRecords().records).toHaveLength(1)
    expect(Reflect.apply(clearRecords, undefined, [{ scope: 'unattributed' }])).toEqual({ cleared: 1 })
    expect(unattributed.getRecords().records).toEqual([])
  })

  it('在详情读取时解析后加载的 ChatLuna Usage 服务', async () => {
    const app = new App()
    runningApps.push(app)
    const runtimeBots = new SandboxRuntimeBotRegistry()
    const control = new SandboxControlService(app, { runtimeBots })
    const listeners = new Map<string, unknown>()
    const registrar: SandboxConsoleRegistrar = {
      addEntry() {},
      addListener(event, callback) {
        listeners.set(event, callback)
      },
      broadcast() {},
    }
    let usageService: ChatLunaUsageLookup | undefined
    registerConsole(registrar, control, appearance, undefined, undefined, undefined, () => usageService)

    const record = control.recordModelRequest({
      status: 'success', durationMs: 5613, model: 'gemini-3.7-flash-high',
      attribution: 'attributed', entities: { scopeId: 'main' }, requestBodyAvailable: false,
    })
    usageService = {
      async list() {
        return {
          rows: [{
            inputTokens: 10469,
            outputTokens: 696,
            reasoningTokens: 609,
            cachedTokens: 0,
            totalTokens: 11165,
            model: 'gemini-3.7-flash-high',
            createdAt: record.createdAt,
            ttftMs: 5613,
            totalMs: 5613,
            tps: 232.495991448423,
          }],
        }
      },
    }

    const getRecord = listeners.get('chatluna-sandbox/model-request-record')
    if (typeof getRecord !== 'function') throw new Error('模型请求详情监听器未注册')
    await expect(Reflect.apply(getRecord, undefined, [{ scope: 'space', spaceId: 'main', recordId: record.id }])).resolves.toMatchObject({
      usage: {
        inputTokens: 10469,
        outputTokens: 696,
        reasoningTokens: 609,
        totalTokens: 11165,
        ttftMs: 5613,
        totalMs: 5613,
        tps: 232.495991448423,
        source: 'chatluna-usage',
      },
    })
  })
})
