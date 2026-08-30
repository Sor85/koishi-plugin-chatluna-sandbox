import type { WebqqChatPaneModel } from '../webqq-chat-pane.vue'
import type { WebqqDetailsPanelModel } from '../webqq-details-panel.vue'
import type { WebqqForwardTargetModel, WebqqForwardTargetOption } from '../webqq-forward-target-dialog.vue'
import type { WebqqSidebarModel } from '../webqq-sidebar.vue'
import {
  formatRecalledMessageEventText,
  getSandboxBots,
  getSandboxUsers,
  isRecalledMessage,
  type SandboxAppearance,
  type SandboxForward,
  type SandboxSnapshot,
} from '../../src/types'
import { includesConversationParticipant, listRootConversations, readConversationMessageIds } from '../../src/conversation-resolution'
import { buildForwardPreviewMap } from './forward-preview'
import { formatMentionContent } from './mention'
import { getIncomingNotificationRequests } from './notification-requests'
import { getConversationPeerId, getFriendDirectory, getGroupDirectory } from './relationship-directory'
import { resolveWorkspaceSelection } from './workspace-state'

export interface WorkspaceThumbnailModels {
  sidebar: WebqqSidebarModel
  chatPane: WebqqChatPaneModel
  detailsPanel: WebqqDetailsPanelModel
}

export function buildWorkspaceThumbnailModels(
  snapshot: SandboxSnapshot,
  appearance: SandboxAppearance,
  colorMode: 'light' | 'dark',
): WorkspaceThumbnailModels {
  const selection = resolveWorkspaceSelection(snapshot, { currentView: 'messages' })
  const currentOperatorId = selection.currentOperatorId
  const activeConversationId = selection.activeConversationId
  const users = getSandboxUsers(snapshot)
  const bots = getSandboxBots(snapshot)
  const currentOperator = snapshot.participants.find(({ id }) => id === currentOperatorId)
  // 缩略图只画根会话：它是工作台的小幅预览，会话实例的对话线不参与这一层信息密度。
  const visibleConversations = currentOperatorId
    ? listRootConversations(snapshot)
      .filter((conversation) => includesConversationParticipant(snapshot, conversation, currentOperatorId))
    : []
  const currentConversation = visibleConversations.find(({ id }) => id === activeConversationId)
  const currentGroup = snapshot.groups.find(({ id }) => id === currentConversation?.groupId)
  const currentPeerId = currentConversation ? getConversationPeerId(currentConversation, currentOperatorId) : undefined
  const currentPeer = snapshot.participants.find(({ id }) => id === currentPeerId)
  const currentBot = bots.find(({ id }) => id === currentPeerId)
  const title = currentGroup?.name ?? currentPeer?.name ?? (currentConversation ? currentConversation.id : '选择一个会话')
  const subtitle = currentGroup
    ? `群聊 ${currentGroup.id} · ${currentGroup.members.length} 人`
    : currentBot ? '在线 · 虚拟 OneBot 机器人' : currentPeer ? '在线 · 好友' : '暂无会话'
  const avatar = currentGroup?.avatar ?? currentPeer?.avatar ?? ''
  const avatarKind = currentGroup ? 'group' as const : currentBot ? 'bot' as const : 'user' as const
  const participantNames = Object.fromEntries(snapshot.participants.map(({ id, name }) => [id, name]))
  const participants = Object.fromEntries(snapshot.participants.map(({ id, name, avatar, kind }) => [id, {
    name,
    avatar,
    isBot: kind === 'bot',
  }]))
  const currentConversationMessageIds = new Set(currentConversation
    ? readConversationMessageIds(snapshot, currentConversation.id)
    : [])
  const messages = snapshot.messages.filter(({ id }) => currentConversationMessageIds.has(id))
  const replyMessages = Object.fromEntries(messages.flatMap(({ replyToMessageId }) => {
    if (!replyToMessageId) return []
    const reply = snapshot.messages.find(({ id }) => id === replyToMessageId)
    return reply ? [[reply.id, reply]] : []
  }))
  const friendMenuStates = currentOperatorId
    ? Object.fromEntries(snapshot.participants.map(({ id }) => [id, {
      isFriend: snapshot.friendships.some(({ participantIds }) => participantIds.includes(currentOperatorId) && participantIds.includes(id)),
      pendingOutgoing: snapshot.requests.some(({ type, requesterId, targetId }) => type === 'friend' && requesterId === currentOperatorId && targetId === id),
      pendingIncoming: snapshot.requests.some(({ type, requesterId, targetId }) => type === 'friend' && requesterId === id && targetId === currentOperatorId),
    }]))
    : {}
  const conversations = visibleConversations.map((conversation) => {
    const group = conversation.type === 'group' ? snapshot.groups.find(({ id }) => id === conversation.groupId) : undefined
    const peerId = getConversationPeerId(conversation, currentOperatorId)
    const peer = snapshot.participants.find(({ id }) => id === peerId)
    const latestMessageId = readConversationMessageIds(snapshot, conversation.id).at(-1)
    const latestMessage = snapshot.messages.find(({ id }) => id === latestMessageId)
    return {
      id: conversation.id,
      groupId: group?.id,
      title: group?.name ?? peer?.name ?? conversation.id,
      avatar: group?.avatar ?? peer?.avatar,
      avatarKind: group ? 'group' as const : peer?.kind === 'bot' ? 'bot' as const : 'user' as const,
      preview: latestMessage ? describeMessage(latestMessage, participantNames, snapshot) : '开始一段新对话',
      time: latestMessage?.createdAt
        ? new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date(latestMessage.createdAt))
        : '',
      actorRole: group?.members.find(({ participantId }) => participantId === currentOperatorId)?.role,
      entityTarget: group
        ? { type: 'group' as const, id: group.id }
        : { type: peer?.kind === 'bot' ? 'bot' as const : 'user' as const, id: peerId ?? '' },
      entityLabel: group ? '群组' as const : peer?.kind === 'bot' ? '机器人' as const : '用户' as const,
    }
  })
  const recentTargets: WebqqForwardTargetOption[] = conversations.map((conversation) => ({
    conversationId: conversation.id,
    title: conversation.title,
    subtitle: conversation.preview,
    avatar: conversation.avatar,
    avatarKind: conversation.avatarKind,
  }))
  const forwardTargets: WebqqForwardTargetModel = {
    recent: recentTargets,
    friends: getFriendDirectory(snapshot, currentOperatorId).filter(({ isFriend, conversationId }) => isFriend && conversationId).map((entry) => ({
      conversationId: entry.conversationId!,
      title: entry.displayName,
      subtitle: entry.status,
      avatar: entry.avatar,
      avatarKind: entry.isBot ? 'bot' as const : 'user' as const,
    })),
    groups: getGroupDirectory(snapshot, currentOperatorId).filter(({ member, conversationId }) => member && conversationId).map((group) => ({
      conversationId: group.conversationId!,
      title: group.name,
      subtitle: `群聊 ${group.id} · ${group.members.length} 人`,
      avatar: group.avatar,
      avatarKind: 'group' as const,
    })),
  }

  return {
    sidebar: {
      appearance,
      currentView: 'messages',
      activeConversationId,
      currentGroupId: currentGroup?.id,
      currentGroupMemberIds: currentGroup?.members.map(({ participantId }) => participantId) ?? [],
      currentOperator: currentOperator ? { id: currentOperator.id, name: currentOperator.name } : undefined,
      bots: bots.map(({ id, name }) => ({ id, name })),
      conversations,
      friends: getFriendDirectory(snapshot, currentOperatorId),
      groups: getGroupDirectory(snapshot, currentOperatorId),
      notificationRequests: getIncomingNotificationRequests(snapshot, currentOperatorId),
      participants,
      groupNames: Object.fromEntries(snapshot.groups.map(({ id, name }) => [id, name])),
    },
    chatPane: {
      conversationId: currentConversation?.id,
      title,
      subtitle,
      avatar,
      avatarKind,
      profileParticipantId: currentGroup ? undefined : currentPeer?.id,
      profileGroupId: currentGroup?.id,
      detailsVisible: true,
      participantNames,
      messageList: {
        messages,
        chatLunaStates: [],
        replyMessages,
        forwardPreviews: buildForwardPreviewMap(messages, (snapshot.forwards ?? []) as SandboxForward[]),
        participants,
        friendMenuStates,
        currentConversation,
        currentGroup,
        currentOperatorId,
        title,
        avatar,
        avatarKind,
        hasMoreMessages: !!currentConversation?.hasMoreMessages,
        mediaSources: {},
        mediaLoadFailures: {},
        markRecalledMessages: appearance.sandboxMarkRecalledMessages,
      },
      composer: {
        senders: snapshot.participants.map((participant) => ({
          id: participant.id,
          name: participant.name,
          avatar: participant.avatar,
          type: participant.kind,
        })),
        currentOperatorId,
        conversationId: currentConversation?.id,
        mentionCandidates: currentGroup?.members.flatMap((member) => {
          const participant = snapshot.participants.find(({ id }) => id === member.participantId)
          if (!participant) return []
          return [{ id: participant.id, name: member.card?.trim() || participant.name, avatar: participant.avatar, kind: participant.kind }]
        }) ?? [],
        accentColor: appearance.sandboxAccentColor,
        colorMode,
      },
      forwardTargets,
    },
    detailsPanel: {
      view: currentGroup ? 'group' : 'private',
      conversationId: currentConversation?.id,
      revision: snapshot.revision,
      counts: { users: users.length, bots: bots.length, groups: snapshot.groups.length, requests: snapshot.requests.length },
      group: currentGroup,
      bot: currentBot,
      privateParticipant: currentPeer ? {
        id: currentPeer.id,
        name: currentPeer.name,
        avatar: currentPeer.avatar,
        isBot: currentPeer.kind === 'bot',
        personalNote: currentPeer.profile?.personalNote,
      } : undefined,
      currentOperatorName: currentOperator?.name,
      currentOperatorId,
      persistence: { mode: 'memory', available: true, persisted: false },
      participants,
    },
  }
}

function describeMessage(message: SandboxSnapshot['messages'][number], participantNames: Record<string, string>, snapshot: SandboxSnapshot) {
  if (!isRecalledMessage(message)) return formatMentionContent(message.content, participantNames)
  const operatorId = message.lifecycle.operatorId
  const operator = snapshot.participants.find(({ id }) => id === operatorId)
  return formatRecalledMessageEventText(message, operator?.name ?? operatorId)
}
