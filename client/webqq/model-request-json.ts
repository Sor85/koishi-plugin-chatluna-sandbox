export type ModelRequestJsonKind = 'object' | 'array' | 'value'
export type ModelRequestJsonValueKind = 'string' | 'number' | 'boolean' | 'null' | 'undefined' | 'other'

export interface ModelRequestJsonNode {
  key: string
  kind: ModelRequestJsonKind
  valueKind?: ModelRequestJsonValueKind
  preview: string
  value?: unknown
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

export function buildModelRequestJsonTree(value: unknown, key = 'root'): ModelRequestJsonNode {
  if (Array.isArray(value)) {
    return {
      key,
      kind: 'array',
      preview: `${value.length} items`,
      children: value.map((item, index) => buildModelRequestJsonTree(item, String(index))),
    }
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    return {
      key,
      kind: 'object',
      preview: `${entries.length} items`,
      children: entries.map(([childKey, child]) => buildModelRequestJsonTree(child, childKey)),
    }
  }
  return {
    key,
    kind: 'value',
    valueKind: getModelRequestJsonValueKind(value),
    preview: formatModelRequestJsonPrimitive(value),
    value,
    children: [],
  }
}
