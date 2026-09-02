import { describe, expect, it, vi } from 'vitest'

const { send } = vi.hoisted(() => ({ send: vi.fn() }))

vi.mock('@koishijs/client', () => ({ send }))

import { createKoishiModelRequestPort } from '../client/model-request/koishi-port'

describe('Koishi 模型请求端口', () => {
  /** 这道端口的工厂根本不收「解析当前空间标识」的函数，分类只能由调用方显式给出。 */
  it('模型请求记录按显式 scope 发送，不注入当前工作区 spaceId', async () => {
    send.mockClear()
    send.mockResolvedValue({ records: [], hasMore: false, capacity: { recordCount: 0, totalBytes: 0, maxRecords: 5000, maxBytes: 1 } })
    const port = createKoishiModelRequestPort()

    await port.getModelRequestRecords({ scope: 'unattributed', limit: 50 })
    await port.getModelRequestRecord({ scope: 'space', spaceId: 'main', recordId: 'record-1' })
    await port.clearModelRequestRecords({ scope: 'unattributed' })

    expect(send).toHaveBeenNthCalledWith(1, 'chatluna-sandbox/model-request-records', { scope: 'unattributed', limit: 50 })
    expect(send).toHaveBeenNthCalledWith(2, 'chatluna-sandbox/model-request-record', { scope: 'space', spaceId: 'main', recordId: 'record-1' })
    expect(send).toHaveBeenNthCalledWith(3, 'chatluna-sandbox/clear-model-request-records', { scope: 'unattributed' })
  })
})
