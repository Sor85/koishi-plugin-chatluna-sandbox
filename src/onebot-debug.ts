import { Random } from 'koishi'
import type {
  GetSandboxOneBotDebugRecordsInput,
  SandboxImplementationProfile,
  SandboxOneBotDebugDirection,
  SandboxOneBotDebugRecord,
  SandboxOneBotDebugStatus,
} from './types'

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

export interface AppendOneBotDebugRecordInput {
  botId: string
  implementation: SandboxImplementationProfile
  direction: SandboxOneBotDebugDirection
  type: string
  resolvedType?: string
  status: SandboxOneBotDebugStatus
  durationMs: number
  payload?: unknown
  result?: unknown
  error?: SandboxOneBotDebugRecord['error']
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
      type: input.type,
      resolvedType: input.resolvedType,
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
      && (!input.type || record.type === input.type || record.resolvedType === input.type)
      && (!input.errorsOnly || record.status === 'error')
    )).reverse())
  }

  clear(): number {
    const count = this.records.length
    this.records = []
    return count
  }
}
