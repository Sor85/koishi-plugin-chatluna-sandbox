import type { SandboxModelRequestTrajectoryRow } from '../../src/types'

export type ModelRequestTrajectorySortOrder = 'asc' | 'desc'

/**
 * 账本展示可以倒序请求，但每个请求内部必须保留服务端投影的阅读顺序。
 * 请求序号仍来自原始 records，排序只改变请求组的前后位置。
 */
export function orderModelRequestTrajectoryRows(
  rows: readonly SandboxModelRequestTrajectoryRow[],
  order: ModelRequestTrajectorySortOrder,
): SandboxModelRequestTrajectoryRow[] {
  const groups: SandboxModelRequestTrajectoryRow[][] = []
  const byRequestId = new Map<string, SandboxModelRequestTrajectoryRow[]>()
  for (const row of rows) {
    const requestId = row.requestId ?? row.id
    let group = byRequestId.get(requestId)
    if (!group) {
      group = []
      byRequestId.set(requestId, group)
      groups.push(group)
    }
    group.push(row)
  }
  return (order === 'desc' ? [...groups].reverse() : groups).flat()
}

export function isModelRequestTrajectoryRowCollapsed(
  row: Pick<SandboxModelRequestTrajectoryRow, 'kind' | 'requestId'>,
  collapsedRequestIds: ReadonlySet<string>,
): boolean {
  return row.kind !== 'request' && Boolean(row.requestId && collapsedRequestIds.has(row.requestId))
}
