export interface SandboxUser {
  id: string
  name: string
}

export interface SandboxBotProfile {
  id: string
  name: string
}

export type SandboxGroupRole = 'owner' | 'admin' | 'member'

export interface SandboxGroupMember {
  participantId: string
  card?: string
  role: SandboxGroupRole
}

export interface SandboxGroupAnnouncement {
  id: string
  authorId: string
  content: string
  createdAt: string
}

export interface SandboxGroup {
  id: string
  name: string
  members: SandboxGroupMember[]
  announcements: SandboxGroupAnnouncement[]
}

export interface SandboxConversation {
  id: string
  type: 'direct' | 'group'
  userId: string
  botId: string
  groupId?: string
  messageIds: string[]
}

export interface SandboxMessage {
  id: string
  authorId: string
  conversationId: string
  content: string
  createdAt: string
}

export interface SandboxSnapshot {
  revision: number
  users: SandboxUser[]
  bots: SandboxBotProfile[]
  groups: SandboxGroup[]
  conversations: SandboxConversation[]
  messages: SandboxMessage[]
}

export interface SandboxAppearance {
  enableWebQQFrostedGlass: boolean
  webQQChatStyle: 'tim' | 'qq'
  webQQTimBubbleTail: boolean
  webQQColorMode: 'auto' | 'light' | 'dark'
  webQQAccentColor: string
}

export interface SandboxWorkspaceState {
  snapshot: SandboxSnapshot
  appearance: SandboxAppearance
}

export interface SendMessageInput {
  actorUserId: string
  botId: string
  conversationId: string
  content: string
}

export interface SendMessageResult {
  messageId: string
  revision: number
}

export interface SetGroupAnnouncementInput {
  actorUserId: string
  groupId: string
  content: string
}

export interface DeleteGroupAnnouncementInput {
  actorUserId: string
  groupId: string
  announcementId: string
}
