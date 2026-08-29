import {
  createDirectConversationId,
  createGroupConversationId,
  SandboxDomainError,
  type SandboxConversation,
  type SandboxSnapshot,
} from './types'

/**
 * 会话解析的唯一实现。
 *
 * 「某个会话 ID 指向谁、某个操作者能看到哪些会话、一对参与者或一个群组的会话在哪」在整个
 * 服务端只有这一处答案。调用方一律吃 {@link ResolvedConversation}，不需要知道会话的存储形态。
 *
 * 形态是一组接收沙盒场景的函数而不是持有场景引用的类：场景本身是权威状态，谁持有它就会
 * 长出第二处「当前场景」。解析函数不改场景；变更函数就地改传入的场景并在名字里写明。
 */

/**
 * 解析出的会话。根会话解析到自己（`kind: 'root'`、`rootConversationId === id`）。
 *
 * `messageIds` 直接引用场景里的数组而不是副本：解析在消息历史与搜索这类热路径上按会话调用，
 * 复制会把每次读取变成 O(消息数)。写入必须走本模块的变更函数，类型上因此声明为只读。
 */
export interface ResolvedConversation {
  readonly id: string
  readonly kind: 'root'
  /** 所属根会话 ID。 */
  readonly rootConversationId: string
  readonly type: 'direct' | 'group'
  /** 私聊的稳定参与者对；群聊为 undefined。 */
  readonly participantIds?: readonly [string, string]
  /** 群聊的群号；私聊为 undefined。 */
  readonly groupId?: string
  readonly messageIds: readonly string[]
  /** 消息分页水位：解析自被截断过的快照时为真，权威场景里始终为假。 */
  readonly hasMoreMessages?: boolean
}

function resolveRoot(conversation: SandboxConversation): ResolvedConversation {
  const shared = {
    id: conversation.id,
    kind: 'root' as const,
    rootConversationId: conversation.id,
    messageIds: conversation.messageIds,
    ...(conversation.hasMoreMessages ? { hasMoreMessages: true } : {}),
  }
  return conversation.type === 'direct'
    ? { ...shared, type: 'direct', participantIds: conversation.participantIds }
    : { ...shared, type: 'group', groupId: conversation.groupId }
}

function findRootRow(scene: SandboxSnapshot, conversationId: string): SandboxConversation | undefined {
  return scene.conversations.find(({ id }) => id === conversationId)
}

/** 场景里的全部根会话，按存储顺序。 */
export function listRootConversations(scene: SandboxSnapshot): ResolvedConversation[] {
  return scene.conversations.map(resolveRoot)
}

/** 场景里的全部会话。 */
export function listConversations(scene: SandboxSnapshot): ResolvedConversation[] {
  return listRootConversations(scene)
}

/** 场景里的全部会话 ID。 */
export function listConversationIds(scene: SandboxSnapshot): Set<string> {
  return new Set(listConversations(scene).map(({ id }) => id))
}

export function resolveConversation(scene: SandboxSnapshot, conversationId: string): ResolvedConversation | undefined {
  const root = findRootRow(scene, conversationId)
  return root ? resolveRoot(root) : undefined
}

export function requireConversation(scene: SandboxSnapshot, conversationId: string): ResolvedConversation {
  const conversation = resolveConversation(scene, conversationId)
  if (!conversation) throw new SandboxDomainError(`会话不存在：${conversationId}`)
  return conversation
}

/**
 * 会话是否属于某个参与者：私聊看参与者对，群聊看群成员关系。
 *
 * 与 {@link isConversationVisible} 的区别是不要求好友关系存在——解除好友只撤销会话可见性，
 * 会话与历史消息仍然归属这一对参与者。
 */
export function includesConversationParticipant(
  scene: SandboxSnapshot,
  conversation: ResolvedConversation,
  participantId: string,
): boolean {
  if (conversation.type === 'direct') return !!conversation.participantIds?.includes(participantId)
  return !!scene.groups.find(({ id }) => id === conversation.groupId)
    ?.members.some((member) => member.participantId === participantId)
}

/** 会话对某个操作者是否可见：私聊额外要求好友关系仍然存在。 */
export function isConversationVisible(
  scene: SandboxSnapshot,
  operatorId: string,
  conversation: ResolvedConversation,
): boolean {
  if (!includesConversationParticipant(scene, conversation, operatorId)) return false
  if (conversation.type !== 'direct') return true
  const [firstId, secondId] = conversation.participantIds!
  return scene.friendships.some(({ participantIds }) => participantIds.includes(firstId) && participantIds.includes(secondId))
}

export function findVisibleConversation(
  scene: SandboxSnapshot,
  operatorId: string,
  conversationId: string,
): ResolvedConversation | undefined {
  const conversation = resolveConversation(scene, conversationId)
  return conversation && isConversationVisible(scene, operatorId, conversation) ? conversation : undefined
}

export function requireVisibleConversation(
  scene: SandboxSnapshot,
  operatorId: string,
  conversationId: string,
): ResolvedConversation {
  const conversation = findVisibleConversation(scene, operatorId, conversationId)
  if (!conversation) throw new SandboxDomainError(`会话不存在：${conversationId}`)
  return conversation
}

export function listVisibleConversations(scene: SandboxSnapshot, operatorId: string): ResolvedConversation[] {
  return listConversations(scene).filter((conversation) => isConversationVisible(scene, operatorId, conversation))
}

/** 可见的根会话。会话实例不在其中，最近联系人与关系目录这类「一个联系人一行」的视图用它。 */
export function listVisibleRootConversations(scene: SandboxSnapshot, operatorId: string): ResolvedConversation[] {
  return listRootConversations(scene).filter((conversation) => isConversationVisible(scene, operatorId, conversation))
}

export function listVisibleConversationIds(scene: SandboxSnapshot, operatorId: string): Set<string> {
  return new Set(listVisibleConversations(scene, operatorId).map(({ id }) => id))
}

/** 私聊会话中的对端参与者；群聊或参与者不在会话中时返回 undefined。 */
export function resolveConversationPeerId(conversation: ResolvedConversation, participantId: string): string | undefined {
  if (conversation.type !== 'direct') return undefined
  return conversation.participantIds?.find((id) => id !== participantId)
}

export function findDirectRootConversation(
  scene: SandboxSnapshot,
  firstId: string,
  secondId: string,
): ResolvedConversation | undefined {
  const conversation = findRootRow(scene, createDirectConversationId(firstId, secondId))
  return conversation ? resolveRoot(conversation) : undefined
}

export function findGroupRootConversation(scene: SandboxSnapshot, groupId: string): ResolvedConversation | undefined {
  const conversation = findRootRow(scene, createGroupConversationId(groupId))
  return conversation ? resolveRoot(conversation) : undefined
}

/** 一对参与者的私聊根会话 ID。会话尚未建立时返回规范 ID，不写入场景。 */
export function resolveDirectConversationId(scene: SandboxSnapshot, firstId: string, secondId: string): string {
  return findDirectRootConversation(scene, firstId, secondId)?.id ?? createDirectConversationId(firstId, secondId)
}

/** 一个群组的群聊根会话 ID。会话尚未建立时返回规范 ID，不写入场景。 */
export function resolveGroupConversationId(scene: SandboxSnapshot, groupId: string): string {
  return findGroupRootConversation(scene, groupId)?.id ?? createGroupConversationId(groupId)
}

/** 确保一对参与者的私聊根会话存在，就地写入场景。 */
export function ensureDirectRootConversation(
  scene: SandboxSnapshot,
  firstId: string,
  secondId: string,
): ResolvedConversation {
  const existing = findDirectRootConversation(scene, firstId, secondId)
  if (existing) return existing
  const conversation: SandboxConversation = {
    id: createDirectConversationId(firstId, secondId),
    type: 'direct',
    participantIds: [firstId, secondId].sort() as [string, string],
    messageIds: [],
  }
  scene.conversations.push(conversation)
  return resolveRoot(conversation)
}

/** 确保一个群组的群聊根会话存在，就地写入场景。 */
export function ensureGroupRootConversation(scene: SandboxSnapshot, groupId: string): ResolvedConversation {
  const existing = findGroupRootConversation(scene, groupId)
  if (existing) return existing
  const conversation: SandboxConversation = {
    id: createGroupConversationId(groupId),
    type: 'group',
    groupId,
    messageIds: [],
  }
  scene.conversations.push(conversation)
  return resolveRoot(conversation)
}

/** 把一条消息挂到会话末尾。会话不存在时抛领域错误。 */
export function appendConversationMessageId(scene: SandboxSnapshot, conversationId: string, messageId: string): void {
  const root = findRootRow(scene, conversationId)
  if (!root) throw new SandboxDomainError(`会话不存在：${conversationId}`)
  root.messageIds.push(messageId)
}

/** 清空某个会话的消息引用，保留会话实体本身。 */
export function clearConversationMessageIds(scene: SandboxSnapshot, conversationId: string): void {
  const root = findRootRow(scene, conversationId)
  if (!root) throw new SandboxDomainError(`会话不存在：${conversationId}`)
  root.messageIds = []
  root.hasMoreMessages = false
}

/** 从所有会话里摘掉已被淘汰的消息引用。 */
export function pruneConversationMessageIds(scene: SandboxSnapshot, removedMessageIds: ReadonlySet<string>): void {
  for (const conversation of scene.conversations) {
    if (!conversation.messageIds.some((id) => removedMessageIds.has(id))) continue
    conversation.messageIds = conversation.messageIds.filter((id) => !removedMessageIds.has(id))
  }
}

/**
 * 删除匹配的会话，返回被删除的会话 ID。
 *
 * 只负责会话集合本身；消息、机器人投递记录、ChatLuna 状态、合并转发与媒体的级联清理由
 * 提交场景变更的一方按返回的 ID 完成。
 */
export function removeConversations(
  scene: SandboxSnapshot,
  predicate: (conversation: ResolvedConversation) => boolean,
): Set<string> {
  const removedIds = new Set(listConversations(scene).filter(predicate).map(({ id }) => id))
  if (!removedIds.size) return removedIds
  scene.conversations = scene.conversations.filter(({ id }) => !removedIds.has(id))
  return removedIds
}

export interface VisibleConversationProjection {
  conversations: SandboxConversation[]
  /** 投影出的全部会话所引用的消息 ID。 */
  messageIds: Set<string>
}

/** 某个操作者可见的会话投影，消息按上限截断并标注是否还有更多。 */
export function projectVisibleConversations(
  scene: SandboxSnapshot,
  operatorId: string,
  messageLimit: number,
): VisibleConversationProjection {
  const conversations = scene.conversations
    .filter((conversation) => isConversationVisible(scene, operatorId, resolveRoot(conversation)))
    .map((conversation) => ({
      ...conversation,
      messageIds: conversation.messageIds.slice(-messageLimit),
      hasMoreMessages: conversation.messageIds.length > messageLimit,
    }))
  return { conversations, messageIds: new Set(conversations.flatMap(({ messageIds }) => messageIds)) }
}

/** 把整份场景的会话消息引用截断到上限，用于按带宽裁剪快照。 */
export function trimConversationMessages(
  scene: SandboxSnapshot,
  messageLimit: number,
): VisibleConversationProjection {
  const conversations = scene.conversations.map((conversation) => ({
    ...conversation,
    messageIds: conversation.messageIds.slice(-messageLimit),
    hasMoreMessages: conversation.hasMoreMessages || conversation.messageIds.length > messageLimit,
  }))
  return { conversations, messageIds: new Set(conversations.flatMap(({ messageIds }) => messageIds)) }
}

export interface ConversationReferenceScope {
  participantIds: ReadonlySet<string>
  groupIds: ReadonlySet<string>
  messageIds: ReadonlySet<string>
}

/** 替换场景时校验会话集合的自洽性。 */
export function validateSceneConversations(scene: SandboxSnapshot, scope: ConversationReferenceScope): void {
  const conversationIds = new Set(scene.conversations.map(({ id }) => id))
  if (conversationIds.size !== scene.conversations.length) throw new SandboxDomainError('会话 ID 不能重复')
  for (const conversation of scene.conversations) {
    if (conversation.type === 'direct' && !conversation.participantIds.every((id) => scope.participantIds.has(id))) {
      throw new SandboxDomainError(`私聊包含不存在的参与者：${conversation.id}`)
    }
    if (conversation.type === 'group' && !scope.groupIds.has(conversation.groupId)) {
      throw new SandboxDomainError(`群聊引用不存在的群组：${conversation.id}`)
    }
    if (conversation.messageIds.some((id) => !scope.messageIds.has(id))) {
      throw new SandboxDomainError('会话引用不存在的消息')
    }
  }
}
