import { describe, expect, it } from 'vitest'
import { createFakeWorkspacePort } from '../client/webqq/fake-workspace-port'
import { createWorkspaceController } from '../client/webqq/workspace-controller'
import type { SandboxMcpCallRecord, SandboxMcpCallRecordListItem } from '../src/mcp/types'
import type { SandboxWorkspaceState } from '../src/types'

const workspace: SandboxWorkspaceState = {
  snapshot: {
    revision: 0,
    participants: [
      { kind: 'user', id: '10001', name: '测试用户1' },
      { kind: 'bot', id: '20001', name: 'Koishi', implementation: 'napcat', enabled: true },
    ],
    groups: [],
    conversations: [{ id: 'private:10001:20001', type: 'direct', participantIds: ['10001', '20001'], messageIds: [] }],
    messages: [],
    forwards: [],
    friendships: [],
    requests: [],
  },
  chatLunaStates: [],
  appearance: {
    enableSandboxFrostedGlass: true,
    sandboxTimBubbleTail: true,
    sandboxColorMode: 'auto',
    sandboxAccentColor: '#2563eb',
    sandboxMarkRecalledMessages: true,
  },
  persistence: { mode: 'memory', available: true, persisted: false },
}

const record: SandboxMcpCallRecordListItem = {
  id: 'call-1',
  createdAt: '2026-07-25T12:00:00.000Z',
  credentialName: '测试凭证',
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
    const port = createFakeWorkspacePort(workspace)
    port.mcpCallRecordsResult = { records: [record] }
    port.mcpCallRecordResult = detail
    const controller = createWorkspaceController(port, {
      getItem: () => null,
      setItem: () => undefined,
    })

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
