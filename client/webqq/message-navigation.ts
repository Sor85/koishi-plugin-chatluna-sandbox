import { ref, type Ref } from 'vue'
import type { createWorkspaceController } from './workspace-controller'

export interface WebqqMessageNavigationTarget {
  scopeId: string
  botId: string
  conversationId: string
  messageId: string
}

export interface WebqqMessageRevealRequest {
  seq: number
  conversationId: string
  messageId: string
}

export function buildMessageNavigationTarget(input: {
  attribution: 'attributed' | 'unattributed'
  scopeId?: string
  botId?: string
  conversationId?: string
  messageId?: string
}): WebqqMessageNavigationTarget | undefined {
  const { attribution, scopeId, botId, conversationId, messageId } = input
  if (attribution !== 'attributed' || !scopeId || !botId || !conversationId || !messageId) return undefined
  return { scopeId, botId, conversationId, messageId }
}

export function createMessageNavigationShell(
  controller: ReturnType<typeof createWorkspaceController>,
  activeSpaceId: Ref<string | undefined>,
  enterSpace: (spaceId?: string) => Promise<void>,
) {
  const revealRequest = ref<WebqqMessageRevealRequest>()

  async function navigateToMessage(target: WebqqMessageNavigationTarget) {
    const spaceId = target.scopeId === 'main' ? undefined : target.scopeId
    await enterSpace(spaceId)
    if (activeSpaceId.value !== spaceId) return
    await controller.selectOperator(target.botId)
    if (controller.currentOperatorId.value !== target.botId) return
    if (!controller.workspace.value.snapshot.conversations.some(({ id }) => id === target.conversationId)) return
    const { messageId } = await controller.resolveMessageId({
      conversationId: target.conversationId,
      rawMessageId: target.messageId,
    })
    if (!messageId) return
    controller.selectConversation(target.conversationId)
    revealRequest.value = {
      seq: (revealRequest.value?.seq ?? 0) + 1,
      conversationId: target.conversationId,
      messageId,
    }
  }

  return { navigateToMessage, revealRequest }
}
