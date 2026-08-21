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
import {
  countMessageCharacters,
  countToolCallCharacters,
  countToolDefinitionCharacters,
  projectModelEvidence,
  type ModelEvidenceMessage,
  type ModelEvidenceProjection,
} from './model-evidence'

interface BuildSandboxModelRequestTrajectoryOptions {
  record: SandboxModelRequestDetail
  mode: 'request' | 'conversation'
  store?: SandboxModelRequestStore
}

interface ProjectedRow {
  evidenceId: string
  kind: SandboxModelRequestTrajectoryKind
  preview: string
  callId?: string
  toolName?: string
  toolEvent?: 'definition' | 'call' | 'result'
}

const CONVERSATION_RECORD_LIMIT = 200

export function buildSandboxModelRequestTrajectory(
  options: BuildSandboxModelRequestTrajectoryOptions,
): SandboxModelRequestTrajectory {
  const sourceRecords = options.mode === 'conversation'
    ? resolveConversationRecords(options.record, options.store)
    : [options.record]
  const records = sourceRecords.map(record => presentModelRequestRecord(record, 'list') as SandboxModelRequestListItem)
  const rows: SandboxModelRequestTrajectoryRow[] = []
  const promptComposition: SandboxModelRequestPromptCompositionItem[] = []
  let index = 1

  for (const record of sourceRecords) {
    // 轨迹只负责会话聚合、请求边界、时间与组成统计；协议语义全部来自共享模型证据投影。
    const projection = projectModelEvidence({
      requestBody: record.requestBody,
      ...(record.responseBodyStatus === 'complete' && record.responseBodyRaw !== undefined
        ? { responseBodyRaw: record.responseBodyRaw, responseBodyFormat: record.responseBodyFormat }
        : {}),
    })

    rows.push({
      id: `${record.id}:request`,
      index: index++,
      kind: 'request',
      preview: requestPreview(record),
      durationMs: record.durationMs,
      startedAt: record.createdAt,
      requestId: record.id,
      status: record.status,
    })

    for (const row of projectRequestRows(projection)) {
      rows.push({ id: `${record.id}:${row.evidenceId}`, index: index++, requestId: record.id, source: 'request', ...row })
    }
    for (const row of projectResponseRows(projection)) {
      rows.push({ id: `${record.id}:${row.evidenceId}`, index: index++, requestId: record.id, source: 'response', ...row })
    }
    for (const item of projectPromptComposition(projection)) {
      promptComposition.push(options.mode === 'conversation' ? { ...item, requestId: record.id } : item)
    }
  }

  return {
    mode: options.mode,
    ...(options.record.entities.conversationId
      ? { conversationId: options.record.entities.conversationId }
      : {}),
    records,
    rows,
    promptComposition,
    complete: options.mode === 'request' || !options.store || sourceRecords.length < CONVERSATION_RECORD_LIMIT,
  }
}

function projectRequestRows(projection: ModelEvidenceProjection): ProjectedRow[] {
  const rows: ProjectedRow[] = projection.toolDefinitions.map(definition => ({
    evidenceId: definition.evidenceId,
    kind: 'tool' as const,
    preview: `工具定义 · ${definition.name}`,
    toolName: definition.name,
    toolEvent: 'definition' as const,
  }))
  for (const message of projection.requestMessages) {
    rows.push(...messageRows(message))
  }
  return rows
}

function messageRows(message: ModelEvidenceMessage): ProjectedRow[] {
  const rows: ProjectedRow[] = []
  if (message.role === 'tool') {
    rows.push({
      evidenceId: message.evidenceId,
      kind: 'tool',
      preview: `${message.toolName ?? '工具结果'} · ${compactText(message.text) || '无输出'}`,
      ...(message.toolName ? { toolName: message.toolName } : {}),
      ...(message.toolCallId ? { callId: message.toolCallId } : {}),
      toolEvent: 'result',
    })
    return rows
  }
  const reasoning = message.reasoning ? compactText(message.reasoning) : ''
  const text = compactText(message.text)
  if (text || reasoning) {
    rows.push({
      evidenceId: message.evidenceId,
      kind: message.role,
      preview: text || `思考 · ${reasoning}`,
    })
  }
  for (const call of message.toolCalls) {
    rows.push({
      evidenceId: call.evidenceId,
      kind: 'tool',
      preview: `${call.name} · ${compactText(call.arguments ?? '') || '无参数'}`,
      toolName: call.name,
      ...(call.callId ? { callId: call.callId } : {}),
      toolEvent: 'call',
    })
  }
  return rows
}

function projectResponseRows(projection: ModelEvidenceProjection): ProjectedRow[] {
  return projection.responseEvents.flatMap<ProjectedRow>((event) => {
    if (event.kind === 'reasoning') {
      return [{ evidenceId: event.evidenceId, kind: 'assistant', preview: `思考 · ${compactText(event.text ?? '')}` }]
    }
    if (event.kind === 'content') {
      return [{ evidenceId: event.evidenceId, kind: 'assistant', preview: compactText(event.text ?? '') }]
    }
    if (event.kind === 'tool-call') {
      return [{
        evidenceId: event.evidenceId,
        kind: 'tool',
        preview: `${event.name ?? '工具调用'} · ${compactText(event.arguments ?? '') || '无参数'}`,
        ...(event.name ? { toolName: event.name } : {}),
        ...(event.callId ? { callId: event.callId } : {}),
        toolEvent: 'call',
      }]
    }
    if (event.kind === 'tool-result') {
      return [{
        evidenceId: event.evidenceId,
        kind: 'tool',
        preview: `${event.name ?? '工具结果'} · ${compactText(event.text ?? '') || '无输出'}`,
        ...(event.name ? { toolName: event.name } : {}),
        ...(event.callId ? { callId: event.callId } : {}),
        toolEvent: 'result',
      }]
    }
    return []
  })
}

function projectPromptComposition(projection: ModelEvidenceProjection): SandboxModelRequestPromptCompositionItem[] {
  const sequence: SandboxModelRequestPromptCompositionItem[] = []
  for (const message of projection.requestMessages) {
    const kind: SandboxModelRequestPromptKind = message.role === 'tool' ? 'tool-interaction' : message.role
    push(sequence, kind, message.evidenceId, countMessageCharacters(message))
    for (const call of message.toolCalls) {
      push(sequence, 'tool-interaction', call.evidenceId, countToolCallCharacters(call))
    }
  }

  const tools = projection.toolDefinitions.map(definition => ({
    kind: 'tool-definition' as const,
    evidenceId: definition.evidenceId,
    characters: Math.max(countToolDefinitionCharacters(definition), 1),
  }))

  // 工具声明不是对话轮次，但属于请求前缀。插在 leading system/user 之后，
  // 让单请求轨道按 System → User → Tool Defs 顺序铺开，而不是每种各从 0 起一条。
  let split = 0
  while (split < sequence.length && (sequence[split]!.kind === 'system' || sequence[split]!.kind === 'user')) {
    split += 1
  }
  return [...sequence.slice(0, split), ...tools, ...sequence.slice(split)]
}

function push(
  target: SandboxModelRequestPromptCompositionItem[],
  kind: SandboxModelRequestPromptKind,
  evidenceId: string,
  count: number,
): void {
  if (count > 0) target.push({ kind, evidenceId, characters: count })
}

function resolveConversationRecords(
  record: SandboxModelRequestDetail,
  store: SandboxModelRequestStore | undefined,
): SandboxModelRequestRecord[] {
  const conversationId = record.entities.conversationId
  if (!store || !conversationId) return [record]
  return store.getRawRecords({ conversationId, order: 'asc', limit: CONVERSATION_RECORD_LIMIT })
}

function requestPreview(record: SandboxModelRequestRecord): string {
  const provider = record.provider || '未知渠道'
  const model = record.model || '未知模型'
  if (record.status === 'pending') return `${provider} / ${model} · 进行中`
  if (record.status === 'error') return `${provider} / ${model} · 请求失败`
  return `${provider} / ${model} · ${record.durationMs} ms`
}

function compactText(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length > 180 ? `${normalized.slice(0, 177)}…` : normalized
}

export function statusLabel(status: SandboxModelRequestStatus): string {
  if (status === 'pending') return '进行中'
  if (status === 'error') return '错误'
  return '已完成'
}
