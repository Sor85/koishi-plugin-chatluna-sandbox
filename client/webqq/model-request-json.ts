export type ModelRequestJsonKind = 'object' | 'array' | 'value'
export type ModelRequestJsonValueKind = 'string' | 'number' | 'boolean' | 'null' | 'undefined' | 'other'

export interface ModelRequestImageSource {
  source: string
  mimeType: string
}

export interface ModelRequestJsonNode {
  key: string
  path: string[]
  kind: ModelRequestJsonKind
  valueKind?: ModelRequestJsonValueKind
  preview: string
  value?: unknown
  imageSource?: ModelRequestImageSource
  children: ModelRequestJsonNode[]
}

export function formatModelRequestJsonPrimitive(value: unknown): string {
  if (value === undefined) return 'undefined'
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export function getModelRequestJsonValueKind(value: unknown): ModelRequestJsonValueKind {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (typeof value === 'string') return 'string'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  return 'other'
}

const MODEL_REQUEST_IMAGE_DATA_URL = /^data:(image\/[a-z0-9.+-]+);base64,([a-z\d+/=\s]+)$/i
const MODEL_REQUEST_IMAGE_FIELD_NAMES = new Set([
  'data',
  'base64',
  'b64',
  'b64_json',
  'image',
  'image_data',
  'image_base64',
])
const MODEL_REQUEST_IMAGE_MIME_FIELDS = [
  'media_type',
  'mediaType',
  'mime_type',
  'mimeType',
]

function compactBase64(value: string): string | undefined {
  const compact = value.replace(/\s/g, '')
  if (compact.length < 24 || compact.length % 4 !== 0 || !/^[a-z\d+/]+={0,2}$/i.test(compact)) return undefined
  return compact
}

function normalizeImageMimeType(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const mimeType = value.trim().toLowerCase()
  if (!/^image\/[a-z0-9.+-]+$/i.test(mimeType) || mimeType === 'image/svg+xml') return undefined
  return mimeType === 'image/jpg' ? 'image/jpeg' : mimeType
}

export function parseModelRequestImageSource(
  value: unknown,
  key?: string,
  parentData?: Record<string, unknown>,
): ModelRequestImageSource | undefined {
  if (typeof value !== 'string') return undefined
  const dataUrl = value.match(MODEL_REQUEST_IMAGE_DATA_URL)
  if (dataUrl?.[1] && dataUrl[2] && !dataUrl[1].toLowerCase().includes('svg+xml')) {
    const compact = compactBase64(dataUrl[2])
    if (compact) {
      return {
        source: `data:${normalizeImageMimeType(dataUrl[1]) ?? dataUrl[1].toLowerCase()};base64,${compact}`,
        mimeType: normalizeImageMimeType(dataUrl[1]) ?? dataUrl[1].toLowerCase(),
      }
    }
  }

  const fieldName = key?.toLowerCase()
  if (!fieldName || !MODEL_REQUEST_IMAGE_FIELD_NAMES.has(fieldName)) return undefined
  const compact = compactBase64(value)
  if (!compact) return undefined
  const mimeType = fieldName === 'b64_json'
    ? 'image/png'
    : normalizeImageMimeType(MODEL_REQUEST_IMAGE_MIME_FIELDS
      .map((field) => parentData?.[field])
      .find((candidate) => candidate !== undefined))
  if (!mimeType) return undefined
  return {
    source: `data:${mimeType};base64,${compact}`,
    mimeType,
  }
}

export function normalizeModelRequestJsonString(value: string): string {
  const expanded = value.replace(/\t/g, '  ')
  const lines = expanded.split('\n')
  if (lines.length < 2) return expanded
  const continuation = lines.slice(1).filter((line) => line.trim())
  if (!continuation.length) return expanded
  const commonIndent = Math.min(...continuation.map((line) => line.match(/^\s*/)?.[0].length ?? 0))
  if (!commonIndent) return expanded
  return [lines[0], ...lines.slice(1).map((line) => line.slice(Math.min(commonIndent, line.length)))].join('\n')
}

export interface ModelResponseBodyPreview {
  kind: 'json' | 'sse' | 'text' | 'empty'
  value?: unknown
}

export function parseModelResponseBody(
  raw: string | undefined,
  format: 'json' | 'text' | 'sse' | undefined,
): ModelResponseBodyPreview {
  if (raw === undefined || raw === '') return { kind: 'empty' }
  if (format === 'sse') return { kind: 'sse', value: parseModelResponseSse(raw) }
  if (format === 'json') {
    try {
      return { kind: 'json', value: JSON.parse(raw) }
    } catch {
      return { kind: 'text', value: raw }
    }
  }
  try {
    return { kind: 'json', value: JSON.parse(raw) }
  } catch {
    return { kind: 'text', value: raw }
  }
}

export function parseModelResponseSse(raw: string): Array<Record<string, unknown>> {
  return raw.replace(/\r\n/g, '\n').split(/\n\n+/).flatMap((block) => {
    if (!block.trim()) return []
    const data: string[] = []
    let event = 'message'
    let id: string | undefined
    for (const line of block.split('\n')) {
      if (line.startsWith(':')) continue
      const separator = line.indexOf(':')
      const field = separator < 0 ? line : line.slice(0, separator)
      const value = separator < 0 ? '' : line.slice(separator + 1).replace(/^ /, '')
      if (field === 'data') data.push(value)
      else if (field === 'event') event = value || 'message'
      else if (field === 'id') id = value
    }
    const rawData = data.join('\n')
    if (!rawData && event === 'message' && id === undefined) return []
    let parsedData: unknown = rawData
    if (rawData !== '[DONE]') {
      try {
        parsedData = JSON.parse(rawData)
      } catch {
        // 非 JSON data 仍按 SSE 原文保留，不影响其他事件的结构化预览。
      }
    }
    return [{
      ...(id !== undefined ? { id } : {}),
      event,
      data: parsedData,
    }]
  })
}

export type ModelRequestJsonPath = string[]

function isModelRequestJsonRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function deepEqualModelRequestJson(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length
      && left.every((item, index) => deepEqualModelRequestJson(item, right[index]))
  }
  if (!isModelRequestJsonRecord(left) || !isModelRequestJsonRecord(right)) return false
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key) => Object.hasOwn(right, key) && deepEqualModelRequestJson(left[key], right[key]))
}

/**
 * 轨迹行经过 RPC 后不再与请求体共享对象引用，因此必须按结构匹配原始片段。
 * 只返回完整节点的路径，避免把相同的短字符串误定位到另一个消息字段。
 */
export function findModelRequestJsonPath(value: unknown, target: unknown): ModelRequestJsonPath | undefined {
  if (deepEqualModelRequestJson(value, target)) return []
  if (Array.isArray(value)) {
    for (const [index, child] of value.entries()) {
      const childPath = findModelRequestJsonPath(child, target)
      if (childPath) return [String(index), ...childPath]
    }
    return undefined
  }
  if (!isModelRequestJsonRecord(value)) return undefined
  for (const [key, child] of Object.entries(value)) {
    const childPath = findModelRequestJsonPath(child, target)
    if (childPath) return [key, ...childPath]
  }
}

export function buildModelRequestJsonTree(
  value: unknown,
  key = 'root',
  parentData?: Record<string, unknown>,
  path: string[] = [],
): ModelRequestJsonNode {
  if (Array.isArray(value)) {
    return {
      key,
      path,
      kind: 'array',
      preview: `${value.length} items`,
      children: value.map((item, index) => buildModelRequestJsonTree(item, String(index), undefined, [...path, String(index)])),
    }
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    return {
      key,
      path,
      kind: 'object',
      preview: `${entries.length} items`,
      children: entries.map(([childKey, child]) => buildModelRequestJsonTree(child, childKey, value as Record<string, unknown>, [...path, childKey])),
    }
  }
  return {
    key,
    path,
    kind: 'value',
    valueKind: getModelRequestJsonValueKind(value),
    preview: formatModelRequestJsonPrimitive(value),
    value,
    imageSource: parseModelRequestImageSource(value, key, parentData),
    children: [],
  }
}
