import { Context, h, Random, Universal } from 'koishi'
import { resolve } from 'node:path'
import { SandboxBot } from './bot'
import { SandboxChatLunaStateStore } from './chatluna-state'
import { SandboxMediaStorage } from './media-storage'
import { SandboxOneBotDebugStore, type AppendOneBotDebugRecordInput } from './onebot-debug'
import { toOneBotMessageSegments, toOneBotRawMessage } from './onebot-message'
import type { SandboxScenePersistence } from './persistence'
import { getOneBotCapabilityMatrix, getOneBotMessageEventFields, getOneBotMessageSequence, normalizeDisabledCapabilities, resolveOneBotMessageId, type SandboxOneBotCapability } from './onebot-profiles'
import {
  createDirectConversationId,
  createGroupConversationId,
  getDirectConversationPeerId,
  isSandboxGroupMemberMuted,
  type CreateSandboxBotInput,
  type CreateSandboxGroupInput,
  type CreateSandboxUserInput,
  type DeleteSandboxBotInput,
  type DeleteSandboxGroupInput,
  type DeleteSandboxUserInput,
  type DeleteGroupAnnouncementInput,
  type GetMediaContentInput,
  type GetSandboxBotDeliveriesInput,
  type GetMessageHistoryInput,
  type GetSandboxOneBotDebugRecordsInput,
  type PerformFriendActionInput,
  type PerformFriendActionResult,
  type PerformGroupActionInput,
  type PerformGroupActionResult,
  type RecallMessageInput,
  type SandboxBotDelivery,
  type SandboxBotProfile,
  type SandboxChatLunaState,
  type SandboxConversation,
  type SandboxDirectConversation,
  type SandboxFriendship,
  type SandboxGroup,
  type SandboxGroupMember,
  type SandboxMedia,
  type SandboxMediaContent,
  type SandboxMessage,
  type SandboxMessageChatLuna,
  type SandboxMessageHistory,
  type SandboxOneBotDebugRecord,
  type SandboxPersistenceStatus,
  type SandboxSnapshot,
  type SandboxParticipant,
  type SandboxUser,
  type SendMediaMessageInput,
  type SendMessageInput,
  type SendMessageResult,
  type SetGroupAnnouncementInput,
  type UpdateSandboxBotInput,
  type UpdateSandboxGroupInput,
  type UpdateSandboxUserInput,
} from './types'

export interface SandboxControlServiceOptions {
  mediaDirectory?: string
  persistence?: SandboxScenePersistence
  debugRecordLimit?: number
  initialScene?: SandboxSnapshot
  runtimeBots?: SandboxRuntimeBotRegistry
  runtimeActive?: boolean
}

export class SandboxRuntimeBotRegistry {
  private owners = new Map<string, object>()

  assertAvailable(botId: string, owner: object): void {
    const currentOwner = this.owners.get(botId)
    if (currentOwner && currentOwner !== owner) throw new Error(`机器人 ID 已被活动场景占用：${botId}`)
  }

  claim(botId: string, owner: object): void {
    this.assertAvailable(botId, owner)
    this.owners.set(botId, owner)
  }

  release(botId: string, owner: object): void {
    if (this.owners.get(botId) === owner) this.owners.delete(botId)
  }
}

interface SandboxMessageContext {
  operator: SandboxParticipant
  peer?: SandboxParticipant
  conversation: SandboxConversation
  group?: SandboxGroup
  reply?: SandboxMessage
}

const DEFAULT_USER_ID = '10001'
const SECONDARY_USER_ID = '10002'
const ADMIN_USER_ID = '10003'
const DEFAULT_BOT_ID = '20001'
const DEFAULT_GROUP_ID = '30001'
// 与真实 QQ 群禁言上限一致，避免插件写入不可能的到期时间。
const MAX_GROUP_MUTE_SECONDS = 30 * 24 * 60 * 60

export function createEmptyScene(): SandboxSnapshot {
  return { revision: 0, participants: [], groups: [], conversations: [], messages: [], friendships: [], requests: [] }
}

export function createDefaultScene(): SandboxSnapshot {
  const createdAt = new Date().toISOString()
  const directConversations: SandboxConversation[] = [
    DEFAULT_USER_ID,
    SECONDARY_USER_ID,
    ADMIN_USER_ID,
  ].map((userId) => ({
    id: createDirectConversationId(userId, DEFAULT_BOT_ID),
    type: 'direct',
    participantIds: [userId, DEFAULT_BOT_ID].sort() as [string, string],
    messageIds: [],
  }))
  const groupConversation: SandboxConversation = {
    id: createGroupConversationId(DEFAULT_GROUP_ID),
    type: 'group',
    groupId: DEFAULT_GROUP_ID,
    messageIds: [],
  }
  return {
    revision: 0,
    participants: [
      { kind: 'user', id: DEFAULT_USER_ID, name: '测试用户1' },
      { kind: 'user', id: SECONDARY_USER_ID, name: '测试用户2' },
      { kind: 'user', id: ADMIN_USER_ID, name: '测试用户3' },
      { kind: 'bot', id: DEFAULT_BOT_ID, name: 'Koishi', implementation: 'napcat', enabled: true },
    ],
    groups: [{
      id: DEFAULT_GROUP_ID,
      name: '测试群',
      members: [
        { participantId: DEFAULT_USER_ID, card: '测试用户1', role: 'owner' },
        { participantId: SECONDARY_USER_ID, card: '测试用户2', role: 'admin' },
        { participantId: ADMIN_USER_ID, card: '测试用户3', role: 'member' },
        { participantId: DEFAULT_BOT_ID, card: 'Koishi', role: 'admin' },
      ],
      announcements: [{
        id: 'announcement:welcome',
        authorId: DEFAULT_USER_ID,
        content: '欢迎使用测试群验证群聊插件功能',
        createdAt,
      }],
    }],
    conversations: [...directConversations, groupConversation],
    messages: [],
    friendships: [
      DEFAULT_USER_ID,
      SECONDARY_USER_ID,
      ADMIN_USER_ID,
    ].map((userId) => createFriendship(userId, DEFAULT_BOT_ID, createdAt)),
    requests: [],
  }
}

function createFriendship(firstId: string, secondId: string, createdAt = new Date().toISOString()): SandboxFriendship {
  const participantIds = [firstId, secondId].sort() as [string, string]
  return {
    id: `friend:${participantIds[0]}:${participantIds[1]}`,
    participantIds,
    remarks: {},
    createdAt,
  }
}

export class SandboxControlService {
  private scene: SandboxSnapshot
  private runtimeBots = new Map<string, SandboxBot>()
  private runtimeBotsActive: boolean
  private runtimeBotRegistry: SandboxRuntimeBotRegistry
  private runtimeOwner = {}
  private botDeliveries: SandboxBotDelivery[] = []
  private chatLunaState: SandboxChatLunaStateStore
  private initialScene: SandboxSnapshot
  private oneBotDebug: SandboxOneBotDebugStore
  private mediaStorage: SandboxMediaStorage
  private persistence?: SandboxScenePersistence
  private persistenceQueue = Promise.resolve()
  private sceneMutationListeners = new Set<(snapshot: SandboxSnapshot) => void>()
  private debugRecordListeners = new Set<(record: SandboxOneBotDebugRecord) => void>()
  private contextDisposers: Array<() => void> = []
  private disposePromise?: Promise<void>

  constructor(private ctx: Context, options: SandboxControlServiceOptions = {}) {
    this.initialScene = structuredClone(options.initialScene ?? createDefaultScene())
    this.scene = structuredClone(this.initialScene)
    this.runtimeBotsActive = options.runtimeActive ?? true
    this.runtimeBotRegistry = options.runtimeBots ?? new SandboxRuntimeBotRegistry()
    this.persistence = options.persistence
    this.oneBotDebug = new SandboxOneBotDebugStore(options.debugRecordLimit)
    this.mediaStorage = new SandboxMediaStorage(options.mediaDirectory ?? resolve(ctx.baseDir, 'data/onebot-sandbox/media'))
    // database 服务可能晚于本插件加载，构造时的可用性不可信；数据库模式的清理决策移到 ready 读取场景之后。
    if (!this.persistence) this.mediaStorage.clear()
    this.chatLunaState = new SandboxChatLunaStateStore(ctx, (botParticipantId, conversationId) => {
      const participant = this.scene.participants.find(({ id }) => id === botParticipantId)
      const conversation = this.scene.conversations.find(({ id }) => id === conversationId)
      return participant?.kind === 'bot' && !!conversation && this.isConversationVisible(botParticipantId, conversation)
    }, () => this.notifySceneMutation(), (botParticipantId, conversationId, result) => {
      this.archiveChatLunaResult(botParticipantId, conversationId, result)
    })
    this.syncRuntimeBots()
    this.contextDisposers.push(ctx.on('ready', async () => {
      if (!this.persistence) return
      const scene = await this.persistence.load()
      if (scene) {
        this.scene = structuredClone(scene)
        this.syncRuntimeBots()
      } else {
        // 数据库读取失败时场景会回到默认值，旧媒体已失去引用，必须同步清理以避免跨重启孤儿文件。
        if (!this.persistence.getStatus().available) this.mediaStorage.clear()
        await this.persistence.save(this.getSnapshot())
      }
    }))
    this.contextDisposers.push(ctx.on('dispose', () => this.dispose()))
  }

  getSnapshot(): SandboxSnapshot {
    return structuredClone(this.scene)
  }

  onSceneMutation(listener: (snapshot: SandboxSnapshot) => void): () => void {
    this.sceneMutationListeners.add(listener)
    return () => this.sceneMutationListeners.delete(listener)
  }

  // OneBot 调试记录是外部测试控制器判断「插件是否真的调用了某个 action」的唯一事实来源；
  // 广播出去后 MCP 才能把它并入事件流，供 wait_for_onebot_action 等待而不必轮询。
  onOneBotDebugRecord(listener: (record: SandboxOneBotDebugRecord) => void): () => void {
    this.debugRecordListeners.add(listener)
    return () => this.debugRecordListeners.delete(listener)
  }

  setRuntimeActive(active: boolean): void {
    if (active === this.runtimeBotsActive) return
    if (active) {
      for (const bot of this.getBots()) this.runtimeBotRegistry.assertAvailable(bot.id, this.runtimeOwner)
      this.runtimeBotsActive = true
      this.syncRuntimeBots()
      return
    }
    this.runtimeBotsActive = false
    void this.disposeRuntimeBots()
  }

  replaceScene(snapshot: SandboxSnapshot): void {
    const next = structuredClone(snapshot)
    const participantIds = new Set(next.participants.map(({ id }) => id))
    if (participantIds.size !== next.participants.length) throw new Error('参与者 ID 不能重复')
    if (next.participants.some(({ id }) => !/^\d+$/.test(id))) throw new Error('参与者 ID 必须是十进制字符串')
    if (new Set(next.groups.map(({ id }) => id)).size !== next.groups.length) throw new Error('群组 ID 不能重复')
    for (const group of next.groups) {
      if (!group.members.every(({ participantId }) => participantIds.has(participantId))) throw new Error(`群组包含不存在的成员：${group.id}`)
      if (group.members.filter(({ role }) => role === 'owner').length !== 1) throw new Error(`群组必须且只能有一个群主：${group.id}`)
    }
    const groupIds = new Set(next.groups.map(({ id }) => id))
    const conversationIds = new Set(next.conversations.map(({ id }) => id))
    if (conversationIds.size !== next.conversations.length) throw new Error('会话 ID 不能重复')
    for (const conversation of next.conversations) {
      if (conversation.type === 'direct' && !conversation.participantIds.every((id) => participantIds.has(id))) throw new Error(`私聊包含不存在的参与者：${conversation.id}`)
      if (conversation.type === 'group' && !groupIds.has(conversation.groupId)) throw new Error(`群聊引用不存在的群组：${conversation.id}`)
    }
    const messageIds = new Set(next.messages.map(({ id }) => id))
    if (messageIds.size !== next.messages.length) throw new Error('消息 ID 不能重复')
    if (next.messages.some(({ authorId, conversationId }) => !participantIds.has(authorId) || !conversationIds.has(conversationId))) throw new Error('消息引用不存在的参与者或会话')
    if (next.messages.some(({ media }) => media?.some(({ id, reference }) => reference !== `sandbox-media://${id}`))) throw new Error('消息包含无效媒体引用')
    if (next.conversations.some((conversation) => conversation.messageIds.some((id) => !messageIds.has(id)))) throw new Error('会话引用不存在的消息')
    if (next.friendships.some(({ participantIds: ids }) => !ids.every((id) => participantIds.has(id)))) throw new Error('好友关系引用不存在的参与者')
    if (this.runtimeBotsActive) {
      for (const participant of next.participants) {
        if (participant.kind === 'bot') this.runtimeBotRegistry.assertAvailable(participant.id, this.runtimeOwner)
      }
    }
    next.revision = this.scene.revision + 1
    this.scene = next
    this.botDeliveries = []
    this.chatLunaState.clear()
    this.syncRuntimeBots()
    this.queueScenePersistence()
    this.notifySceneMutation()
  }

  storeMedia(input: { fileName: string; mimeType: string; dataBase64: string }): SandboxMedia {
    return this.mediaStorage.save(input)
  }

  storeMediaBatch(inputs: Array<{ fileName: string; mimeType: string; dataBase64: string }>): SandboxMedia[] {
    const media: SandboxMedia[] = []
    try {
      for (const input of inputs) media.push(this.mediaStorage.save(input))
      return media
    } catch (error) {
      for (const item of media) this.mediaStorage.remove(item)
      throw error
    }
  }

  async sendStoredMediaMessage(input: Pick<SendMessageInput, 'operatorId' | 'conversationId' | 'content' | 'replyToMessageId'> & { media: SandboxMedia[] }): Promise<SendMessageResult> {
    const context = this.getMessageContext(input)
    const text = input.content.trim()
    const content = text || input.media.map((item) => `[${this.getMediaLabel(item)}] ${item.name}`).join(' ')
    const message = this.appendMessage(input.operatorId, context.conversation.id, content, input.replyToMessageId, input.media)
    const elements = input.media.map((media) => h(media.type === 'image' ? 'img' : media.type, {
      src: media.reference,
      file: media.reference,
      title: media.name,
      mime: media.mimeType,
      size: media.size,
    }))
    if (text) elements.push(h.text(text))
    const onebotMessage: Array<{ type: string; data: Record<string, string> }> = input.media.map((media) => ({
      type: media.type === 'audio' ? 'record' : media.type,
      data: { file: media.reference },
    }))
    if (context.reply) onebotMessage.unshift({ type: 'reply', data: { id: String(getOneBotMessageSequence(context.reply.id)) } })
    if (text) onebotMessage.push({ type: 'text', data: { text } })
    const rawMessage = `${context.reply ? `[CQ:reply,id=${getOneBotMessageSequence(context.reply.id)}]` : ''}${input.media.map((media) => `[CQ:${media.type === 'audio' ? 'record' : media.type},file=${media.reference}]`).join('')}${text}`
    await this.dispatchMessageToBots(context, message, elements, onebotMessage, rawMessage)
    return { messageId: message.id, revision: this.scene.revision }
  }

  get bot(): SandboxBot {
    const bot = this.runtimeBots.get(DEFAULT_BOT_ID) ?? this.runtimeBots.values().next().value
    if (!bot) throw new Error('机器人运行时不存在')
    return bot
  }

  getPersistenceStatus(): SandboxPersistenceStatus {
    return this.persistence?.getStatus() ?? {
      mode: 'memory',
      available: true,
      persisted: false,
    }
  }

  getOneBotDebugRecords(input: GetSandboxOneBotDebugRecordsInput = {}): SandboxOneBotDebugRecord[] {
    return this.oneBotDebug.getRecords(input)
  }

  clearOneBotDebugRecords(): number {
    return this.oneBotDebug.clear()
  }

  recordOneBotDebug(input: AppendOneBotDebugRecordInput): SandboxOneBotDebugRecord {
    const record = this.oneBotDebug.append(input)
    for (const listener of this.debugRecordListeners) listener(record)
    return record
  }

  waitForPersistence(): Promise<void> {
    return this.persistenceQueue
  }

  dispose(): Promise<void> {
    if (this.disposePromise) return this.disposePromise
    this.disposePromise = (async () => {
      for (const dispose of this.contextDisposers.splice(0)) dispose()
      this.chatLunaState.dispose()
      this.sceneMutationListeners.clear()
      this.debugRecordListeners.clear()
      this.runtimeBotsActive = false
      const runtimeDisposal = this.disposeRuntimeBots()
      await this.waitForPersistence()
      await runtimeDisposal
    })()
    return this.disposePromise
  }

  resetScene(): void {
    this.mediaStorage.clear()
    this.chatLunaState.clear()
    this.oneBotDebug.clear()
    this.botDeliveries = []
    // 恢复到本实例的初始场景而非全局默认场景：测试空间的初始场景是空白，
    // 直接 createDefaultScene() 会引入默认机器人 20001，与主场景在全局
    // 运行时注册表中的同 ID 机器人冲突，导致空间内 reset 必定失败。
    this.scene = structuredClone(this.initialScene)
    this.syncRuntimeBots()
    this.queueScenePersistence()
  }

  getBotDeliveries(input: GetSandboxBotDeliveriesInput = {}): SandboxBotDelivery[] {
    return structuredClone(this.botDeliveries.filter(({ recipientBotId, messageId }) => (
      (!input.recipientBotId || recipientBotId === input.recipientBotId)
      && (!input.messageId || messageId === input.messageId)
    )))
  }

  getChatLunaStates(): SandboxChatLunaState[] {
    return this.chatLunaState.getStates()
  }

  getRuntimeBot(botId: string): SandboxBot {
    const bot = this.runtimeBots.get(botId)
    if (!bot) throw new Error(`机器人运行时不存在：${botId}`)
    return bot
  }

  getBotCapabilities(botId: string): SandboxOneBotCapability[] {
    const bot = this.getBots().find(({ id }) => id === botId)
    if (!bot) throw new Error(`机器人不存在：${botId}`)
    return getOneBotCapabilityMatrix(bot.implementation, bot.disabledCapabilities)
  }

  getVisibleSnapshot(operatorId: string, messageLimit = 50): SandboxSnapshot {
    this.getParticipant(operatorId)
    const limit = this.validateMessageLimit(messageLimit)
    const conversations = this.scene.conversations
      .filter((conversation) => this.isConversationVisible(operatorId, conversation))
      .map((conversation) => ({
        ...conversation,
        messageIds: conversation.messageIds.slice(-limit),
        hasMoreMessages: conversation.messageIds.length > limit,
      }))
    const visibleMessageIds = new Set(conversations.flatMap(({ messageIds }) => messageIds))
    return structuredClone({
      ...this.scene,
      conversations,
      messages: this.scene.messages.filter(({ id }) => visibleMessageIds.has(id)),
    })
  }

  getMessageHistory(input: GetMessageHistoryInput): SandboxMessageHistory {
    const conversation = this.getVisibleConversation(input.operatorId, input.conversationId)
    const limit = this.validateMessageLimit(input.limit ?? 50)
    let end = conversation.messageIds.length
    if (input.beforeMessageId) {
      end = conversation.messageIds.indexOf(input.beforeMessageId)
      if (end < 0) throw new Error(`消息不存在：${input.beforeMessageId}`)
    }
    const start = Math.max(0, end - limit)
    const messageIds = conversation.messageIds.slice(start, end)
    const messagesById = new Map(this.scene.messages.map((message) => [message.id, message]))
    return {
      messages: structuredClone(messageIds.flatMap((id) => messagesById.get(id) ?? [])),
      nextBeforeMessageId: start > 0 ? messageIds[0] : undefined,
    }
  }

  createUser(input: CreateSandboxUserInput): void {
    const id = this.validateParticipantId(input.id)
    const name = this.validateName(input.name, '用户昵称')
    if (this.scene.participants.some((participant) => participant.id === id)) {
      throw new Error(`参与者已存在：${id}`)
    }

    this.scene.participants.push({ kind: 'user', id, name })
    // 环境管理属于测试前置配置，可静默建立关系；WebQQ 用户操作仍必须走好友申请审批。
    for (const bot of this.getBots()) this.addFriendship(id, bot.id)
    this.commitSceneMutation()
  }

  updateUser(input: UpdateSandboxUserInput): void {
    const user = this.getUsers().find(({ id }) => id === input.id)
    if (!user) throw new Error(`用户不存在：${input.id}`)
    user.name = this.validateName(input.name, '用户昵称')
    this.commitSceneMutation()
  }

  deleteUser(input: DeleteSandboxUserInput): void {
    const index = this.scene.participants.findIndex(({ id, kind }) => id === input.id && kind === 'user')
    if (index < 0) throw new Error(`用户不存在：${input.id}`)
    this.scene.participants.splice(index, 1)
    const ownedGroupIds = new Set(this.scene.groups
      .filter(({ members }) => members.some(({ participantId, role }) => participantId === input.id && role === 'owner'))
      .map(({ id }) => id))
    this.scene.groups = this.scene.groups.filter(({ id }) => !ownedGroupIds.has(id))
    for (const group of this.scene.groups) {
      group.members = group.members.filter(({ participantId }) => participantId !== input.id)
      group.announcements = group.announcements.filter(({ authorId }) => authorId !== input.id)
    }
    this.scene.requests = this.scene.requests.filter(({ requesterId, targetId, groupId }) => requesterId !== input.id
      && targetId !== input.id
      && !ownedGroupIds.has(groupId ?? ''))
    this.scene.friendships = this.scene.friendships.filter(({ participantIds }) => !participantIds.includes(input.id))
    this.deleteConversations((conversation) => conversation.type === 'direct'
      ? conversation.participantIds.includes(input.id)
      : ownedGroupIds.has(conversation.groupId))
    this.commitSceneMutation()
  }

  createBot(input: CreateSandboxBotInput): void {
    const id = this.validateParticipantId(input.id)
    const name = this.validateName(input.name, '机器人昵称')
    if (this.scene.participants.some((participant) => participant.id === id)) {
      throw new Error(`参与者已存在：${id}`)
    }
    if (this.runtimeBotsActive) this.runtimeBotRegistry.assertAvailable(id, this.runtimeOwner)

    const disabledCapabilities = normalizeDisabledCapabilities(input.implementation, input.disabledCapabilities)
    this.scene.participants.push({
      kind: 'bot',
      id,
      name,
      avatar: input.avatar?.trim() || undefined,
      implementation: input.implementation,
      enabled: input.enabled,
      ...(disabledCapabilities ? { disabledCapabilities } : {}),
    })
    this.createRuntimeBot({
      selfId: id,
      name,
      avatar: input.avatar?.trim() || undefined,
      implementation: input.implementation,
      disabledCapabilities,
    })
    for (const participant of this.scene.participants) {
      if (participant.id !== id) this.addFriendship(participant.id, id)
    }
    this.commitSceneMutation()
  }

  updateBot(input: UpdateSandboxBotInput): void {
    const bot = this.getBots().find(({ id }) => id === input.id)
    if (!bot) throw new Error(`机器人不存在：${input.id}`)
    bot.name = this.validateName(input.name, '机器人昵称')
    if (input.avatar !== undefined) bot.avatar = input.avatar.trim() || undefined
    const disabledCapabilities = normalizeDisabledCapabilities(input.implementation, input.disabledCapabilities)
    bot.implementation = input.implementation
    bot.enabled = input.enabled
    if (disabledCapabilities) bot.disabledCapabilities = disabledCapabilities
    else delete bot.disabledCapabilities
    const runtime = this.runtimeBots.get(bot.id)
    if (runtime) {
      runtime.user = { id: bot.id, name: bot.name, avatar: bot.avatar }
      runtime.status = bot.enabled ? Universal.Status.ONLINE : Universal.Status.OFFLINE
      runtime.updateImplementation(bot.implementation, bot.disabledCapabilities)
    }
    this.commitSceneMutation()
  }

  updateBotSelfProfile(botId: string, input: { name?: string; avatar?: string }) {
    const bot = this.getBots().find(({ id }) => id === botId)
    if (!bot) throw new Error(`机器人不存在：${botId}`)
    if (input.name !== undefined) bot.name = this.validateName(input.name, '机器人昵称')
    if (input.avatar !== undefined) bot.avatar = input.avatar.trim() || undefined
    const runtime = this.getRuntimeBot(botId)
    runtime.user = { id: bot.id, name: bot.name, avatar: bot.avatar }
    this.commitSceneMutation()
    return { status: 'ok', retcode: 0, data: null }
  }

  deleteBot(input: DeleteSandboxBotInput): void {
    const index = this.scene.participants.findIndex(({ id, kind }) => id === input.id && kind === 'bot')
    if (index < 0) throw new Error(`机器人不存在：${input.id}`)
    this.chatLunaState.deleteByBotParticipant(input.id)
    this.scene.participants.splice(index, 1)
    const runtime = this.runtimeBots.get(input.id)
    this.runtimeBots.delete(input.id)
    if (runtime) {
      this.runtimeBotRegistry.release(input.id, this.runtimeOwner)
      void runtime.dispose()
    }
    const ownedGroupIds = new Set(this.scene.groups
      .filter(({ members }) => members.some(({ participantId, role }) => participantId === input.id && role === 'owner'))
      .map(({ id }) => id))
    this.scene.groups = this.scene.groups.filter(({ id }) => !ownedGroupIds.has(id))
    for (const group of this.scene.groups) {
      group.members = group.members.filter(({ participantId }) => participantId !== input.id)
      group.announcements = group.announcements.filter(({ authorId }) => authorId !== input.id)
    }
    this.scene.requests = this.scene.requests.filter(({ requesterId, targetId, groupId }) => requesterId !== input.id
      && targetId !== input.id
      && !ownedGroupIds.has(groupId ?? ''))
    this.scene.friendships = this.scene.friendships.filter(({ participantIds }) => !participantIds.includes(input.id))
    this.deleteConversations((conversation) => conversation.type === 'direct'
      ? conversation.participantIds.includes(input.id)
      : ownedGroupIds.has(conversation.groupId))
    this.commitSceneMutation()
  }

  createGroup(input: CreateSandboxGroupInput): void {
    const id = this.validateGroupId(input.id)
    if (this.scene.groups.some((group) => group.id === id)) throw new Error(`群组已存在：${id}`)
    const members = this.validateGroupMembers(input.members)
    this.scene.groups.push({
      id,
      name: this.validateName(input.name, '群名称'),
      members,
      announcements: [],
    })
    this.syncGroupConversations(id)
    this.commitSceneMutation()
  }

  updateGroup(input: UpdateSandboxGroupInput): void {
    const group = this.scene.groups.find(({ id }) => id === input.id)
    if (!group) throw new Error(`群组不存在：${input.id}`)
    group.name = this.validateName(input.name, '群名称')
    group.members = this.validateGroupMembers(input.members)
    this.syncGroupConversations(group.id)
    this.commitSceneMutation()
  }

  deleteGroup(input: DeleteSandboxGroupInput): void {
    const index = this.scene.groups.findIndex(({ id }) => id === input.id)
    if (index < 0) throw new Error(`群组不存在：${input.id}`)
    this.scene.groups.splice(index, 1)
    this.scene.requests = this.scene.requests.filter(({ groupId }) => groupId !== input.id)
    this.deleteConversations((conversation) => conversation.groupId === input.id)
    this.commitSceneMutation()
  }

  async performFriendAction(input: PerformFriendActionInput): Promise<PerformFriendActionResult> {
    if (this.isBot(input.operatorId)) {
      const bot = this.getBots().find(({ id }) => id === input.operatorId)!
      if (!bot.enabled) throw new Error(`机器人已停用：${bot.id}`)
    }
    if (this.isBot(input.operatorId) && input.action === 'handle-request') {
      const request = this.scene.requests.find(({ id, type }) => id === input.requestId && type === 'friend')
      if (!request || request.targetId !== input.operatorId) throw new Error(`好友申请不存在：${input.requestId}`)
      await this.getRuntimeBot(input.operatorId).internal.set_friend_add_request({
        flag: input.requestId,
        approve: input.approve,
      })
      return { revision: this.scene.revision }
    }
    this.getParticipant(input.operatorId)
    if (input.action === 'handle-request') {
      return this.handleUserRelationshipRequest(input)
    }

    const target = this.getParticipant(input.targetId)
    if (target.id === input.operatorId) throw new Error('不能对自己执行好友操作')
    const friendship = this.getFriendship(input.operatorId, target.id)

    if (input.action === 'request') {
      if (friendship) throw new Error('已经是好友关系')
      if (this.scene.requests.some(({ type, requesterId, targetId }) => type === 'friend'
        && ((requesterId === input.operatorId && targetId === target.id)
          || (requesterId === target.id && targetId === input.operatorId)))) {
        throw new Error('双方已有待处理的好友申请')
      }
      const request = {
        id: `request:friend:${Random.id()}`,
        type: 'friend' as const,
        requesterId: input.operatorId,
        targetId: target.id,
        status: 'pending' as const,
        createdAt: new Date().toISOString(),
        comment: input.comment?.trim() || undefined,
      }
      this.scene.requests.push(request)
      this.commitSceneMutation()
      if (this.isBot(target.id)) await this.dispatchFriendRequest(target.id, input.operatorId, request.id, request.comment)
      return { revision: this.scene.revision, requestId: request.id }
    }

    if (!friendship) throw new Error('好友关系不存在')
    if (input.action === 'set-remark') {
      const remark = input.remark.trim()
      if (remark) friendship.remarks[input.operatorId] = remark
      else delete friendship.remarks[input.operatorId]
      this.commitSceneMutation()
      return { revision: this.scene.revision }
    }

    if (input.action === 'poke') {
      if (this.isBot(target.id)) await this.dispatchBotNotice(target.id, input.operatorId, 'notify')
      const conversation = input.conversationId
        ? this.getVisibleConversation(input.operatorId, input.conversationId)
        : this.scene.conversations.find((item) => item.type === 'direct'
          && item.participantIds.includes(input.operatorId)
          && item.participantIds.includes(target.id))
      if (!conversation) throw new Error('戳一戳必须在可见会话中发起')
      const group = conversation.groupId
        ? this.scene.groups.find(({ id }) => id === conversation.groupId)
        : undefined
      if (group && !group.members.some(({ participantId }) => participantId === target.id)) {
        throw new Error('目标用户不在当前群组中')
      }
      if (!group && (conversation.type !== 'direct' || !conversation.participantIds.includes(target.id))) {
        throw new Error('目标用户不在当前私聊中')
      }
      const getDisplayName = (participantId: string) => group?.members.find((member) => member.participantId === participantId)?.card
        || this.getParticipant(participantId).name
      this.appendMessage(
        input.operatorId,
        conversation.id,
        `${getDisplayName(input.operatorId)} 戳了戳 ${getDisplayName(target.id)}`,
        undefined,
        undefined,
        { type: 'poke', targetId: target.id },
      )
      return { revision: this.scene.revision }
    }

    if (input.action !== 'delete') throw new Error(`不支持的好友操作：${Reflect.get(input, 'action') ?? 'unknown'}`)

    this.scene.friendships = this.scene.friendships.filter(({ id }) => id !== friendship.id)
    if (this.isBot(target.id)) {
      await this.dispatchBotNotice(target.id, input.operatorId, 'friend_del')
    }
    this.commitSceneMutation()
    return { revision: this.scene.revision }
  }

  async performGroupAction(input: PerformGroupActionInput): Promise<PerformGroupActionResult> {
    // 机器人处理协议能力覆盖的群操作时必须经过自身 OneBot action，确保事件中的 self_id 与实际机器人一致。
    // 主动申请入群等沙盒参与者操作则继续落到下方统一路径，避免 WebQQ 因操作者种类出现行为差异。
    if (this.isBot(input.operatorId)) {
      const bot = this.getBots().find(({ id }) => id === input.operatorId)!
      if (!bot.enabled) throw new Error(`机器人已停用：${bot.id}`)
      const runtime = this.getRuntimeBot(bot.id)
      if (input.action === 'handle-request') {
        const request = this.scene.requests.find(({ id, type }) => id === input.requestId && type === 'group')
        if (!request) throw new Error(`群申请不存在：${input.requestId}`)
        await runtime.internal.set_group_add_request({
          flag: input.requestId,
          sub_type: request.subType ?? 'add',
          approve: input.approve,
        })
        return { revision: this.scene.revision }
      }
      if (input.action === 'kick') {
        await runtime.internal._request('set_group_kick', { group_id: input.groupId, user_id: input.targetId })
        return { revision: this.scene.revision }
      }
      if (input.action === 'set-admin') {
        await runtime.internal._request('set_group_admin', { group_id: input.groupId, user_id: input.targetId, enable: input.enabled })
        return { revision: this.scene.revision }
      }
      if (input.action === 'transfer-owner') {
        // WebQQ 的群主转让是“当前操作者”的客户端行为，不应伪造为 NapCat/LLBot 均不存在的原始 action。
        // 直接进入统一领域操作，仍会以该机器人身份执行权限检查和状态变更。
        await this.performBotGroupAction(bot.id, {
          action: 'transfer-owner',
          groupId: input.groupId,
          targetId: input.targetId,
        })
        return { revision: this.scene.revision }
      }
      if (input.action === 'set-card') {
        await runtime.internal._request('set_group_card', { group_id: input.groupId, user_id: input.targetId, card: input.card })
        return { revision: this.scene.revision }
      }
      if (input.action === 'set-title') {
        await runtime.internal._request('set_group_special_title', { group_id: input.groupId, user_id: input.targetId, special_title: input.title })
        return { revision: this.scene.revision }
      }
      if (input.action === 'set-name') {
        await runtime.internal._request('set_group_name', { group_id: input.groupId, group_name: input.name })
        return { revision: this.scene.revision }
      }
    }
    this.getParticipant(input.operatorId)
    if (input.action === 'handle-request') return this.handleUserGroupRequest(input)

    const group = this.scene.groups.find(({ id }) => id === input.groupId)
    if (!group) throw new Error(`群组不存在：${input.groupId}`)

    if (input.action === 'request-join') {
      if (group.members.some(({ participantId }) => participantId === input.operatorId)) throw new Error('已经是群成员')
      if (this.scene.requests.some(({ type, subType, requesterId, groupId }) => type === 'group'
        && (subType ?? 'add') === 'add' && requesterId === input.operatorId && groupId === group.id)) {
        throw new Error('已有待处理的入群申请')
      }
      const request = {
        id: `request:group:${Random.id()}`,
        type: 'group' as const,
        subType: 'add' as const,
        requesterId: input.operatorId,
        groupId: group.id,
        status: 'pending' as const,
        createdAt: new Date().toISOString(),
        comment: input.comment?.trim() || undefined,
      }
      this.scene.requests.push(request)
      this.commitSceneMutation()
      await this.dispatchGroupRequest(group, request)
      return { revision: this.scene.revision, requestId: request.id }
    }

    const actor = this.requireGroupMember(group, input.operatorId)
    if (input.action === 'invite') {
      const target = this.getParticipant(input.targetId)
      if (group.members.some(({ participantId }) => participantId === target.id)) throw new Error('目标已经是群成员')
      if (this.scene.requests.some(({ type, subType, targetId, groupId }) => type === 'group'
        && subType === 'invite' && targetId === target.id && groupId === group.id)) {
        throw new Error('已有待处理的群邀请')
      }
      const request = {
        id: `request:group:${Random.id()}`,
        type: 'group' as const,
        subType: 'invite' as const,
        requesterId: input.operatorId,
        targetId: target.id,
        groupId: group.id,
        status: 'pending' as const,
        createdAt: new Date().toISOString(),
        comment: input.comment?.trim() || undefined,
      }
      this.scene.requests.push(request)
      this.commitSceneMutation()
      await this.dispatchGroupRequest(group, request)
      return { revision: this.scene.revision, requestId: request.id }
    }

    if (input.action === 'leave') {
      if (actor.role === 'owner') throw new Error('群主不能直接退出群组')
      await this.dispatchGroupNotice(group, 'group_decrease', {
        sub_type: 'leave',
        operator_id: Number(input.operatorId),
        user_id: Number(input.operatorId),
      })
      this.removeGroupMember(group, input.operatorId)
      return { revision: this.scene.revision }
    }

    if (input.action === 'set-name') {
      if (actor.role === 'member') throw new Error('只有群主或管理员可以修改群名称')
      const previousName = group.name
      group.name = this.validateName(input.name, '群名称')
      this.commitSceneMutation()
      await this.dispatchGroupNotice(group, 'group_name', {
        user_id: Number(input.operatorId),
        name_old: previousName,
        name_new: group.name,
      })
      return { revision: this.scene.revision }
    }

    const target = this.requireGroupMember(group, input.targetId)
    if (input.action === 'kick') {
      this.assertCanManageMember(actor, target, '踢出成员')
      await this.dispatchGroupNotice(group, 'group_decrease', (botId) => ({
        sub_type: botId === target.participantId ? 'kick_me' : 'kick',
        operator_id: Number(input.operatorId),
        user_id: Number(target.participantId),
      }))
      this.removeGroupMember(group, target.participantId)
      return { revision: this.scene.revision }
    }

    if (input.action === 'set-admin') {
      if (actor.role !== 'owner') throw new Error('只有群主可以设置管理员')
      if (target.role === 'owner') throw new Error('不能修改群主权限')
      target.role = input.enabled ? 'admin' : 'member'
      this.commitSceneMutation()
      await this.dispatchGroupNotice(group, 'group_admin', {
        sub_type: input.enabled ? 'set' : 'unset',
        user_id: Number(target.participantId),
      })
      return { revision: this.scene.revision }
    }

    if (input.action === 'transfer-owner') {
      await this.transferGroupOwner(group, actor, target)
      return { revision: this.scene.revision }
    }

    if (input.action === 'set-card') {
      if (target.participantId !== input.operatorId) this.assertCanManageMember(actor, target, '修改群名片')
      const previousCard = target.card ?? ''
      target.card = input.card.trim() || undefined
      this.commitSceneMutation()
      await this.dispatchGroupNotice(group, 'group_card', {
        user_id: Number(target.participantId),
        card_old: previousCard,
        card_new: target.card ?? '',
      })
      return { revision: this.scene.revision }
    }

    if (input.action === 'set-title') {
      this.setGroupMemberTitle(actor, target, input.title)
      return { revision: this.scene.revision }
    }

    if (input.action !== 'poke') throw new Error(`不支持的群组操作：${Reflect.get(input, 'action') ?? 'unknown'}`)
    const conversation = input.conversationId
      ? this.getVisibleConversation(input.operatorId, input.conversationId)
      : this.scene.conversations.find((item) => item.type === 'group' && item.groupId === group.id)
    if (!conversation || conversation.groupId !== group.id) throw new Error('群内戳一戳必须在当前群会话中发起')
    await this.dispatchGroupNotice(group, 'notify', {
      sub_type: 'poke',
      user_id: Number(input.operatorId),
      target_id: Number(target.participantId),
    })
    const getDisplayName = (participantId: string) => group.members.find((member) => member.participantId === participantId)?.card
      || this.getParticipant(participantId).name
    this.appendMessage(
      input.operatorId,
      conversation.id,
      `${getDisplayName(input.operatorId)} 戳了戳 ${getDisplayName(target.participantId)}`,
      undefined,
      undefined,
      { type: 'poke', targetId: target.participantId },
    )
    return { revision: this.scene.revision }
  }

  async handleBotFriendRequest(botId: string, input: { flag: string; approve: boolean; remark?: string }) {
    if (!this.isBot(botId)) throw new Error(`机器人不存在：${botId}`)
    const requestIndex = this.scene.requests.findIndex(({ id, type, targetId }) => id === input.flag && type === 'friend' && targetId === botId)
    if (requestIndex < 0) throw new Error(`好友申请不存在：${input.flag}`)
    const [request] = this.scene.requests.splice(requestIndex, 1)
    if (input.approve) {
      const friendship = this.addFriendship(request.requesterId, botId)
      const remark = input.remark?.trim()
      if (remark) friendship.remarks[botId] = remark
    }
    this.commitSceneMutation()
    return { status: 'ok', retcode: 0, data: null }
  }

  async handleBotGroupRequest(botId: string, input: { flag: string; subType: 'add' | 'invite'; approve: boolean; reason?: string }) {
    if (!this.isBot(botId)) throw new Error(`机器人不存在：${botId}`)
    const requestIndex = this.scene.requests.findIndex(({ id, type, subType }) => id === input.flag
      && type === 'group' && (subType ?? 'add') === input.subType)
    if (requestIndex < 0) throw new Error(`群申请不存在：${input.flag}`)
    const request = this.scene.requests[requestIndex]
    const group = this.scene.groups.find(({ id }) => id === request.groupId)
    if (!group) throw new Error(`群组不存在：${request.groupId}`)

    if (input.subType === 'invite') {
      if (request.targetId !== botId) throw new Error('只能处理发给自己的群邀请')
    } else {
      const operator = this.requireGroupMember(group, botId)
      if (operator.role !== 'owner' && operator.role !== 'admin') throw new Error('机器人没有审批入群申请的权限')
    }

    this.scene.requests.splice(requestIndex, 1)
    if (input.approve) {
      const participantId = input.subType === 'invite' ? botId : request.requesterId
      await this.addApprovedGroupMember(group, participantId, input.subType === 'invite' ? request.requesterId : botId, input.subType)
    } else {
      this.commitSceneMutation()
    }
    return { status: 'ok', retcode: 0, data: null }
  }

  deleteBotFriend(botId: string, userId: string): void {
    const friendship = this.getFriendship(botId, userId)
    if (!friendship) throw new Error('好友关系不存在')
    this.scene.friendships = this.scene.friendships.filter(({ id }) => id !== friendship.id)
    this.commitSceneMutation()
  }

  async performBotGroupAction(botId: string, input:
  | { action: 'kick'; groupId: string; targetId: string }
  | { action: 'set-admin'; groupId: string; targetId: string; enabled: boolean }
  | { action: 'transfer-owner'; groupId: string; targetId: string }
  | { action: 'set-card'; groupId: string; targetId: string; card: string }
  | { action: 'set-title'; groupId: string; targetId: string; title: string }
  | { action: 'set-ban'; groupId: string; targetId: string; durationSeconds: number }
  | { action: 'set-name'; groupId: string; name: string }
  | { action: 'leave'; groupId: string }) {
    const group = this.scene.groups.find(({ id }) => id === input.groupId)
    if (!group) throw new Error(`群组不存在：${input.groupId}`)
    const actor = this.requireGroupMember(group, botId)

    if (input.action === 'leave') {
      if (actor.role === 'owner') throw new Error('群主不能直接退出群组')
      await this.dispatchGroupNotice(group, 'group_decrease', {
        sub_type: 'leave',
        operator_id: Number(botId),
        user_id: Number(botId),
      })
      this.removeGroupMember(group, botId)
      return { status: 'ok', retcode: 0, data: null }
    }

    if (input.action === 'set-name') {
      if (actor.role === 'member') throw new Error('只有群主或管理员可以修改群名称')
      const previousName = group.name
      group.name = this.validateName(input.name, '群名称')
      this.commitSceneMutation()
      await this.dispatchGroupNotice(group, 'group_name', {
        user_id: Number(botId),
        name_old: previousName,
        name_new: group.name,
      })
      return { status: 'ok', retcode: 0, data: null }
    }

    const target = this.requireGroupMember(group, input.targetId)
    if (input.action === 'kick') {
      this.assertCanManageMember(actor, target, '踢出成员')
      await this.dispatchGroupNotice(group, 'group_decrease', (receiverBotId) => ({
        sub_type: receiverBotId === target.participantId ? 'kick_me' : 'kick',
        operator_id: Number(botId),
        user_id: Number(target.participantId),
      }))
      this.removeGroupMember(group, target.participantId)
      return { status: 'ok', retcode: 0, data: null }
    }

    if (input.action === 'set-admin') {
      if (actor.role !== 'owner') throw new Error('只有群主可以设置管理员')
      if (target.role === 'owner') throw new Error('不能修改群主权限')
      target.role = input.enabled ? 'admin' : 'member'
      this.commitSceneMutation()
      await this.dispatchGroupNotice(group, 'group_admin', {
        sub_type: input.enabled ? 'set' : 'unset',
        user_id: Number(target.participantId),
      })
      return { status: 'ok', retcode: 0, data: null }
    }

    if (input.action === 'transfer-owner') {
      await this.transferGroupOwner(group, actor, target)
      return { status: 'ok', retcode: 0, data: null }
    }

    if (input.action === 'set-title') {
      this.setGroupMemberTitle(actor, target, input.title)
      return { status: 'ok', retcode: 0, data: null }
    }

    if (input.action === 'set-ban') {
      this.setGroupMemberMute(actor, target, input.durationSeconds)
      return { status: 'ok', retcode: 0, data: null }
    }

    if (target.participantId !== botId) this.assertCanManageMember(actor, target, '修改群名片')
    const previousCard = target.card ?? ''
    target.card = input.card.trim() || undefined
    this.commitSceneMutation()
    await this.dispatchGroupNotice(group, 'group_card', {
      user_id: Number(target.participantId),
      card_old: previousCard,
      card_new: target.card ?? '',
    })
    return { status: 'ok', retcode: 0, data: null }
  }

  async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    const { result, delivery } = this.startMessageSend(input)
    await delivery
    return { ...result, revision: this.scene.revision }
  }

  // 同步完成校验与消息落库并立即返回，机器人投递在后台继续；
  // WebQQ 依赖此方法让用户消息即时显示，不被插件处理时长（如图片渲染）阻塞。
  startMessageSend(input: SendMessageInput): { result: SendMessageResult; delivery: Promise<void> } {
    if (!input.content.trim()) throw new Error('消息内容不能为空')
    const context = this.getMessageContext(input)
    const message = this.appendMessage(input.operatorId, context.conversation.id, input.content.trim(), input.replyToMessageId)
    const elements = h.parse(message.content)
    const onebotMessage = [
      ...(context.reply ? [{ type: 'reply', data: { id: String(getOneBotMessageSequence(context.reply.id)) } }] : []),
      ...toOneBotMessageSegments(message.content),
    ]
    const delivery = this.dispatchMessageToBots(context, message, elements, onebotMessage, toOneBotRawMessage(onebotMessage))
    return { result: { messageId: message.id, revision: this.scene.revision }, delivery }
  }

  async sendMediaMessage(input: SendMediaMessageInput): Promise<SendMessageResult> {
    const { result, delivery } = this.startMediaMessageSend(input)
    await delivery
    return { ...result, revision: this.scene.revision }
  }

  startMediaMessageSend(input: SendMediaMessageInput): { result: SendMessageResult; delivery: Promise<void> } {
    if (!input.media.length) throw new Error('至少需要一个媒体文件')
    // 先校验会话与操作者，再落盘媒体；中途任一文件校验失败时清理已写入的文件，避免留下孤儿媒体。
    const context = this.getMessageContext(input)
    const media: SandboxMedia[] = []
    try {
      for (const file of input.media) media.push(this.mediaStorage.save(file))
    } catch (error) {
      for (const saved of media) this.mediaStorage.remove(saved)
      throw error
    }
    const text = input.content?.trim() ?? ''
    // 占位 content 仅用于会话预览与历史可读性，派发给机器人的消息只携带媒体段与用户真实文本。
    const content = text || media.map((item) => `[${this.getMediaLabel(item)}] ${item.name}`).join(' ')
    const message = this.appendMessage(input.operatorId, context.conversation.id, content, input.replyToMessageId, media)
    const elements = media.map((item) => h(item.type === 'image' ? 'img' : item.type, {
      src: item.reference,
      file: item.reference,
      title: item.name,
      mime: item.mimeType,
      size: item.size,
    }))
    if (text) elements.push(h.text(text))
    const onebotMessage: Array<{ type: string; data: Record<string, string> }> = [
      ...(context.reply ? [{ type: 'reply', data: { id: String(getOneBotMessageSequence(context.reply.id)) } }] : []),
      ...media.map((item) => ({ type: item.type === 'audio' ? 'record' : item.type, data: { file: item.reference } })),
      ...(text ? [{ type: 'text', data: { text } }] : []),
    ]
    const rawMessage = `${context.reply ? `[CQ:reply,id=${getOneBotMessageSequence(context.reply.id)}]` : ''}${media.map((item) => `[CQ:${item.type === 'audio' ? 'record' : item.type},file=${item.reference}]`).join('')}${text}`
    const delivery = this.dispatchMessageToBots(context, message, elements, onebotMessage, rawMessage)
    return { result: { messageId: message.id, revision: this.scene.revision }, delivery }
  }

  getMediaContent(input: GetMediaContentInput): SandboxMediaContent {
    const visibleConversationIds = new Set(this.scene.conversations
      .filter((conversation) => this.isConversationVisible(input.operatorId, conversation))
      .map(({ id }) => id))
    this.getParticipant(input.operatorId)
    const media = this.scene.messages
      .filter(({ conversationId }) => visibleConversationIds.has(conversationId))
      .flatMap(({ media }) => media ?? [])
      .find(({ id }) => id === input.mediaId)
    if (!media) throw new Error(`媒体不存在或不可见：${input.mediaId}`)
    return this.mediaStorage.read(media)
  }

  private async dispatchMessageToBots(
    context: SandboxMessageContext,
    message: SandboxMessage,
    elements: ReturnType<typeof h>[],
    onebotMessage: Array<{ type: string; data: Record<string, string> }>,
    rawMessage: string,
  ): Promise<void> {
    await Promise.all(this.getMessageRecipientBots(context).map((recipientBot) => this.dispatchMessageToBot(
      recipientBot,
      context,
      message,
      elements,
      onebotMessage,
      rawMessage,
    )))
  }

  private async dispatchMessageToBot(
    recipientBot: SandboxBotProfile,
    context: SandboxMessageContext,
    message: SandboxMessage,
    elements: ReturnType<typeof h>[],
    onebotMessage: Array<{ type: string; data: Record<string, string> }>,
    rawMessage: string,
  ): Promise<void> {
    const runtimeBot = this.runtimeBots.get(recipientBot.id)
    if (!runtimeBot) throw new Error(`机器人运行时不存在：${recipientBot.id}`)
    const session = runtimeBot.session({
      type: 'message',
      timestamp: Date.now(),
      user: { id: context.operator.id, name: context.operator.name },
      channel: {
        id: context.conversation.id,
        type: context.conversation.type === 'group' ? Universal.Channel.Type.TEXT : Universal.Channel.Type.DIRECT,
      },
      guild: context.group ? { id: context.group.id, name: context.group.name } : undefined,
      message: {
        id: message.id,
        messageId: message.id,
        content: elements.join(''),
        elements,
        quote: context.reply ? {
          id: context.reply.id,
          messageId: context.reply.id,
          content: context.reply.content,
          user: { id: context.reply.authorId },
        } : undefined,
      },
    })
    Object.assign(session, {
      onebot: {
        time: Math.floor(Date.now() / 1000),
        self_id: Number(recipientBot.id),
        post_type: 'message',
        message_type: context.conversation.type === 'group' ? 'group' : 'private',
        sub_type: context.conversation.type === 'group' ? 'normal' : 'friend',
        ...getOneBotMessageEventFields(recipientBot.implementation, message.id),
        user_id: Number(context.operator.id),
        group_id: context.group ? Number(context.group.id) : undefined,
        message: onebotMessage,
        raw_message: rawMessage,
        sender: { user_id: Number(context.operator.id), nickname: context.operator.name },
      },
    })

    // Koishi 的 dispatch() 是同步触发事件、异步执行中间件；等待 middleware
    // 完成才能保证控制台 RPC 返回时，插件通过 session.send() 写入的回复已可见。
    const middlewareFinished = new Promise<void>((resolve) => {
      const dispose = this.ctx.on('middleware', (processedSession) => {
        if (processedSession.id !== session.id) return
        dispose()
        resolve()
      })
    })

    await this.dispatchOneBotEvent(runtimeBot, session)
    await middlewareFinished
    this.botDeliveries.push({
      id: Random.id(),
      recipientBotId: recipientBot.id,
      messageId: message.id,
      conversationId: context.conversation.id,
      createdAt: new Date().toISOString(),
    })
  }

  setGroupAnnouncement(input: SetGroupAnnouncementInput): void {
    const participant = this.getParticipant(input.operatorId)
    const group = this.scene.groups.find(({ id }) => id === input.groupId)
    if (!group) throw new Error(`群组不存在：${input.groupId}`)
    if (!group.members.some(({ participantId }) => participantId === participant.id)) {
      throw new Error(`参与者不在群组中：${input.operatorId}`)
    }
    const content = input.content.trim()
    if (!content) throw new Error('群公告不能为空')

    group.announcements.unshift({
      id: Random.id(),
      authorId: participant.id,
      content,
      createdAt: new Date().toISOString(),
    })
    this.commitSceneMutation()
  }

  deleteGroupAnnouncement(input: DeleteGroupAnnouncementInput): void {
    const participant = this.getParticipant(input.operatorId)
    const group = this.scene.groups.find(({ id }) => id === input.groupId)
    if (!group) throw new Error(`群组不存在：${input.groupId}`)
    if (!group.members.some(({ participantId }) => participantId === participant.id)) {
      throw new Error(`参与者不在群组中：${input.operatorId}`)
    }

    const index = group.announcements.findIndex(({ id }) => id === input.announcementId)
    if (index < 0) throw new Error(`群公告不存在：${input.announcementId}`)
    group.announcements.splice(index, 1)
    this.commitSceneMutation()
  }

  // 表情回应过去只校验消息可见后确认调用；现在写入消息状态，使 get_msg、场景快照
  // 和消息历史都能读回同一份回应事实。
  setMessageReaction(input: { operatorId: string; messageId: string; emojiId: string; enabled: boolean }): void {
    const emojiId = input.emojiId.trim()
    if (!emojiId) throw new Error('表情 ID 不能为空')
    const message = this.scene.messages.find(({ id }) => id === input.messageId)
    if (!message) throw new Error(`消息不存在：${input.messageId}`)
    // 与撤回一致地覆盖同一广播组，避免同一条逻辑消息的副本之间回应不一致。
    for (const target of this.scene.messages.filter(({ id, broadcastId }) => id === message.id
      || (!!message.broadcastId && broadcastId === message.broadcastId))) {
      const reactions = target.reactions ?? []
      const reaction = reactions.find((item) => item.emojiId === emojiId)
      if (!input.enabled) {
        if (reaction) reaction.participantIds = reaction.participantIds.filter((id) => id !== input.operatorId)
      } else if (!reaction) {
        reactions.push({ emojiId, participantIds: [input.operatorId] })
      } else if (!reaction.participantIds.includes(input.operatorId)) {
        reaction.participantIds.push(input.operatorId)
      }
      const remaining = reactions.filter(({ participantIds }) => participantIds.length)
      if (remaining.length) target.reactions = remaining
      else delete target.reactions
    }
    this.commitSceneMutation()
  }

  async recallMessage(input: RecallMessageInput): Promise<{ revision: number }> {
    if (this.isBot(input.operatorId)) {
      const bot = this.getBots().find(({ id }) => id === input.operatorId)!
      if (!bot.enabled) throw new Error(`机器人已停用：${bot.id}`)
      // 机器人操作者必须走自身 OneBot action（操作通道约束），保持能力校验与调试记录一致。
      await this.getRuntimeBot(bot.id).internal._request('delete_msg', { message_id: input.messageId })
      return { revision: this.scene.revision }
    }
    this.getParticipant(input.operatorId)
    await this.recallVisibleMessage(input.operatorId, input.messageId, input.conversationId)
    return { revision: this.scene.revision }
  }

  async recallBotMessage(botId: string, rawMessageId: string, conversationId?: string): Promise<void> {
    const messageId = resolveOneBotMessageId(rawMessageId, this.scene.messages.map(({ id }) => id))
    await this.recallVisibleMessage(botId, messageId ?? rawMessageId, conversationId)
  }

  // 撤回与真实 QQ 一致：消息就地替换为灰条提示，保留会话位置，并向相关机器人派发撤回通知。
  private async recallVisibleMessage(operatorId: string, messageId: string, conversationId?: string): Promise<void> {
    const message = this.scene.messages.find(({ id }) => id === messageId)
    if (!message || (conversationId && message.conversationId !== conversationId)) throw new Error(`消息不存在：${messageId}`)
    const conversation = this.scene.conversations.find(({ id }) => id === message.conversationId)
    if (!conversation || !this.isConversationVisible(operatorId, conversation)) throw new Error(`消息不存在：${messageId}`)
    if (message.event) throw new Error('该消息不支持撤回')
    const group = conversation.type === 'group'
      ? this.scene.groups.find(({ id }) => id === conversation.groupId)
      : undefined
    if (message.authorId !== operatorId) {
      if (!group) throw new Error('只能撤回自己发送的消息')
      const actor = this.requireGroupMember(group, operatorId)
      const target = this.requireGroupMember(group, message.authorId)
      this.assertCanManageMember(actor, target, '撤回成员消息')
    }
    const operatorName = group?.members.find(({ participantId }) => participantId === operatorId)?.card
      || this.getParticipant(operatorId).name
    const recalled = this.scene.messages.filter(({ id, broadcastId }) => id === message.id
      || (!!message.broadcastId && broadcastId === message.broadcastId))
    for (const target of recalled) {
      for (const media of target.media ?? []) this.mediaStorage.remove(media)
      delete target.media
      delete target.replyToMessageId
      target.content = `${operatorName} 撤回了一条消息`
      target.event = { type: 'recall', operatorId }
    }
    this.commitSceneMutation()
    if (group) {
      await this.dispatchGroupNotice(group, 'group_recall', {
        user_id: Number(message.authorId),
        operator_id: Number(operatorId),
        message_id: getOneBotMessageSequence(message.id),
      }, { messageId: message.id })
      return
    }
    if (conversation.type !== 'direct') return
    await Promise.all(conversation.participantIds.map(async (participantId) => {
      const bot = this.getBots().find(({ id }) => id === participantId)
      if (!bot?.enabled) return
      await this.dispatchFriendRecallNotice(bot.id, conversation, message.id)
    }))
  }

  private async dispatchFriendRecallNotice(botId: string, conversation: SandboxDirectConversation, messageId: string): Promise<void> {
    const bot = this.runtimeBots.get(botId)
    if (!bot) return
    const peerId = getDirectConversationPeerId(conversation, botId)
    const session = bot.session({
      type: 'message-deleted',
      timestamp: Date.now(),
      user: { id: peerId, name: this.getParticipant(peerId).name },
      channel: { id: conversation.id, type: Universal.Channel.Type.DIRECT },
      message: { id: messageId, messageId },
    })
    Object.assign(session, {
      onebot: {
        time: Math.floor(Date.now() / 1000),
        self_id: Number(botId),
        post_type: 'notice',
        notice_type: 'friend_recall',
        user_id: Number(peerId),
        message_id: getOneBotMessageSequence(messageId),
      },
    })
    await this.dispatchOneBotEvent(bot, session)
    // 与群通知路径一致：OneBot 插件监听原始 notice，标准事件与原始事件复用同一个 Session。
    ;(this.ctx.emit as unknown as (session: unknown, name: string, payload: unknown) => void)(session, 'notice', session)
  }

  private appendMessage(
    authorId: string,
    conversationId: string,
    content: string,
    replyToMessageId?: string,
    media?: SandboxMedia[],
    event?: SandboxMessage['event'],
    broadcastId?: string,
  ): SandboxMessage {
    const conversation = this.scene.conversations.find(({ id }) => id === conversationId)
    if (!conversation) throw new Error(`会话不存在：${conversationId}`)

    const message: SandboxMessage = {
      id: Random.id(),
      authorId,
      conversationId,
      content,
      createdAt: new Date().toISOString(),
      replyToMessageId,
      broadcastId,
      media,
      event,
    }
    this.scene.messages.push(message)
    conversation.messageIds.push(message.id)
    this.commitSceneMutation()
    return message
  }

  // 把本轮 ChatLuna 思考与用量写到该机器人最后一条消息上，让结果随场景快照持久化并覆盖多轮历史。
  private archiveChatLunaResult(botParticipantId: string, conversationId: string, result: SandboxMessageChatLuna): void {
    for (let index = this.scene.messages.length - 1; index >= 0; index--) {
      const message = this.scene.messages[index]
      if (message.event || message.authorId !== botParticipantId || message.conversationId !== conversationId) continue
      message.chatLuna = {
        ...(result.thought ? { thought: result.thought } : { thought: message.chatLuna?.thought ?? '' }),
        ...(result.thoughtDurationMs === undefined ? {} : { thoughtDurationMs: result.thoughtDurationMs }),
        ...(result.usage ? { usage: result.usage } : {}),
      }
      if (!message.chatLuna.thought && !message.chatLuna.usage) delete message.chatLuna
      this.commitSceneMutation()
      return
    }
  }

  private commitSceneMutation(): void {
    this.scene.revision += 1
    this.queueScenePersistence()
    this.notifySceneMutation()
  }

  private notifySceneMutation(): void {
    if (!this.sceneMutationListeners.size) return
    const snapshot = this.getSnapshot()
    for (const listener of this.sceneMutationListeners) listener(snapshot)
  }

  private queueScenePersistence(): void {
    const persistence = this.persistence
    if (!persistence) return
    const snapshot = this.getSnapshot()
    this.persistenceQueue = this.persistenceQueue.then(() => persistence.save(snapshot))
  }

  private validateParticipantId(value: string): string {
    const id = value.trim()
    if (!/^\d+$/.test(id)) throw new Error('QQ ID 必须是数字字符串')
    return id
  }

  private validateGroupId(value: string): string {
    const id = value.trim()
    if (!/^\d+$/.test(id)) throw new Error('群号必须是数字字符串')
    return id
  }

  private validateName(value: string, field: string): string {
    const name = value.trim()
    if (!name) throw new Error(`${field}不能为空`)
    return name
  }

  private getUsers(): SandboxUser[] {
    return this.scene.participants.filter((participant): participant is SandboxUser => participant.kind === 'user')
  }

  private getBots(): SandboxBotProfile[] {
    return this.scene.participants.filter((participant): participant is SandboxBotProfile => participant.kind === 'bot')
  }

  private getUser(userId: string) {
    const user = this.getUsers().find(({ id }) => id === userId)
    if (!user) throw new Error(`用户不存在：${userId}`)
    return user
  }

  private getVisibleConversation(operatorId: string, conversationId: string) {
    this.getParticipant(operatorId)
    const conversation = this.scene.conversations.find(({ id }) => id === conversationId)
    if (!conversation || !this.isConversationVisible(operatorId, conversation)) throw new Error(`会话不存在：${conversationId}`)
    return conversation
  }

  private isConversationVisible(operatorId: string, conversation: SandboxConversation) {
    if (conversation.type === 'direct') {
      if (!conversation.participantIds.includes(operatorId)) return false
      return !!this.getFriendship(...conversation.participantIds)
    }
    const group = this.scene.groups.find(({ id }) => id === conversation.groupId)
    return !!group?.members.some(({ participantId }) => participantId === operatorId)
  }

  private getMessageContext(input: Pick<SendMessageInput, 'operatorId' | 'conversationId' | 'replyToMessageId'>): SandboxMessageContext {
    const operator = this.getParticipant(input.operatorId)
    const conversation = this.getVisibleConversation(input.operatorId, input.conversationId)
    const group = conversation.groupId
      ? this.scene.groups.find(({ id }) => id === conversation.groupId)
      : undefined
    if (conversation.type === 'group' && (!group || !group.members.some(({ participantId }) => participantId === operator.id))) {
      throw new Error(`群聊关系不存在：${input.conversationId}`)
    }
    const peer = conversation.type === 'direct'
      ? this.getParticipant(getDirectConversationPeerId(conversation, input.operatorId))
      : undefined
    const reply = input.replyToMessageId
      ? this.scene.messages.find(({ id, conversationId }) => id === input.replyToMessageId && conversationId === conversation.id)
      : undefined
    if (input.replyToMessageId && !reply) throw new Error(`回复消息不存在：${input.replyToMessageId}`)
    return { operator, peer, conversation, group, reply }
  }

  private getMessageRecipientBots(context: SandboxMessageContext): SandboxBotProfile[] {
    // 消息本体只记录作者和逻辑会话；接收机器人必须在投递时按当前关系推导，
    // 才能让一条群消息复用同一个 ID 派发给多个机器人，并避免成员变更留下过期归属。
    if (context.conversation.type === 'direct') {
      return context.peer?.kind === 'bot' && context.peer.enabled ? [context.peer] : []
    }
    return (context.group?.members ?? [])
      .map(({ participantId }) => this.scene.participants.find(({ id }) => id === participantId))
      .filter((participant): participant is SandboxBotProfile => participant?.kind === 'bot'
        && participant.enabled
        && participant.id !== context.operator.id)
  }

  private getMediaLabel(media: SandboxMedia): string {
    return media.type === 'image' ? '图片' : media.type === 'audio' ? '语音' : media.type === 'video' ? '视频' : '文件'
  }

  private validateMessageLimit(value: number) {
    if (!Number.isInteger(value) || value < 1 || value > 100) throw new Error('消息分页大小必须在 1 到 100 之间')
    return value
  }

  private createRuntimeBot(config: SandboxBot.Config) {
    this.runtimeBotRegistry.claim(config.selfId, this.runtimeOwner)
    try {
      const bot = new SandboxBot(this.ctx, this, config)
      this.runtimeBots.set(config.selfId, bot)
      return bot
    } catch (error) {
      this.runtimeBotRegistry.release(config.selfId, this.runtimeOwner)
      throw error
    }
  }

  private syncRuntimeBots(): void {
    if (!this.runtimeBotsActive) return
    const botIds = new Set(this.getBots().map(({ id }) => id))
    for (const [botId, runtime] of this.runtimeBots) {
      if (botIds.has(botId)) continue
      this.runtimeBots.delete(botId)
      this.runtimeBotRegistry.release(botId, this.runtimeOwner)
      void runtime.dispose()
    }
    for (const profile of this.getBots()) {
      const runtime = this.runtimeBots.get(profile.id) ?? this.createRuntimeBot({
        selfId: profile.id,
        name: profile.name,
        avatar: profile.avatar,
        implementation: profile.implementation,
        disabledCapabilities: profile.disabledCapabilities,
      })
      runtime.user = { id: profile.id, name: profile.name, avatar: profile.avatar }
      runtime.status = profile.enabled ? Universal.Status.ONLINE : Universal.Status.OFFLINE
      runtime.updateImplementation(profile.implementation, profile.disabledCapabilities)
    }
  }

  private async disposeRuntimeBots(): Promise<void> {
    const runtimes = [...this.runtimeBots]
    this.runtimeBots.clear()
    for (const [botId] of runtimes) this.runtimeBotRegistry.release(botId, this.runtimeOwner)
    await Promise.all(runtimes.map(([, runtime]) => runtime.dispose()))
  }

  private handleUserRelationshipRequest(input: Extract<PerformFriendActionInput, { action: 'handle-request' }>): PerformFriendActionResult | Promise<PerformGroupActionResult> {
    const requestIndex = this.scene.requests.findIndex(({ id }) => id === input.requestId)
    if (requestIndex < 0) throw new Error(`关系申请不存在：${input.requestId}`)
    const request = this.scene.requests[requestIndex]
    if (request.type === 'friend') {
      if (this.isBot(request.targetId)) throw new Error('机器人申请必须由机器人处理')
      if (request.targetId !== input.operatorId) throw new Error('只能处理发给自己的好友申请')
      this.scene.requests.splice(requestIndex, 1)
      if (input.approve) this.addFriendship(request.requesterId, input.operatorId)
      this.commitSceneMutation()
      return { revision: this.scene.revision }
    }

    return this.handleUserGroupRequest({
      action: 'handle-request',
      operatorId: input.operatorId,
      requestId: input.requestId,
      approve: input.approve,
    })
  }

  private async handleUserGroupRequest(input: Extract<PerformGroupActionInput, { action: 'handle-request' }>): Promise<PerformGroupActionResult> {
    const requestIndex = this.scene.requests.findIndex(({ id, type }) => id === input.requestId && type === 'group')
    if (requestIndex < 0) throw new Error(`群申请不存在：${input.requestId}`)
    const request = this.scene.requests[requestIndex]
    const group = this.scene.groups.find(({ id }) => id === request.groupId)
    if (!group) throw new Error(`群组不存在：${request.groupId}`)
    const subType = request.subType ?? 'add'

    if (subType === 'invite') {
      if (this.isBot(request.targetId)) throw new Error('机器人邀请必须由机器人处理')
      if (request.targetId !== input.operatorId) throw new Error('只能处理发给自己的群邀请')
    } else {
      const operator = this.requireGroupMember(group, input.operatorId)
      if (operator.role !== 'owner' && operator.role !== 'admin') throw new Error('只有群主或管理员可以处理入群申请')
    }

    this.scene.requests.splice(requestIndex, 1)
    if (input.approve) {
      const participantId = subType === 'invite' ? request.targetId : request.requesterId
      if (!participantId) throw new Error('群申请缺少目标参与者')
      await this.addApprovedGroupMember(group, participantId, input.operatorId, subType)
    } else {
      this.commitSceneMutation()
    }
    return { revision: this.scene.revision }
  }

  private requireGroupMember(group: SandboxGroup, participantId: string) {
    const member = group.members.find((item) => item.participantId === participantId)
    if (!member) throw new Error(`参与者不在群组中：${participantId}`)
    return member
  }

  private assertCanManageMember(
    actor: SandboxGroup['members'][number],
    target: SandboxGroup['members'][number],
    action: string,
  ) {
    if (actor.role === 'member') throw new Error(`只有群主或管理员可以${action}`)
    if (target.role === 'owner' || (actor.role === 'admin' && target.role === 'admin')) {
      throw new Error('管理员不能管理群主或其他管理员')
    }
    if (actor.participantId === target.participantId) throw new Error(`不能对自己执行${action}`)
  }

  // 专属头衔与禁言过去只做权限校验后确认调用，插件无法验证结果；两者现在都写入
  // 群成员状态，使 WebQQ、场景快照和 OneBot 查询读到同一份事实。
  private setGroupMemberTitle(actor: SandboxGroupMember, target: SandboxGroupMember, title: string): void {
    if (actor.role !== 'owner') throw new Error('只有群主可以设置专属头衔')
    target.title = this.validateOptionalName(title, '专属头衔')
    this.commitSceneMutation()
  }

  private setGroupMemberMute(actor: SandboxGroupMember, target: SandboxGroupMember, durationSeconds: number): void {
    if (!Number.isFinite(durationSeconds) || durationSeconds < 0) throw new Error('禁言时长不能为负数')
    if (durationSeconds > MAX_GROUP_MUTE_SECONDS) throw new Error('禁言时长不能超过 30 天')
    this.assertCanManageMember(actor, target, durationSeconds > 0 ? '禁言成员' : '解除禁言')
    target.mutedUntil = durationSeconds > 0
      ? new Date(Date.now() + durationSeconds * 1000).toISOString()
      : undefined
    this.commitSceneMutation()
  }

  private validateOptionalName(value: string, label: string): string | undefined {
    const trimmed = value.trim()
    if (!trimmed) return undefined
    if (trimmed.length > 64) throw new Error(`${label}不能超过 64 个字符`)
    return trimmed
  }

  private async transferGroupOwner(group: SandboxGroup, actor: SandboxGroupMember, target: SandboxGroupMember) {    if (actor.role !== 'owner') throw new Error('只有群主可以转让群主身份')
    if (actor.participantId === target.participantId) throw new Error('不能把群主身份转让给自己')
    actor.role = 'member'
    target.role = 'owner'
    this.commitSceneMutation()
    await this.dispatchGroupNotice(group, 'group_owner', {
      operator_id: Number(actor.participantId),
      user_id: Number(target.participantId),
      owner_id_old: Number(actor.participantId),
      owner_id_new: Number(target.participantId),
    })
  }

  private async addApprovedGroupMember(group: SandboxGroup, participantId: string, operatorId: string, subType: 'add' | 'invite') {
    this.getParticipant(participantId)
    if (!group.members.some((member) => member.participantId === participantId)) {
      group.members.push({ participantId, role: 'member' })
      this.syncGroupConversations(group.id)
    }
    this.commitSceneMutation()
    await this.dispatchGroupNotice(group, 'group_increase', {
      sub_type: subType === 'add' ? 'approve' : 'invite',
      operator_id: Number(operatorId),
      user_id: Number(participantId),
    })
  }

  private removeGroupMember(group: SandboxGroup, participantId: string) {
    group.members = group.members.filter((member) => member.participantId !== participantId)
    this.scene.requests = this.scene.requests.filter((request) => request.groupId !== group.id
      || (request.requesterId !== participantId && request.targetId !== participantId))
    this.syncGroupConversations(group.id)
    this.commitSceneMutation()
  }

  private addFriendship(firstId: string, secondId: string): SandboxFriendship {
    const existing = this.getFriendship(firstId, secondId)
    if (existing) return existing
    const friendship = createFriendship(firstId, secondId)
    this.scene.friendships.push(friendship)
    const id = createDirectConversationId(firstId, secondId)
    if (!this.scene.conversations.some((conversation) => conversation.id === id)) {
      this.scene.conversations.push({
        id,
        type: 'direct',
        participantIds: [firstId, secondId].sort() as [string, string],
        messageIds: [],
      })
    }
    return friendship
  }

  private getFriendship(firstId: string, secondId: string) {
    return this.scene.friendships.find(({ participantIds }) => participantIds.includes(firstId) && participantIds.includes(secondId))
  }

  private getParticipant(id: string): SandboxUser | SandboxBotProfile {
    const user = this.getUsers().find((item) => item.id === id)
    const bot = this.getBots().find((item) => item.id === id)
    if (user) return user
    if (bot) return bot
    throw new Error(`参与者不存在：${id}`)
  }

  private isBot(id: string | undefined): boolean {
    return !!id && this.getBots().some((bot) => bot.id === id)
  }

  private async dispatchFriendRequest(botId: string, userId: string, flag: string, comment?: string) {
    const bot = this.runtimeBots.get(botId)
    if (!bot) throw new Error(`机器人运行时不存在：${botId}`)
    const session = bot.session({
      type: 'friend-request',
      timestamp: Date.now(),
      user: { id: userId, name: this.getUser(userId).name },
    })
    Object.assign(session, {
      onebot: {
        time: Math.floor(Date.now() / 1000),
        self_id: Number(botId),
        post_type: 'request',
        request_type: 'friend',
        user_id: Number(userId),
        comment,
        flag,
      },
    })
    await this.dispatchOneBotEvent(bot, session)
  }

  private async dispatchBotNotice(botId: string, userId: string, noticeType: 'notify' | 'friend_del') {
    const bot = this.runtimeBots.get(botId)
    if (!bot) throw new Error(`机器人运行时不存在：${botId}`)
    const session = bot.session({
      type: 'notice',
      timestamp: Date.now(),
      user: { id: userId, name: this.getUser(userId).name },
      // channelId 使用沙盒私聊会话 ID 而非 adapter-onebot 的 `private:QQ号`，
      // 插件收到事件后 session.send() 才能直接回落到同一会话。
      channel: { id: createDirectConversationId(userId, botId), type: Universal.Channel.Type.DIRECT },
    })
    if (noticeType === 'notify') {
      // adapter-onebot 把 notify/poke 映射为 type=notice、subtype=poke 并附带 targetId；
      // 插件靠这些字段过滤戳一戳，缺失会导致监听器永远不匹配（如"被戳后回复"类插件）。
      Object.assign(session, { subtype: 'poke', targetId: botId })
    }
    Object.assign(session, {
      onebot: {
        time: Math.floor(Date.now() / 1000),
        self_id: Number(botId),
        post_type: 'notice',
        notice_type: noticeType,
        sub_type: noticeType === 'notify' ? 'poke' : undefined,
        user_id: Number(userId),
        target_id: Number(botId),
      },
    })
    await this.dispatchOneBotEvent(bot, session)
  }

  private async dispatchGroupRequest(group: SandboxGroup, request: SandboxSnapshot['requests'][number]) {
    const subType = request.subType ?? 'add'
    const botIds = subType === 'invite' && this.isBot(request.targetId)
      ? [request.targetId as string]
      : group.members.flatMap(({ participantId, role }) => this.isBot(participantId) && (role === 'owner' || role === 'admin') ? [participantId] : [])
    await Promise.all(botIds.map(async (botId) => {
      const bot = this.getRuntimeBot(botId)
      const session = bot.session({
        type: 'guild-request',
        timestamp: Date.now(),
        guild: { id: group.id, name: group.name },
        user: { id: request.requesterId, name: this.getParticipant(request.requesterId).name },
      })
      Object.assign(session, {
        onebot: {
          time: Math.floor(Date.now() / 1000),
          self_id: Number(botId),
          post_type: 'request',
          request_type: 'group',
          sub_type: subType,
          group_id: Number(group.id),
          user_id: Number(request.requesterId),
          comment: request.comment,
          flag: request.id,
        },
      })
      await this.dispatchOneBotEvent(bot, session)
    }))
  }

  private async dispatchGroupNotice(
    group: SandboxGroup,
    noticeType: string,
    data: Record<string, unknown> | ((botId: string) => Record<string, unknown>),
    options: { messageId?: string } = {},
  ): Promise<void> {
    const botIds = group.members.flatMap(({ participantId }) => this.isBot(participantId) ? [participantId] : [])
    await Promise.all(botIds.map(async (botId) => {
      const bot = this.getRuntimeBot(botId)
      const noticeData = typeof data === 'function' ? data(botId) : data
      const userId = noticeData.user_id === undefined ? undefined : String(noticeData.user_id)
      const operatorId = noticeData.operator_id === undefined ? undefined : String(noticeData.operator_id)
      const user = userId ? this.getParticipant(userId) : undefined
      const operator = operatorId ? this.getParticipant(operatorId) : undefined
      const member = userId ? group.members.find(({ participantId }) => participantId === userId) : undefined
      const standardType = noticeType === 'group_increase'
        ? (userId === botId ? 'guild-added' : 'guild-member-added')
        : noticeType === 'group_decrease'
          ? (userId === botId ? 'guild-removed' : 'guild-member-removed')
          : noticeType === 'group_name'
            ? 'guild-updated'
            : noticeType === 'group_admin' || noticeType === 'group_card' || noticeType === 'group_owner'
              ? 'guild-member-updated'
              : noticeType === 'group_recall'
                ? 'message-deleted'
                : 'notice'
      const session = bot.session({
        type: standardType,
        timestamp: Date.now(),
        guild: { id: group.id, name: group.name },
        // channelId 与消息事件一致使用沙盒群会话 ID，插件在通知回调里 session.send() 才能落回本群。
        channel: { id: createGroupConversationId(group.id), type: Universal.Channel.Type.TEXT },
        user: user ? { id: user.id, name: user.name, avatar: user.avatar, isBot: this.isBot(user.id) } : undefined,
        operator: operator ? { id: operator.id, name: operator.name, avatar: operator.avatar, isBot: this.isBot(operator.id) } : undefined,
        member: member && user ? {
          user: { id: user.id, name: user.name, avatar: user.avatar, isBot: this.isBot(user.id) },
          name: user.name,
          nick: member.card ?? user.name,
          roles: [{ id: member.role }],
        } : undefined,
        message: options.messageId ? { id: options.messageId, messageId: options.messageId } : undefined,
      })
      if (noticeType === 'notify' && noticeData.sub_type === 'poke') {
        // 与 adapter-onebot 对齐：群戳一戳的 session 需要 subtype=poke 与 targetId，插件靠它们过滤事件。
        Object.assign(session, {
          subtype: 'poke',
          targetId: noticeData.target_id === undefined ? undefined : String(noticeData.target_id),
        })
      }
      Object.assign(session, {
        onebot: {
          time: Math.floor(Date.now() / 1000),
          self_id: Number(botId),
          post_type: 'notice',
          notice_type: noticeType,
          group_id: Number(group.id),
          ...noticeData,
        },
      })
      await this.dispatchOneBotEvent(bot, session)
      if (standardType !== 'notice') {
        // OneBot 插件仍会监听原始 notice；标准事件和原始事件必须复用同一个 Session，
        // 避免重复派发 internal/session 导致调试记录和等待器各收到两次。
        ;(this.ctx.emit as unknown as (session: unknown, name: string, payload: unknown) => void)(session, 'notice', session)
      }
    }))
  }

  private async dispatchOneBotEvent(bot: SandboxBot, session: ReturnType<SandboxBot['session']>): Promise<void> {
    const startedAt = Date.now()
    const payload = Reflect.get(session, 'onebot')
    const profile = this.getBots().find(({ id }) => id === bot.selfId)
    if (!profile) throw new Error(`机器人不存在：${bot.selfId}`)
    const type = this.getOneBotEventType(payload)
    try {
      await bot.dispatch(session)
      this.recordOneBotDebug({
        botId: bot.selfId,
        implementation: profile.implementation,
        direction: 'event',
        type,
        status: 'success',
        durationMs: Date.now() - startedAt,
        payload,
        result: { delivered: true },
      })
    } catch (error) {
      const traceId = Random.id()
      this.ctx.logger('onebot-sandbox').error(`OneBot 原始事件派发失败 [${traceId}]`, error)
      this.recordOneBotDebug({
        botId: bot.selfId,
        implementation: profile.implementation,
        direction: 'event',
        type,
        status: 'error',
        durationMs: Date.now() - startedAt,
        payload,
        error: {
          message: error instanceof Error ? error.message : 'OneBot 原始事件派发失败',
          traceId,
        },
      })
      throw error
    }
  }

  private getOneBotEventType(payload: unknown): string {
    if (!payload || typeof payload !== 'object') return 'unknown'
    const postType = String(Reflect.get(payload, 'post_type') ?? 'unknown')
    const detail = Reflect.get(payload, `${postType}_type`)
    return detail === undefined ? postType : `${postType}.${String(detail)}`
  }

  private deleteConversations(predicate: (conversation: SandboxSnapshot['conversations'][number]) => boolean): void {
    const removedIds = new Set(this.scene.conversations.filter(predicate).map(({ id }) => id))
    const removedMessageIds = new Set(this.scene.messages
      .filter(({ conversationId }) => removedIds.has(conversationId))
      .map(({ id }) => id))
    this.chatLunaState.deleteByConversationIds(removedIds)
    for (const media of this.scene.messages
      .filter(({ conversationId }) => removedIds.has(conversationId))
      .flatMap(({ media }) => media ?? [])) {
      this.mediaStorage.remove(media)
    }
    this.scene.conversations = this.scene.conversations.filter(({ id }) => !removedIds.has(id))
    this.scene.messages = this.scene.messages.filter(({ conversationId }) => !removedIds.has(conversationId))
    this.botDeliveries = this.botDeliveries.filter(({ messageId }) => !removedMessageIds.has(messageId))
  }

  private validateGroupMembers(members: SandboxSnapshot['groups'][number]['members']) {
    const participantIds = new Set<string>()
    let ownerId = ''
    const result = members.map((member) => {
      if (participantIds.has(member.participantId)) throw new Error(`群成员重复：${member.participantId}`)
      const user = this.getUsers().find(({ id }) => id === member.participantId)
      const bot = this.getBots().find(({ id }) => id === member.participantId)
      if (!user && !bot) throw new Error(`群成员不存在：${member.participantId}`)
      if (member.role === 'owner') {
        // 普通用户和虚拟 OneBot 机器人共享同一套群角色，群主只要求是有效参与者。
        if (ownerId) throw new Error('群组只能有一个群主')
        ownerId = member.participantId
      }
      participantIds.add(member.participantId)
      return {
        participantId: member.participantId,
        card: member.card?.trim() || undefined,
        role: member.role,
        title: member.title?.trim() || undefined,
        mutedUntil: isSandboxGroupMemberMuted(member) ? member.mutedUntil : undefined,
      }
    })
    if (!ownerId) throw new Error('群组必须有一个群主')
    return result
  }

  private syncGroupConversations(groupId: string): void {
    const group = this.scene.groups.find(({ id }) => id === groupId)
    if (!group) return
    const id = createGroupConversationId(groupId)
    if (this.scene.conversations.some((conversation) => conversation.id === id)) return
    this.scene.conversations.push({ id, type: 'group', groupId, messageIds: [] })
  }
}
