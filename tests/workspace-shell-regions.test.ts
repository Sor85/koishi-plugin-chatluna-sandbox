import { ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { createFakeTestCallRecordPort } from '../client/webqq/fake-test-call-record-port'
import { createFakeModelRequestPort } from '../client/webqq/fake-model-request-port'
import { createFakeOneBotDebugPort } from '../client/webqq/fake-onebot-debug-port'
import { createFakePresetPort } from '../client/webqq/fake-preset-port'
import { createFakeWorkspacePort, type WorkspacePortOperation } from '../client/webqq/fake-workspace-port'
import type { TestCallRecordPortOperation } from '../client/webqq/test-call-record-port'
import type { ModelRequestPortOperation } from '../client/webqq/model-request-port'
import type { OneBotDebugPortOperation } from '../client/webqq/onebot-debug-port'
import type { PresetPortOperation } from '../client/webqq/preset-port'
import { createWorkspaceController } from '../client/webqq/workspace-controller'
import { createWorkspaceLayout } from '../client/webqq/workspace-layout'
import { createWebqqWorkspaceShell } from '../client/webqq/workspace-shell'
import type { SandboxSnapshot, SandboxWorkspaceState } from '../src/types'

/**
 * 四个工作台区域的进行中与错误。这些字段本来就是外壳 interface 上的模型字段，因此这里真的构造
 * 外壳、真的让上游失败，断言模型上的值——而不是读外壳源码。
 *
 * 「调用途中」的观察靠**先发起、不 await、立刻读模型**取得：置进行中与清错误都发生在第一个
 * await 之前，因此这一读一定落在调用途中，与假端口是否立即结算无关。
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

type RegionOperation =
  | WorkspacePortOperation
  | OneBotDebugPortOperation
  | ModelRequestPortOperation
  | PresetPortOperation
  | TestCallRecordPortOperation

/**
 * 四个区域各驱动自己那道端口。用例问的是「失败写进哪个区域的错误位」，因此这里按操作名
 * 路由注入——操作名在四道端口之间不重名，用例里那一串操作名一字不改。
 */
function createRegionPorts() {
  const workspace = createFakeWorkspacePort(createWorkspace())
  const oneBotDebug = createFakeOneBotDebugPort()
  const modelRequest = createFakeModelRequestPort()
  const preset = createFakePresetPort()
  const testCallRecord = createFakeTestCallRecordPort()
  const owners = [workspace, oneBotDebug, modelRequest, preset, testCallRecord]
  return {
    workspace,
    oneBotDebug,
    modelRequest,
    preset,
    testCallRecord,
    rejectNext(operation: RegionOperation, error: unknown) {
      const owner = owners.find((candidate) => operation in candidate)
      if (!owner) throw new Error(`没有端口提供操作：${operation}`)
      ;(owner.rejectNext as (operation: string, error: unknown) => void)(operation, error)
    },
  }
}

async function createShell() {
  const ports = createRegionPorts()
  const controller = createWorkspaceController(ports, createStorage())
  await controller.load()
  // 外壳在 setup 里注册 onMounted；测试直接调用工厂时该钩子是空操作，只吞掉这一条预期告警。
  const warn = console.warn
  console.warn = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].includes('onMounted is called when there is no active component')) return
    warn(...args)
  }
  try {
    const shell = createWebqqWorkspaceShell(controller, createWorkspaceLayout(ref(true)), () => undefined)
    return { ports, shell }
  } finally {
    console.warn = warn
  }
}

/** 发起一次读取但不等待，先读调用途中的模型，再等它结束。 */
async function acrossCall<T>(start: () => Promise<T>, observe: () => void) {
  const running = start().catch(() => undefined)
  observe()
  await running
}

type Shell = Awaited<ReturnType<typeof createShell>>['shell']

function progressOf(shell: Shell) {
  return {
    debug: [shell.debugWorkspaceModel.value.loading, shell.debugWorkspaceModel.value.detailLoading],
    testCall: [shell.testCallWorkspaceModel.value.loading, shell.testCallWorkspaceModel.value.detailLoading],
    modelRequest: [shell.modelRequestWorkspaceModel.value.loading, shell.modelRequestWorkspaceModel.value.detailLoading],
    preset: [shell.presetWorkspaceModel.value.loading, shell.presetWorkspaceModel.value.saving],
  }
}

function errorsOf(shell: Shell) {
  return {
    debug: shell.debugWorkspaceModel.value.error,
    testCall: shell.testCallWorkspaceModel.value.error,
    modelRequest: shell.modelRequestWorkspaceModel.value.error,
    preset: shell.presetWorkspaceModel.value.error,
    composer: shell.chatPaneModel.value.composer.externalError,
  }
}

const noProgress = {
  debug: [false, false],
  testCall: [false, false],
  modelRequest: [false, false],
  preset: [false, false],
}

const noError = { debug: '', testCall: '', modelRequest: '', preset: '', composer: '' }

const presetLocateInput = {
  document: { kind: 'core' as const, fileName: 'a.yml', revision: 'r' },
  expression: { stableId: 'expression-1' },
  scope: { scope: 'main' as const },
}

describe('四个区域的读取闸门', () => {
  it('起始状态四个区域都不转圈、都没有错误', async () => {
    const { shell } = await createShell()

    expect(progressOf(shell)).toEqual(noProgress)
    expect(errorsOf(shell)).toEqual(noError)
  })

  /**
   * 读某条详情时列表不该跟着转圈——这是今天的行为，收拢前整个测试目录零覆盖，而它恰好是四个
   * 区域里唯一形状不一致的地方。用一个计数器代替两条通道就会在这条断言上变红。
   */
  it('三个区域各有列表与详情两条通道，读详情时列表通道不为真', async () => {
    const { shell } = await createShell()

    await acrossCall(() => shell.loadOneBotDebugRecords(), () => {
      expect(progressOf(shell)).toEqual({ ...noProgress, debug: [true, false] })
    })
    await acrossCall(() => shell.loadOneBotDebugRecord({ recordId: 'missing' }), () => {
      expect(progressOf(shell)).toEqual({ ...noProgress, debug: [false, true] })
    })

    await acrossCall(() => shell.loadTestCallRecords(), () => {
      expect(progressOf(shell)).toEqual({ ...noProgress, testCall: [true, false] })
    })
    await acrossCall(() => shell.loadTestCallRecord({ recordId: 'missing' }), () => {
      expect(progressOf(shell)).toEqual({ ...noProgress, testCall: [false, true] })
    })

    await acrossCall(() => shell.loadModelRequestRecords({ scope: 'main' }), () => {
      expect(progressOf(shell)).toEqual({ ...noProgress, modelRequest: [true, false] })
    })
    await acrossCall(() => shell.loadModelRequestRecord({ scope: 'main', recordId: 'missing' }), () => {
      expect(progressOf(shell)).toEqual({ ...noProgress, modelRequest: [false, true] })
    })
  })

  it('预设区域没有详情通道：读目录与读单个预设共用同一条读取通道，保存走另一条', async () => {
    const { shell } = await createShell()

    await acrossCall(() => shell.loadPresetCatalog(), () => {
      expect(progressOf(shell)).toEqual({ ...noProgress, preset: [true, false] })
    })
    await acrossCall(() => shell.readPreset({ kind: 'core', fileName: 'missing.yml' }), () => {
      expect(progressOf(shell)).toEqual({ ...noProgress, preset: [true, false] })
    })
    await acrossCall(
      () => shell.savePreset({ kind: 'core', fileName: 'a.yml', source: 'x', expectedRevision: 'r' }),
      () => expect(progressOf(shell)).toEqual({ ...noProgress, preset: [false, true] }),
    )
  })

  it('定位预设表达式不展示进行中，只写区域错误位', async () => {
    const { ports, shell } = await createShell()
    ports.rejectNext('locatePresetExpression', new Error('没有匹配的模型请求'))

    await acrossCall(
      () => shell.locatePresetExpression(presetLocateInput),
      () => expect(progressOf(shell)).toEqual(noProgress),
    )

    expect(errorsOf(shell)).toEqual({ ...noError, preset: '没有匹配的模型请求' })
  })

  /** 漏掉复位不报错，界面只会一直转圈。四个区域的失败路径逐个断言。 */
  it('读取失败后进行中一定复位，界面不会一直转圈', async () => {
    const { ports, shell } = await createShell()
    ports.rejectNext('getOneBotDebugRecords', new Error('上游失败'))
    ports.rejectNext('getTestCallRecords', new Error('上游失败'))
    ports.rejectNext('getModelRequestRecords', new Error('上游失败'))
    ports.rejectNext('getPresetCatalog', new Error('上游失败'))

    await shell.loadOneBotDebugRecords()
    await shell.loadTestCallRecords()
    await shell.loadModelRequestRecords({ scope: 'main' })
    await shell.loadPresetCatalog()
    await shell.loadOneBotDebugRecord({ recordId: 'missing' }).catch(() => undefined)
    await shell.loadTestCallRecord({ recordId: 'missing' }).catch(() => undefined)
    await shell.loadModelRequestRecord({ scope: 'main', recordId: 'missing' }).catch(() => undefined)
    await shell.savePreset({ kind: 'core', fileName: 'a.yml', source: 'x', expectedRevision: 'r' }).catch(() => undefined)

    expect(progressOf(shell)).toEqual(noProgress)
  })

  it('四个区域各自独立：一个区域的错误不出现在另一个区域的模型上，也不写进发送控件', async () => {
    const { ports, shell } = await createShell()

    ports.rejectNext('getOneBotDebugRecords', new Error('调试记录读取失败'))
    await shell.loadOneBotDebugRecords()
    expect(errorsOf(shell)).toEqual({ ...noError, debug: '调试记录读取失败' })

    ports.rejectNext('getTestCallRecords', new Error('测试调用读取失败'))
    await shell.loadTestCallRecords()
    ports.rejectNext('getModelRequestRecords', new Error('模型请求读取失败'))
    await shell.loadModelRequestRecords({ scope: 'main' })
    ports.rejectNext('getPresetCatalog', new Error('预设目录读取失败'))
    await shell.loadPresetCatalog()

    // 四条错误同时在场且各归各位；发送控件上的外部错误始终为空。
    expect(errorsOf(shell)).toEqual({
      debug: '调试记录读取失败',
      testCall: '测试调用读取失败',
      modelRequest: '模型请求读取失败',
      preset: '预设目录读取失败',
      composer: '',
    })
  })

  /**
   * 每个读取动作把失败写进**自己那个区域**的错误位。这里用可区分的上游消息逐个动作驱动，
   * 因此接错区域会变红。
   *
   * 不在这一层断言调用点传入的兜底文案：工作区控制器已经把每个操作的失败规范化成带消息的
   * `WorkspaceControllerError`，上游即使抛出裸字符串也会被它接住，因此外壳这一层的兜底在
   * 控制器背后不可达。兜底优先级那条规则由错误位模块自己的测试执行。
   */
  it('每个读取动作把上游失败写进自己那个区域的错误位', async () => {
    const { ports, shell } = await createShell()
    const wrote = async (operation: Parameters<typeof ports.rejectNext>[0], message: string, call: () => Promise<unknown>) => {
      ports.rejectNext(operation, new Error(message))
      await call().catch(() => undefined)
      return errorsOf(shell)
    }

    expect(await wrote('getOneBotDebugRecords', '调试列表失败', () => shell.loadOneBotDebugRecords()))
      .toEqual({ ...noError, debug: '调试列表失败' })
    expect(await wrote('getOneBotDebugRecord', '调试详情失败', () => shell.loadOneBotDebugRecord({ recordId: 'r' })))
      .toEqual({ ...noError, debug: '调试详情失败' })
    expect(await wrote('clearOneBotDebugRecords', '调试清理失败', () => shell.clearOneBotDebugRecords()))
      .toEqual({ ...noError, debug: '调试清理失败' })

    expect(await wrote('getTestCallRecords', 'MCP 列表失败', () => shell.loadTestCallRecords()))
      .toEqual({ ...noError, debug: '调试清理失败', testCall: 'MCP 列表失败' })
    expect(await wrote('getTestCallRecord', 'MCP 详情失败', () => shell.loadTestCallRecord({ recordId: 'r' })))
      .toEqual({ ...noError, debug: '调试清理失败', testCall: 'MCP 详情失败' })
    expect(await wrote('clearTestCallRecords', 'MCP 清理失败', () => shell.clearTestCallRecords()))
      .toEqual({ ...noError, debug: '调试清理失败', testCall: 'MCP 清理失败' })

    const beforeModelRequest = { debug: '调试清理失败', testCall: 'MCP 清理失败' }
    expect(await wrote('getModelRequestRecords', '模型请求列表失败', () => shell.loadModelRequestRecords({ scope: 'main' })))
      .toEqual({ ...noError, ...beforeModelRequest, modelRequest: '模型请求列表失败' })
    expect(await wrote('getModelRequestRecords', '模型请求追加失败', () => shell.loadMoreModelRequestRecords({ scope: 'main' })))
      .toEqual({ ...noError, ...beforeModelRequest, modelRequest: '模型请求追加失败' })
    expect(await wrote('getModelRequestRecord', '模型请求详情失败', () => shell.loadModelRequestRecord({ scope: 'main', recordId: 'r' })))
      .toEqual({ ...noError, ...beforeModelRequest, modelRequest: '模型请求详情失败' })
    expect(await wrote('getModelRequestTrajectory', '模型请求轨迹失败', () => shell.loadModelRequestTrajectory({ scope: 'main', recordId: 'r', mode: 'request' })))
      .toEqual({ ...noError, ...beforeModelRequest, modelRequest: '模型请求轨迹失败' })
    expect(await wrote('clearModelRequestRecords', '模型请求清理失败', () => shell.clearModelRequestRecords({ scope: 'main' })))
      .toEqual({ ...noError, ...beforeModelRequest, modelRequest: '模型请求清理失败' })

    const beforePreset = { ...beforeModelRequest, modelRequest: '模型请求清理失败' }
    expect(await wrote('getPresetCatalog', '预设目录失败', () => shell.loadPresetCatalog()))
      .toEqual({ ...noError, ...beforePreset, preset: '预设目录失败' })
    expect(await wrote('readPreset', '预设读取失败', () => shell.readPreset({ kind: 'core', fileName: 'a.yml' })))
      .toEqual({ ...noError, ...beforePreset, preset: '预设读取失败' })
    expect(await wrote('savePreset', '预设保存失败', () => shell.savePreset({ kind: 'core', fileName: 'a.yml', source: 'x', expectedRevision: 'r' })))
      .toEqual({ ...noError, ...beforePreset, preset: '预设保存失败' })
    expect(await wrote('createPreset', '预设新建失败', () => shell.createPreset({ kind: 'core', fileName: 'a.yml', source: 'x' })))
      .toEqual({ ...noError, ...beforePreset, preset: '预设新建失败' })
    expect(await wrote('renamePreset', '预设重命名失败', () => shell.renamePreset({ kind: 'core', fileName: 'a.yml', newFileName: 'b.yml', expectedRevision: 'r', confirmed: true })))
      .toEqual({ ...noError, ...beforePreset, preset: '预设重命名失败' })
    expect(await wrote('deletePreset', '预设删除失败', () => shell.deletePreset({ kind: 'core', fileName: 'a.yml', expectedRevision: 'r', confirmed: true })))
      .toEqual({ ...noError, ...beforePreset, preset: '预设删除失败' })
    expect(await wrote('locatePresetExpression', '定位失败', () => shell.locatePresetExpression(presetLocateInput)))
      .toEqual({ ...noError, ...beforePreset, preset: '定位失败' })
  })

  it('读取失败后再点一次能重试，错误位在新的一次读取开始时就被清掉', async () => {
    const { ports, shell } = await createShell()
    ports.rejectNext('getModelRequestRecords', new Error('第一次就失败'))

    await shell.loadModelRequestRecords({ scope: 'main' })
    expect(errorsOf(shell).modelRequest).toBe('第一次就失败')

    await acrossCall(
      () => shell.loadModelRequestRecords({ scope: 'main' }),
      () => expect(errorsOf(shell).modelRequest).toBe(''),
    )
    expect(errorsOf(shell)).toEqual(noError)
  })

  it('证据导航失败的文案报到模型请求区域，随下一次读取被清掉', async () => {
    const { shell } = await createShell()

    shell.reportEvidenceNavigationFailure('目标记录不在这条轨迹里')
    expect(errorsOf(shell)).toEqual({ ...noError, modelRequest: '目标记录不在这条轨迹里' })

    await shell.loadModelRequestRecords({ scope: 'main' })
    expect(errorsOf(shell)).toEqual(noError)
  })
})
