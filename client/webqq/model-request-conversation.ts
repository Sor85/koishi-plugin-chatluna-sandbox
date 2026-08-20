import type { SandboxModelRequestDetail, SandboxModelRequestUsage } from '../../src/types'
import { extractModelResponseContent, normalizeModelResponseUsage } from './model-response-content'
import { parseModelResponseBody } from './model-request-json'

export type ModelConversationRole = 'system' | 'user' | 'assistant' | 'tool'
export type ModelConversationSource = 'request' | 'response'
export type ModelConversationFormat = 'json' | 'sse' | 'text'

export interface ModelConversationContentPart {
  kind: 'text' | 'image' | 'file' | 'audio' | 'video' | 'other'
  value: string
  mimeType?: string
}

export interface ModelConversationToolCall {
  id?: string
  name: string
  arguments?: string
  toolPath?: string[]
}

export interface ModelConversationMessage {
  index: number
  role: ModelConversationRole
  source: ModelConversationSource
  content: string
  contentParts: ModelConversationContentPart[]
  reasoning?: string
  toolCalls: ModelConversationToolCall[]
  toolCallId?: string
  raw: unknown
  path: string[]
  searchText: string
}

export interface ModelConversationTool {
  name: string
  description: string
  parameters?: unknown
  propertyCount: number
  requiredFields: string[]
  raw: unknown
  path: string[]
  searchText: string
}

export interface ModelConversationToolResult {
  id?: string
  name?: string
  content: string
  raw: unknown
  path: string[]
}

export interface ModelConversationResponse {
  source: 'response'
  status: 'pending' | 'complete' | 'empty' | 'unavailable' | 'error'
  statusMessage?: string
  content: string[]
  reasoning: string[]
  toolCalls: ModelConversationToolCall[]
  toolResults: ModelConversationToolResult[]
  finishReasons: string[]
  usage?: SandboxModelRequestUsage
  raw: unknown
  format?: ModelConversationFormat
  searchText: string
}

export interface ModelRequestConversation {
  model?: string
  messages: ModelConversationMessage[]
  response?: ModelConversationResponse
  tools: ModelConversationTool[]
  parseError?: string
  searchText: string
}

export function parseModelRequestConversation(
  body: unknown,
  format?: string,
): ModelRequestConversation {
  const messages: ModelConversationMessage[] = []
  const tools: ModelConversationTool[] = []
  let index = 0
  if (!isRecord(body)) return { messages, tools, parseError: '请求体不是可解析的对象', searchText: '' }

  const pushMessage = (message: Omit<ModelConversationMessage, 'index' | 'searchText'>) => {
    const next = { ...message, index, searchText: buildSearchText(message) }
    messages.push(next)
    index += 1
  }

  const protocol = format?.toLowerCase() ?? ''
  const aiSdk = protocol.includes('aisdk') || Array.isArray(body.messages) && hasTypedParts(body.messages)

  const systemFields = new Set(['system', 'systemInstruction', 'system_instruction', 'instructions'])
  for (const [field, value] of Object.entries(body)) {
    if (systemFields.has(field) && value !== undefined) projectSystemMessages(value, [field], pushMessage)
  }

  if (Array.isArray(body.messages)) {
    for (const [messageIndex, value] of body.messages.entries()) {
      if (isRecord(value)) projectMessage(value, ['messages', String(messageIndex)], pushMessage, aiSdk)
    }
  } else if (Array.isArray(body.contents)) {
    for (const [contentIndex, value] of body.contents.entries()) {
      if (isRecord(value)) projectGeminiMessage(value, ['contents', String(contentIndex)], pushMessage)
    }
  } else if (body.input !== undefined) {
    projectResponsesInput(body.input, ['input'], pushMessage)
  } else if (typeof body.input === 'string') {
    pushMessage(createMessage('user', body.input, body.input, ['input']))
  }

  collectTools(body, tools)
  const result: ModelRequestConversation = {
    ...(typeof body.model === 'string' ? { model: body.model } : {}),
    messages,
    tools,
    searchText: [...messages, ...tools].map((item) => item.searchText).join('\n'),
  }
  if (!messages.length && !tools.length) result.parseError = '未识别请求体中的对话结构'
  return result
}

export function parseModelResponseConversation(
  record: Pick<SandboxModelRequestDetail, 'responseBodyRaw' | 'responseBodyFormat' | 'responseBodyStatus' | 'responseBodyError' | 'usage'>,
): ModelConversationResponse {
  const empty = (status: ModelConversationResponse['status'], statusMessage: string): ModelConversationResponse => ({
    source: 'response',
    status,
    statusMessage,
    content: [],
    reasoning: [],
    toolCalls: [],
    toolResults: [],
    finishReasons: [],
    ...(record.usage ? { usage: record.usage } : {}),
    raw: record.responseBodyRaw,
    ...(record.responseBodyFormat ? { format: record.responseBodyFormat } : {}),
    searchText: statusMessage,
  })
  if (record.responseBodyStatus === 'pending') return empty('pending', '响应仍在采集中')
  if (record.responseBodyStatus === 'error') return empty('error', record.responseBodyError || '响应采集失败')
  if (record.responseBodyStatus === 'unavailable' || record.responseBodyRaw === undefined) return empty('unavailable', '响应不可用')

  const parsed = parseModelResponseBody(record.responseBodyRaw, record.responseBodyFormat)
  if (record.responseBodyFormat === 'json' && parsed.kind === 'text') {
    return { ...empty('error', '响应 JSON 解析失败'), raw: record.responseBodyRaw, format: 'json' }
  }
  const extracted = extractModelResponseContent(parsed.value)
  const preview = parsed.kind === 'text' && typeof parsed.value === 'string'
    ? { ...extracted, content: [parsed.value] }
    : extracted
  const toolResults = collectResponseToolResults(parsed.value)
  const normalizedUsage = normalizeModelResponseUsage(preview.usage)
  const usage = record.usage ?? (normalizedUsage ? { ...normalizedUsage, source: 'response' as const } : undefined)
  const hasContent = Boolean(preview.content.length || preview.reasoning.length || preview.toolCalls.length || toolResults.length || preview.finishReasons.length || usage)
  const statusMessage = hasContent ? undefined : '响应没有可展示的结构化内容'
  const raw = parsed.value ?? record.responseBodyRaw
  return {
    source: 'response',
    status: hasContent ? 'complete' : 'empty',
    ...(statusMessage ? { statusMessage } : {}),
    content: preview.content,
    reasoning: preview.reasoning,
    toolCalls: preview.toolCalls.map((call) => ({ id: call.id, name: call.name, arguments: call.arguments })),
    toolResults,
    finishReasons: preview.finishReasons,
    ...(usage ? { usage } : {}),
    raw,
    format: record.responseBodyFormat ?? (parsed.kind === 'empty' ? undefined : parsed.kind),
    searchText: [statusMessage ?? '', preview.content, preview.reasoning, preview.toolCalls.map((call) => `${call.name} ${call.arguments ?? ''}`), toolResults.map((result) => `${result.name ?? ''} ${result.content}`), preview.finishReasons].flat().join('\n'),
  }
}

export function parseModelRequestConversationDetail(detail: SandboxModelRequestDetail): ModelRequestConversation {
  const conversation = parseModelRequestConversation(detail.requestBody)
  const response = parseModelResponseConversation(detail)
  return { ...conversation, response, searchText: `${conversation.searchText}\n${response.searchText}` }
}

function collectResponseToolResults(value: unknown): ModelConversationToolResult[] {
  const results: ModelConversationToolResult[] = []
  const seen = new Set<string>()
  const evidenceContainers = new Set([
    'data', 'output', 'outputs', 'content', 'parts', 'candidates', 'choices',
    'message', 'delta', 'response', 'result', 'results', 'items',
    'toolResults', 'tool_results',
  ])
  const append = (result: ModelConversationToolResult) => {
    const key = JSON.stringify([result.id ?? '', result.name ?? '', result.content])
    if (seen.has(key)) return
    seen.add(key)
    results.push(result)
  }
  const visit = (candidate: unknown, path: string[]) => {
    if (Array.isArray(candidate)) {
      candidate.forEach((item, index) => visit(item, [...path, String(index)]))
      return
    }
    if (!isRecord(candidate)) return
    if (isRecord(candidate.functionResponse)) {
      const result = candidate.functionResponse
      append(createResponseToolResult(result, [...path, 'functionResponse'], result.response ?? result.output ?? result.result))
      return
    }
    const type = typeof candidate.type === 'string' ? candidate.type.toLowerCase() : ''
    if (type === 'function_call_output' || type === 'tool_result' || type === 'tool-result' || type === 'tool-output') {
      const output = candidate.output ?? candidate.result ?? candidate.content
      append(createResponseToolResult(candidate, path, output))
      return
    }
    // SSE 事件常带累计快照和 metadata；只沿模型输出容器递归，避免重复结果和元数据伪证据。
    for (const [key, child] of Object.entries(candidate)) {
      if (evidenceContainers.has(key)) visit(child, [...path, key])
    }
  }
  visit(value, [])
  return results
}

function createResponseToolResult(
  raw: Record<string, unknown>,
  path: string[],
  output: unknown,
): ModelConversationToolResult {
  const id = raw.call_id ?? raw.toolCallId ?? raw.tool_call_id ?? raw.id
  const name = raw.name ?? raw.toolName ?? raw.tool_name
  return {
    ...(typeof id === 'string' && id ? { id } : {}),
    ...(typeof name === 'string' && name ? { name } : {}),
    content: normalizeAiSdkToolOutput(output),
    raw,
    path,
  }
}

function projectMessage(
  value: Record<string, unknown>,
  path: string[],
  push: (message: Omit<ModelConversationMessage, 'index' | 'searchText'>) => void,
  aiSdk: boolean,
) {
  if (aiSdk && Array.isArray(value.parts)) {
    projectAiSdkMessage(value, path, push)
    return
  }
  const role = typeof value.role === 'string' ? value.role.toLowerCase() : 'user'
  if (role === 'assistant' || (Array.isArray(value.content) && hasAnthropicContentBlocks(value.content))) {
    const parts: ModelConversationContentPart[] = []
    const toolCalls = normalizeToolCalls(value.tool_calls ?? value.toolCalls)
    const reasoning: string[] = []
    const blocks = Array.isArray(value.content) ? value.content : [value.content]
    for (const [blockIndex, block] of blocks.entries()) {
      if (!isRecord(block)) {
        parts.push(...normalizeParts(block))
        continue
      }
      const blockPath = [...path, 'content', String(blockIndex)]
      if (block.type === 'thinking' || block.type === 'redacted_thinking') {
        const text = String(block.thinking ?? block.data ?? '')
        if (text) reasoning.push(text)
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          ...(typeof block.id === 'string' ? { id: block.id } : {}),
          name: String(block.name ?? '工具调用'),
          arguments: JSON.stringify(block.input ?? {}, null, 2),
          toolPath: blockPath,
        })
      } else if (block.type === 'tool_result') {
        const resultParts = normalizeParts(block.content)
        push(createMessage('tool', resultParts.map((part) => part.value).join('\n'), resultParts, blockPath, block, undefined, [], String(block.tool_use_id ?? '')))
      } else {
        parts.push(...normalizeParts(block))
      }
    }
    if (role === 'assistant' || parts.length) {
      const explicitReasoning = [value.reasoning_content, value.reasoning, ...reasoning]
        .filter((item): item is string => typeof item === 'string' && item.length > 0)
        .join('\n')
      push(createMessage(role === 'assistant' ? 'assistant' : 'user', parts.filter((part) => part.kind === 'text').map((part) => part.value).join('\n'), parts, path, value, explicitReasoning, toolCalls))
    }
    return
  }
  if (role === 'tool' || role === 'function' || value.tool_call_id !== undefined) {
    const parts = normalizeParts(value.content ?? value.output)
    push(createMessage('tool', parts.map((part) => part.value).join('\n'), parts, path, value, undefined, [], String(value.tool_call_id ?? value.call_id ?? '')))
    return
  }
  const parts = normalizeParts(aiSdk ? value.parts ?? value.content : value.content ?? value.parts)
  push(createMessage(role === 'system' || role === 'developer' ? 'system' : 'user', parts.map((part) => part.value).join('\n'), parts, path, value))
}

function projectAiSdkMessage(
  value: Record<string, unknown>,
  path: string[],
  push: (message: Omit<ModelConversationMessage, 'index' | 'searchText'>) => void,
) {
  const role = typeof value.role === 'string' ? value.role.toLowerCase() : 'user'
  const messageRole: ModelConversationRole = role === 'assistant'
    ? 'assistant'
    : role === 'system'
      ? 'system'
      : role === 'tool'
        ? 'tool'
        : 'user'
  let contentParts: ModelConversationContentPart[] = []
  let reasoning: string[] = []
  let toolCalls: ModelConversationToolCall[] = []
  let rawParts: unknown[] = []
  let segmentStart = 0

  const flushSegment = () => {
    if (!contentParts.length && !reasoning.length && !toolCalls.length) return
    push(createMessage(
      messageRole,
      semanticContent(contentParts),
      contentParts,
      [...path, 'parts', String(segmentStart)],
      rawParts.length === 1 ? rawParts[0] : rawParts,
      reasoning.join('\n'),
      toolCalls,
    ))
    contentParts = []
    reasoning = []
    toolCalls = []
    rawParts = []
  }

  for (const [partIndex, part] of (value.parts as unknown[]).entries()) {
    if (!rawParts.length) segmentStart = partIndex
    const partPath = [...path, 'parts', String(partIndex)]
    if (!isRecord(part)) {
      rawParts.push(part)
      contentParts.push(...normalizeParts(part))
      continue
    }
    const type = typeof part.type === 'string' ? part.type.toLowerCase() : ''
    if (type === 'tool-result' || type === 'tool-output') {
      // typed parts 是有序证据流；工具结果前后必须冲刷语义片段，不能统一移到消息首尾。
      flushSegment()
      const output = part.output ?? part.result ?? part.content
      const toolCallId = typeof part.toolCallId === 'string'
        ? part.toolCallId
        : typeof part.tool_call_id === 'string'
          ? part.tool_call_id
          : undefined
      const content = normalizeAiSdkToolOutput(output)
      push(createMessage('tool', content, content, partPath, part, undefined, [], toolCallId))
      continue
    }

    rawParts.push(part)
    if (type === 'reasoning' || type === 'reasoning-part') {
      if (typeof part.text === 'string' && part.text) reasoning.push(part.text)
      continue
    }
    if (type === 'tool-call' || type === 'tool-invocation' || type === 'dynamic-tool') {
      const invocation = isRecord(part.toolInvocation) ? part.toolInvocation : part
      const name = String(invocation.toolName ?? invocation.tool_name ?? invocation.name ?? '工具调用')
      const argumentsValue = invocation.input ?? invocation.args ?? invocation.arguments
      toolCalls.push({
        ...(typeof invocation.toolCallId === 'string' ? { id: invocation.toolCallId } : typeof invocation.tool_call_id === 'string' ? { id: invocation.tool_call_id } : {}),
        name,
        ...(argumentsValue !== undefined ? { arguments: stringifyValue(argumentsValue) } : {}),
        toolPath: partPath,
      })
      continue
    }
    contentParts.push(...normalizeParts([part]))
  }

  flushSegment()
}

function projectGeminiMessage(
  value: Record<string, unknown>,
  path: string[],
  push: (message: Omit<ModelConversationMessage, 'index' | 'searchText'>) => void,
) {
  const role = value.role === 'model' ? 'assistant' : 'user'
  const contentParts: ModelConversationContentPart[] = []
  const toolCalls: ModelConversationToolCall[] = []
  const sourceParts = Array.isArray(value.parts) ? value.parts : []
  for (const [partIndex, part] of sourceParts.entries()) {
    if (!isRecord(part)) continue
    if (isRecord(part.functionCall)) {
      toolCalls.push({
        name: String(part.functionCall.name ?? '工具调用'),
        arguments: JSON.stringify(part.functionCall.args ?? {}, null, 2),
        toolPath: [...path, 'parts', String(partIndex), 'functionCall'],
      })
      continue
    }
    if (isRecord(part.functionResponse)) {
      push(createMessage(
        'tool',
        JSON.stringify(part.functionResponse.response ?? part.functionResponse, null, 2),
        normalizeParts(part.functionResponse.response ?? part.functionResponse),
        [...path, 'parts', String(partIndex), 'functionResponse'],
        part.functionResponse,
        undefined,
        [],
        String(part.functionResponse.id ?? ''),
      ))
      continue
    }
    contentParts.push(...normalizeGeminiPart(part))
  }
  if (contentParts.length || toolCalls.length) push(createMessage(role, contentParts.map((part) => part.value).join('\n'), contentParts, path, value, undefined, toolCalls))
}

function projectResponsesInput(
  input: unknown,
  path: string[],
  push: (message: Omit<ModelConversationMessage, 'index' | 'searchText'>) => void,
) {
  const values = Array.isArray(input) ? input : [input]
  for (const [index, value] of values.entries()) {
    if (!isRecord(value)) {
      push(createMessage('user', String(value), String(value), [...path, String(index)]))
      continue
    }
    const itemPath = [...path, String(index)]
    if (value.type === 'function_call') {
      push(createMessage('assistant', '', [], itemPath, value, undefined, normalizeToolCalls([value])))
    } else if (value.type === 'function_call_output') {
      push(createMessage('tool', String(value.output ?? ''), String(value.output ?? ''), itemPath, value, undefined, [], String(value.call_id ?? '')))
    } else {
      const role = value.role === 'assistant' ? 'assistant' : value.role === 'system' ? 'system' : 'user'
      const parts = normalizeParts(value.content ?? value.input)
      push(createMessage(role, parts.map((part) => part.value).join('\n'), parts, itemPath, value))
    }
  }
}

function collectTools(body: Record<string, unknown>, target: ModelConversationTool[]) {
  const addArray = (value: unknown[], path: string[]) => {
    for (const [index, item] of value.entries()) {
      if (!isRecord(item)) continue
      if (Array.isArray(item.functionDeclarations)) {
        for (const [declarationIndex, declaration] of item.functionDeclarations.entries()) {
          if (isRecord(declaration)) target.push(createTool(declaration, [...path, String(index), 'functionDeclarations', String(declarationIndex)]))
        }
        continue
      }
      const definition = isRecord(item.function) ? item.function : item
      target.push(createTool(definition, [...path, String(index), ...(isRecord(item.function) ? ['function'] : [])]))
    }
  }

  // 同时出现 tools/functions 等字段时，Object.keys 的插入顺序就是原始请求证据顺序；
  // 固定先读某个字段会悄悄重排工具目录，导致同名工具无法按原文复盘。
  for (const [field, value] of Object.entries(body)) {
    if (field !== 'tools' && field !== 'functions') continue
    if (Array.isArray(value)) {
      addArray(value, [field])
      continue
    }
    if (!isRecord(value)) continue
    for (const [name, definition] of Object.entries(value)) {
      if (!isRecord(definition)) continue
      target.push(createTool({ name, ...definition }, [field, name]))
    }
  }
}

function createTool(value: Record<string, unknown>, path: string[]): ModelConversationTool {
  const name = typeof value.name === 'string' ? value.name : '未命名工具'
  const parameters = value.parameters ?? value.input_schema ?? value.inputSchema ?? value.parametersJsonSchema
  const description = typeof value.description === 'string' ? value.description : ''
  const schema = isRecord(parameters) ? parameters : undefined
  const properties = isRecord(schema?.properties) ? schema.properties : undefined
  const requiredFields = Array.isArray(schema?.required)
    ? schema.required.filter((field): field is string => typeof field === 'string')
    : []
  return {
    name,
    description,
    ...(parameters !== undefined ? { parameters } : {}),
    propertyCount: properties ? Object.keys(properties).length : 0,
    requiredFields,
    raw: value,
    path,
    searchText: `${name}\n${description}\n${JSON.stringify(parameters ?? '')}`,
  }
}

function projectSystemMessages(
  value: unknown,
  path: string[],
  push: (message: Omit<ModelConversationMessage, 'index' | 'searchText'>) => void,
) {
  const container = isRecord(value) && Array.isArray(value.parts)
    ? { values: value.parts, path: [...path, 'parts'] }
    : Array.isArray(value)
      ? { values: value, path }
      : undefined
  if (!container) {
    push(createSystemMessage(value, path))
    return
  }
  for (const [index, item] of container.values.entries()) {
    // 顶层 system 数组及 systemInstruction.parts 都是独立原始证据；合并后会让卡片折叠、搜索和定位失去单条边界。
    push(createSystemMessage(item, [...container.path, String(index)]))
  }
}

function createSystemMessage(value: unknown, path: string[]) {
  const parts = normalizeParts(value)
  return createMessage('system', parts.map((part) => part.value).join('\n'), parts, path, value)
}

function createMessage(
  role: ModelConversationRole,
  content: string,
  contentParts: ModelConversationContentPart[] | string,
  path: string[],
  raw: unknown = content,
  reasoning?: unknown,
  toolCalls: ModelConversationToolCall[] = [],
  toolCallId?: string,
): Omit<ModelConversationMessage, 'index' | 'searchText'> {
  return {
    role,
    source: 'request',
    content,
    contentParts: typeof contentParts === 'string' ? [{ kind: 'text', value: contentParts }] : contentParts,
    ...(typeof reasoning === 'string' && reasoning ? { reasoning } : {}),
    toolCalls,
    ...(toolCallId ? { toolCallId } : {}),
    raw,
    path,
  }
}

function normalizeToolCalls(value: unknown): ModelConversationToolCall[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!isRecord(item)) return []
    const fn = isRecord(item.function) ? item.function : item
    const name = typeof fn.name === 'string' ? fn.name : '工具调用'
    const args = fn.arguments ?? fn.input ?? fn.args
    const id = typeof item.id === 'string'
      ? item.id
      : typeof item.call_id === 'string'
        ? item.call_id
        : typeof item.toolCallId === 'string'
          ? item.toolCallId
          : undefined
    return [{
      ...(id ? { id } : {}),
      name,
      ...(args !== undefined ? { arguments: typeof args === 'string' ? args : JSON.stringify(args, null, 2) } : {}),
    }]
  })
}

function normalizeParts(value: unknown): ModelConversationContentPart[] {
  if (typeof value === 'string') return [{ kind: 'text', value }]
  if (isRecord(value)) {
    if (Array.isArray(value.parts)) return normalizeParts(value.parts)
    return normalizeParts([value])
  }
  if (!Array.isArray(value)) return value === undefined ? [] : [{ kind: 'other', value: stringifyValue(value) }]
  return (value as unknown[]).flatMap((item): ModelConversationContentPart[] => {
    if (typeof item === 'string') return [{ kind: 'text', value: item }]
    if (!isRecord(item)) return []
    const text = item.text ?? item.output_text ?? item.content
    if (typeof text === 'string') return [{ kind: 'text', value: text }]
    const type = typeof item.type === 'string' ? item.type.toLowerCase() : ''
    const mimeType = typeof item.mediaType === 'string'
      ? item.mediaType
      : typeof item.mimeType === 'string'
        ? item.mimeType
        : typeof item.media_type === 'string'
          ? item.media_type
          : undefined
    const source = normalizeMediaSource(item.image_url ?? item.image ?? item.source ?? item.url ?? item.data)
    if (type.includes('image') || mimeType?.startsWith('image/') || item.image_url || item.image) {
      return [{ kind: 'image', value: source ?? '[图片]', ...(mimeType ? { mimeType } : {}) }]
    }
    if (type.includes('file') || mimeType && !mimeType.startsWith('image/')) {
      return [{ kind: 'file', value: source ?? '[文件]', ...(mimeType ? { mimeType } : {}) }]
    }
    if (type.includes('audio')) return [{ kind: 'audio', value: source ?? '[音频]', ...(mimeType ? { mimeType } : {}) }]
    if (type.includes('video')) return [{ kind: 'video', value: source ?? '[视频]', ...(mimeType ? { mimeType } : {}) }]
    return [{ kind: 'other', value: stringifyValue(item) }]
  })
}

function normalizeMediaSource(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (!isRecord(value)) return undefined
  if (typeof value.url === 'string') return value.url
  if (typeof value.data === 'string') {
    const mimeType = typeof value.media_type === 'string' ? value.media_type : typeof value.mimeType === 'string' ? value.mimeType : undefined
    return mimeType ? `data:${mimeType};base64,${value.data}` : value.data
  }
}

function semanticContent(parts: ModelConversationContentPart[]): string {
  return parts
    .filter((part) => part.kind === 'text' || part.kind === 'other')
    .map((part) => part.value)
    .join('\n')
}

function normalizeAiSdkToolOutput(value: unknown): string {
  if (isRecord(value) && value.type === 'json' && 'value' in value) return stringifyValue(value.value)
  if (isRecord(value) && value.type === 'text' && typeof value.value === 'string') return value.value
  return stringifyValue(value ?? '')
}

function stringifyValue(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2) ?? String(value)
  } catch {
    return String(value)
  }
}

function normalizeGeminiPart(value: unknown): ModelConversationContentPart[] {
  if (!isRecord(value)) return []
  if (typeof value.text === 'string') return [{ kind: 'text', value: value.text }]
  if (isRecord(value.inlineData)) {
    const mimeType = typeof value.inlineData.mimeType === 'string' ? value.inlineData.mimeType : undefined
    const data = typeof value.inlineData.data === 'string' ? value.inlineData.data : ''
    if (mimeType?.startsWith('image/') && mimeType !== 'image/svg+xml') {
      return [{ kind: 'image', value: `data:${mimeType};base64,${data}`, mimeType }]
    }
    return [{ kind: mimeType?.startsWith('audio/') ? 'audio' : mimeType?.startsWith('video/') ? 'video' : 'file', value: data || '[内联文件]', ...(mimeType ? { mimeType } : {}) }]
  }
  if (isRecord(value.fileData)) {
    const mimeType = typeof value.fileData.mimeType === 'string' ? value.fileData.mimeType : undefined
    const source = typeof value.fileData.fileUri === 'string' ? value.fileData.fileUri : '[文件]'
    return [{ kind: mimeType?.startsWith('image/') ? 'image' : mimeType?.startsWith('audio/') ? 'audio' : mimeType?.startsWith('video/') ? 'video' : 'file', value: source, ...(mimeType ? { mimeType } : {}) }]
  }
  if (isRecord(value.functionCall)) return [{ kind: 'other', value: stringifyValue(value.functionCall) }]
  if (isRecord(value.functionResponse)) return [{ kind: 'other', value: stringifyValue(value.functionResponse) }]
  return [{ kind: 'other', value: stringifyValue(value) }]
}

function hasAnthropicContentBlocks(content: unknown[]) {
  return content.some((part) => isRecord(part) && ['thinking', 'redacted_thinking', 'tool_use', 'tool_result'].includes(String(part.type)))
}

function hasAnthropicBlocks(messages: unknown[]) {
  return messages.some((message) => isRecord(message) && Array.isArray(message.content) && hasAnthropicContentBlocks(message.content))
}

function hasTypedParts(messages: unknown[]) {
  return messages.some((message) => isRecord(message) && Array.isArray(message.parts))
}

function buildSearchText(message: Omit<ModelConversationMessage, 'index' | 'searchText'>): string {
  return [message.role, message.content, message.reasoning ?? '', message.toolCallId ?? '', ...message.toolCalls.flatMap((call) => [call.name, call.arguments ?? ''])].join('\n')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
