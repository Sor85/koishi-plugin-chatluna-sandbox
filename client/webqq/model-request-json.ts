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
