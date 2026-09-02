import { describe, expect, it } from 'vitest'
import { createFakeOneBotDebugPort } from '../client/onebot-debug/fake-port'
import { createTestWorkspaceController } from './helpers/workspace-controller'
import type { SandboxConsoleOneBotDebugRecord } from '../src/types'

const record: SandboxConsoleOneBotDebugRecord = {
  id: 'debug-1',
  sequence: 1,
  createdAt: '2026-07-25T12:00:00.000Z',
  botId: '20001',
  implementation: 'napcat',
  direction: 'action',
  requestedAction: 'get_login_info',
  action: 'get_login_info',
  status: 'success',
  durationMs: 1,
  payload: {},
  result: { status: 'ok' },
  entities: {},
  source: { type: 'main', name: '主环境' },
}

describe('WebQQ OneBot 调试控制器', () => {
  it('通过端口加载筛选记录并清理当前缓冲区', async () => {
    const port = createFakeOneBotDebugPort()
    port.debugRecordsResult = {
      records: [record],
      hasMore: false,
      earliestCursor: 1,
      capacity: { recordCount: 1, totalBytes: 128, maxRecords: 5000, maxBytes: 50 * 1024 * 1024 },
    }
    const controller = createTestWorkspaceController({ oneBotDebug: port })

    await controller.loadOneBotDebugRecords({ botId: '20001', direction: 'action' })
    expect(controller.oneBotDebugRecords.value).toEqual([record])
    expect(port.calls.at(-1)).toEqual({
      operation: 'getOneBotDebugRecords',
      input: { botId: '20001', direction: 'action' },
    })

    port.debugRecordResult = record
    await controller.loadOneBotDebugRecord({ recordId: 'debug-1', includeLargeValues: true })
    expect(controller.oneBotDebugRecord.value).toEqual(record)
    expect(port.calls.at(-1)).toEqual({
      operation: 'getOneBotDebugRecord',
      input: { recordId: 'debug-1', includeLargeValues: true },
    })

    await controller.clearOneBotDebugRecords()
    expect(controller.oneBotDebugRecords.value).toEqual([])
    expect(controller.oneBotDebugRecord.value).toBeUndefined()
    expect(port.calls.at(-1)).toEqual({ operation: 'clearOneBotDebugRecords', input: undefined })
  })
})
