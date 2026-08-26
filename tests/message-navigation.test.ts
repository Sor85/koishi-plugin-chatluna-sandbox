import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { buildMessageNavigationTarget, createMessageNavigationShell } from '../client/webqq/message-navigation'

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

  it('将 XML 中的 OneBot 数字 ID 解析为消息列表使用的领域 ID', async () => {
    const currentOperatorId = ref('10001')
    const controller = {
      currentOperatorId,
      workspace: ref({ snapshot: { conversations: [{ id: 'group:30001' }] } }),
      selectOperator: vi.fn(async (operatorId: string) => {
        currentOperatorId.value = operatorId
      }),
      selectConversation: vi.fn(),
      resolveMessageId: vi.fn(async () => ({ messageId: 'f742d8a6' })),
    }
    const activeSpaceId = ref<string>()
    const enterSpace = vi.fn(async (spaceId?: string) => {
      activeSpaceId.value = spaceId
    })
    const navigation = createMessageNavigationShell(controller as never, activeSpaceId, enterSpace)

    await navigation.navigateToMessage({
      scopeId: 'main',
      botId: '20001',
      conversationId: 'group:30001',
      messageId: '4148353190',
    })

    expect(controller.resolveMessageId).toHaveBeenCalledWith({
      conversationId: 'group:30001',
      rawMessageId: '4148353190',
    })
    expect(navigation.revealRequest.value).toEqual({
      seq: 1,
      conversationId: 'group:30001',
      messageId: 'f742d8a6',
    })
  })
})
