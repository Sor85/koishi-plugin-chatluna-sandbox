import type { SandboxEvidenceCompositionKind, SandboxEvidenceKind } from './evidence-kind'

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

/**
 * 会话实例：根会话下的一条独立对话线，拥有自己的消息与标题。
 *
 * 只保存所属根会话 ID；参与者对与群号一律从根会话读，因此关系变更不需要同步两处。
 * 可见性完全继承根会话，不引入创建者或所有权维度。会话实例不出现在根会话集合里，
 * 既有「遍历根会话」的实现因此默认只看到根会话。
 */
export interface SandboxConversationInstance {
  id: string
  rootConversationId: string
  title: string
  messageIds: string[]
  hasMoreMessages?: boolean
}

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

export interface SandboxMessageModelRequestReference {
  scopeId: string
  recordId: string
}

export interface SandboxMessageChatLuna {
  thought: string
  thoughtDurationMs?: number
  usage?: SandboxChatLunaTokenUsage
  modelRequests?: SandboxMessageModelRequestReference[]
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

// 合并转发节点保存作者快照与正文/媒体；删除参与者或改名不影响历史 node。
export interface SandboxForwardNode {
  userId: string
  nickname: string
  content: string
  createdAt: string
  media?: SandboxMedia[]
  // 引用节点可保留来源消息 ID，便于调试与测试断言。
  sourceMessageId?: string
  // 节点本身是嵌套合并转发时，只保存转发资源 ID，详情再按资源读取。
  forwardId?: string
}

// 合并转发是独立资源：外层消息只挂 forwardId，完整 node 列表通过资源读取。
export interface SandboxForward {
  id: string
  authorId: string
  createdAt: string
  nodes: SandboxForwardNode[]
}

// OneBot 自定义节点与领域 builder 共用同一输入形状。
export type SandboxForwardNodeInput =
  | {
    type: 'reference'
    messageId: string
  }
  | {
    type: 'custom'
    userId: string
    nickname: string
    content: string
    createdAt?: string
    media?: SandboxMedia[]
    forwardId?: string
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
  // 外层消息只挂资源 ID；完整 node 列表保存在场景 forwards 集合中。
  forwardId?: string
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
  /** 按创建时间正序或倒序，默认倒序。 */
  order?: 'asc' | 'desc'
  /** 每页条数，默认 50，最大 200。 */
  limit?: number
  /** 分页游标：倒序仅返回 sequence 更小的记录，正序仅返回 sequence 更大的记录。 */
  beforeSequence?: number
}

export interface SandboxOneBotDebugLargeValueSummary {
  kind: 'large-value'
  encoding: 'base64' | 'data-url'
  mimeType?: string
  charCount: number
  byteLength: number
  sha256: string
}

export interface SandboxOneBotDebugCapacity {
  recordCount: number
  totalBytes: number
  maxRecords: number
  maxBytes: number
}

export interface SandboxOneBotDebugRecordsPage<T extends SandboxOneBotDebugRecord = SandboxOneBotDebugRecord> {
  records: T[]
  hasMore: boolean
  /** 下一页应传入的 beforeSequence。 */
  nextCursor?: number
  /** 当前仍保留的最早 sequence；游标过期恢复时可用。 */
  earliestCursor?: number
  capacity: SandboxOneBotDebugCapacity
}

export interface GetSandboxOneBotDebugRecordInput {
  recordId: string
  /** 仅单条详情允许展开大型值；列表接口不得接受此参数。 */
  includeLargeValues?: boolean
}

export interface ClearSandboxOneBotDebugRecordsResult {
  cleared: number
}

/**
 * 可预期的领域业务拒绝：参数不合法、权限不足、场景一致性校验不通过这类由领域规则主动作出的判定。
 *
 * 它存在的唯一理由是让上层能把「领域说不」与「实现出错」分开：MCP 侧按 ADR-0027 只把未预期异常
 * 降级成 `internal_error` 并把堆栈写进 Logger，而领域拒绝的消息对外部测试控制器有用，必须原样透出。
 * 基础设施故障（数据库不可用）与内部不变量违背不属于此类，应继续抛普通 `Error`。
 */
export class SandboxDomainError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SandboxDomainError'
  }
}

export class SandboxOneBotDebugCursorExpiredError extends SandboxDomainError {
  readonly code = 'cursor_expired' as const

  constructor(
    message: string,
    readonly earliestCursor?: number,
  ) {
    super(message)
    this.name = 'SandboxOneBotDebugCursorExpiredError'
  }
}

export class SandboxModelRequestCursorExpiredError extends SandboxDomainError {
  readonly code = 'cursor_expired' as const

  constructor(
    message: string,
    readonly earliestCursor?: number,
  ) {
    super(message)
    this.name = 'SandboxModelRequestCursorExpiredError'
  }
}

export type SandboxModelRequestStatus = 'pending' | 'success' | 'error'
export type SandboxModelResponseBodyStatus = 'pending' | 'complete' | 'unavailable' | 'error'
export type SandboxModelResponseBodyFormat = 'json' | 'text' | 'sse'
export type SandboxModelRequestAttribution = 'attributed' | 'unattributed'

export interface SandboxModelRequestError {
  code: string
  message: string
  retryable: boolean
  traceId: string
}

export interface SandboxChatLunaRequestError {
  code?: number
  message?: string
  originMessage?: string
  isTimeout?: boolean
}

export interface SandboxModelRequestEntities {
  scopeId?: string
  botId?: string
  conversationId?: string
}

export type SandboxPresetDocumentKind = 'core' | 'character'
export type SandboxPresetTemplateRole = 'system' | 'user' | 'assistant' | 'tool'

export interface SandboxPresetRuntimeTemplate {
  path: readonly (string | number)[]
  role: SandboxPresetTemplateRole
  template: string
}

export interface SandboxPresetRuntimeSnapshot {
  kind: SandboxPresetDocumentKind
  presetName: string
  capturedAt: string
  source?: string
  templates: readonly SandboxPresetRuntimeTemplate[]
}

export interface SandboxPresetRuntimeSnapshotSummary {
  kind: SandboxPresetDocumentKind
  presetName: string
  capturedAt: string
  templateCount: number
}

export type SandboxModelRequestVariableStatus =
  | 'observed'
  | 'stale'
  | 'not-observed'
  | 'ambiguous'
  | 'unsupported'

export interface SandboxModelRequestVariable {
  id: string
  name: string
  presetKind: SandboxPresetDocumentKind
  presetName: string
  path: readonly (string | number)[]
  occurrence: number
  status: SandboxModelRequestVariableStatus
  value?: string
  evidenceId?: string
  range?: { start: number, end: number }
}

/**
 * 一条模型请求记录被共享模型证据投影读出的计数。
 *
 * 两个字段都是投影派生事实，与模型请求对话视图、模型请求轨迹使用完全相同的消息边界和工具展平规则。
 * 原始请求体的字段数与模型名称不属于这里：它们不是协议事实，见 SandboxModelRequestDetail。
 */
export interface SandboxModelEvidenceCounts {
  requestMessageCount: number
  toolDefinitionCount: number
}

export interface SandboxModelRequestUsage {
  inputTokens?: number
  outputTokens?: number
  reasoningTokens?: number
  cachedTokens?: number
  totalTokens?: number
  ttftMs?: number
  totalMs?: number
  tps?: number
  estimated?: boolean
  source: 'chatluna-usage' | 'response'
}

export interface SandboxModelRequestRecord {
  id: string
  sequence: number
  createdAt: string
  status: SandboxModelRequestStatus
  durationMs: number
  method?: string
  url?: string
  provider?: string
  model?: string
  headers?: Record<string, string>
  attribution: SandboxModelRequestAttribution
  entities: SandboxModelRequestEntities
  requestBodyAvailable: boolean
  requestBody?: unknown
  responseBodyStatus: SandboxModelResponseBodyStatus
  responseBodyFormat?: SandboxModelResponseBodyFormat
  responseStatus?: number
  responseBodyRaw?: string
  responseBodyError?: string
  interactionId?: string
  chatlunaRequestId?: string
  presetSnapshots?: readonly SandboxPresetRuntimeSnapshot[]
  usage?: SandboxModelRequestUsage
  error?: SandboxModelRequestError
  chatlunaError?: SandboxChatLunaRequestError
}

export type SandboxModelRequestListItem = Omit<SandboxModelRequestRecord, 'requestBody' | 'responseBodyRaw' | 'presetSnapshots'> & {
  presetSnapshotSummaries?: readonly SandboxPresetRuntimeSnapshotSummary[]
}
export type SandboxModelRequestDetail = SandboxModelRequestRecord & {
  /** 原始请求体的顶层键数量。这是原始 JSON 事实而不是投影产物；请求体未采集或不是对象时缺省。 */
  requestBodyKeyCount?: number
  /** 共享模型证据投影派生的计数。请求体未采集时缺省，采集到但不是对象时两项均为 0。 */
  evidenceCounts?: SandboxModelEvidenceCounts
  variables: readonly SandboxModelRequestVariable[]
}

export interface GetSandboxModelRequestRecordsInput {
  botId?: string
  conversationId?: string
  interactionId?: string
  model?: string
  errorsOnly?: boolean
  order?: 'asc' | 'desc'
  limit?: number
  beforeSequence?: number
  beforeCreatedAt?: string
  beforeId?: string
}

export interface SandboxModelRequestCapacity {
  recordCount: number
  totalBytes: number
  maxRecords: number
  maxBytes: number
}

export interface SandboxModelRequestRecordsPage<T extends SandboxModelRequestListItem = SandboxModelRequestListItem> {
  records: T[]
  hasMore: boolean
  nextCursor?: number
  nextCreatedAt?: string
  nextId?: string
  earliestCursor?: number
  capacity: SandboxModelRequestCapacity
}

/**
 * 轨迹账本的行种类：一维基础证据种类，外加视图特有的请求边界行。
 *
 * 请求边界不是证据，而是「一次模型请求从这里开始」的结构标记；
 * 隐藏全部证据种类后仍要能看出有哪些请求，因此它不并入基础证据种类。
 */
export type SandboxModelRequestTrajectoryKind = SandboxEvidenceKind | 'request'

export interface SandboxModelRequestTrajectoryRow {
  id: string
  index: number
  kind: SandboxModelRequestTrajectoryKind
  preview: string
  /** 模型证据投影身份。请求边界行没有对应的原始模型证据，因此不带此字段。 */
  evidenceId?: string
  callId?: string
  toolName?: string
  variableId?: string
  variableName?: string
  variablePresetName?: string
  variableStatus?: SandboxModelRequestVariableStatus
  variableValue?: string
  source?: 'request' | 'response'
  durationMs?: number
  startedAt?: string
  requestId?: string
  status?: SandboxModelRequestStatus
}

/** 请求组成项的种类：基础证据种类的子集加工具交互聚合，聚合成员由证据种类 module 声明。 */
export type SandboxModelRequestPromptKind = SandboxEvidenceCompositionKind

export interface SandboxModelRequestPromptCompositionItem {
  kind: SandboxModelRequestPromptKind
  /** 点击组成分段时定位的轨迹行身份；变量片段使用变量证据身份。 */
  evidenceId: string
  characters: number
  variableId?: string
  variableName?: string
  requestId?: string
}

export interface SandboxModelRequestTrajectory {
  mode: 'request' | 'conversation'
  conversationId?: string
  records: readonly SandboxModelRequestListItem[]
  rows: readonly SandboxModelRequestTrajectoryRow[]
  promptComposition: readonly SandboxModelRequestPromptCompositionItem[]
  complete: boolean
}

export interface GetSandboxModelRequestRecordInput { recordId: string }
export interface ClearSandboxModelRequestRecordsResult { cleared: number }

export type SandboxModelRequestSource =
  | { type: 'main', name: string }
  | { type: 'test-space', spaceId: string, name: string }
  | { type: 'unattributed', name: string }

export type SandboxConsoleModelRequestListItem = SandboxModelRequestListItem & { source: SandboxModelRequestSource }
export type SandboxConsoleModelRequestDetail = SandboxModelRequestDetail & { source: SandboxModelRequestSource }

export type SandboxModelRequestScope =
  | { scope: 'all', spaceId?: never, unattributed?: false }
  | { scope: 'main', spaceId?: never, unattributed?: false }
  | { scope: 'space', spaceId: string, unattributed?: false }
  | { scope: 'unattributed', spaceId?: never, unattributed?: true }

export type ListSandboxModelRequestRecordsInput = SandboxModelRequestScope & GetSandboxModelRequestRecordsInput
export type ReadSandboxModelRequestRecordInput = SandboxModelRequestScope & GetSandboxModelRequestRecordInput
export type ReadSandboxModelRequestTrajectoryInput = SandboxModelRequestScope & {
  recordId: string
  mode: 'request' | 'conversation'
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
  // 会话实例是独立集合：既有「遍历根会话」的实现因此默认只看到根会话，需要全部会话的
  // 少数路径（消息搜索、保留窗口裁剪、场景导出）经会话解析模块显式合并两个集合。
  // 读取路径统一把缺失值规范成 []，以便旧测试夹具与未改动的客户端空快照继续通过类型检查。
  conversationInstances?: SandboxConversationInstance[]
  messages: SandboxMessage[]
  // 合并转发资源与消息解耦；重启后仍可按 forwardId 展开完整 node。
  // 读取路径统一把缺失值规范成 []，以便旧测试夹具与未改动的客户端空快照继续通过类型检查。
  forwards?: SandboxForward[]
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
  enableSandboxFrostedGlass: boolean
  sandboxTimBubbleTail: boolean
  sandboxColorMode: 'auto' | 'light' | 'dark'
  sandboxAccentColor: string
  // 只控制 WebQQ 呈现；关闭时隐藏原气泡并显示撤回事件，底层数据仍保留。
  sandboxMarkRecalledMessages: boolean
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
  // 历史页直接引用的转发资源；嵌套详情仍按 getForwardMessage 按需读取。
  forwards?: SandboxForward[]
  nextBeforeMessageId?: string
}

// 当前会话内按正文和/或创建时间查找：游标语义与 getMessageHistory 一致，命中只返回摘要。
export interface SearchConversationMessagesInput {
  operatorId: string
  conversationId: string
  query: string
  // 成对提供，使用 [createdAtStart, createdAtEnd) 半开区间。
  createdAtStart?: string
  createdAtEnd?: string
  beforeMessageId?: string
  limit?: number
}

export interface SandboxMessageSearchHit {
  messageId: string
  authorId: string
  createdAt: string
  // 命中摘要使用消息 content 原文；撤回消息仍可搜到底层正文。
  summary: string
}

export interface SandboxMessageSearchResult {
  // 由新到旧排列，便于搜索面板直接渲染。
  hits: SandboxMessageSearchHit[]
  nextBeforeMessageId?: string
}

// WebQQ 消息列表外层卡片用的轻量预览，不替代完整 SandboxForward 资源。
export interface SandboxForwardPreview {
  title: string
  total: number
  lines: string[]
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

export interface CreateConversationInstanceInput {
  operatorId: string
  /** 所属会话；传入会话实例时归一化到它的根会话，不产生第三层。 */
  rootConversationId: string
  title?: string
}

export interface BranchConversationInstanceInput {
  operatorId: string
  /** 分叉来源会话，可以是根会话也可以是会话实例。 */
  conversationId: string
  /** 分叉点消息；它及其之前的历史会被复制进新实例。 */
  messageId: string
  title?: string
}

/** 会话实例变更返回完整工作区状态外加新会话 ID，客户端一次请求完成状态替换与选中。 */
export interface SandboxConversationInstanceResult extends SandboxWorkspaceState {
  conversationId: string
}

export interface RenameConversationInstanceInput {
  operatorId: string
  conversationId: string
  title: string
}

export interface DeleteConversationInstanceInput {
  operatorId: string
  conversationId: string
}

export interface SendForwardMessageInput {
  operatorId: string
  conversationId: string
  // WebQQ 多选：服务端按 createdAt + id 稳定排序后生成引用 node。
  messageIds?: string[]
  // OneBot 或内部 builder：可混合引用节点与自定义节点。
  nodes?: SandboxForwardNodeInput[]
}

export interface SendForwardMessageResult extends SendMessageResult {
  forwardId: string
}

export interface GetForwardMessageInput {
  operatorId: string
  // 标准 get_forward_msg 使用转发资源 ID；兼容 message_id 时由调用方解析外层消息。
  forwardId?: string
  messageId?: string
}

export interface RecallMessageInput {
  operatorId: string
  conversationId?: string
  messageId: string
}

export interface ClearConversationMessagesInput {
  operatorId: string
  conversationId: string
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
