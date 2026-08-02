// 账号资料、好友备注、群成员资料和机器人运行资料保持独立类型，避免把备注/群名片误当成全局资料。
export type SandboxAccountSex = 'male' | 'female' | 'unknown'

export interface SandboxAccountProfile {
  personalNote?: string
  sex?: SandboxAccountSex
  age?: number
  qid?: string
  level?: number
  loginDays?: number
  regTime?: number
  city?: string
  country?: string
  birthdayYear?: number
  birthdayMonth?: number
  birthdayDay?: number
  labels?: string[]
  isVip?: boolean
  isYearsVip?: boolean
  vipLevel?: number
}

interface SandboxParticipantBase {
  id: string
  name: string
  avatar?: string
  // 全局账号资料；好友备注和群成员资料不在这里。
  profile?: SandboxAccountProfile
}

export type SandboxEntitySource =
  | { type: 'main', name: string }
  | { type: 'test-space', spaceId: string, name: string }

export interface SandboxUser extends SandboxParticipantBase {
  kind: 'user'
}

export type CreateSandboxUserInput = Omit<SandboxUser, 'kind'>

export type UpdateSandboxUserInput = CreateSandboxUserInput

export interface DeleteSandboxUserInput {
  id: string
}

export type SandboxImplementationProfile = 'napcat' | 'llbot'

// 机器人运行资料：实现配置、启用状态和能力覆盖，独立于账号资料。
export interface SandboxBotRuntimeProfile {
  implementation: SandboxImplementationProfile
  enabled: boolean
  disabledCapabilities?: string[]
}

export interface SandboxBotProfile extends SandboxParticipantBase, SandboxBotRuntimeProfile {
  kind: 'bot'
}

export type CreateSandboxBotInput = Omit<SandboxBotProfile, 'kind'>

export type UpdateSandboxBotInput = CreateSandboxBotInput

export type SandboxDirectoryBot = SandboxBotProfile & { source: SandboxEntitySource }

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
  // 专属头衔由群主授予，与群名片相互独立，同一参与者在不同群组各自持有。
  title?: string
  // 禁言到期时间；仅在未到期时表示成员处于禁言状态，过期条目由读取方按当前时间判断。
  mutedUntil?: string
  // 以下字段属于群成员资料，不回写到账号全局资料。
  area?: string
  joinTime?: number
  lastSentTime?: number
  level?: string
  unfriendly?: boolean
  titleExpireTime?: number
  cardChangeable?: boolean
}

// 禁言状态按到期时间保存，读取方统一在此判断是否仍然生效，避免各处重复比较时间。
export function isSandboxGroupMemberMuted(member: Pick<SandboxGroupMember, 'mutedUntil'>, now = Date.now()): boolean {
  return !!member.mutedUntil && new Date(member.mutedUntil).getTime() > now
}

export interface SandboxGroupAnnouncement {  id: string
  authorId: string
  content: string
  createdAt: string
}

export interface SandboxGroup {
  id: string
  name: string
  avatar?: string
  members: SandboxGroupMember[]
  announcements: SandboxGroupAnnouncement[]
}

export interface CreateSandboxGroupInput {
  id: string
  name: string
  avatar?: string
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

export interface SandboxMessageChatLuna {
  thought: string
  thoughtDurationMs?: number
  usage?: SandboxChatLunaTokenUsage
}

export interface SandboxMessageReaction {
  emojiId: string
  participantIds: string[]
}

// 可见消息不携带 lifecycle；一旦进入撤回状态，撤回者与时间必须作为完整事实同时存在。
export interface SandboxRecalledMessageLifecycle {
  status: 'recalled'
  operatorId: string
  recalledAt: string
}

interface SandboxMessageBase {
  id: string
  authorId: string
  conversationId: string
  content: string
  createdAt: string
  replyToMessageId?: string
  broadcastId?: string
  media?: SandboxMedia[]
  // 表情回应按 emoji 聚合参与者，与真实 QQ 一致：同一人对同一 emoji 只计一次。
  reactions?: SandboxMessageReaction[]
  // 本轮 ChatLuna 思考内容随消息一起落场景快照，多轮对话后仍能查看历史思考。
  chatLuna?: SandboxMessageChatLuna
  // 仅用于戳一戳等消息事件；撤回不再占用 event，改用 lifecycle。
  event?: {
    type: 'poke'
    targetId: string
  }
}

// 撤回是消息生命周期状态，不是新的系统消息；权威场景始终保留原文与附属事实。
export type SandboxMessage = SandboxMessageBase & (
  | { lifecycle?: undefined }
  | { lifecycle: SandboxRecalledMessageLifecycle }
)

export function isRecalledMessage(
  message: SandboxMessage | undefined | null,
): message is SandboxMessage & { lifecycle: SandboxRecalledMessageLifecycle } {
  return message?.lifecycle?.status === 'recalled'
}

export function formatRecalledMessageEventText(
  message: SandboxMessage & { lifecycle: SandboxRecalledMessageLifecycle },
  operatorName: string,
): string {
  return `${operatorName || message.lifecycle.operatorId} 撤回了一条消息`
}

export interface SandboxBotDelivery {
  id: string
  recipientBotId: string
  messageId: string
  conversationId: string
  createdAt: string
}

export interface SandboxChatLunaTokenUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

export interface SandboxChatLunaState {
  botParticipantId: string
  conversationId: string
  thinking: boolean
  usage?: SandboxChatLunaTokenUsage
  updatedAt: string
}

export type SandboxPersistenceMode = 'memory' | 'database'

export interface SandboxPersistenceStatus {
  mode: SandboxPersistenceMode
  available: boolean
  persisted: boolean
  message?: string
}

export type SandboxOneBotDebugDirection = 'action' | 'event'
export type SandboxOneBotDebugStatus = 'success' | 'error'

export interface SandboxOneBotDebugError {
  code: string
  message: string
  retryable: boolean
  traceId: string
}

export interface SandboxOneBotDebugRecord {
  id: string
  /** 空间内单调递增、回收后也不复用的序号。 */
  sequence: number
  createdAt: string
  botId: string
  implementation: SandboxImplementationProfile
  direction: SandboxOneBotDebugDirection
  /** 插件实际请求的 action 名；事件方向则为原始事件类型。 */
  requestedAction: string
  /** 能力矩阵中的规范 action；事件方向与 requestedAction 相同。 */
  action: string
  /** 仅当 requestedAction 通过矩阵别名命中时存在。 */
  matchedAlias?: string
  status: SandboxOneBotDebugStatus
  durationMs: number
  payload?: unknown
  result?: unknown
  entities: {
    userId?: string
    groupId?: string
    conversationId?: string
    messageId?: string
  }
  error?: SandboxOneBotDebugError
}

export type SandboxConsoleOneBotDebugRecord = SandboxOneBotDebugRecord & { source: SandboxEntitySource }

export interface GetSandboxOneBotDebugRecordsInput {
  botId?: string
  direction?: SandboxOneBotDebugDirection
  /** 匹配规范 action，并自动覆盖能力矩阵声明的全部别名。 */
  action?: string
  /** 仅精确匹配插件实际请求名。 */
  requestedAction?: string
  errorsOnly?: boolean
  /** 每页条数，默认 50，最大 200。 */
  limit?: number
  /** 新到旧分页：仅返回 sequence 严格小于该值的记录。 */
  beforeSequence?: number
}

export interface SandboxOneBotDebugRecordsPage<T extends SandboxOneBotDebugRecord = SandboxOneBotDebugRecord> {
  records: T[]
  hasMore: boolean
  /** 下一页应传入的 beforeSequence。 */
  nextCursor?: number
  /** 当前仍保留的最早 sequence；游标过期恢复时可用。 */
  earliestCursor?: number
}

export interface ClearSandboxOneBotDebugRecordsResult {
  cleared: number
}

export class SandboxOneBotDebugCursorExpiredError extends Error {
  readonly code = 'cursor_expired' as const

  constructor(
    message: string,
    readonly earliestCursor?: number,
  ) {
    super(message)
    this.name = 'SandboxOneBotDebugCursorExpiredError'
  }
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
  | { action: 'set-title'; groupId: string; targetId: string; title: string }
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
  webQQTimBubbleTail: boolean
  webQQColorMode: 'auto' | 'light' | 'dark'
  webQQAccentColor: string
  // 只控制 WebQQ 呈现；关闭时隐藏原气泡并显示撤回事件，底层数据仍保留。
  webQQMarkRecalledMessages: boolean
}

export interface SandboxWorkspaceState {
  snapshot: SandboxSnapshot
  chatLunaStates: SandboxChatLunaState[]
  appearance: SandboxAppearance
  persistence: SandboxPersistenceStatus
}

export interface GetSandboxWorkspaceInput {
  operatorId?: string
  messageLimit?: number
}

export interface GetSandboxBotDeliveriesInput {
  recipientBotId?: string
  messageId?: string
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

export interface RecallMessageInput {
  operatorId: string
  conversationId?: string
  messageId: string
}

export interface SetMessageReactionInput {
  operatorId: string
  messageId: string
  emojiId: string
  enabled: boolean
}

export interface SendMediaFileInput {
  fileName: string
  mimeType: string
  dataBase64: string
}

export interface SendMediaMessageInput {
  operatorId: string
  conversationId: string
  media: SendMediaFileInput[]
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
