import { Random } from 'koishi'
import { createHash } from 'node:crypto'
import type {
  GetSandboxOneBotDebugRecordsInput,
  SandboxImplementationProfile,
  SandboxOneBotDebugCapacity,
  SandboxOneBotDebugDirection,
  SandboxOneBotDebugError,
  SandboxOneBotDebugLargeValueSummary,
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
/** 超过该字符数的 Base64 类内容在投影层折叠；持久化仍保留完整值。 */
export const LARGE_BASE64_CHAR_THRESHOLD = 8 * 1024

const SENSITIVE_KEY_PATTERN = /authorization|access[_-]?token|secret|password|cookie|private[_-]?key/i
const TEXT_KEY_PATTERN = /^(?:content|message|raw_message|text)$/i
const BASE64_BODY_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

function redactSensitiveAndText(value: unknown, key = ''): unknown {
  if (SENSITIVE_KEY_PATTERN.test(key)) return '[已脱敏]'
  if (typeof value === 'string') {
    // 消息正文不是协议调试所需字段，只保留长度可避免短文本绕过脱敏。
    if (TEXT_KEY_PATTERN.test(key)) return `[文本已省略，${value.length} 字符]`
    return value
  }
  if (Array.isArray(value)) return value.map((item) => redactSensitiveAndText(item, key))
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [
    entryKey,
    redactSensitiveAndText(entryValue, entryKey),
  ]))
}

function isBase64Body(value: string): boolean {
  if (value.length < 16 || value.length % 4 !== 0) return false
  return BASE64_BODY_PATTERN.test(value)
}

function inferMimeFromBase64(body: string): string | undefined {
  try {
    const bytes = Buffer.from(body.slice(0, 64), 'base64')
    if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
    if (bytes.length >= 6 && bytes.subarray(0, 6).toString('ascii') === 'GIF87a') return 'image/gif'
    if (bytes.length >= 6 && bytes.subarray(0, 6).toString('ascii') === 'GIF89a') return 'image/gif'
    if (bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp'
    if (bytes.length >= 5 && bytes.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf'
  } catch {
    return undefined
  }
}

function createLargeValueSummary(encoding: 'base64' | 'data-url', body: string, mimeType?: string): SandboxOneBotDebugLargeValueSummary {
  const byteLength = Math.floor(body.length * 3 / 4) - (body.endsWith('==') ? 2 : body.endsWith('=') ? 1 : 0)
  return {
    kind: 'large-value',
    encoding,
    ...(mimeType ? { mimeType } : {}),
    charCount: body.length,
    byteLength: Math.max(0, byteLength),
    sha256: createHash('sha256').update(body).digest('hex'),
  }
}

function foldLargeValues(value: unknown): unknown {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    const dataUrl = trimmed.match(/^data:([^;,]+);base64,(.+)$/s)
    if (dataUrl && dataUrl[2].length > LARGE_BASE64_CHAR_THRESHOLD && isBase64Body(dataUrl[2])) {
      return createLargeValueSummary('data-url', dataUrl[2], dataUrl[1].trim().toLowerCase() || undefined)
    }
    if (trimmed.startsWith('base64://')) {
      const body = trimmed.slice('base64://'.length)
      if (body.length > LARGE_BASE64_CHAR_THRESHOLD && isBase64Body(body)) {
        return createLargeValueSummary('base64', body, inferMimeFromBase64(body))
      }
      return value
    }
    if (trimmed.length > LARGE_BASE64_CHAR_THRESHOLD && isBase64Body(trimmed)) {
      return createLargeValueSummary('base64', trimmed, inferMimeFromBase64(trimmed))
    }
    return value
  }
  if (Array.isArray(value)) return value.map((item) => foldLargeValues(item))
  if (!value || typeof value !== 'object') return value
  if (Reflect.get(value, 'kind') === 'large-value') return value
  return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [
    entryKey,
    foldLargeValues(entryValue),
  ]))
}

export function presentOneBotDebugRecord(
  record: SandboxOneBotDebugRecord,
  includeLargeValues = false,
): SandboxOneBotDebugRecord {
  if (includeLargeValues) return structuredClone(record)
  return {
    ...structuredClone(record),
    payload: foldLargeValues(record.payload),
    result: foldLargeValues(record.result),
    error: record.error
      ? {
        ...record.error,
        // error.message 保持可读；不把错误消息当 Base64 折叠。
        message: record.error.message,
      }
      : undefined,
  }
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

  getCapacity(): SandboxOneBotDebugCapacity {
    return {
      recordCount: this.records.length,
      totalBytes: this.totalBytes,
      maxRecords: this.maxRecords,
      maxBytes: this.maxBytes,
    }
  }

  append(input: AppendOneBotDebugRecordInput): SandboxOneBotDebugRecord {
    // 持久化保留完整原始大型值；仅脱敏密钥与消息正文。
    const payload = redactSensitiveAndText(input.payload)
    const result = redactSensitiveAndText(input.result)
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
      result,
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
    // 广播与即时返回使用折叠投影，避免 MCP 事件流被超大 Base64 淹没。
    return presentOneBotDebugRecord(record, false)
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
      records: page.map((record) => presentOneBotDebugRecord(record, false)),
      hasMore,
      nextCursor: hasMore ? page[page.length - 1]?.sequence : undefined,
      earliestCursor,
      capacity: this.getCapacity(),
    }
  }

  getRecord(recordId: string, includeLargeValues = false): SandboxOneBotDebugRecord | undefined {
    const record = this.records.find(({ id }) => id === recordId)
    return record ? presentOneBotDebugRecord(record, includeLargeValues) : undefined
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
