interface SandboxParticipantBase {
  id: string
  name: string
  avatar?: string
}

export interface SandboxUser extends SandboxParticipantBase {
  kind: 'user'
}

export type CreateSandboxUserInput = Omit<SandboxUser, 'kind'>

export type UpdateSandboxUserInput = CreateSandboxUserInput

export interface DeleteSandboxUserInput {
  id: string
}

export type SandboxImplementationProfile = 'napcat' | 'llbot'

export interface SandboxBotProfile {
  kind: 'bot'
  id: string
  name: string
  avatar?: string
  implementation: SandboxImplementationProfile
  enabled: boolean
}

export type CreateSandboxBotInput = Omit<SandboxBotProfile, 'kind'>

export type UpdateSandboxBotInput = CreateSandboxBotInput

export type SandboxParticipant = SandboxUser | SandboxBotProfile

export function isSandboxUser(participant: SandboxParticipant): participant is SandboxUser {
  return participant.kind === 'user'
}

export function isSandboxBot(participant: SandboxParticipant): participant is SandboxBotProfile {
  return participant.kind === 'bot'
}

export function getSandboxUsers(snapshot: Pick<SandboxSnapshot, 'participants'>): SandboxUser[] {
  return snapshot.participants.filter(isSandboxUser)
}

export function getSandboxBots(snapshot: Pick<SandboxSnapshot, 'participants'>): SandboxBotProfile[] {
  return snapshot.participants.filter(isSandboxBot)
}

export interface DeleteSandboxBotInput {
  id: string
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

export interface CreateSandboxGroupInput {
  id: string
  name: string
  members: SandboxGroupMember[]
}

export interface UpdateSandboxGroupInput extends CreateSandboxGroupInput {}

export interface DeleteSandboxGroupInput {
  id: string
}

export type ManageSandboxEnvironmentInput =
  | { action: 'create-user', data: CreateSandboxUserInput }
  | { action: 'update-user', data: UpdateSandboxUserInput }
  | { action: 'delete-user', data: DeleteSandboxUserInput }
  | { action: 'create-bot', data: CreateSandboxBotInput }
  | { action: 'update-bot', data: UpdateSandboxBotInput }
  | { action: 'delete-bot', data: DeleteSandboxBotInput }
  | { action: 'create-group', data: CreateSandboxGroupInput }
  | { action: 'update-group', data: UpdateSandboxGroupInput }
  | { action: 'delete-group', data: DeleteSandboxGroupInput }

export interface SandboxDirectConversation {
  id: string
  type: 'direct'
  participantIds: readonly [string, string]
  groupId?: never
  messageIds: string[]
  hasMoreMessages?: boolean
}

export interface SandboxGroupConversation {
  id: string
  type: 'group'
  groupId: string
  participantIds?: never
  messageIds: string[]
  hasMoreMessages?: boolean
}

export type SandboxConversation = SandboxDirectConversation | SandboxGroupConversation

export function createDirectConversationId(firstId: string, secondId: string): string {
  const [left, right] = [firstId, secondId].sort()
  return `private:${left}:${right}`
}

export function createGroupConversationId(groupId: string): string {
  return `group:${groupId}`
}

export function getDirectConversationPeerId(conversation: SandboxDirectConversation, participantId: string): string {
  const peerId = conversation.participantIds.find((id) => id !== participantId)
  if (!peerId) throw new Error(`参与者不在当前私聊中：${participantId}`)
  return peerId
}

export interface SandboxMessage {
  id: string
  authorId: string
  conversationId: string
  content: string
  createdAt: string
  replyToMessageId?: string
  broadcastId?: string
  media?: SandboxMedia[]
  event?: {
    type: 'poke'
    targetId: string
  }
}

export interface SandboxBotDelivery {
  id: string
  recipientBotId: string
  messageId: string
  conversationId: string
  createdAt: string
}

export type SandboxMediaType = 'image' | 'file' | 'audio' | 'video'

export interface SandboxMedia {
  id: string
  type: SandboxMediaType
  name: string
  mimeType: string
  size: number
  reference: string
}

export interface SandboxRelationshipRequest {
  id: string
  type: 'friend' | 'group'
  subType?: 'add' | 'invite'
  requesterId: string
  targetId?: string
  groupId?: string
  status: 'pending'
  createdAt: string
  comment?: string
}

export interface SandboxFriendship {
  id: string
  participantIds: [string, string]
  remarks: Record<string, string>
  createdAt: string
}

export interface SandboxSnapshot {
  revision: number
  participants: SandboxParticipant[]
  groups: SandboxGroup[]
  conversations: SandboxConversation[]
  messages: SandboxMessage[]
  friendships: SandboxFriendship[]
  requests: SandboxRelationshipRequest[]
}

export type SandboxFriendAction =
  | { action: 'request'; targetId: string; comment?: string }
  | { action: 'handle-request'; requestId: string; approve: boolean }
  | { action: 'delete'; targetId: string }
  | { action: 'set-remark'; targetId: string; remark: string }
  | { action: 'poke'; targetId: string; conversationId?: string }

export type PerformFriendActionInput = SandboxFriendAction extends infer Action
  ? Action extends SandboxFriendAction ? Action & { operatorId: string } : never
  : never

export interface PerformFriendActionResult {
  revision: number
  requestId?: string
}

export type SandboxGroupAction =
  | { action: 'request-join'; groupId: string; comment?: string }
  | { action: 'invite'; groupId: string; targetId: string; comment?: string }
  | { action: 'handle-request'; requestId: string; approve: boolean }
  | { action: 'leave'; groupId: string }
  | { action: 'kick'; groupId: string; targetId: string }
  | { action: 'set-admin'; groupId: string; targetId: string; enabled: boolean }
  | { action: 'transfer-owner'; groupId: string; targetId: string }
  | { action: 'set-card'; groupId: string; targetId: string; card: string }
  | { action: 'set-name'; groupId: string; name: string }
  | { action: 'poke'; groupId: string; targetId: string; conversationId?: string }

export type PerformGroupActionInput = SandboxGroupAction extends infer Action
  ? Action extends SandboxGroupAction ? Action & { operatorId: string } : never
  : never

export interface PerformGroupActionResult {
  revision: number
  requestId?: string
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

export interface GetSandboxWorkspaceInput {
  operatorId?: string
  messageLimit?: number
}

export interface GetMessageHistoryInput {
  operatorId: string
  conversationId: string
  beforeMessageId?: string
  limit?: number
}

export interface SandboxMessageHistory {
  messages: SandboxMessage[]
  nextBeforeMessageId?: string
}

export interface SendMessageInput {
  operatorId: string
  conversationId: string
  content: string
  replyToMessageId?: string
}

export interface SendMessageResult {
  messageId: string
  revision: number
}

export interface SendMediaMessageInput {
  operatorId: string
  conversationId: string
  fileName: string
  mimeType: string
  dataBase64: string
  content?: string
  replyToMessageId?: string
}

export interface GetMediaContentInput {
  operatorId: string
  mediaId: string
}

export interface SandboxMediaContent extends SandboxMedia {
  dataBase64: string
}

export interface SetGroupAnnouncementInput {
  operatorId: string
  groupId: string
  content: string
}

export interface DeleteGroupAnnouncementInput {
  operatorId: string
  groupId: string
  announcementId: string
}
