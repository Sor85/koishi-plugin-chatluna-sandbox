import type { SandboxModelRequestDetail, SandboxModelRequestPromptKind, SandboxModelRequestStatus } from '../../src/types'
import type {
  ModelConversationMessage,
  ModelRequestConversation,
} from './model-request-conversation'

export type ModelRequestAnalysisGroupKey = 'system' | 'user' | 'assistant' | 'tool' | 'response'
export type ModelRequestAnalysisItemKind = 'message' | 'tool-call' | 'tool-result' | 'tool-definition' | 'response'

export interface ModelRequestAnalysisNavigationItem {
  id: string
  kind: ModelRequestAnalysisItemKind
  label: string
  index?: number
  preview: string
  target: string
  searchText: string
}

export interface ModelRequestAnalysisNavigationGroup {
  key: ModelRequestAnalysisGroupKey
  label: string
  count: number
  items: ModelRequestAnalysisNavigationItem[]
}

export interface ModelRequestAnalysisBoundary {
  label: string
  status: SandboxModelRequestStatus
  model?: string
  provider?: string
  durationMs: number
  target: string
}

export interface ModelRequestAnalysisNavigation {
  boundary: ModelRequestAnalysisBoundary
  groups: ModelRequestAnalysisNavigationGroup[]
  searchText: string
}

const GROUP_LABELS: Record<ModelRequestAnalysisGroupKey, string> = {
  system: 'System',
  user: 'User',
  assistant: 'Assistant',
  tool: 'Tool',
  response: '响应',
}

export function normalizeAnalysisQuery(value: string | undefined): string {
  return value?.trim().toLocaleLowerCase('zh-CN') ?? ''
}

export function modelAnalysisMessageId(index: number): string {
  return `model-analysis-message-${index}`
}

export function modelAnalysisToolId(path: string[]): string {
  return `model-analysis-tool-${path.map(encodeTargetPart).join('-')}`
}

export function modelAnalysisToolCallId(messageIndex: number, callIndex: number): string {
  return `${modelAnalysisMessageId(messageIndex)}-tool-call-${callIndex}`
}

export function modelAnalysisResponseToolCallId(callIndex: number): string {
  return `model-analysis-response-tool-call-${callIndex}`
}

export function modelAnalysisResponseToolResultId(resultIndex: number): string {
  return `model-analysis-response-tool-result-${resultIndex}`
}

export function buildModelRequestAnalysisNavigation(
  conversation: ModelRequestConversation,
  detail: Pick<SandboxModelRequestDetail, 'sequence' | 'status' | 'model' | 'provider' | 'durationMs'>,
): ModelRequestAnalysisNavigation {
  const grouped = new Map<ModelRequestAnalysisGroupKey, ModelRequestAnalysisNavigationItem[]>()
  const add = (key: ModelRequestAnalysisGroupKey, item: ModelRequestAnalysisNavigationItem) => {
    const items = grouped.get(key) ?? []
    items.push({ ...item, searchText: normalizeAnalysisQuery(item.searchText) })
    grouped.set(key, items)
  }

  for (const message of conversation.messages) {
    add(message.role, messageNavigationItem(message))
    if (message.role === 'assistant') {
      message.toolCalls.forEach((call, callIndex) => add('assistant', {
        id: `message-${message.index}-tool-call-${callIndex}`,
        kind: 'tool-call',
        label: 'TOOL CALL',
        index: message.index,
        preview: call.name,
        target: modelAnalysisToolCallId(message.index, callIndex),
        searchText: `${call.name}\n${call.id ?? ''}\n${call.arguments ?? ''}`,
      }))
    }
  }

  conversation.tools.forEach((tool, index) => add('tool', {
    id: `tool-definition-${index}`,
    kind: 'tool-definition',
    label: 'TOOL DEFS',
    preview: tool.name,
    target: index === 0 ? 'model-analysis-tools' : modelAnalysisToolId(tool.path),
    searchText: tool.searchText,
  }))

  const response = conversation.response
  if (response) {
    add('response', {
      id: 'response',
      kind: 'response',
      label: '响应',
      preview: compactAnalysisText(response.content.join('\n') || response.statusMessage || '本次响应'),
      target: 'model-analysis-response',
      searchText: response.searchText,
    })
    response.toolCalls.forEach((call, index) => add('response', {
      id: `response-tool-call-${index}`,
      kind: 'tool-call',
      label: 'TOOL CALL',
      preview: call.name,
      target: modelAnalysisResponseToolCallId(index),
      searchText: `${call.name}\n${call.id ?? ''}\n${call.arguments ?? ''}`,
    }))
    response.toolResults.forEach((result, index) => add('response', {
      id: `response-tool-result-${index}`,
      kind: 'tool-result',
      label: 'TOOL RESULT',
      preview: result.name || result.id || '工具结果',
      target: modelAnalysisResponseToolResultId(index),
      searchText: `${result.name ?? ''}\n${result.id ?? ''}\n${result.content}`,
    }))
  }

  const order: ModelRequestAnalysisGroupKey[] = ['system', 'user', 'assistant', 'tool', 'response']
  const groups = order.flatMap((key) => {
    const items = grouped.get(key) ?? []
    return items.length ? [{ key, label: GROUP_LABELS[key], count: items.length, items }] : []
  })
  return {
    boundary: {
      label: `请求 ${detail.sequence}`,
      status: detail.status,
      ...(detail.model ? { model: detail.model } : {}),
      ...(detail.provider ? { provider: detail.provider } : {}),
      durationMs: detail.durationMs,
      target: 'model-analysis-response',
    },
    groups,
    searchText: normalizeAnalysisQuery(conversation.searchText),
  }
}

export function resolveAnalysisPromptTarget(
  navigation: ModelRequestAnalysisNavigation,
  kind: SandboxModelRequestPromptKind,
  indexInKind: number,
): string | undefined {
  if (kind === 'tool-definition') {
    return navigation.groups
      .find(group => group.key === 'tool')
      ?.items.filter(item => item.kind === 'tool-definition')[indexInKind]?.target
  }
  if (kind === 'tool-interaction') {
    const interactions = navigation.groups
      .filter(group => group.key !== 'response')
      .flatMap(group => group.items)
      .filter(item => item.kind === 'tool-call' || item.kind === 'tool-result')
      .sort((left, right) => targetOrder(left.target) - targetOrder(right.target))
    return interactions[indexInKind]?.target
  }
  const group = navigation.groups.find(candidate => candidate.key === kind)
  return group?.items.filter(item => item.kind === 'message')[indexInKind]?.target
}

export interface ModelAnalysisTargetPreparation {
  messageIndex?: number
  response: boolean
  toolPaths: string[][]
  expandCards: string[]
  expandTargets: string[]
}

export function prepareModelAnalysisTarget(
  conversation: ModelRequestConversation,
  target: string,
): ModelAnalysisTargetPreparation {
  const messageTarget = target.match(/^model-analysis-message-(\d+)(?:-tool-call-(\d+))?$/)
  const messageIndex = messageTarget ? Number(messageTarget[1]) : undefined
  const hasMessage = messageIndex !== undefined && conversation.messages.some(message => message.index === messageIndex)
  const tool = conversation.tools.find(candidate => modelAnalysisToolId(candidate.path) === target)
  const response = target === 'model-analysis-response' || target.startsWith('model-analysis-response-')
  return {
    ...(hasMessage ? { messageIndex } : {}),
    response,
    toolPaths: tool ? [tool.path] : [],
    expandCards: [
      ...(hasMessage ? [modelAnalysisMessageId(messageIndex)] : []),
      ...(response ? ['model-analysis-response'] : []),
    ],
    expandTargets: [target],
  }
}

export function resolveToolDefinitionLocation(
  tools: ModelRequestConversation['tools'],
  name: string,
): { target: string, toolPaths: string[][] } | undefined {
  const matches = tools.filter(tool => tool.name === name)
  if (!matches.length) return undefined
  return {
    target: matches.length === 1 ? modelAnalysisToolId(matches[0]!.path) : 'model-analysis-tools',
    toolPaths: matches.map(tool => tool.path),
  }
}

export function shouldExpandAnalysisText(
  manuallyExpanded: boolean,
  forceExpanded: boolean,
  query: string,
  value: string,
): boolean {
  return manuallyExpanded || forceExpanded || Boolean(query && value.toLocaleLowerCase('zh-CN').includes(query))
}

export function collapseAnalysisText(
  value: string,
  expanded: boolean,
  threshold = 1200,
  previewLength = 600,
): { text: string, collapsible: boolean } {
  const collapsible = value.length > threshold
  return {
    text: expanded || !collapsible ? value : value.slice(0, previewLength),
    collapsible,
  }
}

export function compactAnalysisText(value: string, length = 80): string {
  const text = value.replace(/\s+/g, ' ').trim()
  if (!text) return '无文本内容'
  return text.length > length ? `${text.slice(0, Math.max(0, length - 1))}…` : text
}

export function isPreviewableConversationImage(value: string): boolean {
  if (/^https?:\/\//i.test(value)) return true
  return /^data:image\/(?!svg\+xml)[a-z0-9.+-]+;base64,[a-z\d+/=\s]+$/i.test(value)
}

function messageNavigationItem(message: ModelConversationMessage): ModelRequestAnalysisNavigationItem {
  return {
    id: `message-${message.index}`,
    kind: message.role === 'tool' ? 'tool-result' : 'message',
    label: message.role === 'tool' ? 'TOOL RESULT' : message.role.toUpperCase(),
    index: message.index,
    preview: compactAnalysisText(message.content || message.reasoning || message.toolCalls[0]?.name || '无文本内容'),
    target: modelAnalysisMessageId(message.index),
    searchText: message.searchText,
  }
}

function targetOrder(target: string): number {
  const match = target.match(/^model-analysis-message-(\d+)(?:-tool-call-(\d+))?$/)
  if (!match) return Number.MAX_SAFE_INTEGER
  return Number(match[1]) * 100 + (match[2] === undefined ? 50 : Number(match[2]))
}

function encodeTargetPart(value: string): string {
  return encodeURIComponent(value).replaceAll('%', '_')
}
