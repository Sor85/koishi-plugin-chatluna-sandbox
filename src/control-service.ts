import { Context, h, Random, Universal } from 'koishi'
import { resolve } from 'node:path'
import { SandboxBot } from './bot'
import { SandboxMediaStorage } from './media-storage'
import type {
  CreateSandboxBotInput,
  CreateSandboxGroupInput,
  CreateSandboxUserInput,
  DeleteSandboxBotInput,
  DeleteSandboxGroupInput,
  DeleteSandboxUserInput,
  DeleteGroupAnnouncementInput,
  GetMediaContentInput,
  GetMessageHistoryInput,
  PerformFriendActionInput,
  PerformFriendActionResult,
  PerformGroupActionInput,
  PerformGroupActionResult,
  SandboxBotProfile,
  SandboxConversation,
  SandboxFriendship,
  SandboxGroup,
  SandboxMedia,
  SandboxMediaContent,
  SandboxMessage,
  SandboxMessageHistory,
  SandboxSnapshot,
  SandboxUser,
  SendMediaMessageInput,
  SendMessageInput,
  SendMessageResult,
  SetGroupAnnouncementInput,
  UpdateSandboxBotInput,
  UpdateSandboxGroupInput,
  UpdateSandboxUserInput,
} from './types'

export interface SandboxControlServiceOptions {
  mediaDirectory?: string
}

interface SandboxMessageContext {
  user: SandboxUser
  bot: SandboxBotProfile
  conversation: SandboxConversation
  group?: SandboxGroup
  reply?: SandboxMessage
  runtimeBot: SandboxBot
}

const DEFAULT_USER_ID = '10001'
const SECONDARY_USER_ID = '10002'
const ADMIN_USER_ID = '10003'
const DEFAULT_BOT_ID = '20001'
const DEFAULT_GROUP_ID = '30001'

function createDefaultScene(): SandboxSnapshot {
  const createdAt = new Date().toISOString()
  const directConversations: SandboxConversation[] = [
    DEFAULT_USER_ID,
    SECONDARY_USER_ID,
    ADMIN_USER_ID,
  ].map((userId) => ({
    id: `private:${userId}:${DEFAULT_BOT_ID}`,
    type: 'direct',
    userId,
    botId: DEFAULT_BOT_ID,
    messageIds: [],
  }))
  const groupConversations: SandboxConversation[] = [
    DEFAULT_USER_ID,
    SECONDARY_USER_ID,
    ADMIN_USER_ID,
  ].map((userId) => ({
    id: `group:${DEFAULT_GROUP_ID}:${userId}:${DEFAULT_BOT_ID}`,
    type: 'group',
    userId,
    botId: DEFAULT_BOT_ID,
    groupId: DEFAULT_GROUP_ID,
    messageIds: [],
  }))
  return {
    revision: 0,
    users: [
      { id: DEFAULT_USER_ID, name: '群主' },
      { id: SECONDARY_USER_ID, name: '管理员' },
      { id: ADMIN_USER_ID, name: '普通群员' },
    ],
    bots: [{
      id: DEFAULT_BOT_ID,
      name: 'Koishi',
      implementation: 'napcat',
      enabled: true,
    }],
    groups: [{
      id: DEFAULT_GROUP_ID,
      name: '测试群',
      members: [
        { participantId: DEFAULT_USER_ID, card: '群主', role: 'owner' },
        { participantId: SECONDARY_USER_ID, card: '管理员', role: 'admin' },
        { participantId: ADMIN_USER_ID, card: '普通群员', role: 'member' },
        { participantId: DEFAULT_BOT_ID, card: 'Koishi', role: 'admin' },
      ],
      announcements: [{
        id: 'announcement:welcome',
        authorId: DEFAULT_USER_ID,
        content: '欢迎使用测试群验证群聊插件功能',
        createdAt,
      }],
    }],
    conversations: [...directConversations, ...groupConversations],
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
  readonly bot: SandboxBot

  private scene: SandboxSnapshot = createDefaultScene()
  private runtimeBots = new Map<string, SandboxBot>()
  private mediaStorage: SandboxMediaStorage

  constructor(private ctx: Context, options: SandboxControlServiceOptions = {}) {
    this.mediaStorage = new SandboxMediaStorage(options.mediaDirectory ?? resolve(ctx.baseDir, 'data/onebot-sandbox/media'))
    this.bot = this.createRuntimeBot({
      selfId: DEFAULT_BOT_ID,
      name: 'Koishi',
    })
  }

  getSnapshot(): SandboxSnapshot {
    return structuredClone(this.scene)
  }

  getRuntimeBot(botId: string): SandboxBot {
    const bot = this.runtimeBots.get(botId)
    if (!bot) throw new Error(`机器人运行时不存在：${botId}`)
    return bot
  }

  getVisibleSnapshot(actorUserId: string, messageLimit = 50): SandboxSnapshot {
    this.getUser(actorUserId)
    const limit = this.validateMessageLimit(messageLimit)
    const conversations = this.scene.conversations
      .filter(({ userId }) => userId === actorUserId)
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
    const conversation = this.getVisibleConversation(input.actorUserId, input.conversationId)
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
    if (this.scene.users.some((user) => user.id === id) || this.scene.bots.some((bot) => bot.id === id)) {
      throw new Error(`参与者已存在：${id}`)
    }

    this.scene.users.push({ id, name })
    // 环境管理属于测试前置配置，可静默建立关系；WebQQ 用户操作仍必须走好友申请审批。
    for (const bot of this.scene.bots) this.addFriendship(id, bot.id)
    this.scene.revision += 1
  }

  updateUser(input: UpdateSandboxUserInput): void {
    const user = this.scene.users.find(({ id }) => id === input.id)
    if (!user) throw new Error(`用户不存在：${input.id}`)
    user.name = this.validateName(input.name, '用户昵称')
    this.scene.revision += 1
  }

  deleteUser(input: DeleteSandboxUserInput): void {
    const index = this.scene.users.findIndex(({ id }) => id === input.id)
    if (index < 0) throw new Error(`用户不存在：${input.id}`)
    this.scene.users.splice(index, 1)
    const ownedGroupIds = new Set(this.scene.groups
      .filter(({ members }) => members.some(({ participantId, role }) => participantId === input.id && role === 'owner'))
      .map(({ id }) => id))
    this.scene.groups = this.scene.groups.filter(({ id }) => !ownedGroupIds.has(id))
    for (const group of this.scene.groups) {
      group.members = group.members.filter(({ participantId }) => participantId !== input.id)
      group.announcements = group.announcements.filter(({ authorId }) => authorId !== input.id)
    }
    this.scene.requests = this.scene.requests.filter(({ requesterId, targetId }) => requesterId !== input.id && targetId !== input.id)
    this.scene.friendships = this.scene.friendships.filter(({ participantIds }) => !participantIds.includes(input.id))
    this.deleteConversations((conversation) => conversation.userId === input.id
      || (!!conversation.groupId && ownedGroupIds.has(conversation.groupId)))
    this.scene.revision += 1
  }

  createBot(input: CreateSandboxBotInput): void {
    const id = this.validateParticipantId(input.id)
    const name = this.validateName(input.name, '机器人昵称')
    if (this.scene.users.some((user) => user.id === id) || this.scene.bots.some((bot) => bot.id === id)) {
      throw new Error(`参与者已存在：${id}`)
    }

    this.scene.bots.push({
      id,
      name,
      implementation: input.implementation,
      enabled: input.enabled,
    })
    this.createRuntimeBot({ selfId: id, name })
    for (const user of this.scene.users) {
      this.addFriendship(user.id, id)
    }
    this.scene.revision += 1
  }

  updateBot(input: UpdateSandboxBotInput): void {
    const bot = this.scene.bots.find(({ id }) => id === input.id)
    if (!bot) throw new Error(`机器人不存在：${input.id}`)
    bot.name = this.validateName(input.name, '机器人昵称')
    bot.implementation = input.implementation
    bot.enabled = input.enabled
    const runtime = this.runtimeBots.get(bot.id)
    if (runtime) {
      runtime.user = { id: bot.id, name: bot.name }
      runtime.status = bot.enabled ? Universal.Status.ONLINE : Universal.Status.OFFLINE
    }
    this.scene.revision += 1
  }

  deleteBot(input: DeleteSandboxBotInput): void {
    const index = this.scene.bots.findIndex(({ id }) => id === input.id)
    if (index < 0) throw new Error(`机器人不存在：${input.id}`)
    this.scene.bots.splice(index, 1)
    const runtime = this.runtimeBots.get(input.id)
    this.runtimeBots.delete(input.id)
    void runtime?.dispose()
    for (const group of this.scene.groups) {
      group.members = group.members.filter(({ participantId }) => participantId !== input.id)
    }
    this.scene.requests = this.scene.requests.filter(({ targetId }) => targetId !== input.id)
    this.scene.friendships = this.scene.friendships.filter(({ participantIds }) => !participantIds.includes(input.id))
    this.deleteConversations((conversation) => conversation.botId === input.id)
    this.scene.revision += 1
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
    this.scene.revision += 1
  }

  updateGroup(input: UpdateSandboxGroupInput): void {
    const group = this.scene.groups.find(({ id }) => id === input.id)
    if (!group) throw new Error(`群组不存在：${input.id}`)
    group.name = this.validateName(input.name, '群名称')
    group.members = this.validateGroupMembers(input.members)
    this.syncGroupConversations(group.id)
    this.scene.revision += 1
  }

  deleteGroup(input: DeleteSandboxGroupInput): void {
    const index = this.scene.groups.findIndex(({ id }) => id === input.id)
    if (index < 0) throw new Error(`群组不存在：${input.id}`)
    this.scene.groups.splice(index, 1)
    this.scene.requests = this.scene.requests.filter(({ groupId }) => groupId !== input.id)
    this.deleteConversations((conversation) => conversation.groupId === input.id)
    this.scene.revision += 1
  }

  async performFriendAction(input: PerformFriendActionInput): Promise<PerformFriendActionResult> {
    this.getUser(input.actorUserId)
    if (input.action === 'handle-request') {
      return this.handleUserRelationshipRequest(input)
    }

    const target = this.getParticipant(input.targetId)
    if (target.id === input.actorUserId) throw new Error('不能对自己执行好友操作')
    const friendship = this.getFriendship(input.actorUserId, target.id)

    if (input.action === 'request') {
      if (friendship) throw new Error('已经是好友关系')
      if (this.scene.requests.some(({ type, requesterId, targetId }) => type === 'friend'
        && ((requesterId === input.actorUserId && targetId === target.id)
          || (requesterId === target.id && targetId === input.actorUserId)))) {
        throw new Error('双方已有待处理的好友申请')
      }
      const request = {
        id: `request:friend:${Random.id()}`,
        type: 'friend' as const,
        requesterId: input.actorUserId,
        targetId: target.id,
        status: 'pending' as const,
        createdAt: new Date().toISOString(),
        comment: input.comment?.trim() || undefined,
      }
      this.scene.requests.push(request)
      this.scene.revision += 1
      if (this.isBot(target.id)) await this.dispatchFriendRequest(target.id, input.actorUserId, request.id, request.comment)
      return { revision: this.scene.revision, requestId: request.id }
    }

    if (!friendship) throw new Error('好友关系不存在')
    if (input.action === 'set-remark') {
      const remark = input.remark.trim()
      if (remark) friendship.remarks[input.actorUserId] = remark
      else delete friendship.remarks[input.actorUserId]
      this.scene.revision += 1
      return { revision: this.scene.revision }
    }

    if (input.action === 'poke') {
      if (this.isBot(target.id)) await this.dispatchBotNotice(target.id, input.actorUserId, 'notify')
      const conversation = input.conversationId
        ? this.getVisibleConversation(input.actorUserId, input.conversationId)
        : this.scene.conversations.find(({ type, userId, botId }) => type === 'direct' && userId === input.actorUserId && botId === target.id)
      if (!conversation) throw new Error('戳一戳必须在可见会话中发起')
      const group = conversation.groupId
        ? this.scene.groups.find(({ id }) => id === conversation.groupId)
        : undefined
      if (group && !group.members.some(({ participantId }) => participantId === target.id)) {
        throw new Error('目标用户不在当前群组中')
      }
      if (!group && conversation.botId !== target.id) throw new Error('目标用户不在当前私聊中')
      const getDisplayName = (participantId: string) => group?.members.find((member) => member.participantId === participantId)?.card
        || this.getParticipant(participantId).name
      this.appendMessage(
        input.actorUserId,
        conversation.id,
        `${getDisplayName(input.actorUserId)} 戳了戳 ${getDisplayName(target.id)}`,
        undefined,
        undefined,
        { type: 'poke', targetId: target.id },
      )
      return { revision: this.scene.revision }
    }

    if (input.action !== 'delete') throw new Error(`不支持的好友操作：${Reflect.get(input, 'action') ?? 'unknown'}`)

    this.scene.friendships = this.scene.friendships.filter(({ id }) => id !== friendship.id)
    if (this.isBot(target.id)) {
      this.deleteConversations(({ type, userId, botId }) => type === 'direct' && userId === input.actorUserId && botId === target.id)
      await this.dispatchBotNotice(target.id, input.actorUserId, 'friend_del')
    }
    this.scene.revision += 1
    return { revision: this.scene.revision }
  }

  async performGroupAction(input: PerformGroupActionInput): Promise<PerformGroupActionResult> {
    this.getUser(input.actorUserId)
    if (input.action === 'handle-request') return this.handleUserGroupRequest(input)

    const group = this.scene.groups.find(({ id }) => id === input.groupId)
    if (!group) throw new Error(`群组不存在：${input.groupId}`)

    if (input.action === 'request-join') {
      if (group.members.some(({ participantId }) => participantId === input.actorUserId)) throw new Error('已经是群成员')
      if (this.scene.requests.some(({ type, subType, requesterId, groupId }) => type === 'group'
        && (subType ?? 'add') === 'add' && requesterId === input.actorUserId && groupId === group.id)) {
        throw new Error('已有待处理的入群申请')
      }
      const request = {
        id: `request:group:${Random.id()}`,
        type: 'group' as const,
        subType: 'add' as const,
        requesterId: input.actorUserId,
        groupId: group.id,
        status: 'pending' as const,
        createdAt: new Date().toISOString(),
        comment: input.comment?.trim() || undefined,
      }
      this.scene.requests.push(request)
      this.scene.revision += 1
      await this.dispatchGroupRequest(group, request)
      return { revision: this.scene.revision, requestId: request.id }
    }

    const actor = this.requireGroupMember(group, input.actorUserId)
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
        requesterId: input.actorUserId,
        targetId: target.id,
        groupId: group.id,
        status: 'pending' as const,
        createdAt: new Date().toISOString(),
        comment: input.comment?.trim() || undefined,
      }
      this.scene.requests.push(request)
      this.scene.revision += 1
      await this.dispatchGroupRequest(group, request)
      return { revision: this.scene.revision, requestId: request.id }
    }

    if (input.action === 'leave') {
      if (actor.role === 'owner') throw new Error('群主不能直接退出群组')
      await this.dispatchGroupNotice(group, 'group_decrease', {
        sub_type: 'leave',
        operator_id: Number(input.actorUserId),
        user_id: Number(input.actorUserId),
      })
      this.removeGroupMember(group, input.actorUserId)
      return { revision: this.scene.revision }
    }

    if (input.action === 'set-name') {
      if (actor.role === 'member') throw new Error('只有群主或管理员可以修改群名称')
      const previousName = group.name
      group.name = this.validateName(input.name, '群名称')
      this.scene.revision += 1
      await this.dispatchGroupNotice(group, 'group_name', {
        user_id: Number(input.actorUserId),
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
        operator_id: Number(input.actorUserId),
        user_id: Number(target.participantId),
      }))
      this.removeGroupMember(group, target.participantId)
      return { revision: this.scene.revision }
    }

    if (input.action === 'set-admin') {
      if (actor.role !== 'owner') throw new Error('只有群主可以设置管理员')
      if (target.role === 'owner') throw new Error('不能修改群主权限')
      if (this.isBot(target.participantId)) throw new Error('机器人不能设置为管理员')
      target.role = input.enabled ? 'admin' : 'member'
      this.scene.revision += 1
      await this.dispatchGroupNotice(group, 'group_admin', {
        sub_type: input.enabled ? 'set' : 'unset',
        user_id: Number(target.participantId),
      })
      return { revision: this.scene.revision }
    }

    if (input.action === 'set-card') {
      if (target.participantId !== input.actorUserId) this.assertCanManageMember(actor, target, '修改群名片')
      const previousCard = target.card ?? ''
      target.card = input.card.trim() || undefined
      this.scene.revision += 1
      await this.dispatchGroupNotice(group, 'group_card', {
        user_id: Number(target.participantId),
        card_old: previousCard,
        card_new: target.card ?? '',
      })
      return { revision: this.scene.revision }
    }

    if (input.action !== 'poke') throw new Error(`不支持的群组操作：${Reflect.get(input, 'action') ?? 'unknown'}`)
    const conversation = input.conversationId
      ? this.getVisibleConversation(input.actorUserId, input.conversationId)
      : this.scene.conversations.find(({ userId, groupId }) => userId === input.actorUserId && groupId === group.id)
    if (!conversation || conversation.groupId !== group.id) throw new Error('群内戳一戳必须在当前群会话中发起')
    await this.dispatchGroupNotice(group, 'notify', {
      sub_type: 'poke',
      user_id: Number(input.actorUserId),
      target_id: Number(target.participantId),
    })
    const getDisplayName = (participantId: string) => group.members.find((member) => member.participantId === participantId)?.card
      || this.getParticipant(participantId).name
    this.appendMessage(
      input.actorUserId,
      conversation.id,
      `${getDisplayName(input.actorUserId)} 戳了戳 ${getDisplayName(target.participantId)}`,
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
    this.scene.revision += 1
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
      this.scene.revision += 1
    }
    return { status: 'ok', retcode: 0, data: null }
  }

  async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    if (!input.content.trim()) throw new Error('消息内容不能为空')
    const context = this.getMessageContext(input)
    const senderId = input.senderId ?? context.user.id
    if (senderId !== context.user.id && senderId !== context.bot.id) throw new Error(`发送者不在当前会话中：${senderId}`)
    const message = this.appendMessage(senderId, context.conversation.id, input.content.trim(), input.replyToMessageId)
    if (senderId === context.bot.id) return { messageId: message.id, revision: this.scene.revision }
    return this.dispatchUserMessage(context, message, h.parse(message.content), [
      ...(context.reply ? [{ type: 'reply', data: { id: context.reply.id } }] : []),
      { type: 'text', data: { text: message.content } },
    ], `${context.reply ? `[CQ:reply,id=${context.reply.id}]` : ''}${message.content}`)
  }

  async sendMediaMessage(input: SendMediaMessageInput): Promise<SendMessageResult> {
    const context = this.getMessageContext(input)
    const senderId = input.senderId ?? context.user.id
    if (senderId !== context.user.id && senderId !== context.bot.id) throw new Error(`发送者不在当前会话中：${senderId}`)
    const media = this.mediaStorage.save(input)
    const content = input.content?.trim() || `[${this.getMediaLabel(media)}] ${media.name}`
    const message = this.appendMessage(senderId, context.conversation.id, content, input.replyToMessageId, [media])
    if (senderId === context.bot.id) return { messageId: message.id, revision: this.scene.revision }
    const elementType = media.type === 'image' ? 'img' : media.type
    const mediaElement = h(elementType, {
      src: media.reference,
      file: media.reference,
      title: media.name,
      mime: media.mimeType,
      size: media.size,
    })
    const elements = [mediaElement, ...(input.content?.trim() ? [h.text(input.content.trim())] : [])]
    const onebotType = media.type === 'audio' ? 'record' : media.type
    return this.dispatchUserMessage(context, message, elements, [
      ...(context.reply ? [{ type: 'reply', data: { id: context.reply.id } }] : []),
      { type: onebotType, data: { file: media.reference } },
      ...(input.content?.trim() ? [{ type: 'text', data: { text: input.content.trim() } }] : []),
    ], `${context.reply ? `[CQ:reply,id=${context.reply.id}]` : ''}[CQ:${onebotType},file=${media.reference}]${input.content?.trim() ?? ''}`)
  }

  getMediaContent(input: GetMediaContentInput): SandboxMediaContent {
    const visibleConversationIds = new Set(this.scene.conversations
      .filter(({ userId }) => userId === input.actorUserId)
      .map(({ id }) => id))
    this.getUser(input.actorUserId)
    const media = this.scene.messages
      .filter(({ conversationId }) => visibleConversationIds.has(conversationId))
      .flatMap(({ media }) => media ?? [])
      .find(({ id }) => id === input.mediaId)
    if (!media) throw new Error(`媒体不存在或不可见：${input.mediaId}`)
    return this.mediaStorage.read(media)
  }

  private async dispatchUserMessage(
    context: SandboxMessageContext,
    message: SandboxMessage,
    elements: ReturnType<typeof h>[],
    onebotMessage: Array<{ type: string; data: Record<string, string> }>,
    rawMessage: string,
  ): Promise<SendMessageResult> {
    const session = context.runtimeBot.session({
      type: 'message',
      timestamp: Date.now(),
      user: { id: context.user.id, name: context.user.name },
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
        self_id: Number(context.bot.id),
        post_type: 'message',
        message_type: context.conversation.type === 'group' ? 'group' : 'private',
        sub_type: context.conversation.type === 'group' ? 'normal' : 'friend',
        message_id: Number.parseInt(message.id, 16),
        user_id: Number(context.user.id),
        group_id: context.group ? Number(context.group.id) : undefined,
        message: onebotMessage,
        raw_message: rawMessage,
        sender: { user_id: Number(context.user.id), nickname: context.user.name },
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

    context.runtimeBot.dispatch(session)
    await middlewareFinished

    return {
      messageId: message.id,
      revision: this.scene.revision,
    }
  }

  setGroupAnnouncement(input: SetGroupAnnouncementInput): void {
    const user = this.scene.users.find(({ id }) => id === input.actorUserId)
    const group = this.scene.groups.find(({ id }) => id === input.groupId)
    if (!user) throw new Error(`用户不存在：${input.actorUserId}`)
    if (!group) throw new Error(`群组不存在：${input.groupId}`)
    if (!group.members.some(({ participantId }) => participantId === user.id)) {
      throw new Error(`用户不在群组中：${input.actorUserId}`)
    }
    const content = input.content.trim()
    if (!content) throw new Error('群公告不能为空')

    group.announcements.unshift({
      id: Random.id(),
      authorId: user.id,
      content,
      createdAt: new Date().toISOString(),
    })
    this.scene.revision += 1
  }

  deleteGroupAnnouncement(input: DeleteGroupAnnouncementInput): void {
    const user = this.scene.users.find(({ id }) => id === input.actorUserId)
    const group = this.scene.groups.find(({ id }) => id === input.groupId)
    if (!user) throw new Error(`用户不存在：${input.actorUserId}`)
    if (!group) throw new Error(`群组不存在：${input.groupId}`)
    if (!group.members.some(({ participantId }) => participantId === user.id)) {
      throw new Error(`用户不在群组中：${input.actorUserId}`)
    }

    const index = group.announcements.findIndex(({ id }) => id === input.announcementId)
    if (index < 0) throw new Error(`群公告不存在：${input.announcementId}`)
    group.announcements.splice(index, 1)
    this.scene.revision += 1
  }

  recordBotMessage(conversationId: string, content: string): SandboxMessage {
    const conversation = this.scene.conversations.find(({ id }) => id === conversationId)
    if (!conversation) throw new Error(`会话不存在：${conversationId}`)
    return this.appendMessage(conversation.botId, conversation.id, content)
  }

  private appendMessage(
    authorId: string,
    conversationId: string,
    content: string,
    replyToMessageId?: string,
    media?: SandboxMedia[],
    event?: SandboxMessage['event'],
  ): SandboxMessage {
    const conversation = this.scene.conversations.find(({ id }) => id === conversationId)
    if (!conversation) throw new Error(`会话不存在：${conversationId}`)

    const message: SandboxMessage = {
      id: Random.id(),
      authorId,
      botId: conversation.botId,
      conversationId,
      content,
      createdAt: new Date().toISOString(),
      replyToMessageId,
      media,
      event,
    }
    this.scene.messages.push(message)
    conversation.messageIds.push(message.id)
    this.scene.revision += 1
    return message
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

  private getUser(userId: string) {
    const user = this.scene.users.find(({ id }) => id === userId)
    if (!user) throw new Error(`用户不存在：${userId}`)
    return user
  }

  private getVisibleConversation(actorUserId: string, conversationId: string) {
    this.getUser(actorUserId)
    const conversation = this.scene.conversations.find(({ id, userId }) => id === conversationId && userId === actorUserId)
    if (!conversation) throw new Error(`会话不存在：${conversationId}`)
    return conversation
  }

  private getMessageContext(input: Pick<SendMessageInput, 'actorUserId' | 'botId' | 'conversationId' | 'replyToMessageId'>): SandboxMessageContext {
    const user = this.scene.users.find(({ id }) => id === input.actorUserId)
    const bot = this.scene.bots.find(({ id }) => id === input.botId)
    const conversation = this.scene.conversations.find(({ id }) => id === input.conversationId)
    if (!user) throw new Error(`用户不存在：${input.actorUserId}`)
    if (!bot) throw new Error(`机器人不存在：${input.botId}`)
    if (!bot.enabled) throw new Error(`机器人已停用：${input.botId}`)
    if (!conversation || conversation.userId !== user.id || conversation.botId !== bot.id) {
      throw new Error(`会话不存在：${input.conversationId}`)
    }
    const group = conversation.groupId
      ? this.scene.groups.find(({ id }) => id === conversation.groupId)
      : undefined
    if (conversation.type === 'group' && (!group
      || !group.members.some(({ participantId }) => participantId === user.id)
      || !group.members.some(({ participantId }) => participantId === bot.id))) {
      throw new Error(`群聊关系不存在：${input.conversationId}`)
    }
    const reply = input.replyToMessageId
      ? this.scene.messages.find(({ id, conversationId }) => id === input.replyToMessageId && conversationId === conversation.id)
      : undefined
    if (input.replyToMessageId && !reply) throw new Error(`回复消息不存在：${input.replyToMessageId}`)
    const runtimeBot = this.runtimeBots.get(bot.id)
    if (!runtimeBot) throw new Error(`机器人运行时不存在：${bot.id}`)
    return { user, bot, conversation, group, reply, runtimeBot }
  }

  private getMediaLabel(media: SandboxMedia): string {
    return media.type === 'image' ? '图片' : media.type === 'audio' ? '语音' : media.type === 'video' ? '视频' : '文件'
  }

  private validateMessageLimit(value: number) {
    if (!Number.isInteger(value) || value < 1 || value > 100) throw new Error('消息分页大小必须在 1 到 100 之间')
    return value
  }

  private createRuntimeBot(config: SandboxBot.Config) {
    const bot = new SandboxBot(this.ctx, this, config)
    this.runtimeBots.set(config.selfId, bot)
    return bot
  }

  private handleUserRelationshipRequest(input: Extract<PerformFriendActionInput, { action: 'handle-request' }>): PerformFriendActionResult | Promise<PerformGroupActionResult> {
    const requestIndex = this.scene.requests.findIndex(({ id }) => id === input.requestId)
    if (requestIndex < 0) throw new Error(`关系申请不存在：${input.requestId}`)
    const request = this.scene.requests[requestIndex]
    if (request.type === 'friend') {
      if (this.isBot(request.targetId)) throw new Error('机器人申请必须由机器人处理')
      if (request.targetId !== input.actorUserId) throw new Error('只能处理发给自己的好友申请')
      this.scene.requests.splice(requestIndex, 1)
      if (input.approve) this.addFriendship(request.requesterId, input.actorUserId)
      this.scene.revision += 1
      return { revision: this.scene.revision }
    }

    return this.handleUserGroupRequest({
      action: 'handle-request',
      actorUserId: input.actorUserId,
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
      if (request.targetId !== input.actorUserId) throw new Error('只能处理发给自己的群邀请')
    } else {
      const operator = this.requireGroupMember(group, input.actorUserId)
      if (operator.role !== 'owner' && operator.role !== 'admin') throw new Error('只有群主或管理员可以处理入群申请')
    }

    this.scene.requests.splice(requestIndex, 1)
    if (input.approve) {
      const participantId = subType === 'invite' ? request.targetId : request.requesterId
      if (!participantId) throw new Error('群申请缺少目标参与者')
      await this.addApprovedGroupMember(group, participantId, input.actorUserId, subType)
    } else {
      this.scene.revision += 1
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

  private async addApprovedGroupMember(group: SandboxGroup, participantId: string, operatorId: string, subType: 'add' | 'invite') {
    this.getParticipant(participantId)
    if (!group.members.some((member) => member.participantId === participantId)) {
      group.members.push({ participantId, role: 'member' })
      this.syncGroupConversations(group.id)
    }
    this.scene.revision += 1
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
    this.scene.revision += 1
  }

  private addFriendship(firstId: string, secondId: string): SandboxFriendship {
    const existing = this.getFriendship(firstId, secondId)
    if (existing) return existing
    const friendship = createFriendship(firstId, secondId)
    this.scene.friendships.push(friendship)
    const userId = this.isBot(firstId) ? secondId : firstId
    const botId = this.isBot(firstId) ? firstId : this.isBot(secondId) ? secondId : undefined
    if (botId && !this.scene.conversations.some(({ id }) => id === `private:${userId}:${botId}`)) {
      this.scene.conversations.push({
        id: `private:${userId}:${botId}`,
        type: 'direct',
        userId,
        botId,
        messageIds: [],
      })
    }
    return friendship
  }

  private getFriendship(firstId: string, secondId: string) {
    return this.scene.friendships.find(({ participantIds }) => participantIds.includes(firstId) && participantIds.includes(secondId))
  }

  private getParticipant(id: string): SandboxUser | SandboxBotProfile {
    const user = this.scene.users.find((item) => item.id === id)
    const bot = this.scene.bots.find((item) => item.id === id)
    if (user) return user
    if (bot) return bot
    throw new Error(`参与者不存在：${id}`)
  }

  private isBot(id: string | undefined): boolean {
    return !!id && this.scene.bots.some((bot) => bot.id === id)
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
    await bot.dispatch(session)
  }

  private async dispatchBotNotice(botId: string, userId: string, noticeType: 'notify' | 'friend_del') {
    const bot = this.runtimeBots.get(botId)
    if (!bot) throw new Error(`机器人运行时不存在：${botId}`)
    const session = bot.session({
      type: 'notice',
      timestamp: Date.now(),
      user: { id: userId, name: this.getUser(userId).name },
    })
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
    await bot.dispatch(session)
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
      await bot.dispatch(session)
    }))
  }

  private async dispatchGroupNotice(
    group: SandboxGroup,
    noticeType: string,
    data: Record<string, unknown> | ((botId: string) => Record<string, unknown>),
  ) {
    const botIds = group.members.flatMap(({ participantId }) => this.isBot(participantId) ? [participantId] : [])
    await Promise.all(botIds.map(async (botId) => {
      const bot = this.getRuntimeBot(botId)
      const session = bot.session({
        type: 'notice',
        timestamp: Date.now(),
        guild: { id: group.id, name: group.name },
      })
      Object.assign(session, {
        onebot: {
          time: Math.floor(Date.now() / 1000),
          self_id: Number(botId),
          post_type: 'notice',
          notice_type: noticeType,
          group_id: Number(group.id),
          ...(typeof data === 'function' ? data(botId) : data),
        },
      })
      await bot.dispatch(session)
    }))
  }

  private deleteConversations(predicate: (conversation: SandboxSnapshot['conversations'][number]) => boolean): void {
    const removedIds = new Set(this.scene.conversations.filter(predicate).map(({ id }) => id))
    for (const media of this.scene.messages
      .filter(({ conversationId }) => removedIds.has(conversationId))
      .flatMap(({ media }) => media ?? [])) {
      this.mediaStorage.remove(media)
    }
    this.scene.conversations = this.scene.conversations.filter(({ id }) => !removedIds.has(id))
    this.scene.messages = this.scene.messages.filter(({ conversationId }) => !removedIds.has(conversationId))
  }

  private validateGroupMembers(members: SandboxSnapshot['groups'][number]['members']) {
    const participantIds = new Set<string>()
    let ownerId = ''
    const result = members.map((member) => {
      if (participantIds.has(member.participantId)) throw new Error(`群成员重复：${member.participantId}`)
      const user = this.scene.users.find(({ id }) => id === member.participantId)
      const bot = this.scene.bots.find(({ id }) => id === member.participantId)
      if (!user && !bot) throw new Error(`群成员不存在：${member.participantId}`)
      if (member.role === 'owner') {
        if (!user) throw new Error('群主必须是普通用户')
        if (ownerId) throw new Error('群组只能有一个群主')
        ownerId = member.participantId
      }
      participantIds.add(member.participantId)
      return {
        participantId: member.participantId,
        card: member.card?.trim() || undefined,
        role: member.role,
      }
    })
    if (!ownerId) throw new Error('群组必须有一个群主')
    return result
  }

  private syncGroupConversations(groupId: string): void {
    const group = this.scene.groups.find(({ id }) => id === groupId)
    if (!group) return
    const userIds = group.members
      .filter(({ participantId }) => this.scene.users.some(({ id }) => id === participantId))
      .map(({ participantId }) => participantId)
    const botIds = group.members
      .filter(({ participantId }) => this.scene.bots.some(({ id }) => id === participantId))
      .map(({ participantId }) => participantId)
    const desiredIds = new Set(userIds.flatMap((userId) => botIds.map((botId) => `group:${groupId}:${userId}:${botId}`)))
    this.deleteConversations((conversation) => conversation.groupId === groupId && !desiredIds.has(conversation.id))
    for (const userId of userIds) {
      for (const botId of botIds) {
        const id = `group:${groupId}:${userId}:${botId}`
        if (this.scene.conversations.some((conversation) => conversation.id === id)) continue
        this.scene.conversations.push({
          id,
          type: 'group',
          userId,
          botId,
          groupId,
          messageIds: [],
        })
      }
    }
  }
}
