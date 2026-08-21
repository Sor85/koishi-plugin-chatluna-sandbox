import type {
  SandboxModelRequestDetail,
  SandboxModelRequestStatus,
} from '../../src/types'
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
  /** 与轨迹行、组成分段共享的模型证据投影身份。响应分组头部本身不是一条证据，因此可缺省。 */
  evidenceId?: string
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
  /** evidenceId → 分析视图定位目标。跨视图定位只依赖这张表，不再重算角色内序号。 */
  targets: Record<string, string>
  searchText: string
}

const GROUP_LABELS: Record<ModelRequestAnalysisGroupKey, string> = {
  system: 'System',
  user: 'User',
  assistant: 'Assistant',
  tool: 'Tool',
  response: '响应',
}

export const MODEL_ANALYSIS_RESPONSE_TARGET = 'model-analysis-response'
export const MODEL_ANALYSIS_TOOLS_TARGET = 'model-analysis-tools'

export function normalizeAnalysisQuery(value: string | undefined): string {
  return value?.trim().toLocaleLowerCase('zh-CN') ?? ''
}

/**
 * 把模型证据身份编码成分析视图的 DOM 目标。
 *
 * evidenceId 已经是确定性的，这里只做 DOM id 允许字符的收敛，不引入第二套排序或序号规则。
 */
export function modelAnalysisTargetId(evidenceId: string): string {
  return `model-analysis-${evidenceId.replace(/[^\w:.-]+/g, '_')}`
}

export function buildModelRequestAnalysisNavigation(
  conversation: ModelRequestConversation,
  detail: Pick<SandboxModelRequestDetail, 'sequence' | 'status' | 'model' | 'provider' | 'durationMs'>,
): ModelRequestAnalysisNavigation {
  const grouped = new Map<ModelRequestAnalysisGroupKey, ModelRequestAnalysisNavigationItem[]>()
  const targets: Record<string, string> = {}
  const add = (key: ModelRequestAnalysisGroupKey, item: ModelRequestAnalysisNavigationItem) => {
    const items = grouped.get(key) ?? []
    items.push({ ...item, searchText: normalizeAnalysisQuery(item.searchText) })
    grouped.set(key, items)
    if (item.evidenceId) targets[item.evidenceId] = item.target
  }

  for (const message of conversation.messages) {
    add(message.role, messageNavigationItem(message))
    for (const call of message.toolCalls) {
      add(message.role, {
        id: call.evidenceId,
        kind: 'tool-call',
        label: 'TOOL CALL',
        index: message.index,
        preview: call.name,
        evidenceId: call.evidenceId,
        target: modelAnalysisTargetId(call.evidenceId),
        searchText: `${call.name}\n${call.id ?? ''}\n${call.arguments ?? ''}`,
      })
    }
  }

  conversation.tools.forEach((tool, index) => add('tool', {
    id: tool.evidenceId,
    kind: 'tool-definition',
    label: 'TOOL DEFS',
    preview: tool.name,
    evidenceId: tool.evidenceId,
    // 第一个工具定义定位到 TOOL DEFS 区块头，让整段能力目录一起进入视野。
    target: index === 0 ? MODEL_ANALYSIS_TOOLS_TARGET : modelAnalysisTargetId(tool.evidenceId),
    searchText: tool.searchText,
  }))

  const response = conversation.response
  if (response) {
    add('response', {
      id: 'response',
      kind: 'response',
      label: '响应',
      preview: compactAnalysisText(response.content.join('\n') || response.statusMessage || '本次响应'),
      target: MODEL_ANALYSIS_RESPONSE_TARGET,
      searchText: response.searchText,
    })
    // 正文、思考、结束原因和用量都落在同一张响应卡片上。
    for (const evidenceId of response.cardEvidenceIds) targets[evidenceId] = MODEL_ANALYSIS_RESPONSE_TARGET
    for (const call of response.toolCalls) {
      add('response', {
        id: call.evidenceId,
        kind: 'tool-call',
        label: 'TOOL CALL',
        preview: call.name,
        evidenceId: call.evidenceId,
        target: modelAnalysisTargetId(call.evidenceId),
        searchText: `${call.name}\n${call.id ?? ''}\n${call.arguments ?? ''}`,
      })
    }
    for (const result of response.toolResults) {
      add('response', {
        id: result.evidenceId,
        kind: 'tool-result',
        label: 'TOOL RESULT',
        preview: result.name || result.id || '工具结果',
        evidenceId: result.evidenceId,
        target: modelAnalysisTargetId(result.evidenceId),
        searchText: `${result.name ?? ''}\n${result.id ?? ''}\n${result.content}`,
      })
    }
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
      target: MODEL_ANALYSIS_RESPONSE_TARGET,
    },
    groups,
    targets,
    searchText: normalizeAnalysisQuery(conversation.searchText),
  }
}

/** 轨迹行、组成分段和分析导航共用同一张证据身份表；找不到时退回请求边界。 */
export function resolveAnalysisEvidenceTarget(
  navigation: ModelRequestAnalysisNavigation,
  evidenceId: string | undefined,
): string | undefined {
  if (!evidenceId) return navigation.groups[0]?.items[0]?.target ?? navigation.boundary.target
  return navigation.targets[evidenceId]
}

export interface ModelAnalysisTargetPreparation {
  messageEvidenceId?: string
  response: boolean
  toolEvidenceIds: string[]
  expandCards: string[]
  expandTargets: string[]
}

export function prepareModelAnalysisTarget(
  conversation: ModelRequestConversation,
  target: string,
): ModelAnalysisTargetPreparation {
  const message = conversation.messages.find(candidate => (
    modelAnalysisTargetId(candidate.evidenceId) === target
    || candidate.toolCalls.some(call => modelAnalysisTargetId(call.evidenceId) === target)
  ))
  const tool = conversation.tools.find(candidate => modelAnalysisTargetId(candidate.evidenceId) === target)
  const response = target === MODEL_ANALYSIS_RESPONSE_TARGET
    || Boolean(conversation.response && [
      ...conversation.response.toolCalls.map(call => call.evidenceId),
      ...conversation.response.toolResults.map(result => result.evidenceId),
    ].some(evidenceId => modelAnalysisTargetId(evidenceId) === target))
  return {
    ...(message ? { messageEvidenceId: message.evidenceId } : {}),
    response,
    toolEvidenceIds: tool ? [tool.evidenceId] : [],
    expandCards: [
      ...(message ? [modelAnalysisTargetId(message.evidenceId)] : []),
      ...(response ? [MODEL_ANALYSIS_RESPONSE_TARGET] : []),
    ],
    expandTargets: [target],
  }
}

export function resolveToolDefinitionLocation(
  tools: ModelRequestConversation['tools'],
  name: string,
): { target: string, toolEvidenceIds: string[] } | undefined {
  const matches = tools.filter(tool => tool.name === name)
  if (!matches.length) return undefined
  return {
    // 同名工具定义证据不明确时展开全部匹配项，而不是猜测第一项。
    target: matches.length === 1 ? modelAnalysisTargetId(matches[0]!.evidenceId) : MODEL_ANALYSIS_TOOLS_TARGET,
    toolEvidenceIds: matches.map(tool => tool.evidenceId),
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

export function exceedsAnalysisLineLimit(
  renderedHeight: number,
  lineHeight: number,
  maxLines = 12,
): boolean {
  return renderedHeight > lineHeight * maxLines
}

export function analysisTargetScrollTop(
  elementTop: number,
  scrollerTop: number,
  scrollerScrollTop: number,
  margin = 12,
): number {
  return Math.max(0, elementTop - scrollerTop + scrollerScrollTop - margin)
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

export function formatEvidencePath(path: readonly string[]): string {
  return path.reduce((result, part) => /^\d+$/.test(part) ? `${result}[${part}]` : result ? `${result}.${part}` : part, '')
}

function messageNavigationItem(message: ModelConversationMessage): ModelRequestAnalysisNavigationItem {
  return {
    id: message.evidenceId,
    kind: message.role === 'tool' ? 'tool-result' : 'message',
    label: message.role === 'tool' ? 'TOOL RESULT' : message.role.toUpperCase(),
    index: message.index,
    preview: compactAnalysisText(message.content || message.reasoning || message.toolCalls[0]?.name || '无文本内容'),
    evidenceId: message.evidenceId,
    target: modelAnalysisTargetId(message.evidenceId),
    searchText: message.searchText,
  }
}
