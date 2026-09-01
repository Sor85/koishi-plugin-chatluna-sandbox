/**
 * 端口拆分基线比对用的确定性场景。重构前后各跑一次同一份场景，比对四个工作台模型与
 * 发送控件模型的完整输出——它们本来就是外壳 interface 的一部分，可以直接导出比对。
 */
import type {
  SandboxConsoleOneBotDebugRecord,
  SandboxModelRequestDetail,
  SandboxModelRequestListItem,
  SandboxModelRequestTrajectory,
  SandboxWorkspaceState,
} from '../../../src/types'
import type { SandboxPresetDocument } from '../../../src/presets'
import type { SandboxMcpCallRecord, SandboxMcpCallRecordListItem } from '../../../src/mcp/types'

export const workspace: SandboxWorkspaceState = {
  snapshot: {
    revision: 7,
    participants: [
      { kind: 'user', id: '10001', name: '测试用户1' },
      { kind: 'user', id: '10002', name: '测试用户2' },
      { kind: 'bot', id: '20001', name: 'Koishi', implementation: 'napcat', enabled: true },
    ],
    groups: [],
    conversations: [
      { id: 'private:10001:20001', type: 'direct', participantIds: ['10001', '20001'], messageIds: ['message-1'] },
    ],
    conversationInstances: [],
    messages: [
      {
        id: 'message-1',
        conversationId: 'private:10001:20001',
        authorId: '10001',
        content: '基准消息',
        createdAt: '2026-08-30T00:00:00.000Z',
      },
    ],
    forwards: [],
    friendships: [{ id: 'friend:10001:20001', participantIds: ['10001', '20001'], remarks: {}, createdAt: '2026-08-01T00:00:00.000Z' }],
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

export const debugRecord: SandboxConsoleOneBotDebugRecord = {
  id: 'debug-1',
  sequence: 1,
  createdAt: '2026-08-30T12:00:00.000Z',
  botId: '20001',
  implementation: 'napcat',
  direction: 'action',
  requestedAction: 'get_login_info',
  action: 'get_login_info',
  status: 'success',
  durationMs: 3,
  payload: {},
  result: { status: 'ok' },
  entities: {},
  source: { type: 'main', name: '主环境' },
}

export const modelRequestItem: SandboxModelRequestListItem = {
  id: 'record-1',
  sequence: 8,
  createdAt: '2026-08-30T12:00:01.000Z',
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

export const modelRequestDetail: SandboxModelRequestDetail = {
  ...modelRequestItem,
  variables: [],
  requestBody: { model: 'gpt-4.1', messages: [] },
}

export const modelRequestTrajectory: SandboxModelRequestTrajectory = {
  mode: 'request',
  records: [modelRequestItem],
  rows: [{ id: 'record-1:request', index: 1, kind: 'request', preview: 'openai / gpt-4.1', requestId: 'record-1' }],
  promptComposition: [],
  complete: true,
}

export const presetDocument: SandboxPresetDocument = {
  kind: 'core',
  fileName: 'assistant.yml',
  displayName: 'assistant',
  source: 'keywords:\n  - assistant\n',
  revision: 'rev-1',
  size: 24,
  modifiedAt: '2026-08-22T00:00:00.000Z',
  templateFields: [],
  expressions: [],
  diagnostics: [],
}

export const mcpCallItem: SandboxMcpCallRecordListItem = {
  id: 'call-1',
  createdAt: '2026-08-30T12:00:02.000Z',
  credentialName: '测试凭证',
  transport: 'mcp',
  sourceIp: '127.0.0.1',
  tool: 'get_server_info',
  durationMs: 4,
  status: 'success',
  affected: [],
}

export const mcpCallDetail: SandboxMcpCallRecord = {
  ...mcpCallItem,
  arguments: {},
  result: { name: 'chatluna-sandbox' },
}

export function createStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  }
}

/** 外壳在工厂里注册 onMounted；脱离组件调用时该钩子是空操作，只吞掉这一条预期告警。 */
export function silenceMountWarning<T>(run: () => T): T {
  const warn = console.warn
  console.warn = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].includes('onMounted is called when there is no active component')) return
    warn(...args)
  }
  try {
    return run()
  } finally {
    console.warn = warn
  }
}

export function canonical(value: unknown) {
  return JSON.stringify(value, (_key, item) => item === undefined ? '<undefined>' : item, 2)
}

/**
 * 调用序列按能力分组。基线侧只有一份记录器，按操作名分组；重构后每道端口各有一份记录器，
 * 直接就是分好的组。两侧因此产出同一份 JSON，可以逐字节比对。
 */
const capabilityOf: Record<string, string> = {
  getOneBotDebugRecords: 'oneBotDebug',
  getOneBotDebugRecord: 'oneBotDebug',
  clearOneBotDebugRecords: 'oneBotDebug',
  getModelRequestRecords: 'modelRequest',
  getModelRequestRecord: 'modelRequest',
  getModelRequestTrajectory: 'modelRequest',
  clearModelRequestRecords: 'modelRequest',
  getPresetCatalog: 'preset',
  readPreset: 'preset',
  createPreset: 'preset',
  savePreset: 'preset',
  renamePreset: 'preset',
  deletePreset: 'preset',
  locatePresetExpression: 'preset',
  getMcpCallRecords: 'mcpCallRecord',
  getMcpCallRecord: 'mcpCallRecord',
  clearMcpCallRecords: 'mcpCallRecord',
}

export interface RecordedCall {
  operation: string
  input: unknown
}

export function groupCalls(calls: readonly RecordedCall[]) {
  const groups: Record<string, RecordedCall[]> = {
    workspace: [],
    oneBotDebug: [],
    modelRequest: [],
    preset: [],
    mcpCallRecord: [],
  }
  for (const call of calls) groups[capabilityOf[call.operation] ?? 'workspace']!.push(call)
  return groups
}
