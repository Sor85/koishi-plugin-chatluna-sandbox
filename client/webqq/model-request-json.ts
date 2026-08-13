export type ModelRequestJsonKind = 'object' | 'array' | 'value'

export interface ModelRequestJsonNode {
  key: string
  kind: ModelRequestJsonKind
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

export function buildModelRequestJsonTree(value: unknown, key = 'root'): ModelRequestJsonNode {
  if (Array.isArray(value)) {
    return {
      key,
      kind: 'array',
      preview: `Array(${value.length})`,
      children: value.map((item, index) => buildModelRequestJsonTree(item, String(index))),
    }
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    return {
      key,
      kind: 'object',
      preview: `{${entries.length}}`,
      children: entries.map(([childKey, child]) => buildModelRequestJsonTree(child, childKey)),
    }
  }
  return {
    key,
    kind: 'value',
    preview: formatModelRequestJsonPrimitive(value),
    value,
    children: [],
  }
}
