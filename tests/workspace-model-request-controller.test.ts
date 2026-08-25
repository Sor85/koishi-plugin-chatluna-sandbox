import { describe, expect, it } from 'vitest'
import { createFakeWorkspacePort } from '../client/webqq/fake-workspace-port'
import { createWorkspaceController } from '../client/webqq/workspace-controller'
import type { SandboxModelRequestDetail, SandboxModelRequestListItem, SandboxWorkspaceState } from '../src/types'

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

const listItem: SandboxModelRequestListItem = {
  id: 'record-1',
  sequence: 8,
  createdAt: '2026-08-13T12:00:00.000Z',
  status: 'success',
  durationMs: 12,
  model: 'gpt-4.1',
  provider: 'openai',
  attribution: 'unattributed',
  entities: {},
  requestBodyAvailable: true,
  responseBodyStatus: 'complete',
  responseBodyFormat: 'json',
  responseStatus: 200,
}

const olderItem: SandboxModelRequestListItem = {
  ...listItem,
  id: 'record-0',
  sequence: 7,
}

const detail: SandboxModelRequestDetail = {
  ...listItem,
  variables: [],
  requestBody: { model: 'gpt-4.1', messages: [] },
}

describe('WebQQ 模型请求控制器', () => {
  it('按空间或未归属分类分页加载摘要，并读取单条详情', async () => {
    const port = createFakeWorkspacePort(workspace)
    port.modelRequestRecordsResult = {
      records: [listItem],
      hasMore: true,
      nextCursor: 8,
      earliestCursor: 1,
      capacity: { recordCount: 2, totalBytes: 128, maxRecords: 5000, maxBytes: 50 * 1024 * 1024 },
    }
    port.modelRequestRecordResult = detail
    port.modelRequestTrajectoryResult = {
      mode: 'request',
      records: [listItem],
      rows: [{ id: 'record-1:request', index: 1, kind: 'request', preview: 'openai / gpt-4.1', requestId: 'record-1' }],
      promptComposition: [],
      complete: true,
    }
    const controller = createWorkspaceController(port, {
      getItem: () => null,
      setItem: () => undefined,
    })

    await controller.loadModelRequestRecords({ scope: 'space', spaceId: 'main', limit: 50 })
    expect(controller.modelRequestRecords.value).toEqual([listItem])
    expect(controller.modelRequestRecordsPage.value).toMatchObject({ hasMore: true, nextCursor: 8 })
    expect(port.calls.at(-1)).toEqual({
      operation: 'getModelRequestRecords',
      input: { scope: 'space', spaceId: 'main', limit: 50 },
    })

    port.modelRequestRecordsResult = {
      ...port.modelRequestRecordsResult,
      records: [olderItem],
      hasMore: false,
      nextCursor: undefined,
    }
    await controller.loadModelRequestRecords({ scope: 'space', spaceId: 'main', beforeSequence: 8, limit: 50 }, 'append')
    expect(controller.modelRequestRecords.value.map(({ id }) => id)).toEqual(['record-1', 'record-0'])

    await controller.loadModelRequestRecord({ scope: 'space', spaceId: 'main', recordId: 'record-1' })
    expect(controller.modelRequestRecord.value).toEqual(detail)
    expect(port.calls.at(-1)).toEqual({
      operation: 'getModelRequestRecord',
      input: { scope: 'space', spaceId: 'main', recordId: 'record-1' },
    })

    await controller.loadModelRequestTrajectory({ scope: 'space', spaceId: 'main', recordId: 'record-1', mode: 'request' })
    expect(controller.modelRequestTrajectory.value).toEqual(port.modelRequestTrajectoryResult)
    expect(port.calls.at(-1)).toEqual({
      operation: 'getModelRequestTrajectory',
      input: { scope: 'space', spaceId: 'main', recordId: 'record-1', mode: 'request' },
    })
  })

  it('只通过未归属分类清理当前缓冲区', async () => {
    const port = createFakeWorkspacePort(workspace)
    port.modelRequestRecordsResult = {
      records: [listItem],
      hasMore: false,
      capacity: { recordCount: 1, totalBytes: 64, maxRecords: 5000, maxBytes: 50 * 1024 * 1024 },
    }
    const controller = createWorkspaceController(port, {
      getItem: () => null,
      setItem: () => undefined,
    })

    await controller.loadModelRequestRecords({ scope: 'unattributed' })
    await controller.clearModelRequestRecords({ scope: 'unattributed' })

    expect(controller.modelRequestRecords.value).toEqual([])
    expect(controller.modelRequestRecord.value).toBeUndefined()
    expect(port.calls.at(-1)).toEqual({
      operation: 'clearModelRequestRecords',
      input: { scope: 'unattributed' },
    })
  })
})
