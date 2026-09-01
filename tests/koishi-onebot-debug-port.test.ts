import { describe, expect, it, vi } from 'vitest'

const { send } = vi.hoisted(() => ({ send: vi.fn() }))

vi.mock('@koishijs/client', () => ({ send }))

import { createKoishiOneBotDebugPort } from '../client/webqq/koishi-onebot-debug-port'

describe('Koishi OneBot 调试记录端口', () => {
  /**
   * 四道记录域端口里只有这一道定域。它的工厂与工作区端口收同一个「解析当前空间标识」的实参，
   * 因此切到某个 AI 测试空间后调试记录读到的仍然是那个空间的数据。
   */
  it('为调试记录的所有调用附加当前活动空间的 spaceId', async () => {
    send.mockClear()
    send.mockResolvedValue({})
    const port = createKoishiOneBotDebugPort(() => 'space-1')

    await port.getOneBotDebugRecords({ botId: '20001', direction: 'action' })
    await port.getOneBotDebugRecord({ recordId: 'debug-1', includeLargeValues: true })
    await port.clearOneBotDebugRecords()

    expect(send).toHaveBeenNthCalledWith(1, 'chatluna-sandbox/debug-records', {
      botId: '20001',
      direction: 'action',
      spaceId: 'space-1',
    })
    expect(send).toHaveBeenNthCalledWith(2, 'chatluna-sandbox/debug-record', {
      recordId: 'debug-1',
      includeLargeValues: true,
      spaceId: 'space-1',
    })
    expect(send).toHaveBeenNthCalledWith(3, 'chatluna-sandbox/clear-debug-records', { spaceId: 'space-1' })
  })

  it('调用方指名 spaceId 时显式定域优先，不被当前活动空间覆盖', async () => {
    send.mockClear()
    send.mockResolvedValue({})
    const port = createKoishiOneBotDebugPort(() => 'space-1')

    await port.getOneBotDebugRecord({ recordId: 'debug-1', spaceId: 'space-target' })

    expect(send).toHaveBeenNthCalledWith(1, 'chatluna-sandbox/debug-record', {
      recordId: 'debug-1',
      spaceId: 'space-target',
    })
  })

  it('没有活动空间时不附加 spaceId', async () => {
    send.mockClear()
    send.mockResolvedValue({})
    const port = createKoishiOneBotDebugPort()

    await port.getOneBotDebugRecords()

    expect(send).toHaveBeenNthCalledWith(1, 'chatluna-sandbox/debug-records', {})
  })
})
