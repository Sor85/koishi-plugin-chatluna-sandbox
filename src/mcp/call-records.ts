import { createHash } from 'node:crypto'
import { LARGE_BASE64_CHAR_THRESHOLD } from '../onebot-debug'
import type { SandboxMcpCallRecord, SandboxMcpCallRecordListItem, SandboxMcpError } from './types'

const SENSITIVE_KEY_PATTERN = /authorization|access[_-]?token|(?:^|_)token$|secret|password|cookie|private[_-]?key|confirmation[_-]?token|data[_-]?base64/i
const TEXT_KEY_PATTERN = /^(?:content|message|raw_message|text)$/i
const BASE64_BODY_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

export interface ListSandboxMcpCallRecordsInput {
  tool?: string
  credentialName?: string
  spaceId?: string
  testRunId?: string
  errorsOnly?: boolean
}

export interface SandboxMcpCallRecordsPage {
  records: SandboxMcpCallRecordListItem[]
}

export function redactMcpCallValue(value: unknown, key = ''): unknown {
  if (SENSITIVE_KEY_PATTERN.test(key)) return '[已脱敏]'
  if (typeof value === 'string') {
    if (TEXT_KEY_PATTERN.test(key)) return `[文本已省略，${value.length} 字符]`
    return foldLargeBase64(value)
  }
  if (Array.isArray(value)) return value.map((item) => redactMcpCallValue(item, key))
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [
    entryKey,
    redactMcpCallValue(entryValue, entryKey),
  ]))
}

export function resolveMcpCallSpaceId(args: Record<string, unknown>, result?: unknown): string | undefined {
  if (typeof args.spaceId === 'string' && args.spaceId.trim()) return args.spaceId
  if (result && typeof result === 'object') {
    const spaceId = Reflect.get(result, 'spaceId')
    if (typeof spaceId === 'string' && spaceId.trim()) return spaceId
  }
}

export function toMcpCallRecordListItem(record: SandboxMcpCallRecord): SandboxMcpCallRecordListItem {
  return {
    id: record.id,
    createdAt: record.createdAt,
    credentialName: record.credentialName,
    ...(record.sourceIp ? { sourceIp: record.sourceIp } : {}),
    tool: record.tool,
    ...(record.testRunId ? { testRunId: record.testRunId } : {}),
    ...(record.spaceId ? { spaceId: record.spaceId } : {}),
    durationMs: record.durationMs,
    status: record.status,
    affected: [...record.affected],
    ...(record.errorCode ? { errorCode: record.errorCode } : {}),
  }
}

export function presentMcpCallRecord(record: SandboxMcpCallRecord): SandboxMcpCallRecord {
  return {
    ...toMcpCallRecordListItem(record),
    arguments: structuredClone(record.arguments),
    result: structuredClone(record.result),
    error: record.error ? structuredClone(record.error) : undefined,
  }
}

export function matchesMcpCallRecordFilter(record: SandboxMcpCallRecord, input: ListSandboxMcpCallRecordsInput = {}): boolean {
  if (input.tool && record.tool !== input.tool) return false
  if (input.credentialName && record.credentialName !== input.credentialName) return false
  if (input.spaceId && record.spaceId !== input.spaceId) return false
  if (input.testRunId && record.testRunId !== input.testRunId) return false
  if (input.errorsOnly && record.status !== 'error') return false
  return true
}

export function summarizeMcpCallError(error: SandboxMcpError): NonNullable<SandboxMcpCallRecord['error']> {
  return {
    code: error.code,
    message: error.message,
    retryable: error.retryable,
    recovery: error.recovery,
    ...(error.details === undefined ? {} : { details: redactMcpCallValue(error.details) }),
    ...(error.retryAfterMs === undefined ? {} : { retryAfterMs: error.retryAfterMs }),
  }
}

function foldLargeBase64(value: string): unknown {
  const trimmed = value.trim()
  const dataUrl = trimmed.match(/^data:([^;,]+);base64,(.+)$/s)
  if (dataUrl && dataUrl[2].length > LARGE_BASE64_CHAR_THRESHOLD && isBase64Body(dataUrl[2])) {
    return summarizeLargeValue('data-url', dataUrl[2], dataUrl[1].trim().toLowerCase() || undefined)
  }
  if (trimmed.startsWith('base64://')) {
    const body = trimmed.slice('base64://'.length)
    if (body.length > LARGE_BASE64_CHAR_THRESHOLD && isBase64Body(body)) {
      return summarizeLargeValue('base64', body)
    }
    return value
  }
  if (trimmed.length > LARGE_BASE64_CHAR_THRESHOLD && isBase64Body(trimmed)) {
    return summarizeLargeValue('base64', trimmed)
  }
  return value
}

function summarizeLargeValue(encoding: 'base64' | 'data-url', body: string, mimeType?: string) {
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

function isBase64Body(value: string): boolean {
  if (value.length < 16 || value.length % 4 !== 0) return false
  return BASE64_BODY_PATTERN.test(value)
}
