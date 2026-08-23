import { describe, expect, it } from 'vitest'
import {
  SandboxModelRequestStore,
  createModelRequestError,
} from '../src/model-request'
import { SandboxModelRequestCursorExpiredError, type SandboxPresetRuntimeSnapshot } from '../src/types'

const presetSnapshot: SandboxPresetRuntimeSnapshot = {
  kind: 'core',
  presetName: 'demo',
  capturedAt: '2026-01-01T00:00:00.000Z',
  source: 'prompts:\n  - role: system\n    content: Hello {name}.\n',
  templates: [{ path: ['prompts', 0, 'content'], role: 'system', template: 'Hello {name}.' }],
}

function appendRecord(
  store: SandboxModelRequestStore,
  overrides: Partial<Parameters<SandboxModelRequestStore['append']>[0]> = {},
) {
  return store.append({
    status: 'success',
    durationMs: 12,
    method: 'POST',
    url: 'https://api.openai.com/v1/chat/completions',
    provider: 'openai',
    model: 'gpt-4o',
    attribution: 'attributed',
    entities: { scopeId: 'main', botId: '20001', conversationId: 'private:10001:20001' },
    requestBodyAvailable: true,
    requestBody: { model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }], tools: [{ type: 'function' }] },
    responseBodyStatus: 'complete',
    responseBodyFormat: 'json',
    responseStatus: 200,
    responseBodyRaw: JSON.stringify({ choices: [{ message: { content: 'hello' } }] }),
    ...overrides,
  })
}

describe('模型请求记录库', () => {
  it('列表省略请求体并提供摘要，详情保留完整请求体', () => {
    const store = new SandboxModelRequestStore()
    const created = appendRecord(store)
    const page = store.getRecords()
    expect(page.records).toHaveLength(1)
    expect(page.records[0]).not.toHaveProperty('requestBody')
    expect(page.records[0]).not.toHaveProperty('responseBodyRaw')
    expect(page.records[0]).toMatchObject({
      id: created.id,
      status: 'success',
      model: 'gpt-4o',
      summary: { keys: 3, messageCount: 1, toolCount: 1, bodyAvailable: true },
    })
    expect(store.getRecord(created.id)).toMatchObject({
      id: created.id,
      requestBody: { model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }] },
      responseBodyStatus: 'complete',
      responseBodyFormat: 'json',
      responseStatus: 200,
      responseBodyRaw: JSON.stringify({ choices: [{ message: { content: 'hello' } }] }),
      summary: { messageCount: 1, toolCount: 1, bodyAvailable: true },
    })
  })

  it('列表只暴露预设快照摘要，详情与持久记录保留完整模板源码', () => {
    const store = new SandboxModelRequestStore()
    const created = appendRecord(store, { presetSnapshots: [presetSnapshot] })

    expect(store.getRecords().records[0]).toMatchObject({
      presetSnapshotSummaries: [{ kind: 'core', presetName: 'demo', templateCount: 1, capturedAt: presetSnapshot.capturedAt }],
    })
    expect(JSON.stringify(store.getRecords().records[0])).not.toContain('Hello {name}')
    expect(store.getRecord(created.id)?.presetSnapshots).toEqual([presetSnapshot])
    expect(store.getRawRecords()[0]?.presetSnapshots).toEqual([presetSnapshot])
  })

  it('按 Gemini generateContent 结构统计消息和函数声明工具', () => {
    const store = new SandboxModelRequestStore()
    const created = appendRecord(store, {
      url: 'http://192.168.5.3/v1beta/models/gemini:generateContent',
      provider: '192.168.5.3',
      model: undefined,
      requestBody: {
        contents: [{ role: 'user', parts: [{ text: '你好' }] }],
        safetySettings: [],
        generationConfig: {},
        systemInstruction: { role: 'user', parts: [{ text: '系统提示' }] },
        tools: [{ functionDeclarations: [
          { name: 'music_voice' },
          { name: 'jmcomic_search' },
        ] }],
      },
    })

    expect(store.getRecord(created.id)).toMatchObject({
      summary: { keys: 5, messageCount: 1, toolCount: 2, bodyAvailable: true },
    })
  })

  it('同一条记录从 pending 更新为 success 或 error，不新增序号', () => {
    const store = new SandboxModelRequestStore()
    const pending = appendRecord(store, {
      status: 'pending',
      durationMs: 0,
      responseBodyStatus: 'pending',
      responseBodyRaw: undefined,
    })
    const success = store.update(pending.id, {
      status: 'success',
      durationMs: 40,
      responseBodyStatus: 'complete',
      responseBodyFormat: 'text',
      responseStatus: 200,
      responseBodyRaw: 'done',
    })
    expect(success).toMatchObject({
      id: pending.id,
      sequence: pending.sequence,
      status: 'success',
      durationMs: 40,
      responseBodyStatus: 'complete',
      responseBodyRaw: 'done',
    })
    expect(store.getRecords().records).toHaveLength(1)

    const failed = appendRecord(store, { status: 'pending', durationMs: 0, model: 'gpt-4.1' })
    store.update(failed.id, { status: 'error', durationMs: 8, error: createModelRequestError(new Error('timeout')) })
    expect(store.getRecord(failed.id)).toMatchObject({
      status: 'error',
      error: { code: 'transient_error', retryable: true, message: 'timeout' },
    })
    expect(store.getRecords({ errorsOnly: true }).records.map(({ id }) => id)).toEqual([failed.id])
  })

  it('按稳定序号新到旧分页，回收后的游标返回 cursor_expired', () => {
    const store = new SandboxModelRequestStore({ maxRecords: 2 })
    appendRecord(store, { model: 'one' })
    appendRecord(store, { model: 'two' })
    appendRecord(store, { model: 'three' })
    const page = store.getRecords({ limit: 1 })
    expect(page.records.map(({ model }) => model)).toEqual(['three'])
    expect(page.hasMore).toBe(true)
    expect(store.getRecords({ limit: 1, beforeSequence: page.nextCursor }).records.map(({ model }) => model)).toEqual(['two'])
    expect(() => store.getRecords({ beforeSequence: 1 })).toThrow(SandboxModelRequestCursorExpiredError)
  })

  it('支持按创建时间和记录 ID 做跨库分页游标', () => {
    const store = new SandboxModelRequestStore()
    const created = appendRecord(store, { model: 'one' })
    expect(store.getRecords({ beforeCreatedAt: '1970-01-01T00:00:00.000Z' }).records).toEqual([])
    expect(store.getRecords({ beforeCreatedAt: created.createdAt, beforeId: created.id }).records).toEqual([])
    expect(store.getRecords({ beforeCreatedAt: '2999-01-01T00:00:00.000Z' }).records.map(({ id }) => id)).toEqual([created.id])
  })

  it('支持按时间正序返回记录', () => {
    const store = new SandboxModelRequestStore()
    appendRecord(store, { model: 'one' })
    appendRecord(store, { model: 'two' })
    expect(store.getRecords({ order: 'asc' }).records.map(({ model }) => model)).toEqual(['one', 'two'])
    expect(store.getRecords({ order: 'desc' }).records.map(({ model }) => model)).toEqual(['two', 'one'])
  })
})
