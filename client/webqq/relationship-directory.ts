import type { SandboxConversation, SandboxSnapshot } from '../../src/types'

export function getConversationPeerId(conversation: SandboxConversation, operatorId: string | undefined, operatorIsBot: boolean) {
  return operatorIsBot && conversation.botId === operatorId ? conversation.userId : conversation.botId
}

export function getVisibleRecentConversations(
  conversations: SandboxConversation[],
  operatorIsBot: boolean,
  activeConversationId?: string,
) {
  if (!operatorIsBot) return conversations

  // 机器人视角会同时收到同一群对每个参与者的底层会话；最近列表只合并展示入口，
  // 并优先保留当前激活会话作为代表，避免切换后丢失选中态。
  const groupRepresentatives = new Map<string, SandboxConversation>()
  for (const conversation of conversations) {
    if (!conversation.groupId) continue
    const representative = groupRepresentatives.get(conversation.groupId)
    if (!representative || conversation.id === activeConversationId) {
      groupRepresentatives.set(conversation.groupId, conversation)
    }
  }

  const addedGroups = new Set<string>()
  return conversations.flatMap((conversation) => {
    if (!conversation.groupId) return [conversation]
    if (addedGroups.has(conversation.groupId)) return []
    addedGroups.add(conversation.groupId)
    return [groupRepresentatives.get(conversation.groupId) ?? conversation]
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
    const conversationId = snapshot.conversations.find((conversation) => isGroupConversationFor(conversation, group.id, operatorId))?.id

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
    && ((conversation.userId === firstId && conversation.botId === secondId)
      || (conversation.userId === secondId && conversation.botId === firstId))
}

function isGroupConversationFor(conversation: SandboxConversation, groupId: string, operatorId: string) {
  return conversation.type === 'group'
    && conversation.groupId === groupId
    && (conversation.userId === operatorId || conversation.botId === operatorId)
}
