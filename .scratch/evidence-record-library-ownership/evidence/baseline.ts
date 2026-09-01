/**
 * 记录读取路径的确定性基线。
 *
 * 只驱动 Console RPC 监听器与记录库的 `append`——这两处在本轮收拢前后都存在，因此同一份脚本
 * 既能跑 HEAD 也能跑工作区，输出可以逐字节比对。记录标识与时间按首次出现顺序归一化，
 * 时钟用单调假时钟固定，避免同毫秒追加导致分页顺序随机。
 *
 * 用法：npx tsx .scratch/evidence-record-library-ownership/evidence/baseline.ts
 */
import { App } from '@koishijs/core'
import { registerConsole } from '../../../src/console'
import { SandboxControlService, SandboxRuntimeBotRegistry } from '../../../src/control-service'
import { SandboxModelRequestStore } from '../../../src/model-request'
import { SandboxTestSpaceService } from '../../../src/test-spaces'

const BASE_TIME = Date.UTC(2026, 0, 1, 0, 0, 0)
let tick = 0
const RealDate = Date
class MonotonicDate extends RealDate {
  constructor(...args: unknown[]) {
    if (args.length === 0) super(BASE_TIME + tick++ * 1000)
    else super(...(args as [never]))
  }

  static now(): number {
    return BASE_TIME + tick++ * 1000
  }
}
globalThis.Date = MonotonicDate as unknown as DateConstructor

const appearance = {
  enableSandboxFrostedGlass: true,
  sandboxTimBubbleTail: true,
  sandboxColorMode: 'auto' as const,
  sandboxAccentColor: '#2563eb',
  sandboxMarkRecalledMessages: true,
}

function modelRequest(scopeId: string, model: string, conversationId: string, failed = false) {
  return {
    status: failed ? ('error' as const) : ('success' as const),
    durationMs: 42,
    method: 'POST',
    url: 'https://api.example.invalid/v1/chat/completions',
    provider: 'baseline',
    model,
    attribution: 'attributed' as const,
    entities: { scopeId, botId: '20001', conversationId },
    requestBodyAvailable: true,
    requestBody: {
      model,
      messages: [{ role: 'user', content: `基线 ${model}` }],
      tools: [{ type: 'function', function: { name: 'noop', description: '无操作', parameters: { type: 'object' } } }],
    },
    responseBodyStatus: 'complete' as const,
    responseBodyFormat: 'json' as const,
    responseStatus: failed ? 500 : 200,
    responseBodyRaw: JSON.stringify({ content: `回应 ${model}` }),
    ...(failed ? { error: { code: 'model_request_error', message: 'HTTP 500', retryable: false, traceId: `baseline-${model}` } } : {}),
  }
}

/** 归一化不稳定的标识与时间，保留它们的相等关系。 */
function normalize(value: unknown, tokens: Map<string, string>): unknown {
  if (typeof value === 'string') {
    let text = value
    for (const [raw, token] of tokens) text = text.split(raw).join(token)
    return text.replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, (stamp) => reserve(tokens, stamp, 'time'))
  }
  if (Array.isArray(value)) return value.map((item) => normalize(item, tokens))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, normalize(entry, tokens)]))
  }
  return value
}

function reserve(tokens: Map<string, string>, raw: string, kind: string): string {
  const existing = tokens.get(raw)
  if (existing) return existing
  const created = `<${kind}:${[...tokens.values()].filter((value) => value.startsWith(`<${kind}:`)).length + 1}>`
  tokens.set(raw, created)
  return created
}

async function main(): Promise<void> {
  const app = new App()
  const runtimeBots = new SandboxRuntimeBotRegistry()
  const control = new SandboxControlService(app, { runtimeBots })
  const spaces = new SandboxTestSpaceService(app, runtimeBots)
  const space = spaces.createSpace({ name: '基线空间' })
  const unattributed = new SandboxModelRequestStore()

  const listeners = new Map<string, (...args: never[]) => unknown>()
  registerConsole({
    addEntry() {},
    addListener(event, callback) { listeners.set(event, callback as never) },
    broadcast() {},
  }, control, appearance, undefined, spaces, unattributed)

  const call = async (event: string, input?: unknown) => {
    const listener = listeners.get(event)
    if (!listener) throw new Error(`监听器未注册：${event}`)
    try {
      return { ok: await Reflect.apply(listener, undefined, input === undefined ? [] : [input]) }
    } catch (error) {
      return { error: error instanceof Error ? `${error.constructor.name}: ${error.message}` : String(error) }
    }
  }

  const mainStore = control.getModelRequestStore()
  const spaceStore = space.control.getModelRequestStore()
  const mainRecords = [
    mainStore.append(modelRequest('main', 'main-a', 'private:10001:20001')),
    mainStore.append(modelRequest('main', 'main-b', 'private:10001:20001', true)),
  ]
  const spaceRecords = [spaceStore.append(modelRequest(space.id, 'space-a', 'group:30001'))]
  const lostRecords = [unattributed.append({
    ...modelRequest('main', 'lost-a', 'private:10001:20001'),
    attribution: 'unattributed' as const,
    entities: {},
  })]

  for (const [index, target] of [control, space.control].entries()) {
    target.recordOneBotDebug({
      botId: index === 0 ? '20001' : '21001',
      implementation: index === 0 ? 'napcat' : 'llbot',
      direction: 'action',
      requestedAction: `baseline_action_${index}`,
      action: `baseline_action_${index}`,
      status: 'success',
      durationMs: 7,
      payload: { user_id: '10001' },
      result: { ok: true },
    })
  }

  const debugPage = await call('chatluna-sandbox/debug-records', {}) as { ok?: { records: Array<{ id: string }> } }
  const debugIds = debugPage.ok?.records.map(({ id }) => id) ?? []

  const output: Record<string, unknown> = {
    debugRecordsFederated: debugPage,
    debugRecordsAsc: await call('chatluna-sandbox/debug-records', { order: 'asc' }),
    debugRecordsSpace: await call('chatluna-sandbox/debug-records', { spaceId: space.id }),
    debugRecordsPaged: await call('chatluna-sandbox/debug-records', { limit: 1 }),
    debugRecordFederated: await call('chatluna-sandbox/debug-record', { recordId: debugIds[0] }),
    debugRecordFederatedLarge: await call('chatluna-sandbox/debug-record', { recordId: debugIds[0], includeLargeValues: true }),
    debugRecordSpace: await call('chatluna-sandbox/debug-record', { spaceId: space.id, recordId: debugIds[0] }),
    debugRecordMissingFederated: await call('chatluna-sandbox/debug-record', { recordId: '缺失' }),
    debugRecordMissingSpace: await call('chatluna-sandbox/debug-record', { spaceId: space.id, recordId: '缺失' }),
    modelRequestsMain: await call('chatluna-sandbox/model-request-records', { scope: 'main' }),
    modelRequestsSpace: await call('chatluna-sandbox/model-request-records', { scope: 'space', spaceId: space.id }),
    modelRequestsUnattributed: await call('chatluna-sandbox/model-request-records', { scope: 'unattributed' }),
    modelRequestsAll: await call('chatluna-sandbox/model-request-records', { scope: 'all' }),
    modelRequestsAllPaged: await call('chatluna-sandbox/model-request-records', { scope: 'all', limit: 1 }),
    modelRequestsErrorsOnly: await call('chatluna-sandbox/model-request-records', { scope: 'all', errorsOnly: true }),
    modelRequestRecordMain: await call('chatluna-sandbox/model-request-record', { scope: 'main', recordId: mainRecords[0]!.id }),
    modelRequestRecordSpace: await call('chatluna-sandbox/model-request-record', { scope: 'space', spaceId: space.id, recordId: spaceRecords[0]!.id }),
    modelRequestRecordUnattributed: await call('chatluna-sandbox/model-request-record', { scope: 'unattributed', recordId: lostRecords[0]!.id }),
    modelRequestRecordAllMain: await call('chatluna-sandbox/model-request-record', { scope: 'all', recordId: mainRecords[0]!.id }),
    modelRequestRecordAllSpace: await call('chatluna-sandbox/model-request-record', { scope: 'all', recordId: spaceRecords[0]!.id }),
    modelRequestRecordMissingMain: await call('chatluna-sandbox/model-request-record', { scope: 'main', recordId: '缺失' }),
    modelRequestRecordMissingSpace: await call('chatluna-sandbox/model-request-record', { scope: 'space', spaceId: space.id, recordId: '缺失' }),
    modelRequestRecordMissingUnattributed: await call('chatluna-sandbox/model-request-record', { scope: 'unattributed', recordId: '缺失' }),
    modelRequestRecordMissingAll: await call('chatluna-sandbox/model-request-record', { scope: 'all', recordId: '缺失' }),
    trajectoryMainRequest: await call('chatluna-sandbox/model-request-trajectory', { scope: 'main', recordId: mainRecords[0]!.id, mode: 'request' }),
    trajectoryMainConversation: await call('chatluna-sandbox/model-request-trajectory', { scope: 'main', recordId: mainRecords[0]!.id, mode: 'conversation' }),
    trajectorySpaceConversation: await call('chatluna-sandbox/model-request-trajectory', { scope: 'space', spaceId: space.id, recordId: spaceRecords[0]!.id, mode: 'conversation' }),
    trajectoryUnattributedRequest: await call('chatluna-sandbox/model-request-trajectory', { scope: 'unattributed', recordId: lostRecords[0]!.id, mode: 'request' }),
    trajectoryUnattributedConversation: await call('chatluna-sandbox/model-request-trajectory', { scope: 'unattributed', recordId: lostRecords[0]!.id, mode: 'conversation' }),
    trajectoryAllMainConversation: await call('chatluna-sandbox/model-request-trajectory', { scope: 'all', recordId: mainRecords[0]!.id, mode: 'conversation' }),
    trajectoryAllSpaceConversation: await call('chatluna-sandbox/model-request-trajectory', { scope: 'all', recordId: spaceRecords[0]!.id, mode: 'conversation' }),
    clearModelRequestsAll: await call('chatluna-sandbox/clear-model-request-records', { scope: 'all' }),
    clearModelRequestsSpace: await call('chatluna-sandbox/clear-model-request-records', { scope: 'space', spaceId: space.id }),
    clearModelRequestsUnattributed: await call('chatluna-sandbox/clear-model-request-records', { scope: 'unattributed' }),
    modelRequestsAfterClear: await call('chatluna-sandbox/model-request-records', { scope: 'all' }),
    clearDebugRecordsFederated: await call('chatluna-sandbox/clear-debug-records', {}),
    debugRecordsAfterClear: await call('chatluna-sandbox/debug-records', {}),
  }

  const tokens = new Map<string, string>()
  for (const record of [...mainRecords, ...spaceRecords, ...lostRecords]) reserve(tokens, record.id, 'record')
  for (const id of debugIds) reserve(tokens, id, 'debug')
  reserve(tokens, space.id, 'space')

  process.stdout.write(`${JSON.stringify(normalize(output, tokens), null, 2)}\n`)
  await app.stop()
}

void main()
