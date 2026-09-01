import { describe, expect, it, vi } from 'vitest'

const { send } = vi.hoisted(() => ({ send: vi.fn() }))

vi.mock('@koishijs/client', () => ({ send }))

import { createKoishiMcpCallRecordPort } from '../client/webqq/koishi-mcp-call-record-port'

describe('Koishi MCP 调用记录端口', () => {
  /** 这道端口的工厂根本不收「解析当前空间标识」的函数，筛选里的 spaceId 是记录字段。 */
  it('MCP 调用记录按筛选参数发送，不注入当前工作区 spaceId', async () => {
    send.mockClear()
    send.mockResolvedValue({ records: [] })
    const port = createKoishiMcpCallRecordPort()

    await port.getMcpCallRecords({ tool: 'send_message', spaceId: 'space-target' })
    await port.getMcpCallRecord({ recordId: 'call-1' })
    await port.clearMcpCallRecords()

    expect(send).toHaveBeenNthCalledWith(1, 'chatluna-sandbox/mcp-call-records', { tool: 'send_message', spaceId: 'space-target' })
    expect(send).toHaveBeenNthCalledWith(2, 'chatluna-sandbox/mcp-call-record', { recordId: 'call-1' })
    expect(send).toHaveBeenNthCalledWith(3, 'chatluna-sandbox/clear-mcp-call-records')
  })
})
