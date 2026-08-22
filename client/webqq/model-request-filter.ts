import type { SandboxModelRequestTrajectoryRow } from '../../src/types'
import type { ModelRequestAnalysisGroupKey, ModelRequestAnalysisItemKind } from './model-request-analysis'

/**
 * 模型证据显示过滤。
 *
 * 轨迹账本、分析导航和分析卡片共用同一份过滤定义：种类取自用户在两个视图里看到的同一套标签
 * （SYSTEM / USER / ASSISTANT / TOOL DEFS / TOOL CALL / TOOL RESULT），来源取自证据本身属于
 * 请求还是响应。任何一侧自己重算一套判定，都会让同一条证据在两个视图里出现和消失得不一致。
 */
export type ModelEvidenceFilterKind =
  | 'system'
  | 'user'
  | 'assistant'
  | 'tool-definition'
  | 'tool-call'
  | 'tool-result'

export type ModelEvidenceFilterSource = 'request' | 'response'

export interface ModelEvidenceFilter {
  hiddenKinds: ReadonlySet<ModelEvidenceFilterKind>
  hiddenSources: ReadonlySet<ModelEvidenceFilterSource>
}

export const MODEL_EVIDENCE_FILTER_KINDS: readonly { kind: ModelEvidenceFilterKind, label: string }[] = [
  { kind: 'system', label: 'SYSTEM' },
  { kind: 'user', label: 'USER' },
  { kind: 'assistant', label: 'ASSISTANT' },
  { kind: 'tool-definition', label: 'TOOL DEFS' },
  { kind: 'tool-call', label: 'TOOL CALL' },
  { kind: 'tool-result', label: 'TOOL RESULT' },
]

export const MODEL_EVIDENCE_FILTER_SOURCES: readonly { source: ModelEvidenceFilterSource, label: string }[] = [
  { source: 'request', label: '请求侧' },
  { source: 'response', label: '响应侧' },
]

export const EMPTY_MODEL_EVIDENCE_FILTER: ModelEvidenceFilter = {
  hiddenKinds: new Set(),
  hiddenSources: new Set(),
}

/**
 * 轨迹行 → 过滤种类。
 *
 * 请求边界行没有对应的模型证据（它是请求本身），返回 undefined 表示不参与种类与来源过滤，
 * 否则把整条请求过滤掉之后账本会连边界一起消失，看不出还有哪些请求。
 */
export function trajectoryRowFilterKind(
  row: Pick<SandboxModelRequestTrajectoryRow, 'kind' | 'toolEvent'>,
): ModelEvidenceFilterKind | undefined {
  if (row.kind === 'request') return undefined
  if (row.kind !== 'tool') return row.kind
  if (row.toolEvent === 'definition') return 'tool-definition'
  if (row.toolEvent === 'result') return 'tool-result'
  return 'tool-call'
}

/** 请求消息角色 → 过滤种类。tool 角色的消息就是请求里携带的工具结果。 */
export function messageRoleFilterKind(role: 'system' | 'user' | 'assistant' | 'tool'): ModelEvidenceFilterKind {
  return role === 'tool' ? 'tool-result' : role
}

/** 分析导航项 → 过滤种类。message 类导航项的分组键就是消息角色。 */
export function analysisItemFilterKind(
  itemKind: ModelRequestAnalysisItemKind,
  groupKey: ModelRequestAnalysisGroupKey,
): ModelEvidenceFilterKind | undefined {
  if (itemKind === 'tool-call') return 'tool-call'
  if (itemKind === 'tool-result') return 'tool-result'
  if (itemKind === 'tool-definition') return 'tool-definition'
  // 响应分组头部代表整张响应卡片，不属于任何单一角色，只受来源过滤约束。
  if (itemKind === 'response') return undefined
  if (groupKey === 'system' || groupKey === 'user' || groupKey === 'assistant') return messageRoleFilterKind(groupKey)
  // tool 角色的消息在导航里种类是 tool-result，走不到这里；response 分组头部没有单一角色。
  return undefined
}

/** 分析导航项 → 过滤来源。响应分组内的一切都是响应侧证据。 */
export function analysisItemFilterSource(groupKey: ModelRequestAnalysisGroupKey): ModelEvidenceFilterSource {
  return groupKey === 'response' ? 'response' : 'request'
}

export function isEvidenceVisible(
  filter: ModelEvidenceFilter,
  kind: ModelEvidenceFilterKind | undefined,
  source: ModelEvidenceFilterSource | undefined,
): boolean {
  if (kind !== undefined && filter.hiddenKinds.has(kind)) return false
  return !(source !== undefined && filter.hiddenSources.has(source))
}

export function isModelEvidenceFilterActive(filter: ModelEvidenceFilter): boolean {
  return filter.hiddenKinds.size > 0 || filter.hiddenSources.size > 0
}

/** 无障碍标签用的过滤摘要，说明当前隐藏了什么而不是罗列全部选项。 */
export function modelEvidenceFilterSummary(filter: ModelEvidenceFilter): string {
  if (!isModelEvidenceFilterActive(filter)) return '显示全部证据'
  const kinds = MODEL_EVIDENCE_FILTER_KINDS
    .filter(({ kind }) => filter.hiddenKinds.has(kind))
    .map(({ label }) => label)
  const sources = MODEL_EVIDENCE_FILTER_SOURCES
    .filter(({ source }) => filter.hiddenSources.has(source))
    .map(({ label }) => label)
  return `已隐藏 ${[...kinds, ...sources].join('、')}`
}

/** 切换集合成员，返回新集合，让 Vue 的 ref 能识别变更。 */
export function toggleFilterMember<T>(current: ReadonlySet<T>, member: T): Set<T> {
  const next = new Set(current)
  if (!next.delete(member)) next.add(member)
  return next
}
