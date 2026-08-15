import type { SandboxConversation, SandboxSnapshot } from '../../src/types'

export function getConversationPeerId(conversation: SandboxConversation, operatorId: string | undefined) {
  if (conversation.type === 'direct') return conversation.participantIds.find((id) => id !== operatorId) ?? conversation.participantIds[0]
  return undefined
}

export function getVisibleRecentConversations(
  conversations: SandboxConversation[],
  hiddenAtMessage: Record<string, string> = {},
) {
  return conversations.filter((conversation) => {
    const hiddenMarker = hiddenAtMessage[conversation.id]
    if (hiddenMarker === undefined) return true
    return hiddenMarker !== (conversation.messageIds.at(-1) ?? '')
  })
}

export function getFriendDirectory(snapshot: SandboxSnapshot, operatorId?: string) {
  if (!operatorId) return []

  return snapshot.participants
    .filter(({ id }) => id !== operatorId)
    .map((participant) => {
      const friendship = snapshot.friendships.find(({ participantIds }) => participantIds.includes(operatorId) && participantIds.includes(participant.id))
      const pendingOutgoing = snapshot.requests.some(({ type, requesterId, targetId }) => type === 'friend' && requesterId === operatorId && targetId === participant.id)
      const pendingIncoming = snapshot.requests.some(({ type, requesterId, targetId }) => type === 'friend' && requesterId === participant.id && targetId === operatorId)
      const isBot = participant.kind === 'bot'
      const conversationId = snapshot.conversations.find((conversation) => isDirectConversationBetween(conversation, operatorId, participant.id))?.id

      return {
        id: participant.id,
        isBot,
        isFriend: !!friendship,
        pendingOutgoing,
        pendingIncoming,
        conversationId,
        avatar: participant.avatar,
        displayName: friendship?.remarks[operatorId] || participant.name,
        status: friendship
          ? `${participant.name} · ${isBot ? '机器人好友' : '好友'}`
          : pendingOutgoing
            ? '好友申请待处理'
            : pendingIncoming
              ? '有新的好友申请'
              : isBot ? '未添加机器人好友' : '未添加好友',
        relation: friendship ? 'added' as const : pendingOutgoing || pendingIncoming ? 'pending' as const : 'missing' as const,
      }
    })
}

export function getGroupDirectory(snapshot: SandboxSnapshot, operatorId?: string) {
  if (!operatorId) return []

  return snapshot.groups.map((group) => {
    const member = group.members.find(({ participantId }) => participantId === operatorId)
    const pending = snapshot.requests.some(({ type, subType, requesterId, groupId }) => type === 'group'
      && (subType ?? 'add') === 'add' && requesterId === operatorId && groupId === group.id)
    const conversationId = member
      ? snapshot.conversations.find((conversation) => isGroupConversationFor(conversation, group.id))?.id
      : undefined

    return {
      ...group,
      member,
      pending,
      conversationId,
      relation: member ? 'joined' as const : pending ? 'pending' as const : 'missing' as const,
    }
  })
}

function isDirectConversationBetween(conversation: SandboxConversation, firstId: string, secondId: string) {
  return conversation.type === 'direct'
    && conversation.participantIds.includes(firstId)
    && conversation.participantIds.includes(secondId)
}

function isGroupConversationFor(conversation: SandboxConversation, groupId: string) {
  return conversation.type === 'group'
    && conversation.groupId === groupId
}
