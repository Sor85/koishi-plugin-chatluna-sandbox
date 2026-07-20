export interface SandboxUser {
  id: string
  name: string
}

export interface SandboxBotProfile {
  id: string
  name: string
}

export interface SandboxConversation {
  id: string
  userId: string
  botId: string
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
  conversations: SandboxConversation[]
  messages: SandboxMessage[]
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
