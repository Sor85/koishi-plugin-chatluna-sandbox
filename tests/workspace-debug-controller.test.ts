import { describe, expect, it } from 'vitest'
import { createFakeWorkspacePort } from '../client/webqq/fake-workspace-port'
import { createWorkspaceController } from '../client/webqq/workspace-controller'
import type { SandboxConsoleOneBotDebugRecord, SandboxWorkspaceState } from '../src/types'

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
    const port = createFakeWorkspacePort(workspace)
    port.debugRecordsResult = {
      records: [record],
      hasMore: false,
      earliestCursor: 1,
      capacity: { recordCount: 1, totalBytes: 128, maxRecords: 5000, maxBytes: 50 * 1024 * 1024 },
    }
    const controller = createWorkspaceController(port, {
      getItem: () => null,
      setItem: () => undefined,
    })

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
