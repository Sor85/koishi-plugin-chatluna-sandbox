import { describe, expect, it } from 'vitest'
import { createFakeWorkspacePort } from '../client/webqq/fake-workspace-port'
import { createWorkspaceController } from '../client/webqq/workspace-controller'
import type { SandboxOneBotDebugRecord, SandboxWorkspaceState } from '../src/types'

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
    friendships: [],
    requests: [],
  },
  chatLunaStates: [],
  appearance: {
    enableWebQQFrostedGlass: true,
    webQQChatStyle: 'tim',
    webQQTimBubbleTail: true,
    webQQColorMode: 'auto',
    webQQAccentColor: '#2563eb',
  },
  persistence: { mode: 'memory', available: true, persisted: false },
}

const record: SandboxOneBotDebugRecord = {
  id: 'debug-1',
  createdAt: '2026-07-25T12:00:00.000Z',
  botId: '20001',
  implementation: 'napcat',
  direction: 'action',
  type: 'get_login_info',
  resolvedType: 'get_login_info',
  status: 'success',
  durationMs: 1,
  payload: {},
  result: { status: 'ok' },
  entities: {},
}

describe('WebQQ OneBot 调试控制器', () => {
  it('通过端口加载筛选记录并清理当前缓冲区', async () => {
    const port = createFakeWorkspacePort(workspace)
    port.debugRecordsResult = [record]
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

    await controller.clearOneBotDebugRecords()
    expect(controller.oneBotDebugRecords.value).toEqual([])
    expect(port.calls.at(-1)).toEqual({ operation: 'clearOneBotDebugRecords', input: undefined })
  })
})
