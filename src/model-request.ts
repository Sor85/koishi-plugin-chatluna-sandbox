import { Random } from 'koishi'
import type {
  GetSandboxModelRequestRecordsInput,
  SandboxModelRequestCapacity,
  SandboxModelRequestDetail,
  SandboxModelRequestEntities,
  SandboxModelRequestError,
  SandboxModelRequestListItem,
  SandboxModelRequestRecord,
  SandboxModelRequestRecordsPage,
  SandboxModelRequestStatus,
  SandboxModelRequestSummary,
} from './types'
import { SandboxModelRequestCursorExpiredError } from './types'

export const MAIN_MODEL_REQUEST_SCOPE_ID = 'main'
export const UNATTRIBUTED_MODEL_REQUEST_SCOPE_ID = 'unattributed'

export const DEFAULT_MODEL_REQUEST_RECORD_LIMIT = 5000
export const DEFAULT_MODEL_REQUEST_RECORD_MAX_BYTES = 50 * 1024 * 1024
export const DEFAULT_MODEL_REQUEST_PAGE_SIZE = 50
export const MAX_MODEL_REQUEST_PAGE_SIZE = 200

export interface SandboxModelRequestPersistence {
  load(): Promise<{ nextSequence: number, records: SandboxModelRequestRecord[] }>
  replaceAll(nextSequence: number, records: SandboxModelRequestRecord[]): Promise<void>
  clear(): Promise<void>
}

export interface AppendModelRequestRecordInput {
  status: SandboxModelRequestStatus
  durationMs: number
  method?: string
  url?: string
  provider?: string
  model?: string
  attribution: 'attributed' | 'unattributed'
  entities: SandboxModelRequestEntities
  requestBody?: unknown
  requestBodyAvailable: boolean
  interactionId?: string
  error?: SandboxModelRequestError
}

export interface UpdateModelRequestRecordInput {
  status?: SandboxModelRequestStatus
  durationMs?: number
  error?: SandboxModelRequestError
}

export interface SandboxModelRequestStoreOptions {
  maxRecords?: number
  maxBytes?: number
  persistence?: SandboxModelRequestPersistence
}

function estimateBytes(record: SandboxModelRequestRecord): number {
  return Buffer.byteLength(JSON.stringify(record), 'utf8')
}

function summary(record: Pick<SandboxModelRequestRecord, 'requestBody'>): SandboxModelRequestSummary {
  const body = record.requestBody
  if (!body || typeof body !== 'object') return { keys: 0, messageCount: 0, toolCount: 0, bodyAvailable: record.requestBody !== undefined }
  const object = body as Record<string, unknown>
  const messages = Array.isArray(object.messages) ? object.messages : []
  const tools = Array.isArray(object.tools) ? object.tools : []
  return {
    keys: Object.keys(object).length,
    messageCount: messages.length,
    toolCount: tools.length,
    bodyAvailable: record.requestBody !== undefined,
  }
}

export function createModelRequestError(error: unknown, traceId = Random.id()): SandboxModelRequestError {
  const message = error instanceof Error ? error.message : String(error ?? '模型请求失败')
  const lower = message.toLowerCase()
  const retryable = lower.includes('timeout') || lower.includes('超时') || lower.includes('rate limit') || lower.includes('econnreset')
  return { code: retryable ? 'transient_error' : 'model_request_error', message, retryable, traceId }
}

export function presentModelRequestRecord(record: SandboxModelRequestRecord, view: 'list' | 'detail'): SandboxModelRequestListItem | SandboxModelRequestDetail {
  const base = structuredClone(record)
  const item = {
    ...base,
    summary: summary(record),
  }
  if (view === 'list') {
    const { requestBody: _requestBody, ...listItem } = item
    return listItem
  }
  return item
}

export class SandboxModelRequestStore {
  private records: SandboxModelRequestRecord[] = []
  private nextSequence = 1
  private totalBytes = 0
  private readonly maxRecords: number
  private readonly maxBytes: number
  private readonly persistence?: SandboxModelRequestPersistence
  private persistenceQueue = Promise.resolve()
  private ready = Promise.resolve()

  constructor(options: SandboxModelRequestStoreOptions = {}) {
    this.maxRecords = options.maxRecords ?? DEFAULT_MODEL_REQUEST_RECORD_LIMIT
    this.maxBytes = options.maxBytes ?? DEFAULT_MODEL_REQUEST_RECORD_MAX_BYTES
    this.persistence = options.persistence
    if (this.persistence) {
      this.ready = this.persistence.load().then((state) => {
        this.records = state.records.slice().sort((a, b) => a.sequence - b.sequence)
        this.nextSequence = Math.max(state.nextSequence, this.records.reduce((max, record) => Math.max(max, record.sequence + 1), 1))
        this.totalBytes = this.records.reduce((sum, record) => sum + estimateBytes(record), 0)
        this.reclaimOverflow()
      }).catch(() => undefined)
    }
  }

  waitForReady(): Promise<void> { return this.ready }
  waitForPersistence(): Promise<void> { return this.persistenceQueue }

  getCapacity(): SandboxModelRequestCapacity {
    return { recordCount: this.records.length, totalBytes: this.totalBytes, maxRecords: this.maxRecords, maxBytes: this.maxBytes }
  }

  append(input: AppendModelRequestRecordInput): SandboxModelRequestRecord {
    const record: SandboxModelRequestRecord = {
      id: Random.id(),
      sequence: this.nextSequence++,
      createdAt: new Date().toISOString(),
      status: input.status,
      durationMs: input.durationMs,
      ...(input.method ? { method: input.method } : {}),
      ...(input.url ? { url: input.url } : {}),
      ...(input.provider ? { provider: input.provider } : {}),
      ...(input.model ? { model: input.model } : {}),
      attribution: input.attribution,
      entities: structuredClone(input.entities),
      requestBodyAvailable: input.requestBodyAvailable,
      ...(input.requestBody !== undefined ? { requestBody: structuredClone(input.requestBody) } : {}),
      ...(input.interactionId ? { interactionId: input.interactionId } : {}),
      ...(input.error ? { error: structuredClone(input.error) } : {}),
    }
    this.records.push(record)
    this.totalBytes += estimateBytes(record)
    this.reclaimOverflow()
    this.queuePersist()
    return structuredClone(record)
  }

  update(recordId: string, input: UpdateModelRequestRecordInput): SandboxModelRequestRecord | undefined {
    const index = this.records.findIndex(({ id }) => id === recordId)
    if (index < 0) return
    const previous = this.records[index]!
    this.totalBytes -= estimateBytes(previous)
    const next: SandboxModelRequestRecord = {
      ...previous,
      ...(input.status ? { status: input.status } : {}),
      ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}),
    }
    if (input.status === 'success') delete next.error
    else if (input.error) next.error = structuredClone(input.error)
    this.records[index] = next
    this.totalBytes += estimateBytes(next)
    this.reclaimOverflow()
    this.queuePersist()
    return structuredClone(next)
  }

  getRecords(input: GetSandboxModelRequestRecordsInput = {}): SandboxModelRequestRecordsPage {
    const limit = Math.min(Math.max(Number(input.limit ?? DEFAULT_MODEL_REQUEST_PAGE_SIZE) || DEFAULT_MODEL_REQUEST_PAGE_SIZE, 1), MAX_MODEL_REQUEST_PAGE_SIZE)
    const earliestCursor = this.records[0]?.sequence
    if (input.beforeSequence !== undefined) {
      if (!Number.isInteger(input.beforeSequence) || input.beforeSequence < 1) {
        throw new Error('beforeSequence 必须是正整数')
      }
      if (earliestCursor !== undefined && input.beforeSequence < earliestCursor) {
        throw new SandboxModelRequestCursorExpiredError(
          `模型请求记录游标已过期：${input.beforeSequence}`,
          earliestCursor,
        )
      }
    }
    const filtered = this.records.filter((record) => (
      (!input.botId || record.entities.botId === input.botId)
      && (!input.conversationId || record.entities.conversationId === input.conversationId)
      && (!input.interactionId || record.interactionId === input.interactionId)
      && (!input.model || record.model === input.model)
      && (!input.errorsOnly || record.status === 'error')
      && (input.beforeSequence === undefined || record.sequence < input.beforeSequence)
    )).sort((a, b) => b.sequence - a.sequence)
    const records = filtered.slice(0, limit)
    const hasMore = filtered.length > records.length
    return {
      records: records.map((record) => presentModelRequestRecord(record, 'list') as SandboxModelRequestListItem),
      hasMore,
      nextCursor: hasMore ? records[records.length - 1]?.sequence : undefined,
      earliestCursor,
      capacity: this.getCapacity(),
    }
  }

  getRecord(recordId: string): SandboxModelRequestDetail | undefined {
    const record = this.records.find(({ id }) => id === recordId)
    return record ? presentModelRequestRecord(record, 'detail') as SandboxModelRequestDetail : undefined
  }

  clear(): number {
    const count = this.records.length
    this.records = []
    this.totalBytes = 0
    this.queuePersist(true)
    return count
  }

  private reclaimOverflow(): void {
    while (this.records.length > this.maxRecords || this.totalBytes > this.maxBytes) {
      const removed = this.records.shift()
      if (!removed) break
      this.totalBytes -= estimateBytes(removed)
    }
    if (this.totalBytes < 0) this.totalBytes = 0
  }

  private queuePersist(clear = false): void {
    if (!this.persistence) return
    const records = structuredClone(this.records)
    const nextSequence = this.nextSequence
    this.persistenceQueue = this.persistenceQueue.then(() => clear
      ? this.persistence!.clear().then(() => this.persistence!.replaceAll(nextSequence, []))
      : this.persistence!.replaceAll(nextSequence, records)).catch(() => undefined)
  }
}
