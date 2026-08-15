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
  SandboxModelResponseBodyFormat,
  SandboxModelResponseBodyStatus,
} from './types'
import { SandboxModelRequestCursorExpiredError } from './types'

export const MAIN_MODEL_REQUEST_SCOPE_ID = 'main'
export const UNATTRIBUTED_MODEL_REQUEST_SCOPE_ID = 'unattributed'

export const DEFAULT_MODEL_REQUEST_RECORD_LIMIT = 500
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
  headers?: Record<string, string>
  attribution: 'attributed' | 'unattributed'
  entities: SandboxModelRequestEntities
  requestBody?: unknown
  requestBodyAvailable: boolean
  responseBodyStatus?: SandboxModelResponseBodyStatus
  responseBodyFormat?: SandboxModelResponseBodyFormat
  responseStatus?: number
  responseBodyRaw?: string
  responseBodyError?: string
  interactionId?: string
  error?: SandboxModelRequestError
}

export interface UpdateModelRequestRecordInput {
  status?: SandboxModelRequestStatus
  durationMs?: number
  headers?: Record<string, string>
  responseBodyStatus?: SandboxModelResponseBodyStatus
  responseBodyFormat?: SandboxModelResponseBodyFormat
  responseStatus?: number
  responseBodyRaw?: string
  responseBodyError?: string
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
  // ChatLuna 的 Gemini 网关使用 contents/functionDeclarations；只读 OpenAI
  // 字段会把真实请求误报成 0 条消息、1 个工具，导致详情页统计失真。
  const messages = Array.isArray(object.messages)
    ? object.messages
    : Array.isArray(object.contents)
      ? object.contents
      : []
  const tools = Array.isArray(object.tools) ? object.tools : []
  const toolCount = tools.reduce((count, tool) => {
    if (!tool || typeof tool !== 'object') return count + 1
    const declarations = Reflect.get(tool, 'functionDeclarations')
    return count + (Array.isArray(declarations) ? declarations.length : 1)
  }, 0)
  return {
    keys: Object.keys(object).length,
    messageCount: messages.length,
    toolCount,
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
    const {
      requestBody: _requestBody,
      responseBodyRaw: _responseBodyRaw,
      ...listItem
    } = item
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
  private persistenceAuthoritative = true
  private readonly pendingUpdates = new Set<Promise<void>>()

  constructor(options: SandboxModelRequestStoreOptions = {}) {
    this.maxRecords = options.maxRecords ?? DEFAULT_MODEL_REQUEST_RECORD_LIMIT
    this.maxBytes = options.maxBytes ?? DEFAULT_MODEL_REQUEST_RECORD_MAX_BYTES
    this.persistence = options.persistence
    if (this.persistence) {
      this.ready = this.persistence.load().then((state) => {
        const capturedDuringLoad = this.records
        const persisted = state.records.slice().sort((a, b) => a.sequence - b.sequence)
        let nextSequence = Math.max(
          state.nextSequence,
          persisted.reduce((max, record) => Math.max(max, record.sequence + 1), 1),
        )
        // 数据库恢复是异步的，ChatLuna 可能在恢复完成前就发起请求。不能用加载结果
        // 直接覆盖启动期记录，否则一次正常重启就可能同时丢掉旧记录和刚捕获的新请求。
        const captured = capturedDuringLoad.map((record) => ({
          ...record,
          sequence: nextSequence++,
        }))
        this.records = [...persisted, ...captured]
        this.nextSequence = nextSequence
        this.totalBytes = this.records.reduce((sum, record) => sum + estimateBytes(record), 0)
        this.reclaimOverflow()
      }).catch(() => {
        // 加载失败时不能把当前空内存状态当成权威数据回写，否则会覆盖数据库历史记录。
        this.persistenceAuthoritative = false
      })
    }
  }

  waitForReady(): Promise<void> { return this.ready }

  async waitForPersistence(): Promise<void> {
    await this.ready
    while (this.pendingUpdates.size) await Promise.all([...this.pendingUpdates])
    await this.persistenceQueue
  }

  trackUpdate(task: Promise<void>): void {
    const tracked = task.finally(() => this.pendingUpdates.delete(tracked))
    this.pendingUpdates.add(tracked)
  }

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
      ...(input.headers ? { headers: structuredClone(input.headers) } : {}),
      attribution: input.attribution,
      entities: structuredClone(input.entities),
      requestBodyAvailable: input.requestBodyAvailable,
      ...(input.requestBody !== undefined ? { requestBody: structuredClone(input.requestBody) } : {}),
      responseBodyStatus: input.responseBodyStatus ?? 'unavailable',
      ...(input.responseBodyFormat ? { responseBodyFormat: input.responseBodyFormat } : {}),
      ...(input.responseStatus !== undefined ? { responseStatus: input.responseStatus } : {}),
      ...(input.responseBodyRaw !== undefined ? { responseBodyRaw: input.responseBodyRaw } : {}),
      ...(input.responseBodyError ? { responseBodyError: input.responseBodyError } : {}),
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
      ...(input.headers ? { headers: structuredClone(input.headers) } : {}),
      ...(input.responseBodyStatus ? { responseBodyStatus: input.responseBodyStatus } : {}),
      ...(input.responseBodyFormat ? { responseBodyFormat: input.responseBodyFormat } : {}),
      ...(input.responseStatus !== undefined ? { responseStatus: input.responseStatus } : {}),
      ...(input.responseBodyRaw !== undefined ? { responseBodyRaw: input.responseBodyRaw } : {}),
      ...(input.responseBodyError ? { responseBodyError: input.responseBodyError } : {}),
    }
    if (input.status === 'success') delete next.error
    else if (input.error) next.error = structuredClone(input.error)
    if (input.responseBodyStatus === 'complete') delete next.responseBodyError
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
      && isBeforeModelRequestPageCursor(record, input)
    )).sort((a, b) => compareModelRequestSequence(a.sequence, b.sequence, resolveModelRequestOrder(input)))
    const records = filtered.slice(0, limit)
    const hasMore = filtered.length > records.length
    const last = records[records.length - 1]
    return {
      records: records.map((record) => presentModelRequestRecord(record, 'list') as SandboxModelRequestListItem),
      hasMore,
      nextCursor: hasMore ? last?.sequence : undefined,
      nextCreatedAt: hasMore ? last?.createdAt : undefined,
      nextId: hasMore ? last?.id : undefined,
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
    // 所有整表写入都必须排在首次恢复之后；否则数据库慢于 ChatLuna 启动时，
    // 启动期捕获的一条请求会用不完整数组覆盖重启前的全部历史。
    this.persistenceQueue = Promise.all([this.ready, this.persistenceQueue]).then(async () => {
      if (!this.persistenceAuthoritative) return
      const records = structuredClone(this.records)
      const nextSequence = this.nextSequence
      if (clear) {
        await this.persistence!.clear()
        await this.persistence!.replaceAll(nextSequence, [])
      } else {
        await this.persistence!.replaceAll(nextSequence, records)
      }
    }).catch(() => undefined)
  }
}

export function mergeModelRequestRecordPages<T extends SandboxModelRequestListItem>(
  pages: readonly SandboxModelRequestRecordsPage<T>[],
  limit: number,
  order: 'asc' | 'desc' = 'desc',
): SandboxModelRequestRecordsPage<T> {
  const pageSize = Math.min(Math.max(Number(limit) || DEFAULT_MODEL_REQUEST_PAGE_SIZE, 1), MAX_MODEL_REQUEST_PAGE_SIZE)
  const sign = order === 'asc' ? 1 : -1
  const merged = pages
    .flatMap(({ records }) => records)
    .sort((left, right) => sign * (left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)))
  const records = merged.slice(0, pageSize)
  const last = records[records.length - 1]
  const leftover = merged.length > records.length
  const hasMore = leftover || pages.some(({ hasMore: pageHasMore }) => pageHasMore)
  return {
    records,
    hasMore,
    nextCreatedAt: hasMore ? last?.createdAt : undefined,
    nextId: hasMore ? last?.id : undefined,
    earliestCursor: pages
      .map(({ earliestCursor }) => earliestCursor)
      .filter((value): value is number => typeof value === 'number')
      .sort((left, right) => left - right)[0],
    capacity: pages.reduce((summary, page) => ({
      recordCount: summary.recordCount + page.capacity.recordCount,
      totalBytes: summary.totalBytes + page.capacity.totalBytes,
      maxRecords: summary.maxRecords + page.capacity.maxRecords,
      maxBytes: summary.maxBytes + page.capacity.maxBytes,
    }), { recordCount: 0, totalBytes: 0, maxRecords: 0, maxBytes: 0 } satisfies SandboxModelRequestCapacity),
  }
}

export function resolveModelRequestOrder(input: Pick<GetSandboxModelRequestRecordsInput, 'order'>): 'asc' | 'desc' {
  return input.order === 'asc' ? 'asc' : 'desc'
}

function compareModelRequestSequence(left: number, right: number, order: 'asc' | 'desc'): number {
  return order === 'asc' ? left - right : right - left
}

function isBeforeModelRequestPageCursor(
  record: Pick<SandboxModelRequestRecord, 'id' | 'sequence' | 'createdAt'>,
  input: GetSandboxModelRequestRecordsInput,
): boolean {
  const order = resolveModelRequestOrder(input)
  if (input.beforeSequence !== undefined) {
    return order === 'asc' ? record.sequence > input.beforeSequence : record.sequence < input.beforeSequence
  }
  if (!input.beforeCreatedAt) return true
  const created = record.createdAt.localeCompare(input.beforeCreatedAt)
  if (created !== 0) return order === 'asc' ? created > 0 : created < 0
  if (!input.beforeId) return true
  const id = record.id.localeCompare(input.beforeId)
  return order === 'asc' ? id > 0 : id < 0
}
