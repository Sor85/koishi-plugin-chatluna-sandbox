import { describe, expect, it } from 'vitest'
import { createFakeMcpCallRecordPort } from '../client/webqq/fake-mcp-call-record-port'
import { createTestWorkspaceController } from './helpers/workspace-controller'
import type { SandboxMcpCallRecord, SandboxMcpCallRecordListItem } from '../src/mcp/types'

const record: SandboxMcpCallRecordListItem = {
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

const detail: SandboxMcpCallRecord = {
  ...record,
  arguments: {},
  result: { name: 'chatluna-sandbox' },
}

describe('WebQQ MCP 调用记录控制器', () => {
  it('通过端口加载筛选记录、详情并清理当前缓冲区', async () => {
    const port = createFakeMcpCallRecordPort()
    port.mcpCallRecordsResult = { records: [record] }
    port.mcpCallRecordResult = detail
    const controller = createTestWorkspaceController({ mcpCallRecord: port })

    await controller.loadMcpCallRecords({ tool: 'get_server_info' })
    expect(controller.mcpCallRecords.value).toEqual([record])
    expect(port.calls.at(-1)).toEqual({
      operation: 'getMcpCallRecords',
      input: { tool: 'get_server_info' },
    })

    await controller.loadMcpCallRecord({ recordId: 'call-1' })
    expect(controller.mcpCallRecord.value).toEqual(detail)
    expect(port.calls.at(-1)).toEqual({
      operation: 'getMcpCallRecord',
      input: { recordId: 'call-1' },
    })

    await controller.clearMcpCallRecords()
    expect(controller.mcpCallRecords.value).toEqual([])
    expect(controller.mcpCallRecord.value).toBeUndefined()
    expect(port.calls.at(-1)).toEqual({ operation: 'clearMcpCallRecords', input: undefined })
  })
})
