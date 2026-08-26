import { describe, expect, it } from 'vitest'
import {
  isModelRequestTrajectoryRowCollapsed,
  orderModelRequestTrajectoryRows,
} from '../client/webqq/model-request-trajectory-display'
import type { SandboxModelRequestTrajectoryRow } from '../src/types'

function row(id: string, kind: SandboxModelRequestTrajectoryRow['kind'], requestId: string): SandboxModelRequestTrajectoryRow {
  return { id, index: 1, kind, preview: id, requestId }
}

describe('模型请求轨迹账本展示', () => {
  const rows = [
    row('one:request', 'request', 'one'),
    row('one:system', 'system', 'one'),
    row('one:variable', 'variable', 'one'),
    row('two:request', 'request', 'two'),
    row('two:user', 'user', 'two'),
  ]

  it('默认倒序请求组，但保留每条请求内的阅读顺序', () => {
    expect(orderModelRequestTrajectoryRows(rows, 'desc').map(({ id }) => id)).toEqual([
      'two:request', 'two:user', 'one:request', 'one:system', 'one:variable',
    ])
  })

  it('正序恢复服务端请求组顺序，并且只隐藏折叠请求的内容行', () => {
    expect(orderModelRequestTrajectoryRows(rows, 'asc').map(({ id }) => id)).toEqual(rows.map(({ id }) => id))
    const collapsed = new Set(['one'])
    expect(isModelRequestTrajectoryRowCollapsed(rows[0]!, collapsed)).toBe(false)
    expect(isModelRequestTrajectoryRowCollapsed(rows[1]!, collapsed)).toBe(true)
    expect(isModelRequestTrajectoryRowCollapsed(rows[3]!, collapsed)).toBe(false)
  })
})
