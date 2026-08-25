import { describe, expect, it } from 'vitest'
import { deriveModelRequestVariables } from '../src/model-request-variables'
import type { SandboxModelRequestRecord, SandboxPresetRuntimeSnapshot } from '../src/types'

function record(snapshot: SandboxPresetRuntimeSnapshot, content: string): SandboxModelRequestRecord {
  return {
    id: 'request-1',
    sequence: 1,
    createdAt: '2026-08-23T04:28:13.000Z',
    status: 'success',
    durationMs: 10,
    attribution: 'attributed',
    entities: { scopeId: 'main', botId: '20001', conversationId: 'group:30001' },
    requestBodyAvailable: true,
    requestBody: { messages: [{ role: 'system', content }] },
    responseBodyStatus: 'unavailable',
    presetSnapshots: [snapshot],
  }
}

describe('模型请求变量', () => {
  it('只从运行时预设的值表达式派生变量名和本次请求观察值', () => {
    const snapshot: SandboxPresetRuntimeSnapshot = {
      kind: 'character',
      presetName: 'koishi',
      capturedAt: '2026-08-23T04:28:12.000Z',
      templates: [{
        path: ['system'],
        role: 'system',
        template: '时间：{time}，天气：{weather}，记忆：{long_memory("guild")}。',
      }],
    }

    expect(deriveModelRequestVariables(record(snapshot, '时间：12:30，天气：晴，记忆：昨天一起散步。'))).toEqual([
      expect.objectContaining({ name: 'time', status: 'observed', value: '12:30' }),
      expect.objectContaining({ name: 'weather', status: 'observed', value: '晴' }),
      expect.objectContaining({ name: 'long_memory("guild")', status: 'observed', value: '昨天一起散步' }),
    ])
  })

  it('保留重复表达式的预设顺序，并在范围有歧义时不伪造变量值', () => {
    const snapshot: SandboxPresetRuntimeSnapshot = {
      kind: 'core',
      presetName: 'demo',
      capturedAt: '2026-08-23T04:28:12.000Z',
      templates: [{ path: ['prompts', 0, 'content'], role: 'system', template: 'A[{name}]B[{name}]C' }],
    }
    const variables = deriveModelRequestVariables(record(snapshot, 'A[Alice]B[Bob]C'))

    expect(variables.map(({ name, occurrence, value }) => ({ name, occurrence, value }))).toEqual([
      { name: 'name', occurrence: 0, value: 'Alice' },
      { name: 'name', occurrence: 1, value: 'Bob' },
    ])
  })

  it('控制标签不进入变量列表，未执行分支保留未观察状态', () => {
    const snapshot: SandboxPresetRuntimeSnapshot = {
      kind: 'character',
      presetName: 'demo',
      capturedAt: '2026-08-23T04:28:12.000Z',
      templates: [{ path: ['system'], role: 'system', template: '{if ok}值：{value}{else}备用：{fallback}{/if}' }],
    }
    const variables = deriveModelRequestVariables(record(snapshot, '备用：离线'))

    expect(variables.map(({ name, status, value }) => ({ name, status, value }))).toEqual([
      { name: 'value', status: 'not-observed', value: undefined },
      { name: 'fallback', status: 'observed', value: '离线' },
    ])
  })
})
