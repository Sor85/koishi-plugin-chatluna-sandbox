import { Random } from 'koishi'
import type {
  GetSandboxOneBotDebugRecordsInput,
  SandboxImplementationProfile,
  SandboxOneBotDebugDirection,
  SandboxOneBotDebugError,
  SandboxOneBotDebugRecord,
  SandboxOneBotDebugStatus,
} from './types'
import { getOneBotProfileBaseline } from './onebot-profiles'

const DEFAULT_DEBUG_RECORD_LIMIT = 500
const SENSITIVE_KEY_PATTERN = /authorization|access[_-]?token|secret|password|cookie|private[_-]?key/i
const BASE64_KEY_PATTERN = /base64|dataBase64/i
const TEXT_KEY_PATTERN = /^(?:content|message|raw_message|text)$/i

function redactDebugValue(value: unknown, key = ''): unknown {
  if (SENSITIVE_KEY_PATTERN.test(key)) return '[已脱敏]'
  if (BASE64_KEY_PATTERN.test(key) && typeof value === 'string') return `[Base64 已省略，${value.length} 字符]`
  if (typeof value === 'string') {
    // 消息正文与媒体内容不是协议调试所需字段，只保留长度可避免短文本绕过脱敏。
    if (TEXT_KEY_PATTERN.test(key)) return `[文本已省略，${value.length} 字符]`
    return value
  }
  if (Array.isArray(value)) return value.map((item) => redactDebugValue(item, key))
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [
    entryKey,
    redactDebugValue(entryValue, entryKey),
  ]))
}

function readEntityId(payload: unknown, ...keys: string[]): string | undefined {
  if (!payload || typeof payload !== 'object') return
  for (const key of keys) {
    const value = Reflect.get(payload, key)
    if (typeof value === 'string' || typeof value === 'number') return String(value)
  }
}

function matchesActionFilter(record: SandboxOneBotDebugRecord, action: string): boolean {
  if (record.action === action || record.requestedAction === action || record.matchedAlias === action) return true
  // action 过滤匹配规范 action，并覆盖能力矩阵声明的全部别名。
  const capability = getOneBotProfileBaseline(record.implementation).capabilities
    .find((item) => item.action === record.action)
  return !!capability && (capability.action === action || capability.aliases?.includes(action) === true)
}

export function createOneBotDebugError(error: unknown, traceId = Random.id()): SandboxOneBotDebugError {
  const message = error instanceof Error ? error.message : String(error ?? 'OneBot 调用失败')
  const lower = message.toLowerCase()
  const retryable = lower.includes('timeout')
    || lower.includes('超时')
    || lower.includes('temporarily')
    || lower.includes('busy')
    || lower.includes('rate limit')
    || lower.includes('econnreset')
    || lower.includes('econnrefused')
  let code = 'onebot_error'
  if (message.includes('能力已被禁用')) code = 'capability_disabled'
  else if (message.includes('不支持 OneBot action') || message.includes('暂不支持')) code = 'action_unsupported'
  else if (message.includes('已撤回')) code = 'message_recalled'
  else if (retryable) code = 'transient_error'
  return { code, message, retryable, traceId }
}

export interface AppendOneBotDebugRecordInput {
  botId: string
  implementation: SandboxImplementationProfile
  direction: SandboxOneBotDebugDirection
  requestedAction: string
  action: string
  matchedAlias?: string
  status: SandboxOneBotDebugStatus
  durationMs: number
  payload?: unknown
  result?: unknown
  error?: SandboxOneBotDebugError
}

export class SandboxOneBotDebugStore {
  private records: SandboxOneBotDebugRecord[] = []

  constructor(private limit = DEFAULT_DEBUG_RECORD_LIMIT) {}

  append(input: AppendOneBotDebugRecordInput): SandboxOneBotDebugRecord {
    const payload = redactDebugValue(input.payload)
    const record: SandboxOneBotDebugRecord = {
      id: Random.id(),
      createdAt: new Date().toISOString(),
      botId: input.botId,
      implementation: input.implementation,
      direction: input.direction,
      requestedAction: input.requestedAction,
      action: input.action,
      ...(input.matchedAlias ? { matchedAlias: input.matchedAlias } : {}),
      status: input.status,
      durationMs: input.durationMs,
      payload,
      result: redactDebugValue(input.result),
      entities: {
        userId: readEntityId(input.payload, 'user_id', 'target_id'),
        groupId: readEntityId(input.payload, 'group_id'),
        conversationId: readEntityId(input.payload, 'conversation_id', 'channel_id'),
        messageId: readEntityId(input.payload, 'message_id'),
      },
      error: input.error,
    }
    this.records.push(record)
    if (this.records.length > this.limit) this.records.splice(0, this.records.length - this.limit)
    return structuredClone(record)
  }

  getRecords(input: GetSandboxOneBotDebugRecordsInput = {}): SandboxOneBotDebugRecord[] {
    return structuredClone(this.records.filter((record) => (
      (!input.botId || record.botId === input.botId)
      && (!input.direction || record.direction === input.direction)
      && (!input.action || matchesActionFilter(record, input.action))
      && (!input.requestedAction || record.requestedAction === input.requestedAction)
      && (!input.errorsOnly || record.status === 'error')
    )).reverse())
  }

  clear(): number {
    const count = this.records.length
    this.records = []
    return count
  }
}
