import { describe, expect, it, vi } from 'vitest'

const { send } = vi.hoisted(() => ({ send: vi.fn() }))

vi.mock('@koishijs/client', () => ({ send }))

import { createKoishiTestCallRecordPort } from '../client/test-call/koishi-port'

describe('Koishi 测试调用记录端口', () => {
  /** 这道端口的工厂根本不收「解析当前空间标识」的函数，筛选里的 spaceId 是记录字段。 */
  it('测试调用记录按筛选参数发送，不注入当前工作区 spaceId', async () => {
    send.mockClear()
    send.mockResolvedValue({ records: [] })
    const port = createKoishiTestCallRecordPort()

    await port.getTestCallRecords({ tool: 'send_message', spaceId: 'space-target' })
    await port.getTestCallRecord({ recordId: 'call-1' })
    await port.clearTestCallRecords()

    expect(send).toHaveBeenNthCalledWith(1, 'chatluna-sandbox/test-call-records', { tool: 'send_message', spaceId: 'space-target' })
    expect(send).toHaveBeenNthCalledWith(2, 'chatluna-sandbox/test-call-record', { recordId: 'call-1' })
    expect(send).toHaveBeenNthCalledWith(3, 'chatluna-sandbox/clear-test-call-records')
  })
})
