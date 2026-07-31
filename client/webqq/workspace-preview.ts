import type { SandboxConversation, SandboxSnapshot } from '../../src/types'
import { formatMentionContent } from './mention'
import { getConversationPeerId } from './relationship-directory'
import { resolveWorkspaceSelection } from './workspace-state'

export type SandboxPreviewAvatarKind = 'user' | 'bot' | 'group'

export interface SandboxPreviewSession {
  id: string
  title: string
  avatarKind: SandboxPreviewAvatarKind
  avatar?: string
  preview: string
  active: boolean
}

export interface SandboxPreviewMessage {
  id: string
  text: string
  outgoing: boolean
  event: boolean
  authorName: string
  avatarKind: SandboxPreviewAvatarKind
  avatar?: string
}

export interface SandboxWorkspacePreview {
  sessions: SandboxPreviewSession[]
  messages: SandboxPreviewMessage[]
}

export function buildWorkspacePreview(snapshot: SandboxSnapshot, sessionLimit = 8, messageLimit = 6): SandboxWorkspacePreview {
  const { currentOperatorId, activeConversationId } = resolveWorkspaceSelection(snapshot, { currentView: 'messages' })
  const participants = new Map(snapshot.participants.map((participant) => [participant.id, participant]))
  const participantNames = Object.fromEntries(snapshot.participants.map(({ id, name }) => [id, name]))
  const messagesById = new Map(snapshot.messages.map((message) => [message.id, message]))

  const describe = (conversation: SandboxConversation) => {
    if (conversation.type === 'group') {
      const group = snapshot.groups.find(({ id }) => id === conversation.groupId)
      return { title: group?.name ?? conversation.id, avatarKind: 'group' as const, avatar: undefined }
    }
    const peer = participants.get(getConversationPeerId(conversation, currentOperatorId) ?? '')
    return {
      title: peer?.name ?? conversation.id,
      avatarKind: peer?.kind === 'bot' ? 'bot' as const : 'user' as const,
      avatar: peer?.avatar,
    }
  }

  const sessions = snapshot.conversations.slice(0, sessionLimit).map((conversation) => {
    const latest = messagesById.get(conversation.messageIds.at(-1) ?? '')
    return {
      id: conversation.id,
      ...describe(conversation),
      preview: latest ? formatMentionContent(latest.content, participantNames) : '开始一段新对话',
      active: conversation.id === activeConversationId,
    }
  })

  const activeConversation = snapshot.conversations.find(({ id }) => id === activeConversationId)
  const messages = (activeConversation?.messageIds.slice(-messageLimit) ?? []).flatMap((messageId) => {
    const message = messagesById.get(messageId)
    if (!message) return []
    const author = participants.get(message.authorId)
    return [{
      id: message.id,
      text: formatMentionContent(message.content, participantNames),
      outgoing: message.authorId === currentOperatorId,
      event: !!message.event,
      authorName: author?.name ?? message.authorId,
      avatarKind: author?.kind === 'bot' ? 'bot' as const : 'user' as const,
      avatar: author?.avatar,
    }]
  })

  return { sessions, messages }
}
