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

  it('定位意图消费后仍可返回预设来源，直到显式返回或清空', () => {
    const state = createPresetEvidenceNavigationState()

    expect(state.canReturn).toBe(false)
    expect(state.returnToOrigin()).toBeUndefined()
    expect(state.publish({ status: 'failed', code: 'request-not-observed', message: 'missing' })).toBeUndefined()
    expect(state.canReturn).toBe(false)

    const intent = state.publish({
      status: 'matched',
      recordId: 'record-1',
      evidenceId: 'request:messages:0',
      range: { start: 3, end: 8 },
      scope: { scope: 'main' },
    })
    expect(intent?.seq).toBe(1)
    expect(state.canReturn).toBe(true)
    expect(state.consume(1)).toEqual(intent)
    expect(state.peek()).toBeUndefined()
    expect(state.canReturn).toBe(true)
    expect(state.returnToOrigin()).toEqual({
      view: 'presets',
      snapshot: { listScrollTop: 0, searchQuery: '' },
    })
    expect(state.canReturn).toBe(false)
    expect(state.returnToOrigin()).toBeUndefined()

    state.publish({
      status: 'matched',
      recordId: 'record-2',
      evidenceId: 'request:messages:1',
      range: { start: 0, end: 4 },
      scope: { scope: 'main' },
    })
    state.clear()
    expect(state.canReturn).toBe(false)
    expect(state.peek()).toBeUndefined()
  })

  it('跳转时保存预设来源位置，返回时原样交出', () => {
    const state = createPresetEvidenceNavigationState()
    const editorScroll = { kind: 'scroll-snapshot' }

    state.publish({
      status: 'matched',
      recordId: 'record-1',
      evidenceId: 'request:messages:0',
      range: { start: 3, end: 8 },
      scope: { scope: 'main' },
    }, {
      listScrollTop: 420,
      searchQuery: 'system',
      editorScroll,
    })
    state.consume(1)

    expect(state.returnToOrigin()).toEqual({
      view: 'presets',
      snapshot: {
        listScrollTop: 420,
        searchQuery: 'system',
        editorScroll,
      },
    })
    expect(state.returnToOrigin()).toBeUndefined()
  })
})
