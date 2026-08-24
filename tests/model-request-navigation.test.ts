import { describe, expect, it } from 'vitest'
import { createMessageModelRequestNavigationIntent } from '../client/webqq/model-request-navigation'

describe('消息到模型请求导航', () => {
  it('把主环境引用映射为主环境请求意图', () => {
    expect(createMessageModelRequestNavigationIntent(1, {
      scopeId: 'main',
      recordId: 'request:main',
    })).toEqual({
      seq: 1,
      scope: { scope: 'main' },
      recordId: 'request:main',
    })
  })

  it('把测试空间引用映射为空间请求意图', () => {
    expect(createMessageModelRequestNavigationIntent(2, {
      scopeId: 'space-a',
      recordId: 'request:space',
    })).toEqual({
      seq: 2,
      scope: { scope: 'space', spaceId: 'space-a' },
      recordId: 'request:space',
    })
  })
})
