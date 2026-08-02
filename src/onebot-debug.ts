import { Random } from 'koishi'
import type {
  GetSandboxOneBotDebugRecordsInput,
  SandboxImplementationProfile,
  SandboxOneBotDebugDirection,
  SandboxOneBotDebugError,
  SandboxOneBotDebugRecord,
  SandboxOneBotDebugRecordsPage,
  SandboxOneBotDebugStatus,
} from './types'
import { SandboxOneBotDebugCursorExpiredError } from './types'
import { getOneBotProfileBaseline } from './onebot-profiles'

export const DEFAULT_DEBUG_RECORD_LIMIT = 5000
export const DEFAULT_DEBUG_RECORD_MAX_BYTES = 50 * 1024 * 1024
export const DEFAULT_DEBUG_PAGE_SIZE = 50
export const MAX_DEBUG_PAGE_SIZE = 200

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
  const capability = getOneBotProfileBaseline(record.implementation).capabilities
    .find((item) => item.action === record.action)
  return !!capability && (capability.action === action || capability.aliases?.includes(action) === true)
}

function estimateRecordBytes(record: SandboxOneBotDebugRecord): number {
  return Buffer.byteLength(JSON.stringify(record), 'utf8')
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

export interface SandboxOneBotDebugPersistence {
  load(): Promise<{ nextSequence: number, records: SandboxOneBotDebugRecord[] }>
  replaceAll(nextSequence: number, records: SandboxOneBotDebugRecord[]): Promise<void>
  clear(): Promise<void>
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

export interface SandboxOneBotDebugStoreOptions {
  maxRecords?: number
  maxBytes?: number
  persistence?: SandboxOneBotDebugPersistence
}

export class SandboxOneBotDebugStore {
  private records: SandboxOneBotDebugRecord[] = []
  private nextSequence = 1
  private totalBytes = 0
  private readonly maxRecords: number
  private readonly maxBytes: number
  private readonly persistence?: SandboxOneBotDebugPersistence
  private persistenceQueue = Promise.resolve()
  private ready = Promise.resolve()

  constructor(options: SandboxOneBotDebugStoreOptions | number = {}) {
    // 兼容旧构造签名 debugRecordLimit: number。
    if (typeof options === 'number') {
      this.maxRecords = options
      this.maxBytes = DEFAULT_DEBUG_RECORD_MAX_BYTES
      return
    }
    this.maxRecords = options.maxRecords ?? DEFAULT_DEBUG_RECORD_LIMIT
    this.maxBytes = options.maxBytes ?? DEFAULT_DEBUG_RECORD_MAX_BYTES
    this.persistence = options.persistence
    if (this.persistence) {
      this.ready = this.persistence.load().then((state) => {
        this.records = state.records
          .slice()
          .sort((left, right) => left.sequence - right.sequence)
        this.nextSequence = Math.max(
          state.nextSequence,
          this.records.reduce((max, record) => Math.max(max, record.sequence + 1), 1),
        )
        this.totalBytes = this.records.reduce((sum, record) => sum + estimateRecordBytes(record), 0)
        this.reclaimOverflow()
      }).catch(() => undefined)
    }
  }

  waitForReady(): Promise<void> {
    return this.ready
  }

  waitForPersistence(): Promise<void> {
    return this.persistenceQueue
  }

  append(input: AppendOneBotDebugRecordInput): SandboxOneBotDebugRecord {
    const payload = redactDebugValue(input.payload)
    const record: SandboxOneBotDebugRecord = {
      id: Random.id(),
      sequence: this.nextSequence,
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
    this.nextSequence += 1
    this.records.push(record)
    this.totalBytes += estimateRecordBytes(record)
    this.reclaimOverflow()
    this.queuePersist()
    return structuredClone(record)
  }

  getRecords(input: GetSandboxOneBotDebugRecordsInput = {}): SandboxOneBotDebugRecordsPage {
    const limit = Math.min(Math.max(Number(input.limit ?? DEFAULT_DEBUG_PAGE_SIZE) || DEFAULT_DEBUG_PAGE_SIZE, 1), MAX_DEBUG_PAGE_SIZE)
    const earliestCursor = this.records[0]?.sequence
    if (input.beforeSequence !== undefined) {
      if (!Number.isInteger(input.beforeSequence) || input.beforeSequence < 1) {
        throw new Error('beforeSequence 必须是正整数')
      }
      // 游标指向已回收历史：比当前最早 sequence 还旧。
      if (earliestCursor !== undefined && input.beforeSequence < earliestCursor) {
        throw new SandboxOneBotDebugCursorExpiredError(
          `调试记录游标已过期：${input.beforeSequence}`,
          earliestCursor,
        )
      }
    }

    const filtered = this.records.filter((record) => (
      (!input.botId || record.botId === input.botId)
      && (!input.direction || record.direction === input.direction)
      && (!input.action || matchesActionFilter(record, input.action))
      && (!input.requestedAction || record.requestedAction === input.requestedAction)
      && (!input.errorsOnly || record.status === 'error')
      && (input.beforeSequence === undefined || record.sequence < input.beforeSequence)
    ))
    // 新到旧稳定排序，插入新记录不影响既有 beforeSequence 窗口。
    filtered.sort((left, right) => right.sequence - left.sequence)
    const page = filtered.slice(0, limit)
    const hasMore = filtered.length > page.length
    return {
      records: structuredClone(page),
      hasMore,
      nextCursor: hasMore ? page[page.length - 1]?.sequence : undefined,
      earliestCursor,
    }
  }

  clear(): number {
    const count = this.records.length
    this.records = []
    this.totalBytes = 0
    // sequence 不因清理而回退，避免跨清理复用。
    this.queuePersist(true)
    return count
  }

  private reclaimOverflow(): void {
    while (
      this.records.length > this.maxRecords
      || this.totalBytes > this.maxBytes
    ) {
      const removed = this.records.shift()
      if (!removed) break
      this.totalBytes -= estimateRecordBytes(removed)
    }
    if (this.totalBytes < 0) this.totalBytes = 0
  }

  private queuePersist(clear = false): void {
    const persistence = this.persistence
    if (!persistence) return
    const nextSequence = this.nextSequence
    const records = structuredClone(this.records)
    this.persistenceQueue = this.persistenceQueue
      .then(() => clear ? persistence.clear().then(() => persistence.replaceAll(nextSequence, [])) : persistence.replaceAll(nextSequence, records))
      .catch(() => undefined)
  }
}
