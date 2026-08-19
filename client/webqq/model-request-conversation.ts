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
  raw: unknown
  path: string[]
  searchText: string
}

export interface ModelConversationResponse {
  source: 'response'
  content: string[]
  reasoning: string[]
  toolCalls: ModelConversationToolCall[]
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
  const anthropic = protocol.includes('anthropic') || Array.isArray(body.messages) && hasAnthropicBlocks(body.messages)
  const gemini = protocol.includes('gemini') || Array.isArray(body.contents)
  const responses = protocol.includes('responses') || Array.isArray(body.input)
  const aiSdk = protocol.includes('aisdk') || Array.isArray(body.messages) && hasTypedParts(body.messages)

  if (anthropic && body.system !== undefined) {
    pushMessage(createSystemMessage(body.system, ['system']))
  }
  if (gemini && body.systemInstruction !== undefined) {
    pushMessage(createSystemMessage(body.systemInstruction, ['systemInstruction']))
  }
  if (!gemini && !anthropic && body.system_instruction !== undefined) {
    pushMessage(createSystemMessage(body.system_instruction, ['system_instruction']))
  }
  if (body.system !== undefined && !anthropic) {
    pushMessage(createSystemMessage(body.system, ['system']))
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
  record: Pick<SandboxModelRequestDetail, 'responseBodyRaw' | 'responseBodyFormat' | 'responseBodyStatus' | 'usage'>,
): ModelConversationResponse | undefined {
  if (record.responseBodyStatus !== 'complete' || record.responseBodyRaw === undefined) return undefined
  const parsed = parseModelResponseBody(record.responseBodyRaw, record.responseBodyFormat)
  const preview = extractModelResponseContent(parsed.value)
  const usage = record.usage ?? (normalizeModelResponseUsage(preview.usage)
    ? { ...normalizeModelResponseUsage(preview.usage), source: 'response' as const }
    : undefined)
  const raw = parsed.value ?? record.responseBodyRaw
  return {
    source: 'response',
    content: preview.content,
    reasoning: preview.reasoning,
    toolCalls: preview.toolCalls.map((call) => ({ id: call.id, name: call.name, arguments: call.arguments })),
    finishReasons: preview.finishReasons,
    ...(usage ? { usage } : {}),
    raw,
    format: parsed.kind === 'empty' ? undefined : parsed.kind,
    searchText: [preview.content, preview.reasoning, preview.toolCalls.map((call) => `${call.name} ${call.arguments ?? ''}`), preview.finishReasons].flat().join('\n'),
  }
}

export function parseModelRequestConversationDetail(detail: SandboxModelRequestDetail): ModelRequestConversation {
  const conversation = parseModelRequestConversation(detail.requestBody, detail.responseBodyFormat)
  const response = parseModelResponseConversation(detail)
  return response ? { ...conversation, response, searchText: `${conversation.searchText}\n${response.searchText}` } : conversation
}

function projectMessage(
  value: Record<string, unknown>,
  path: string[],
  push: (message: Omit<ModelConversationMessage, 'index' | 'searchText'>) => void,
  aiSdk: boolean,
) {
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
  const add = (value: unknown, path: string[], gemini = false) => {
    if (!Array.isArray(value)) return
    for (const [index, item] of value.entries()) {
      if (!isRecord(item)) continue
      if (gemini && Array.isArray(item.functionDeclarations)) {
        for (const [declarationIndex, declaration] of item.functionDeclarations.entries()) {
          if (isRecord(declaration)) target.push(createTool(declaration, [...path, String(index), 'functionDeclarations', String(declarationIndex)]))
        }
      } else {
        const definition = isRecord(item.function) ? item.function : item
        target.push(createTool(definition, [...path, String(index), ...(isRecord(item.function) ? ['function'] : [])]))
      }
    }
  }
  add(body.tools, ['tools'], true)
  add(body.functions, ['functions'])
}

function createTool(value: Record<string, unknown>, path: string[]): ModelConversationTool {
  const name = typeof value.name === 'string' ? value.name : '未命名工具'
  const parameters = value.parameters ?? value.input_schema
  const description = typeof value.description === 'string' ? value.description : ''
  return { name, description, ...(parameters !== undefined ? { parameters } : {}), raw: value, path, searchText: `${name}\n${description}\n${JSON.stringify(parameters ?? '')}` }
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
    return [{
      ...(typeof item.id === 'string' ? { id: item.id } : {}),
      name,
      ...(args !== undefined ? { arguments: typeof args === 'string' ? args : JSON.stringify(args, null, 2) } : {}),
    }]
  })
}

function normalizeParts(value: unknown): ModelConversationContentPart[] {
  if (typeof value === 'string') return [{ kind: 'text', value }]
  if (!Array.isArray(value)) return value === undefined ? [] : [{ kind: 'other', value: JSON.stringify(value, null, 2) }]
  return (value as unknown[]).flatMap((item): ModelConversationContentPart[] => {
    if (typeof item === 'string') return [{ kind: 'text' as const, value: item }]
    if (!isRecord(item)) return []
    const text = item.text ?? item.output_text ?? item.content
    if (typeof text === 'string') return [{ kind: 'text' as const, value: text }]
    const type = typeof item.type === 'string' ? item.type : ''
    if (type.includes('image') || item.image_url || item.source) return [{ kind: 'image' as const, value: String(item.image_url ?? item.source ?? '[图片]') }]
    return [{ kind: 'other' as const, value: JSON.stringify(item, null, 2) }]
  })
}

function normalizeGeminiPart(value: unknown): ModelConversationContentPart[] {
  if (!isRecord(value)) return []
  if (typeof value.text === 'string') return [{ kind: 'text', value: value.text }]
  if (isRecord(value.functionCall)) return [{ kind: 'other', value: value.functionCall as unknown as string }]
  if (isRecord(value.functionResponse)) return [{ kind: 'other', value: JSON.stringify(value.functionResponse, null, 2) }]
  return [{ kind: 'other', value: JSON.stringify(value, null, 2) }]
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
