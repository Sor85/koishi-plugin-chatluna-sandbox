import { describe, expect, it } from 'vitest'
import {
  beginModelRequestListNavigation,
  clearModelRequestListSelection,
  releaseModelRequestListNavigationGuard,
  resolveModelRequestListRecords,
  selectModelRequestListRecord,
  type ModelRequestListSelectionState,
} from '../client/webqq/model-request-list-selection'
import type {
  SandboxModelRequestDetail,
  SandboxModelRequestListItem,
} from '../src/types'

function record(id: string): SandboxModelRequestListItem {
  return {
    id,
    sequence: 1,
    status: 'success',
    durationMs: 1,
    createdAt: '2026-08-24T00:00:00.000Z',
    attribution: 'attributed',
    entities: { scopeId: 'main' },
    requestBodyAvailable: true,
    responseBodyStatus: 'complete',
  }
}

function detail(id: string): SandboxModelRequestDetail {
  return { ...record(id), variables: [] } as SandboxModelRequestDetail
}

describe('模型请求跳转列表选中', () => {
  it('筛选 watcher 不会清除跳转目标，详情先返回时把跨页目标补入列表', () => {
    const state: ModelRequestListSelectionState = { selectedRecordId: '' }
    beginModelRequestListNavigation(state, 'request:target')

    clearModelRequestListSelection(state)
    expect(state.selectedRecordId).toBe('request:target')
    expect(resolveModelRequestListRecords(
      state,
      [record('request:latest')],
      detail('request:target'),
    ).map(({ id }) => id)).toEqual(['request:target', 'request:latest'])
    expect(state.navigationRecordId).toBe('request:target')
  })

  it('同步阶段保留保护时，筛选 watcher 不会清除跳转选中态', () => {
    const state: ModelRequestListSelectionState = { selectedRecordId: '' }
    beginModelRequestListNavigation(state, 'request:target')

    expect(resolveModelRequestListRecords(state, [record('request:target')])).toHaveLength(1)
    clearModelRequestListSelection(state)
    releaseModelRequestListNavigationGuard(state)
    expect(state.selectedRecordId).toBe('request:target')
  })

  it('列表先返回目标时保留选中，待同步 watcher 后结束跳转保护', () => {
    const state: ModelRequestListSelectionState = { selectedRecordId: '' }
    beginModelRequestListNavigation(state, 'request:target')

    expect(resolveModelRequestListRecords(state, [record('request:target')])).toHaveLength(1)
    expect(state).toEqual({
      selectedRecordId: 'request:target',
      navigationRecordId: undefined,
      preserveNextClear: true,
    })
    clearModelRequestListSelection(state)
    expect(state.selectedRecordId).toBe('request:target')
    releaseModelRequestListNavigationGuard(state)
    clearModelRequestListSelection(state)
    expect(state.selectedRecordId).toBe('')
  })

  it('用户主动选择其他请求时取消待处理跳转', () => {
    const state: ModelRequestListSelectionState = { selectedRecordId: '' }
    beginModelRequestListNavigation(state, 'request:target')
    selectModelRequestListRecord(state, 'request:other')

    expect(state).toEqual({ selectedRecordId: 'request:other', navigationRecordId: undefined })
    expect(resolveModelRequestListRecords(
      state,
      [record('request:latest')],
      detail('request:target'),
    ).map(({ id }) => id)).toEqual(['request:latest'])
  })
})
