export const MESSAGE_LIST_BOTTOM_THRESHOLD = 24

interface MessageListScrollMetrics {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}

export interface MessageListTail {
  conversationId: string
  lastMessageId: string
  thinkingIds: string[]
}

export function getMessageListDistanceFromBottom(metrics: MessageListScrollMetrics) {
  return Math.max(0, metrics.scrollHeight - metrics.clientHeight - metrics.scrollTop)
}

export function isMessageListNearBottom(
  metrics: MessageListScrollMetrics,
  threshold = MESSAGE_LIST_BOTTOM_THRESHOLD,
) {
  return getMessageListDistanceFromBottom(metrics) <= threshold
}

export function buildMessageListTail(input: {
  conversationId?: string
  messages: readonly { id: string }[]
  chatLunaStates: readonly { botParticipantId: string, conversationId: string, thinking: boolean }[]
}): MessageListTail {
  return {
    conversationId: input.conversationId ?? '',
    lastMessageId: input.messages.at(-1)?.id ?? '',
    thinkingIds: input.chatLunaStates
      .filter((state) => state.thinking && state.conversationId === input.conversationId)
      .map((state) => `${state.botParticipantId}:${state.conversationId}`)
      .sort(),
  }
}

export function shouldFollowMessageListTail(
  previous: MessageListTail | undefined,
  next: MessageListTail,
  stickingToBottom: boolean,
) {
  if (!previous || previous.conversationId !== next.conversationId) return true
  if (!stickingToBottom) return false
  return previous.lastMessageId !== next.lastMessageId
    || previous.thinkingIds.join('\n') !== next.thinkingIds.join('\n')
}

export function scrollMessageListToBottom(element: MessageListScrollMetrics) {
  element.scrollTop = element.scrollHeight
}
