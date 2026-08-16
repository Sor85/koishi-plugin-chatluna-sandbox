import type {
  SandboxModelRequestDetail,
  SandboxModelRequestListItem,
  SandboxModelRequestPromptCompositionItem,
  SandboxModelRequestPromptKind,
  SandboxModelRequestRecord,
  SandboxModelRequestStatus,
  SandboxModelRequestTrajectory,
  SandboxModelRequestTrajectoryKind,
  SandboxModelRequestTrajectoryRow,
} from './types'
import { presentModelRequestRecord, type SandboxModelRequestStore } from './model-request'

interface BuildSandboxModelRequestTrajectoryOptions {
  record: SandboxModelRequestDetail
  mode: 'request' | 'conversation'
  store?: SandboxModelRequestStore
}

interface ProjectedMessage {
  kind: SandboxModelRequestTrajectoryKind
  preview: string
  detail?: unknown
  callId?: string
  toolName?: string
}

export function buildSandboxModelRequestTrajectory(
  options: BuildSandboxModelRequestTrajectoryOptions,
): SandboxModelRequestTrajectory {
  const sourceRecords = options.mode === 'conversation'
    ? resolveConversationRecords(options.record, options.store)
    : [options.record]
  const records = sourceRecords.map((record) => presentModelRequestRecord(record, 'list') as SandboxModelRequestListItem)
  const rows: SandboxModelRequestTrajectoryRow[] = []
  let index = 1

  for (const record of sourceRecords) {
    const requestRow: SandboxModelRequestTrajectoryRow = {
      id: `${record.id}:request`,
      index: index++,
      kind: 'request',
      preview: requestPreview(record),
      durationMs: record.durationMs,
      startedAt: record.createdAt,
      requestId: record.id,
      status: record.status,
    }
    rows.push(requestRow)

    for (const message of projectRequestMessages(record.requestBody)) {
      rows.push({
        id: `${record.id}:${message.kind}:${index}`,
        index: index++,
        requestId: record.id,
        ...message,
      })
    }
    for (const message of projectResponseMessages(record)) {
      rows.push({
        id: `${record.id}:${message.kind}:${index}`,
        index: index++,
        requestId: record.id,
        ...message,
      })
    }
  }

  return {
    mode: options.mode,
    ...(options.record.entities.conversationId
      ? { conversationId: options.record.entities.conversationId }
      : {}),
    records,
    rows,
    ...(options.mode === 'request'
      ? { promptComposition: projectPromptComposition(options.record.requestBody) }
      : {}),
    complete: options.mode === 'request' || !options.store || sourceRecords.length < 200,
  }
}

function projectPromptComposition(body: unknown): SandboxModelRequestPromptCompositionItem[] {
  if (!isRecord(body)) return []
  const sizes = new Map<SandboxModelRequestPromptKind, number>()
  const add = (kind: SandboxModelRequestPromptKind, value: unknown) => {
    const characters = serializedCharacters(value)
    if (characters > 0) sizes.set(kind, (sizes.get(kind) ?? 0) + characters)
  }

  add('tool', body.tools)
  add('tool', body.functions)
  add('system', body.system ?? body.systemInstruction ?? body.system_instruction)

  if (Array.isArray(body.messages)) {
    for (const message of body.messages) {
      if (!isRecord(message)) continue
      const role = stringValue(message.role)?.toLowerCase() ?? 'user'
      if (role === 'assistant') {
        add('assistant', message.content)
        add('tool', message.tool_calls ?? message.function_call)
      } else if (role === 'tool' || role === 'function') {
        add('tool', message.content ?? message)
      } else if (role === 'system' || role === 'developer') {
        add('system', message.content ?? message)
      } else {
        add('user', message.content ?? message)
      }
    }
  }

  if (Array.isArray(body.contents)) {
    for (const content of body.contents) {
      if (!isRecord(content)) continue
      const role: SandboxModelRequestPromptKind = content.role === 'model' ? 'assistant' : 'user'
      const parts = Array.isArray(content.parts) ? content.parts : []
      for (const part of parts) {
        if (isRecord(part) && ('functionCall' in part || 'functionResponse' in part)) add('tool', part)
        else add(role, part)
      }
    }
  }

  if (typeof body.input === 'string') add('user', body.input)
  else if (Array.isArray(body.input)) {
    for (const item of body.input) {
      if (!isRecord(item)) {
        add('user', item)
        continue
      }
      const role = stringValue(item.role)?.toLowerCase()
      if (item.type === 'function_call' || item.type === 'function_call_output') add('tool', item)
      else if (role === 'assistant') add('assistant', item.content ?? item)
      else if (role === 'system' || role === 'developer') add('system', item.content ?? item)
      else add('user', item.content ?? item)
    }
  }

  return (['system', 'user', 'assistant', 'tool'] as const).flatMap((kind) => {
    const characters = sizes.get(kind) ?? 0
    return characters > 0 ? [{ kind, characters }] : []
  })
}

function serializedCharacters(value: unknown): number {
  if (value === undefined || value === null) return 0
  if (typeof value === 'string') return value.length
  try { return JSON.stringify(value).length } catch { return String(value).length }
}

function resolveConversationRecords(
  record: SandboxModelRequestDetail,
  store: SandboxModelRequestStore | undefined,
): SandboxModelRequestRecord[] {
  const conversationId = record.entities.conversationId
  if (!store || !conversationId) return [record]
  return store.getRawRecords({ conversationId, order: 'asc', limit: 200 })
}

function requestPreview(record: SandboxModelRequestRecord): string {
  const provider = record.provider || '未知渠道'
  const model = record.model || '未知模型'
  if (record.status === 'pending') return `${provider} / ${model} · 进行中`
  if (record.status === 'error') return `${provider} / ${model} · 请求失败`
  return `${provider} / ${model} · ${record.durationMs} ms`
}

function projectRequestMessages(body: unknown): ProjectedMessage[] {
  if (!isRecord(body)) return []
  const messages = Array.isArray(body.messages)
    ? body.messages.flatMap(projectOpenAiMessage)
    : Array.isArray(body.contents)
      ? body.contents.flatMap(projectGeminiMessage)
      : []
  const tools = projectToolCatalog(body.tools)
  return [...tools, ...messages]
}

function projectOpenAiMessage(value: unknown): ProjectedMessage[] {
  if (!isRecord(value)) return []
  const role = typeof value.role === 'string' ? value.role.toLowerCase() : 'user'
  const detail = value.content ?? value
  const preview = previewValue(detail)
  if (role === 'system' || role === 'developer') return [{ kind: 'system', preview, detail: value }]
  if (role === 'assistant') {
    // 仅含 tool_calls 的 assistant 消息没有可展示文本；不能回退预览整条消息，
    // 否则同一次工具调用会同时被误投影为 assistant 内容和 tool 事件。
    const contentPreview = previewValue(value.content)
    return [
      ...(contentPreview ? [{ kind: 'assistant' as const, preview: contentPreview, detail: value }] : []),
      ...projectOpenAiToolCalls(value.tool_calls),
    ]
  }
  if (role === 'tool' || role === 'function') {
    return [{
      kind: 'tool',
      preview: `${stringValue(value.name) || '工具结果'} · ${preview || '无输出'}`,
      detail: value,
      ...(stringValue(value.tool_call_id) ? { callId: stringValue(value.tool_call_id) } : {}),
      ...(stringValue(value.name) ? { toolName: stringValue(value.name) } : {}),
    }]
  }
  return [{ kind: 'user', preview: preview || '用户消息', detail: value }]
}

function projectOpenAiToolCalls(value: unknown): ProjectedMessage[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((call) => {
    if (!isRecord(call)) return []
    const fn = isRecord(call.function) ? call.function : call
    const name = stringValue(fn.name) || '工具调用'
    const args = fn.arguments ?? fn.input
    return [{
      kind: 'tool' as const,
      preview: `${name} · ${previewValue(args) || '无参数'}`,
      detail: call,
      toolName: name,
      ...(stringValue(call.id) ? { callId: stringValue(call.id) } : {}),
    }]
  })
}

function projectGeminiMessage(value: unknown): ProjectedMessage[] {
  if (!isRecord(value)) return []
  const role = value.role === 'model' ? 'assistant' : 'user'
  const parts = Array.isArray(value.parts) ? value.parts : []
  const text = parts.flatMap((part) => isRecord(part) && typeof part.text === 'string' ? [part.text] : []).join('\n')
  const calls = parts.flatMap((part) => {
    if (!isRecord(part) || !isRecord(part.functionCall)) return []
    const name = stringValue(part.functionCall.name) || '工具调用'
    return [{
      kind: 'tool' as const,
      preview: `${name} · ${previewValue(part.functionCall.args) || '无参数'}`,
      detail: part.functionCall,
      toolName: name,
    }]
  })
  return [
    ...(text ? [{ kind: role as 'assistant' | 'user', preview: compactText(text), detail: value }] : []),
    ...calls,
  ]
}

function projectToolCatalog(value: unknown): ProjectedMessage[] {
  if (!Array.isArray(value) || !value.length) return []
  const names = value.flatMap((tool) => {
    if (!isRecord(tool)) return []
    if (isRecord(tool.function) && typeof tool.function.name === 'string') return [tool.function.name]
    if (Array.isArray(tool.functionDeclarations)) {
      return tool.functionDeclarations.flatMap((entry) => isRecord(entry) && typeof entry.name === 'string' ? [entry.name] : [])
    }
    return []
  })
  return [{
    kind: 'system',
    preview: names.length ? `工具目录 · ${names.join('、')}` : `工具目录 · ${value.length} 项`,
    detail: value,
  }]
}

function projectResponseMessages(record: SandboxModelRequestRecord): ProjectedMessage[] {
  if (record.responseBodyStatus !== 'complete' || !record.responseBodyRaw) return []
  const value = parseResponseValue(record.responseBodyRaw, record.responseBodyFormat)
  const content: string[] = []
  const reasoning: string[] = []
  const tools: ProjectedMessage[] = []
  collectResponse(value, content, reasoning, tools)
  const rows: ProjectedMessage[] = []
  if (reasoning.length) rows.push({ kind: 'assistant', preview: `思考 · ${compactText(reasoning.join(''))}`, detail: reasoning.join('') })
  if (content.length) rows.push({ kind: 'assistant', preview: compactText(content.join('')), detail: content.join('') })
  rows.push(...tools)
  return rows
}

function collectResponse(value: unknown, content: string[], reasoning: string[], tools: ProjectedMessage[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectResponse(item, content, reasoning, tools)
    return
  }
  if (!isRecord(value)) return
  if ('data' in value && Object.keys(value).includes('event')) collectResponse(value.data, content, reasoning, tools)
  if (Array.isArray(value.choices)) {
    for (const choice of value.choices) {
      if (!isRecord(choice)) continue
      const message = isRecord(choice.message) ? choice.message : isRecord(choice.delta) ? choice.delta : undefined
      if (!message) continue
      collectText(message.content, content)
      collectText(message.reasoning_content ?? message.reasoning, reasoning)
      tools.push(...projectOpenAiToolCalls(message.tool_calls))
    }
  }
  if (Array.isArray(value.content)) {
    for (const block of value.content) {
      if (!isRecord(block)) continue
      if (block.type === 'text') collectText(block.text, content)
      if (block.type === 'thinking') collectText(block.thinking, reasoning)
      if (block.type === 'tool_use') {
        const name = stringValue(block.name) || '工具调用'
        tools.push({ kind: 'tool', preview: `${name} · ${previewValue(block.input) || '无参数'}`, detail: block, toolName: name, ...(stringValue(block.id) ? { callId: stringValue(block.id) } : {}) })
      }
    }
  }
  if (Array.isArray(value.candidates)) {
    for (const candidate of value.candidates) {
      if (!isRecord(candidate) || !isRecord(candidate.content) || !Array.isArray(candidate.content.parts)) continue
      for (const part of candidate.content.parts) {
        if (!isRecord(part)) continue
        collectText(part.text, part.thought === true ? reasoning : content)
        if (isRecord(part.functionCall)) {
          const name = stringValue(part.functionCall.name) || '工具调用'
          tools.push({ kind: 'tool', preview: `${name} · ${previewValue(part.functionCall.args) || '无参数'}`, detail: part.functionCall, toolName: name })
        }
      }
    }
  }
  if (Array.isArray(value.output)) {
    for (const item of value.output) {
      if (!isRecord(item)) continue
      if (item.type === 'message') collectText(item.content, content)
      if (item.type === 'reasoning') collectText(item.summary, reasoning)
      if (item.type === 'function_call') {
        const name = stringValue(item.name) || '工具调用'
        tools.push({ kind: 'tool', preview: `${name} · ${previewValue(item.arguments) || '无参数'}`, detail: item, toolName: name, ...(stringValue(item.call_id) ? { callId: stringValue(item.call_id) } : {}) })
      }
    }
  }
}

function parseResponseValue(raw: string, format: string | undefined): unknown {
  if (format === 'sse') {
    return raw.split(/\r?\n\r?\n/).flatMap((chunk) => {
      const data = chunk.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n')
      if (!data || data === '[DONE]') return []
      try { return [{ event: 'message', data: JSON.parse(data) }] } catch { return [] }
    })
  }
  try { return JSON.parse(raw) } catch { return raw }
}

function collectText(value: unknown, target: string[]): void {
  if (typeof value === 'string' && value) target.push(value)
  if (!Array.isArray(value)) return
  for (const item of value) {
    if (typeof item === 'string') target.push(item)
    else if (isRecord(item)) collectText(item.text ?? item.output_text ?? item.content, target)
  }
}

function previewValue(value: unknown): string {
  if (typeof value === 'string') return compactText(value)
  if (Array.isArray(value)) {
    const text = value.flatMap((item) => {
      if (typeof item === 'string') return [item]
      if (isRecord(item)) return [stringValue(item.text ?? item.content) || (item.type === 'image_url' || item.type === 'image' ? '[图片]' : '')]
      return []
    }).filter(Boolean).join(' ')
    return text ? compactText(text) : `${value.length} 项`
  }
  if (value === undefined || value === null) return ''
  try { return compactText(JSON.stringify(value)) } catch { return String(value) }
}

function compactText(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length > 180 ? `${normalized.slice(0, 177)}…` : normalized
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

export function statusLabel(status: SandboxModelRequestStatus): string {
  if (status === 'pending') return '进行中'
  if (status === 'error') return '错误'
  return '已完成'
}
