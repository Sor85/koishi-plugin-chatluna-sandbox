import type {
  SandboxModelRequestDetail,
  SandboxModelRequestListItem,
} from '../../src/types'

export interface ModelRequestListSelectionState {
  selectedRecordId: string
  navigationRecordId?: string
  preserveNextClear?: boolean
}

export function beginModelRequestListNavigation(
  state: ModelRequestListSelectionState,
  recordId: string,
): void {
  state.selectedRecordId = recordId
  state.navigationRecordId = recordId
  state.preserveNextClear = true
}

export function releaseModelRequestListNavigationGuard(
  state: ModelRequestListSelectionState,
): void {
  delete state.preserveNextClear
}

export function clearModelRequestListSelection(
  state: ModelRequestListSelectionState,
): void {
  if (state.preserveNextClear) {
    delete state.preserveNextClear
    return
  }
  state.selectedRecordId = ''
  state.navigationRecordId = undefined
}

export function selectModelRequestListRecord(
  state: ModelRequestListSelectionState,
  recordId: string,
): void {
  state.selectedRecordId = recordId
  state.navigationRecordId = undefined
  delete state.preserveNextClear
}

export function resolveModelRequestListRecords(
  state: ModelRequestListSelectionState,
  records: readonly SandboxModelRequestListItem[],
  detail?: SandboxModelRequestDetail,
): SandboxModelRequestListItem[] {
  const result = [...records]
  const navigationRecordId = state.navigationRecordId
  if (!navigationRecordId) return result
  if (result.some(({ id }) => id === navigationRecordId)) {
    state.navigationRecordId = undefined
    return result
  }
  if (detail?.id !== navigationRecordId) return result
  // 精确跳转的记录可能已超出首屏分页；用权威详情补入列表，确保左侧仍有可选中的请求。
  return [detail, ...result]
}
