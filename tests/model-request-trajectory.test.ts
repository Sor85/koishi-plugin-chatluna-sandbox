import { describe, expect, it } from 'vitest'
import { SandboxModelRequestStore } from '../src/model-request'
import { buildSandboxModelRequestTrajectory } from '../src/model-request-trajectory'

function createStore() {
  const store = new SandboxModelRequestStore()
  const first = store.append({
    status: 'success',
    durationMs: 120,
    provider: 'openai',
    model: 'gpt-4.1',
    attribution: 'attributed',
    entities: { scopeId: 'main', botId: 'bot-1', conversationId: 'conversation-1' },
    requestBodyAvailable: true,
    requestBody: {
      model: 'gpt-4.1',
      tools: [{ type: 'function', function: { name: 'lookup', parameters: { type: 'object' } } }],
      messages: [
        { role: 'system', content: '遵循系统提示' },
        { role: 'user', content: '查询天气' },
        { role: 'assistant', tool_calls: [{ id: 'call-1', function: { name: 'lookup', arguments: '{"city":"北京"}' } }] },
        { role: 'tool', tool_call_id: 'call-1', name: 'lookup', content: '晴' },
      ],
    },
    responseBodyStatus: 'complete',
    responseBodyFormat: 'json',
    responseBodyRaw: JSON.stringify({
      choices: [{ message: { content: '北京今天晴朗', reasoning_content: '读取工具结果' } }],
      usage: { prompt_tokens: 20, completion_tokens: 8 },
    }),
  })
  const second = store.append({
    status: 'error',
    durationMs: 80,
    provider: 'anthropic',
    model: 'claude-test',
    attribution: 'attributed',
    entities: { scopeId: 'main', botId: 'bot-1', conversationId: 'conversation-1' },
    requestBodyAvailable: true,
    requestBody: { messages: [{ role: 'user', content: '继续' }] },
    responseBodyStatus: 'unavailable',
  })
  return { store, first, second }
}

describe('模型请求轨迹投影', () => {
  it('从单次请求与响应派生语义记录，并保留原始详情', () => {
    const { store, first } = createStore()
    const detail = store.getRecord(first.id)!
    const trajectory = buildSandboxModelRequestTrajectory({ record: detail, mode: 'request', store })

    expect(trajectory.records).toHaveLength(1)
    expect(trajectory.rows.map(({ kind }) => kind)).toEqual([
      'request', 'system', 'system', 'user', 'tool', 'tool', 'assistant', 'assistant',
    ])
    expect(trajectory.rows.find(({ callId }) => callId === 'call-1')).toMatchObject({
      kind: 'tool',
      toolName: 'lookup',
    })
    expect(trajectory.rows.some(({ preview }) => preview.includes('北京今天晴朗'))).toBe(true)
    expect(trajectory.promptComposition).toEqual([
      { kind: 'system', characters: 6 },
      { kind: 'user', characters: 4 },
      { kind: 'tool', characters: 160 },
    ])
  })

  it('按同一记录库和 conversationId 组成完整会话 Step，不混入其他会话', () => {
    const { store, second } = createStore()
    store.append({
      status: 'success',
      durationMs: 20,
      attribution: 'attributed',
      entities: { scopeId: 'main', conversationId: 'conversation-other' },
      requestBodyAvailable: false,
    })
    const trajectory = buildSandboxModelRequestTrajectory({
      record: store.getRecord(second.id)!,
      mode: 'conversation',
      store,
    })

    expect(trajectory.mode).toBe('conversation')
    expect(trajectory.conversationId).toBe('conversation-1')
    expect(trajectory.records).toHaveLength(2)
    expect(trajectory.records.map(({ sequence }) => sequence)).toEqual([1, 2])
    expect(trajectory.rows.filter(({ kind }) => kind === 'request')).toHaveLength(2)
    expect(trajectory.promptComposition).toBeUndefined()
  })
})
