import { describe, expect, it } from 'vitest'
import {
  parseModelRequestConversation,
  parseModelRequestConversationDetail,
} from '../client/webqq/model-request-conversation'
import type { SandboxModelRequestDetail } from '../src/types'

function detail(overrides: Partial<SandboxModelRequestDetail>): SandboxModelRequestDetail {
  return {
    id: 'request-1', sequence: 1, createdAt: '2026-08-19T12:00:00.000Z', status: 'success', durationMs: 120,
    attribution: 'unattributed', entities: {}, requestBodyAvailable: true, responseBodyStatus: 'unavailable',
    summary: { keys: 0, messageCount: 0, toolCount: 0, bodyAvailable: true },
    ...overrides,
  }
}

describe('模型请求对话视图归一化', () => {
  it('归一化 Chat Completions 消息、调用结果与工具定义并保留源路径', () => {
    const conversation = parseModelRequestConversation({
      model: 'gpt-4.1',
      messages: [
        { role: 'system', content: '系统规则' },
        { role: 'user', content: '查天气' },
        { role: 'assistant', content: '正在查询', tool_calls: [{ id: 'call-1', function: { name: 'weather', arguments: '{"city":"北京"}' } }] },
        { role: 'tool', tool_call_id: 'call-1', content: '{"weather":"晴"}' },
      ],
      tools: [{ type: 'function', function: { name: 'weather', description: '查询天气', parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] } } }],
    })

    expect(conversation.messages.map(({ index, role, path }) => ({ index, role, path }))).toEqual([
      { index: 0, role: 'system', path: ['messages', '0'] },
      { index: 1, role: 'user', path: ['messages', '1'] },
      { index: 2, role: 'assistant', path: ['messages', '2'] },
      { index: 3, role: 'tool', path: ['messages', '3'] },
    ])
    expect(conversation.messages[2]?.toolCalls[0]).toMatchObject({ id: 'call-1', name: 'weather', arguments: '{"city":"北京"}' })
    expect(conversation.messages[3]?.toolCallId).toBe('call-1')
    expect(conversation.tools[0]).toMatchObject({ name: 'weather', description: '查询天气', path: ['tools', '0', 'function'] })
  })

  it('分别归一化 Anthropic 与 Gemini 顶层 system 和工具交互', () => {
    const anthropic = parseModelRequestConversation({
      system: [{ type: 'text', text: 'Anthropic 系统' }],
      messages: [
        { role: 'assistant', content: [{ type: 'thinking', thinking: '思考' }, { type: 'tool_use', id: 'tool-1', name: 'lookup', input: { id: 1 } }] },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tool-1', content: '结果' }] },
      ],
      tools: [{ name: 'lookup', input_schema: { type: 'object' } }],
    }, 'anthropic/messages')
    expect(anthropic.messages[0]).toMatchObject({ role: 'system', content: 'Anthropic 系统', path: ['system'] })

    const gemini = parseModelRequestConversation({
      systemInstruction: { parts: [{ text: 'Gemini 系统' }] },
      contents: [
        { role: 'model', parts: [{ functionCall: { name: 'lookup', args: { id: 1 } } }] },
        { role: 'user', parts: [{ functionResponse: { name: 'lookup', response: { value: '结果' } } }] },
      ],
      tools: [{ functionDeclarations: [{ name: 'lookup', description: '查询', parameters: { type: 'object' } }] }],
    }, 'gemini')
    expect(gemini.messages.map(({ role }) => role)).toEqual(['system', 'assistant', 'tool'])
    expect(gemini.messages[1]?.toolCalls[0]).toMatchObject({ name: 'lookup' })
    expect(gemini.tools[0]).toMatchObject({ name: 'lookup', path: ['tools', '0', 'functionDeclarations', '0'] })
  })

  it('归一化 Responses input 和完整 SSE 响应证据', () => {
    const conversation = parseModelRequestConversationDetail(detail({
      requestBody: {
        input: [
          { role: 'user', content: '搜索新闻' },
          { type: 'function_call', call_id: 'call-1', name: 'search', arguments: '{"q":"新闻"}' },
          { type: 'function_call_output', call_id: 'call-1', output: '新闻结果' },
        ],
      },
      responseBodyStatus: 'complete', responseBodyFormat: 'sse',
      responseBodyRaw: 'data: {"choices":[{"delta":{"reasoning_content":"思考"}}]}\n\ndata: {"choices":[{"delta":{"content":"答案"},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":2}}\n\ndata: [DONE]\n\n',
    }))

    expect(conversation.messages.map(({ role }) => role)).toEqual(['user', 'assistant', 'tool'])
    expect(conversation.response).toMatchObject({ format: 'sse', reasoning: ['思考'], content: ['答案'], finishReasons: ['stop'] })
    expect(conversation.response?.raw).toEqual(expect.arrayContaining([expect.objectContaining({ event: 'message' })]))
    expect(conversation.response?.usage).toMatchObject({ inputTokens: 10, outputTokens: 2, source: 'response' })
  })

  it('未知请求结构返回明确解析状态而不生成猜测消息', () => {
    expect(parseModelRequestConversation({ temperature: 0.3 })).toMatchObject({
      messages: [], tools: [], parseError: '未识别请求体中的对话结构',
    })
  })
})
