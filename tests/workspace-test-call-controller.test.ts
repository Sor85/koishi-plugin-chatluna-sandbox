import { describe, expect, it } from 'vitest'
import { createFakeTestCallRecordPort } from '../client/webqq/fake-test-call-record-port'
import { createTestWorkspaceController } from './helpers/workspace-controller'
import type { SandboxTestCallRecord, SandboxTestCallRecordListItem } from '../src/mcp/types'

const record: SandboxTestCallRecordListItem = {
  id: 'call-1',
  createdAt: '2026-07-25T12:00:00.000Z',
  credentialName: '测试凭证',
  transport: 'mcp',
  sourceIp: '127.0.0.1',
  tool: 'get_server_info',
  durationMs: 4,
  status: 'success',
  affected: [],
}

const detail: SandboxTestCallRecord = {
  ...record,
  arguments: {},
  result: { name: 'chatluna-sandbox' },
}

describe('WebQQ 测试调用记录控制器', () => {
  it('通过端口加载筛选记录、详情并清理当前缓冲区', async () => {
    const port = createFakeTestCallRecordPort()
    port.testCallRecordsResult = { records: [record] }
    port.testCallRecordResult = detail
    const controller = createTestWorkspaceController({ testCallRecord: port })

    await controller.loadTestCallRecords({ tool: 'get_server_info' })
    expect(controller.testCallRecords.value).toEqual([record])
    expect(port.calls.at(-1)).toEqual({
      operation: 'getTestCallRecords',
      input: { tool: 'get_server_info' },
    })

    await controller.loadTestCallRecord({ recordId: 'call-1' })
    expect(controller.testCallRecord.value).toEqual(detail)
    expect(port.calls.at(-1)).toEqual({
      operation: 'getTestCallRecord',
      input: { recordId: 'call-1' },
    })

    await controller.clearTestCallRecords()
    expect(controller.testCallRecords.value).toEqual([])
    expect(controller.testCallRecord.value).toBeUndefined()
    expect(port.calls.at(-1)).toEqual({ operation: 'clearTestCallRecords', input: undefined })
  })
})
