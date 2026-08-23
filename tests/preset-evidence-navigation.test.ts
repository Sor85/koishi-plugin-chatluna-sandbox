import { describe, expect, it } from 'vitest'
import { createPresetEvidenceNavigationState } from '../client/webqq/preset-evidence-navigation'

describe('预设证据跨页导航状态', () => {
  it('只发布匹配结果，并按序号一次性消费瞬时意图', () => {
    const state = createPresetEvidenceNavigationState()

    expect(state.publish({ status: 'failed', code: 'request-not-observed', message: 'missing' })).toBeUndefined()
    const intent = state.publish({
      status: 'matched',
      recordId: 'record-1',
      evidenceId: 'request:messages:0',
      range: { start: 3, end: 8 },
      scope: { scope: 'space', spaceId: 'space-1' },
    })

    expect(intent).toEqual({
      seq: 1,
      recordId: 'record-1',
      evidenceId: 'request:messages:0',
      range: { start: 3, end: 8 },
      scope: { scope: 'space', spaceId: 'space-1' },
    })
    expect(state.consume(2)).toBeUndefined()
    expect(state.peek()).toEqual(intent)
    expect(state.consume(1)).toEqual(intent)
    expect(state.peek()).toBeUndefined()
  })
})
