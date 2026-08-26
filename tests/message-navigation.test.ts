import { describe, expect, it } from 'vitest'
import { buildMessageNavigationTarget } from '../client/webqq/message-navigation'

describe('模型请求历史消息导航', () => {
  it('只用完整且已归属的请求事实构造跳转目标', () => {
    expect(buildMessageNavigationTarget({
      attribution: 'attributed',
      scopeId: 'main',
      botId: '20001',
      conversationId: 'group:30001',
      messageId: 'message-9',
    })).toEqual({
      scopeId: 'main',
      botId: '20001',
      conversationId: 'group:30001',
      messageId: 'message-9',
    })
  })

  it.each([
    { attribution: 'unattributed' as const, scopeId: 'main', botId: '20001', conversationId: 'group:30001', messageId: 'message-9' },
    { attribution: 'attributed' as const, botId: '20001', conversationId: 'group:30001', messageId: 'message-9' },
    { attribution: 'attributed' as const, scopeId: 'main', conversationId: 'group:30001', messageId: 'message-9' },
    { attribution: 'attributed' as const, scopeId: 'main', botId: '20001', messageId: 'message-9' },
    { attribution: 'attributed' as const, scopeId: 'main', botId: '20001', conversationId: 'group:30001' },
  ])('缺少任一权威事实时不提供跳转', (input) => {
    expect(buildMessageNavigationTarget(input)).toBeUndefined()
  })
})
