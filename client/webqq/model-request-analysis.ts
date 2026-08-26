import type {
  SandboxModelRequestDetail,
  SandboxModelRequestStatus,
  SandboxModelRequestVariable,
} from '../../src/types'
import type {
  ModelConversationMessage,
  ModelRequestConversation,
} from './model-request-conversation'

export type ModelRequestAnalysisGroupKey = 'system' | 'user' | 'assistant' | 'tool' | 'variables' | 'response'
export type ModelRequestAnalysisItemKind = 'message' | 'tool-call' | 'tool-result' | 'tool-definition' | 'variable' | 'response'

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
  variables: 'Variables',
  response: '响应',
}

export const MODEL_ANALYSIS_RESPONSE_TARGET = 'model-analysis-response'
export const MODEL_ANALYSIS_TOOLS_TARGET = 'model-analysis-tools'

export function modelAnalysisVariableTargetId(variableId: string): string {
  return modelAnalysisTargetId(`variable:${variableId}`)
}

export function normalizeAnalysisQuery(value: string | undefined): string {
  return value?.trim().toLocaleLowerCase('zh-CN') ?? ''
}

/**
 * 用滚动容器上方约四分之一处作为阅读探针，返回探针最后越过的分析分类。
 * 这样长卡片仍保持所属分类，下一分类进入主要阅读区域后才切换导航。
 */
export function resolveActiveAnalysisGroup(
  positions: readonly { key: ModelRequestAnalysisGroupKey, top: number }[],
  scrollerTop: number,
  scrollerHeight: number,
): ModelRequestAnalysisGroupKey | undefined {
  if (!positions.length) return undefined
  const probeTop = analysisProbeTop(scrollerTop, scrollerHeight)
  let active = positions[0].key
  for (const position of positions) {
    if (position.top > probeTop) break
    active = position.key
  }
  return active
}

/** 折叠阅读探针已经越过、且当前不再阅读的分类；尚未读到的分类保持展开。 */
export function resolveCollapsedAnalysisGroups(
  positions: readonly { key: ModelRequestAnalysisGroupKey, top: number }[],
  scrollerTop: number,
  scrollerHeight: number,
): ModelRequestAnalysisGroupKey[] {
  const probeTop = analysisProbeTop(scrollerTop, scrollerHeight)
  const passed = positions.filter(position => position.top <= probeTop)
  const active = passed.at(-1)?.key
  if (!active) return []
  return [...new Set(passed.slice(0, -1).map(position => position.key))]
    .filter(key => key !== active)
}

/** 返回阅读探针当前经过的具体导航目标，用于同步左侧条目。 */
export function resolveActiveAnalysisTarget(
  positions: readonly { target: string, top: number }[],
  scrollerTop: number,
  scrollerHeight: number,
): string | undefined {
  const probeTop = analysisProbeTop(scrollerTop, scrollerHeight)
  let active: string | undefined
  for (const position of positions) {
    if (position.top > probeTop) break
    active = position.target
  }
  return active
}

function analysisProbeTop(scrollerTop: number, scrollerHeight: number): number {
  return scrollerTop + Math.min(120, Math.max(0, scrollerHeight) * 0.25)
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
  detail: Pick<SandboxModelRequestDetail, 'sequence' | 'status' | 'model' | 'provider' | 'durationMs' | 'variables'>,
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

  for (const variable of detail.variables ?? []) {
    add('variables', variableNavigationItem(variable))
  }

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

  const order: ModelRequestAnalysisGroupKey[] = ['system', 'user', 'variables', 'response', 'assistant', 'tool']
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

function variableNavigationItem(variable: SandboxModelRequestVariable): ModelRequestAnalysisNavigationItem {
  const statusText = variable.status === 'observed' ? variable.value ?? '' : variableStatusLabel(variable.status)
  return {
    id: variable.id,
    kind: 'variable',
    label: 'VARIABLE',
    preview: variable.name,
    evidenceId: `variable:${variable.id}`,
    target: modelAnalysisVariableTargetId(variable.id),
    searchText: `${variable.name}\n${statusText}\n${variable.presetName}`,
  }
}

function variableStatusLabel(status: SandboxModelRequestVariable['status']): string {
  if (status === 'ambiguous') return '展开值存在歧义'
  if (status === 'stale') return '预设快照已变化'
  if (status === 'unsupported') return '表达式不支持定位'
  return '未在模型请求中观察到展开值'
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
