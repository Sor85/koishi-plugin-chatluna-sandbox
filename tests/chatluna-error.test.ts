import { describe, expect, it } from 'vitest'
import {
  findLatestFailedModelRequest,
  getChatLunaErrorPossibleCauses,
  readChatLunaRequestError,
} from '../src/chatluna-error'
import type { SandboxModelRequestDetail } from '../src/types'

function record(sequence: number, input: Partial<SandboxModelRequestDetail> = {}): SandboxModelRequestDetail {
  return {
    id: `request-${sequence}`,
    sequence,
    createdAt: new Date(sequence * 1000).toISOString(),
    status: 'error',
    durationMs: 1,
    attribution: 'attributed',
    entities: {},
    requestBodyAvailable: true,
    requestBody: {},
    responseBodyStatus: 'unavailable',
    variables: [],
    summary: { keys: 0, messageCount: 0, toolCount: 0, bodyAvailable: true },
    ...input,
  }
}

describe('ChatLuna 模型请求错误', () => {
  it('提取 ChatLuna 错误码、消息、原始原因和 timeout 标记', () => {
    expect(readChatLunaRequestError({
      errorCode: 102,
      message: 'API 请求超时 (102)',
      originError: new Error('upstream timed out after 60s'),
      isTimeout: true,
      data: { ignored: true },
    })).toEqual({
      code: 102,
      message: 'API 请求超时 (102)',
      originMessage: 'upstream timed out after 60s',
      isTimeout: true,
    })
    expect(readChatLunaRequestError(null)).toBeUndefined()
  })

  it('按官方错误码返回可能原因，不根据裸 HTTP 状态推断', () => {
    expect(getChatLunaErrorPossibleCauses({ code: 100 })).toContain('API Key 不可用或无效，请确认密钥仍可正常使用。')
    expect(getChatLunaErrorPossibleCauses({ code: 103 })[0]).toContain('覆盖范围较广')
    expect(getChatLunaErrorPossibleCauses(undefined)).toEqual([])
    expect(getChatLunaErrorPossibleCauses({ code: 999 })).toEqual([])
  })

  it('优先选择同一逻辑会话最近的失败请求，并跳过已经关联的记录', () => {
    const records = [
      record(1, { entities: { conversationId: 'conversation-a' } }),
      record(2, { entities: { conversationId: 'conversation-b' } }),
      record(3, {
        entities: { conversationId: 'conversation-a' },
        chatlunaError: { code: 103 },
      }),
    ]
    expect(findLatestFailedModelRequest(records, 'conversation-a')?.id).toBe('request-1')
    expect(findLatestFailedModelRequest(records, 'conversation-missing')?.id).toBe('request-2')
  })
})
