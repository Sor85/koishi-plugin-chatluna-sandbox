import { ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { createFakeTestCallRecordPort } from '../client/test-call/fake-port'
import { createFakeModelRequestPort } from '../client/model-request/fake-port'
import { createFakeOneBotDebugPort } from '../client/onebot-debug/fake-port'
import { createFakePresetPort } from '../client/preset/fake-port'
import { createFakeWorkspacePort } from '../client/workspace/fake-port'
import { createWorkspaceController } from '../client/workspace/controller'
import { createWorkspaceLayout } from '../client/workspace/layout'
import { createWebqqWorkspaceShell } from '../client/workspace/shell'
import { MAIN_MODEL_REQUEST_SPACE_ID } from '../client/model-request/query'
import type {
  SandboxModelRequestListItem,
  SandboxModelRequestTrajectory,
  SandboxSnapshot,
  SandboxWorkspaceState,
} from '../src/types'
import { deferred } from './helpers/deferred'

/**
 * 轨迹读取只保留最后一次发起的结果。
 *
 * 分析与账本两种模式共用同一个轨迹槽位：从会话账本切回分析时，先发起的会话读取可能晚于后发起的
 * 单请求读取返回。按返回顺序提交时旧会话会覆盖当前结果，而视图会过滤掉模式不匹配的载荷并把
 * 「模式不匹配」当成仍在加载，于是页面永久停在「正在组装轨迹…」——请求已经读到了，界面却不动。
 * 这条形态不报错，只能靠人操作到那一拍才复现，因此按发起顺序提交这件事必须有守卫兜住。
 */

const baseSnapshot: SandboxSnapshot = {
  revision: 1,
  participants: [
    { kind: 'user', id: '10001', name: '测试用户1' },
    { kind: 'bot', id: '20001', name: 'Koishi', implementation: 'napcat', enabled: true },
  ],
  groups: [],
  conversations: [
    { id: 'private:10001:20001', type: 'direct', participantIds: ['10001', '20001'], messageIds: [] },
  ],
  conversationInstances: [],
  messages: [],
  forwards: [],
  friendships: [{ id: 'friend:10001:20001', participantIds: ['10001', '20001'], remarks: {}, createdAt: '' }],
  requests: [],
}

function createWorkspace(): SandboxWorkspaceState {
  return {
    snapshot: baseSnapshot,
    chatLunaStates: [],
    persistence: { mode: 'memory', available: true, persisted: false },
    appearance: {
      enableSandboxFrostedGlass: true,
      sandboxTimBubbleTail: true,
      sandboxColorMode: 'auto',
      sandboxAccentColor: '#2563eb',
      sandboxMarkRecalledMessages: true,
    },
  }
}

function createStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  }
}

function listItem(id: string): SandboxModelRequestListItem {
  return {
    id,
    sequence: 1,
    createdAt: '2026-09-01T02:00:00.000Z',
    status: 'success',
    durationMs: 12,
    attribution: 'attributed',
    entities: {},
    requestBodyAvailable: true,
    responseBodyStatus: 'complete',
  }
}

async function createShell() {
  const modelRequest = createFakeModelRequestPort()
  const controller = createWorkspaceController({
    workspace: createFakeWorkspacePort(createWorkspace()),
    oneBotDebug: createFakeOneBotDebugPort(),
    modelRequest,
    preset: createFakePresetPort(),
    testCallRecord: createFakeTestCallRecordPort(),
  }, createStorage())
  await controller.load()
  // 外壳在 setup 里注册 onMounted；测试直接调用工厂时该钩子是空操作，只吞掉这一条预期告警。
  const warn = console.warn
  console.warn = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].includes('onMounted is called when there is no active component')) return
    warn(...args)
  }
  try {
    const shell = createWebqqWorkspaceShell(controller, createWorkspaceLayout(ref(true)), () => undefined)
    return { shell, modelRequest }
  } finally {
    console.warn = warn
  }
}

describe('模型请求轨迹读取的提交顺序', () => {
  it('切回分析后，较晚返回的会话轨迹不能让页面永久停在正在组装轨迹', async () => {
    const { shell, modelRequest } = await createShell()
    const conversation = deferred<SandboxModelRequestTrajectory>()
    const request = deferred<SandboxModelRequestTrajectory>()
    const readTrajectory = modelRequest.getModelRequestTrajectory.bind(modelRequest)
    const conversationResult = await readTrajectory({ scope: 'main' as const, recordId: 'record-1', mode: 'conversation' })
    const requestResult = await readTrajectory({ scope: 'main' as const, recordId: 'record-1', mode: 'request' })
    modelRequest.getModelRequestTrajectory = (input) => input.mode === 'conversation'
      ? conversation.promise
      : request.promise

    // 会话读取尚未完成时切回分析；两个调用都走页面实际使用的 shell/controller 链路。
    const oldRead = shell.loadModelRequestTrajectory({ scope: 'main' as const, recordId: 'record-1', mode: 'conversation' })
    const currentRead = shell.loadModelRequestTrajectory({ scope: 'main' as const, recordId: 'record-1', mode: 'request' })
    request.settle(requestResult)
    await currentRead
    conversation.settle(conversationResult)
    await oldRead

    const model = shell.modelRequestWorkspaceModel.value
    expect(model.detailLoading).toBe(false)
    // workspace.vue 会过滤掉模式不匹配的轨迹，并把模式不匹配视为 loading；
    // trajectory.vue 在 loading && !trajectory 时显示“正在组装轨迹…”。
    const requestTrajectory = model.trajectory?.mode === 'request' ? model.trajectory : undefined
    const loading = model.detailLoading || model.trajectory?.mode !== 'request'
    expect(loading && !requestTrajectory).toBe(false)
    expect(model.error).toBe('')
  })

  it.each([
    { scope: 'main' as const, recordId: 'record-2', mode: 'request' as const },
    { scope: 'main' as const, recordId: 'record-1', mode: 'conversation' as const, expandedRequestIds: ['record-1'] },
  ])('轨迹只保留最后发起的读取：$recordId / $mode / $expandedRequestIds', async (input) => {
    const { shell, modelRequest } = await createShell()
    const old = deferred<SandboxModelRequestTrajectory>()
    const readTrajectory = modelRequest.getModelRequestTrajectory.bind(modelRequest)
    const oldResult = await readTrajectory({ scope: 'main' as const, recordId: 'record-1', mode: input.mode })
    const latestResult = await readTrajectory(input)
    oldResult.records = [listItem('record-1')]
    latestResult.records = [listItem(input.recordId)]
    modelRequest.getModelRequestTrajectory = () => old.promise
    const oldRead = shell.loadModelRequestTrajectory({ scope: 'main' as const, recordId: 'record-1', mode: input.mode })
    modelRequest.getModelRequestTrajectory = async () => latestResult
    await shell.loadModelRequestTrajectory(input)
    old.settle(oldResult)
    await oldRead

    expect(shell.modelRequestWorkspaceModel.value.trajectory).toEqual(latestResult)
  })

  it('过期轨迹读取失败不覆盖当前读取的状态与错误', async () => {
    const { shell, modelRequest } = await createShell()
    const old = deferred<SandboxModelRequestTrajectory>()
    const readTrajectory = modelRequest.getModelRequestTrajectory.bind(modelRequest)
    modelRequest.getModelRequestTrajectory = () => old.promise
    const oldRead = shell.loadModelRequestTrajectory({ scope: 'main' as const, recordId: 'record-1', mode: 'conversation' })
    modelRequest.getModelRequestTrajectory = readTrajectory
    await shell.loadModelRequestTrajectory({ scope: 'main' as const, recordId: 'record-1', mode: 'request' })
    old.fail(new Error('旧会话读取失败'))
    await oldRead

    expect(shell.modelRequestWorkspaceModel.value.error).toBe('')
    expect(shell.modelRequestWorkspaceModel.value.trajectory?.mode).toBe('request')
  })

  it('最新轨迹读取失败仍显示错误，旧结果不能再补回', async () => {
    const { shell, modelRequest } = await createShell()
    const old = deferred<SandboxModelRequestTrajectory>()
    const readTrajectory = modelRequest.getModelRequestTrajectory.bind(modelRequest)
    const oldResult = await readTrajectory({ scope: 'main' as const, recordId: 'record-1', mode: 'conversation' })
    modelRequest.getModelRequestTrajectory = () => old.promise
    const oldRead = shell.loadModelRequestTrajectory({ scope: 'main' as const, recordId: 'record-1', mode: 'conversation' })
    modelRequest.getModelRequestTrajectory = readTrajectory
    modelRequest.rejectNext('getModelRequestTrajectory', new Error('当前读取失败'))
    await shell.loadModelRequestTrajectory({ scope: 'main' as const, recordId: 'record-1', mode: 'request' })
    old.settle(oldResult)
    await oldRead

    expect(shell.modelRequestWorkspaceModel.value.error).toBe('当前读取失败')
    expect(shell.modelRequestWorkspaceModel.value.detailLoading).toBe(false)
    expect(shell.modelRequestWorkspaceModel.value.trajectory).toBeUndefined()
  })

  it('清理完成后，尚未返回的轨迹读取不能把已清空轨迹放回', async () => {
    const { shell, modelRequest } = await createShell()
    const result = await modelRequest.getModelRequestTrajectory({ scope: 'main' as const, recordId: 'record-1', mode: 'request' })
    const pending = deferred<SandboxModelRequestTrajectory>()
    modelRequest.getModelRequestTrajectory = () => pending.promise
    const read = shell.loadModelRequestTrajectory({ scope: 'main' as const, recordId: 'record-1', mode: 'request' })
    await shell.clearModelRequestRecords({ scope: 'space', spaceId: MAIN_MODEL_REQUEST_SPACE_ID })
    pending.settle(result)
    await read

    expect(shell.modelRequestWorkspaceModel.value.trajectory).toBeUndefined()
  })
})
