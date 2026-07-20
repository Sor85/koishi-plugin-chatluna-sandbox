import { describe, expect, it } from 'vitest'
import { getUserStackMetrics, orderUsersByActive } from '../client/user-stack'

describe('发送框用户头像组', () => {
  const users = [
    { id: '10001', name: '测试用户' },
    { id: '10002', name: '协作用户' },
    { id: '10003', name: '管理员' },
    { id: '10004', name: '访客' },
  ]

  it('始终把当前用户排在头像组最右侧对应的首位', () => {
    expect(orderUsersByActive(users, '10003').map(({ id }) => id)).toEqual([
      '10003',
      '10001',
      '10002',
      '10004',
    ])
  })

  it('按原发送框头像尺寸缩放 WebQQ 胶囊的折叠与展开宽度', () => {
    expect(getUserStackMetrics(2)).toEqual({
      collapsedVisibleCount: 2,
      overflowCount: 0,
      collapsedWidth: 57,
      expandedWidth: 63,
    })
    expect(getUserStackMetrics(5)).toEqual({
      collapsedVisibleCount: 3,
      overflowCount: 2,
      collapsedWidth: 99,
      expandedWidth: 144,
    })
  })
})
