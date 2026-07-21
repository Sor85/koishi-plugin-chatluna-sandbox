import { Context, h, Random, Universal } from 'koishi'
import { SandboxBot } from './bot'
import type {
  CreateSandboxBotInput,
  CreateSandboxGroupInput,
  CreateSandboxUserInput,
  DeleteSandboxBotInput,
  DeleteSandboxGroupInput,
  DeleteSandboxUserInput,
  DeleteGroupAnnouncementInput,
  GetMessageHistoryInput,
  SandboxConversation,
  SandboxMessage,
  SandboxMessageHistory,
  SandboxSnapshot,
  SendMessageInput,
  SendMessageResult,
  SetGroupAnnouncementInput,
  UpdateSandboxBotInput,
  UpdateSandboxGroupInput,
  UpdateSandboxUserInput,
} from './types'

const DEFAULT_USER_ID = '10001'
const SECONDARY_USER_ID = '10002'
const ADMIN_USER_ID = '10003'
const APPLICANT_USER_ID = '10004'
const DEFAULT_BOT_ID = '20001'
const DEFAULT_GROUP_ID = '30001'

function createDefaultScene(): SandboxSnapshot {
  const createdAt = new Date().toISOString()
  const directConversations: SandboxConversation[] = [
    DEFAULT_USER_ID,
    SECONDARY_USER_ID,
    ADMIN_USER_ID,
    APPLICANT_USER_ID,
  ].map((userId) => ({
    id: `private:${userId}:${DEFAULT_BOT_ID}`,
    type: 'direct',
    userId,
    botId: DEFAULT_BOT_ID,
    messageIds: [],
  }))
  const groupConversations: SandboxConversation[] = [
    DEFAULT_USER_ID,
    ADMIN_USER_ID,
    SECONDARY_USER_ID,
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
      { id: DEFAULT_USER_ID, name: '测试用户' },
      { id: SECONDARY_USER_ID, name: '协作用户' },
      { id: ADMIN_USER_ID, name: '管理用户' },
      { id: APPLICANT_USER_ID, name: '申请用户' },
    ],
    bots: [{
      id: DEFAULT_BOT_ID,
      name: 'OneBot Sandbox',
      implementation: 'napcat',
      enabled: true,
    }],
    groups: [{
      id: DEFAULT_GROUP_ID,
      name: 'OneBot 测试群',
      members: [
        { participantId: DEFAULT_USER_ID, card: '测试群主', role: 'owner' },
        { participantId: ADMIN_USER_ID, card: '管理用户', role: 'admin' },
        { participantId: SECONDARY_USER_ID, card: '协作用户', role: 'member' },
        { participantId: DEFAULT_BOT_ID, card: 'OneBot Sandbox', role: 'member' },
      ],
      announcements: [{
        id: 'announcement:welcome',
        authorId: DEFAULT_USER_ID,
        content: '欢迎使用 OneBot Sandbox 验证群聊插件功能',
        createdAt,
      }],
    }],
    conversations: [...directConversations, ...groupConversations],
    messages: [],
    requests: [{
      id: `request:friend:${APPLICANT_USER_ID}:${DEFAULT_BOT_ID}`,
      type: 'friend',
      requesterId: APPLICANT_USER_ID,
      targetId: DEFAULT_BOT_ID,
      status: 'pending',
      createdAt,
    }, {
      id: `request:group:${APPLICANT_USER_ID}:${DEFAULT_GROUP_ID}`,
      type: 'group',
      requesterId: APPLICANT_USER_ID,
      groupId: DEFAULT_GROUP_ID,
      status: 'pending',
      createdAt,
    }],
  }
}

export class SandboxControlService {
  readonly bot: SandboxBot

  private scene: SandboxSnapshot = createDefaultScene()
  private runtimeBots = new Map<string, SandboxBot>()

  constructor(private ctx: Context) {
    this.bot = this.createRuntimeBot({
      selfId: DEFAULT_BOT_ID,
      name: 'OneBot Sandbox',
    })
  }

  getSnapshot(): SandboxSnapshot {
    return structuredClone(this.scene)
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
    const visibleGroupIds = new Set(conversations.flatMap(({ groupId }) => groupId ? [groupId] : []))

    return structuredClone({
      ...this.scene,
      groups: this.scene.groups.filter(({ id }) => visibleGroupIds.has(id)),
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
    for (const bot of this.scene.bots) {
      this.scene.conversations.push({
        id: `private:${id}:${bot.id}`,
        type: 'direct',
        userId: id,
        botId: bot.id,
        messageIds: [],
      })
    }
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
      this.scene.conversations.push({
        id: `private:${user.id}:${id}`,
        type: 'direct',
        userId: user.id,
        botId: id,
        messageIds: [],
      })
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

  async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
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
    if (!input.content.trim()) throw new Error('消息内容不能为空')
    const reply = input.replyToMessageId
      ? this.scene.messages.find(({ id, conversationId }) => id === input.replyToMessageId && conversationId === conversation.id)
      : undefined
    if (input.replyToMessageId && !reply) throw new Error(`回复消息不存在：${input.replyToMessageId}`)

    const runtimeBot = this.runtimeBots.get(bot.id)
    if (!runtimeBot) throw new Error(`机器人运行时不存在：${bot.id}`)
    const message = this.appendMessage(user.id, conversation.id, input.content.trim(), input.replyToMessageId)
    const session = runtimeBot.session({
      type: 'message',
      timestamp: Date.now(),
      user: { id: user.id, name: user.name },
      channel: {
        id: conversation.id,
        type: conversation.type === 'group' ? Universal.Channel.Type.TEXT : Universal.Channel.Type.DIRECT,
      },
      guild: group ? { id: group.id, name: group.name } : undefined,
      message: {
        id: message.id,
        messageId: message.id,
        content: message.content,
        elements: h.parse(message.content),
        quote: reply ? {
          id: reply.id,
          messageId: reply.id,
          content: reply.content,
          user: { id: reply.authorId },
        } : undefined,
      },
    })
    Object.assign(session, {
      onebot: {
        time: Math.floor(Date.now() / 1000),
        self_id: Number(bot.id),
        post_type: 'message',
        message_type: conversation.type === 'group' ? 'group' : 'private',
        sub_type: conversation.type === 'group' ? 'normal' : 'friend',
        message_id: Number.parseInt(message.id, 16),
        user_id: Number(user.id),
        group_id: group ? Number(group.id) : undefined,
        message: [
          ...(reply ? [{ type: 'reply', data: { id: reply.id } }] : []),
          { type: 'text', data: { text: message.content } },
        ],
        raw_message: `${reply ? `[CQ:reply,id=${reply.id}]` : ''}${message.content}`,
        sender: { user_id: Number(user.id), nickname: user.name },
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

    runtimeBot.dispatch(session)
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

  private appendMessage(authorId: string, conversationId: string, content: string, replyToMessageId?: string): SandboxMessage {
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

  private validateMessageLimit(value: number) {
    if (!Number.isInteger(value) || value < 1 || value > 100) throw new Error('消息分页大小必须在 1 到 100 之间')
    return value
  }

  private createRuntimeBot(config: SandboxBot.Config) {
    const bot = new SandboxBot(this.ctx, this, config)
    this.runtimeBots.set(config.selfId, bot)
    return bot
  }

  private deleteConversations(predicate: (conversation: SandboxSnapshot['conversations'][number]) => boolean): void {
    const removedIds = new Set(this.scene.conversations.filter(predicate).map(({ id }) => id))
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
