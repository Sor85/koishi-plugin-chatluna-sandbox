import { describe, expect, it } from 'vitest'
import {
  EMPTY_MODEL_EVIDENCE_FILTER,
  MODEL_EVIDENCE_FILTER_KINDS,
  analysisItemFilterKind,
  isEvidenceVisible,
  messageRoleFilterKind,
  isModelEvidenceFilterActive,
  modelEvidenceFilterSummary,
  toggleFilterMember,
  trajectoryRowFilterKind,
  type ModelEvidenceFilter,
  type ModelEvidenceFilterKind,
} from '../client/webqq/model-request-filter'

function filter(kinds: ModelEvidenceFilterKind[] = []): ModelEvidenceFilter {
  return { hiddenKinds: new Set(kinds) }
}

describe('模型证据显示过滤', () => {
  it('过滤选项覆盖轨迹账本展示的全部证据种类标签', () => {
    expect(MODEL_EVIDENCE_FILTER_KINDS.map(({ label }) => label))
      .toEqual(['SYSTEM', 'USER', 'ASSISTANT', 'TOOL DEFS', 'TOOL CALL', 'TOOL RESULT'])
  })

  it('轨迹行按种类与工具事件映射到过滤种类', () => {
    expect(trajectoryRowFilterKind({ kind: 'system' })).toBe('system')
    expect(trajectoryRowFilterKind({ kind: 'user' })).toBe('user')
    expect(trajectoryRowFilterKind({ kind: 'assistant' })).toBe('assistant')
    expect(trajectoryRowFilterKind({ kind: 'tool', toolEvent: 'definition' })).toBe('tool-definition')
    expect(trajectoryRowFilterKind({ kind: 'tool', toolEvent: 'call' })).toBe('tool-call')
    expect(trajectoryRowFilterKind({ kind: 'tool', toolEvent: 'result' })).toBe('tool-result')
  })

  it('请求边界行不参与种类过滤，隐藏全部种类后仍能看出有哪些请求', () => {
    expect(trajectoryRowFilterKind({ kind: 'request' })).toBeUndefined()
    const everything = filter(MODEL_EVIDENCE_FILTER_KINDS.map(({ kind }) => kind))
    expect(isEvidenceVisible(everything, trajectoryRowFilterKind({ kind: 'request' }))).toBe(true)
  })

  it('按种类隐藏证据，未隐藏的种类仍然显示', () => {
    expect(isEvidenceVisible(filter(['system']), 'system')).toBe(false)
    expect(isEvidenceVisible(filter(['system']), 'user')).toBe(true)
    expect(isEvidenceVisible(EMPTY_MODEL_EVIDENCE_FILTER, 'tool-call')).toBe(true)
  })

  it('分析导航项映射到与轨迹账本一致的种类', () => {
    expect(analysisItemFilterKind('message', 'system')).toBe('system')
    expect(analysisItemFilterKind('message', 'user')).toBe('user')
    expect(analysisItemFilterKind('message', 'assistant')).toBe('assistant')
    expect(analysisItemFilterKind('tool-result', 'tool')).toBe('tool-result')
    expect(analysisItemFilterKind('tool-definition', 'tool')).toBe('tool-definition')
    expect(analysisItemFilterKind('tool-call', 'assistant')).toBe('tool-call')
    expect(analysisItemFilterKind('tool-call', 'response')).toBe('tool-call')
    // 响应分组头部代表整张响应卡片，没有单一角色。
    expect(analysisItemFilterKind('response', 'response')).toBeUndefined()

    expect(analysisItemFilterKind('message', 'tool')).toBeUndefined()
  })

  it('请求里的 tool 角色消息按 TOOL RESULT 过滤', () => {
    expect(messageRoleFilterKind('tool')).toBe('tool-result')
    expect(messageRoleFilterKind('system')).toBe('system')
    expect(messageRoleFilterKind('user')).toBe('user')
    expect(messageRoleFilterKind('assistant')).toBe('assistant')
  })

  it('响应分组头部没有单一角色，不会被 ASSISTANT 种类过滤掉', () => {
    const kind = analysisItemFilterKind('response', 'response')
    expect(isEvidenceVisible(filter(['assistant']), kind)).toBe(true)
    expect(isEvidenceVisible(filter(['tool-call']), kind)).toBe(true)
  })

  it('切换过滤成员返回新集合，便于响应式识别变更', () => {
    const first = toggleFilterMember(new Set<ModelEvidenceFilterKind>(), 'system')
    expect([...first]).toEqual(['system'])
    const second = toggleFilterMember(first, 'user')
    expect([...second]).toEqual(['system', 'user'])
    expect(second).not.toBe(first)
    expect([...toggleFilterMember(second, 'system')]).toEqual(['user'])
  })

  it('过滤摘要说明当前隐藏了什么', () => {
    expect(isModelEvidenceFilterActive(EMPTY_MODEL_EVIDENCE_FILTER)).toBe(false)
    expect(modelEvidenceFilterSummary(EMPTY_MODEL_EVIDENCE_FILTER)).toBe('显示全部证据')
    const active = filter(['tool-definition', 'system'])
    expect(isModelEvidenceFilterActive(active)).toBe(true)
    // 摘要按选项声明顺序排列，不按用户点击顺序，避免同一组过滤读出不同文案。
    expect(modelEvidenceFilterSummary(active)).toBe('已隐藏 SYSTEM、TOOL DEFS')
  })
})
