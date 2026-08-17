export interface ModelResponseToolCallPreview {
  id?: string
  name: string
  arguments?: string
}

export interface ModelResponseContentPreview {
  content: string[]
  reasoning: string[]
  toolCalls: ModelResponseToolCallPreview[]
  finishReasons: string[]
  usage?: Record<string, unknown>
}

export interface NormalizedModelResponseUsage {
  inputTokens?: number
  outputTokens?: number
  reasoningTokens?: number
  cachedTokens?: number
  totalTokens?: number
}

interface MutableModelResponseContentPreview extends ModelResponseContentPreview {
  toolCallKeys: Map<string, number>
}

export function extractModelResponseContent(value: unknown): ModelResponseContentPreview {
  const preview: MutableModelResponseContentPreview = {
    content: [],
    reasoning: [],
    toolCalls: [],
    finishReasons: [],
    toolCallKeys: new Map(),
  }
  if (Array.isArray(value) && value.every(isSseEvent)) {
    for (const event of value) extractPayload(event.data, preview, true)
  } else {
    extractPayload(value, preview, false)
  }
  return {
    content: preview.content.filter(Boolean),
    reasoning: preview.reasoning.filter(Boolean),
    toolCalls: preview.toolCalls,
    finishReasons: [...new Set(preview.finishReasons.filter(Boolean))],
    ...(preview.usage ? { usage: preview.usage } : {}),
  }
}

export function normalizeModelResponseUsage(usage: Record<string, unknown> | undefined): NormalizedModelResponseUsage | undefined {
  if (!usage) return undefined

  const cacheReadTokens = readUsageNumber(usage, ['cache_read_input_tokens']) ?? 0
  const cacheCreationTokens = readUsageNumber(usage, ['cache_creation_input_tokens']) ?? 0
  const cachedTokens = firstUsageNumber(usage, [
    ['prompt_tokens_details', 'cached_tokens'],
    ['input_tokens_details', 'cached_tokens'],
    ['cachedContentTokenCount'],
  ]) ?? (cacheReadTokens + cacheCreationTokens || undefined)
  const reasoningTokens = firstUsageNumber(usage, [
    ['completion_tokens_details', 'reasoning_tokens'],
    ['output_tokens_details', 'reasoning_tokens'],
    ['thoughtsTokenCount'],
    ['reasoning_tokens'],
  ])

  let inputTokens = firstUsageNumber(usage, [
    ['prompt_tokens'],
    ['promptTokenCount'],
  ])
  if (inputTokens === undefined) {
    const uncachedInputTokens = readUsageNumber(usage, ['input_tokens'])
    inputTokens = uncachedInputTokens === undefined
      ? undefined
      : uncachedInputTokens + cacheReadTokens + cacheCreationTokens
  }

  let outputTokens = firstUsageNumber(usage, [
    ['completion_tokens'],
    ['output_tokens'],
    ['candidatesTokenCount'],
  ])
  // OpenAI 的 completion_tokens 含推理，需要拆出可见输出。
  if (outputTokens !== undefined && reasoningTokens !== undefined && 'completion_tokens' in usage) {
    outputTokens = Math.max(0, outputTokens - reasoningTokens)
  }

  const reportedTotal = firstUsageNumber(usage, [
    ['total_tokens'],
    ['totalTokenCount'],
  ])
  // 部分网关把 completion_tokens 报成与 reasoning 相同，可见输出只体现在 total_tokens。
  // 例如输入 14228、推理 406、总计 14852 时，扣减后输出会变成 0，实际可见输出是 218。
  if ((outputTokens === undefined || outputTokens === 0) && inputTokens !== undefined && reportedTotal !== undefined) {
    const impliedVisible = reportedTotal - inputTokens - (reasoningTokens ?? 0)
    if (impliedVisible > 0) outputTokens = impliedVisible
  }

  const totalTokens = reportedTotal ?? sumUsageTokens(inputTokens, outputTokens, reasoningTokens)
  const normalized = { inputTokens, outputTokens, reasoningTokens, cachedTokens, totalTokens }
  return Object.values(normalized).some((value) => value !== undefined) ? normalized : undefined
}

export function hasModelResponseContent(preview: ModelResponseContentPreview): boolean {
  return Boolean(
    preview.content.length
    || preview.reasoning.length
    || preview.toolCalls.length
    || preview.finishReasons.length
    || preview.usage,
  )
}

function extractPayload(value: unknown, preview: MutableModelResponseContentPreview, streaming: boolean): void {
  if (!isRecord(value)) return
  if (isRecord(value.usage)) preview.usage = mergeUsage(preview.usage, value.usage)
  if (isRecord(value.usageMetadata)) preview.usage = mergeUsage(preview.usage, value.usageMetadata)

  extractOpenAi(value, preview, streaming)
  extractResponsesApi(value, preview, streaming)
  extractAnthropic(value, preview, streaming)
  extractGemini(value, preview, streaming)
}

function extractOpenAi(value: Record<string, unknown>, preview: MutableModelResponseContentPreview, streaming: boolean): void {
  if (!Array.isArray(value.choices)) return
  for (const choice of value.choices) {
    if (!isRecord(choice)) continue
    const message = isRecord(choice.message) ? choice.message : isRecord(choice.delta) ? choice.delta : undefined
    if (message) {
      addContentValue(preview.content, message.content, streaming)
      addText(preview.reasoning, readFirstString(message, ['reasoning_content', 'reasoning', 'reasoning_text']), streaming)
      if (Array.isArray(message.tool_calls)) {
        for (const [index, tool] of message.tool_calls.entries()) addToolCall(preview, tool, index, streaming)
      }
      if (isRecord(message.function_call)) addFunctionCall(preview, message.function_call, 'function_call', streaming)
    }
    const finish = readFirstString(choice, ['finish_reason', 'native_finish_reason'])
    if (finish) preview.finishReasons.push(finish)
  }
}

function extractResponsesApi(value: Record<string, unknown>, preview: MutableModelResponseContentPreview, streaming: boolean): void {
  if (typeof value.type === 'string') {
    if (value.type.endsWith('.output_text.delta')) addText(preview.content, stringValue(value.delta), true)
    if (value.type.endsWith('.reasoning_summary_text.delta')) addText(preview.reasoning, stringValue(value.delta), true)
    if (value.type.endsWith('.function_call_arguments.delta')) {
      addFunctionCall(preview, {
        name: value.name,
        arguments: value.delta,
        call_id: value.item_id,
      }, stringValue(value.item_id) || 'response-function', true)
    }
  }
  if (!Array.isArray(value.output)) return
  for (const [index, item] of value.output.entries()) {
    if (!isRecord(item)) continue
    if (item.type === 'message') addContentValue(preview.content, item.content, streaming)
    else if (item.type === 'reasoning') addContentValue(preview.reasoning, item.summary, streaming)
    else if (item.type === 'function_call') addFunctionCall(preview, item, index, streaming)
  }
}

function extractAnthropic(value: Record<string, unknown>, preview: MutableModelResponseContentPreview, streaming: boolean): void {
  if (Array.isArray(value.content)) {
    for (const [index, block] of value.content.entries()) {
      if (!isRecord(block)) continue
      if (block.type === 'text') addText(preview.content, stringValue(block.text), streaming)
      else if (block.type === 'thinking') addText(preview.reasoning, stringValue(block.thinking), streaming)
      else if (block.type === 'tool_use') addFunctionCall(preview, {
        id: block.id,
        name: block.name,
        arguments: block.input === undefined ? undefined : JSON.stringify(block.input, null, 2),
      }, index, streaming)
    }
  }
  if (isRecord(value.delta)) {
    if (value.delta.type === 'text_delta') addText(preview.content, stringValue(value.delta.text), true)
    if (value.delta.type === 'thinking_delta') addText(preview.reasoning, stringValue(value.delta.thinking), true)
    if (value.delta.type === 'input_json_delta') {
      addFunctionCall(preview, { arguments: value.delta.partial_json }, 'anthropic-tool', true)
    }
    const stop = stringValue(value.delta.stop_reason)
    if (stop) preview.finishReasons.push(stop)
  }
  const stop = stringValue(value.stop_reason)
  if (stop) preview.finishReasons.push(stop)
}

function extractGemini(value: Record<string, unknown>, preview: MutableModelResponseContentPreview, streaming: boolean): void {
  if (!Array.isArray(value.candidates)) return
  for (const candidate of value.candidates) {
    if (!isRecord(candidate)) continue
    if (isRecord(candidate.content) && Array.isArray(candidate.content.parts)) {
      for (const [index, part] of candidate.content.parts.entries()) {
        if (!isRecord(part)) continue
        if (typeof part.text === 'string') addText(part.thought === true ? preview.reasoning : preview.content, part.text, streaming)
        if (isRecord(part.functionCall)) addFunctionCall(preview, part.functionCall, index, streaming)
      }
    }
    const finish = stringValue(candidate.finishReason)
    if (finish) preview.finishReasons.push(finish)
  }
}

function addContentValue(target: string[], value: unknown, streaming: boolean): void {
  if (typeof value === 'string') {
    addText(target, value, streaming)
    return
  }
  if (!Array.isArray(value)) return
  for (const part of value) {
    if (typeof part === 'string') addText(target, part, streaming)
    else if (isRecord(part)) addText(target, readFirstString(part, ['text', 'output_text', 'content']), streaming)
  }
}

function addText(target: string[], value: string | undefined, streaming: boolean): void {
  if (!value) return
  if (streaming && target.length) target[target.length - 1] += value
  else target.push(value)
}

function addToolCall(preview: MutableModelResponseContentPreview, value: unknown, index: number, streaming: boolean): void {
  if (!isRecord(value)) return
  const fn = isRecord(value.function) ? value.function : value
  addFunctionCall(preview, {
    id: value.id,
    name: fn.name,
    arguments: fn.arguments,
  }, value.id ?? value.index ?? index, streaming)
}

function addFunctionCall(
  preview: MutableModelResponseContentPreview,
  value: Record<string, unknown>,
  fallbackKey: unknown,
  streaming: boolean,
): void {
  const id = stringValue(value.id ?? value.call_id)
  const name = stringValue(value.name) || '工具调用'
  const argsValue = value.arguments ?? value.args ?? value.input
  const args = typeof argsValue === 'string'
    ? argsValue
    : argsValue === undefined
      ? undefined
      : JSON.stringify(argsValue, null, 2)
  const key = id || `${String(fallbackKey)}:${name}`
  const existingIndex = preview.toolCallKeys.get(key)
  if (existingIndex === undefined) {
    preview.toolCallKeys.set(key, preview.toolCalls.length)
    preview.toolCalls.push({ ...(id ? { id } : {}), name, ...(args ? { arguments: args } : {}) })
    return
  }
  const existing = preview.toolCalls[existingIndex]!
  if (!existing.name || existing.name === '工具调用') existing.name = name
  if (args) existing.arguments = streaming ? `${existing.arguments ?? ''}${args}` : args
}

function readFirstString(value: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const result = stringValue(value[key])
    if (result) return result
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined
}

function mergeUsage(current: Record<string, unknown> | undefined, incoming: Record<string, unknown>): Record<string, unknown> {
  if (!current) return { ...incoming }
  const merged = { ...current }
  for (const [key, value] of Object.entries(incoming)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      const existing = merged[key]
      merged[key] = typeof existing === 'number' ? Math.max(existing, value) : value
      continue
    }
    if (isRecord(value)) {
      const existing = merged[key]
      merged[key] = isRecord(existing) ? mergeUsage(existing, value) : { ...value }
      continue
    }
    if (value !== undefined) merged[key] = value
  }
  return merged
}

function firstUsageNumber(usage: Record<string, unknown>, paths: readonly (readonly string[])[]): number | undefined {
  for (const path of paths) {
    const value = readUsageNumber(usage, path)
    if (value !== undefined) return value
  }
}

function readUsageNumber(usage: Record<string, unknown>, path: readonly string[]): number | undefined {
  let value: unknown = usage
  for (const key of path) {
    if (!isRecord(value)) return undefined
    value = value[key]
  }
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

function sumUsageTokens(...values: Array<number | undefined>): number | undefined {
  const available = values.filter((value): value is number => value !== undefined)
  return available.length ? available.reduce((total, value) => total + value, 0) : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isSseEvent(value: unknown): value is { data: unknown } {
  return isRecord(value) && 'data' in value && 'event' in value
}
