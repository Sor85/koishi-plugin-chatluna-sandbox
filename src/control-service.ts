import { Context, h, Random, Universal } from 'koishi'
import { SandboxBot } from './bot'
import type {
  DeleteGroupAnnouncementInput,
  SandboxMessage,
  SandboxSnapshot,
  SendMessageInput,
  SendMessageResult,
  SetGroupAnnouncementInput,
} from './types'

const DEFAULT_USER_ID = '10001'
const SECONDARY_USER_ID = '10002'
const DEFAULT_BOT_ID = '20001'
const DEFAULT_GROUP_ID = '30001'
const DEFAULT_CONVERSATION_ID = `private:${DEFAULT_USER_ID}:${DEFAULT_BOT_ID}`
const SECONDARY_CONVERSATION_ID = `private:${SECONDARY_USER_ID}:${DEFAULT_BOT_ID}`
const DEFAULT_GROUP_CONVERSATION_ID = `group:${DEFAULT_GROUP_ID}:${DEFAULT_USER_ID}:${DEFAULT_BOT_ID}`
const SECONDARY_GROUP_CONVERSATION_ID = `group:${DEFAULT_GROUP_ID}:${SECONDARY_USER_ID}:${DEFAULT_BOT_ID}`

export class SandboxControlService {
  readonly bot: SandboxBot

  private scene: SandboxSnapshot = {
    revision: 0,
    users: [
      { id: DEFAULT_USER_ID, name: '测试用户' },
      { id: SECONDARY_USER_ID, name: '协作用户' },
    ],
    bots: [{ id: DEFAULT_BOT_ID, name: 'OneBot Sandbox' }],
    groups: [{
      id: DEFAULT_GROUP_ID,
      name: 'OneBot 测试群',
      members: [
        { participantId: DEFAULT_USER_ID, card: '测试群主', role: 'owner' },
        { participantId: SECONDARY_USER_ID, card: '协作用户', role: 'member' },
        { participantId: DEFAULT_BOT_ID, card: 'OneBot Sandbox', role: 'member' },
      ],
      announcements: [{
        id: 'announcement:welcome',
        authorId: DEFAULT_USER_ID,
        content: '欢迎使用 OneBot Sandbox 验证群聊插件功能',
        createdAt: new Date().toISOString(),
      }],
    }],
    conversations: [{
      id: DEFAULT_CONVERSATION_ID,
      type: 'direct',
      userId: DEFAULT_USER_ID,
      botId: DEFAULT_BOT_ID,
      messageIds: [],
    }, {
      id: SECONDARY_CONVERSATION_ID,
      type: 'direct',
      userId: SECONDARY_USER_ID,
      botId: DEFAULT_BOT_ID,
      messageIds: [],
    }, {
      id: DEFAULT_GROUP_CONVERSATION_ID,
      type: 'group',
      userId: DEFAULT_USER_ID,
      botId: DEFAULT_BOT_ID,
      groupId: DEFAULT_GROUP_ID,
      messageIds: [],
    }, {
      id: SECONDARY_GROUP_CONVERSATION_ID,
      type: 'group',
      userId: SECONDARY_USER_ID,
      botId: DEFAULT_BOT_ID,
      groupId: DEFAULT_GROUP_ID,
      messageIds: [],
    }],
    messages: [],
  }

  constructor(private ctx: Context) {
    this.bot = new SandboxBot(ctx, this, {
      selfId: DEFAULT_BOT_ID,
      name: 'OneBot Sandbox',
    })
  }

  getSnapshot(): SandboxSnapshot {
    return structuredClone(this.scene)
  }

  async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    const user = this.scene.users.find(({ id }) => id === input.actorUserId)
    const bot = this.scene.bots.find(({ id }) => id === input.botId)
    const conversation = this.scene.conversations.find(({ id }) => id === input.conversationId)

    if (!user) throw new Error(`用户不存在：${input.actorUserId}`)
    if (!bot) throw new Error(`机器人不存在：${input.botId}`)
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

    const message = this.appendMessage(user.id, conversation.id, input.content.trim())
    const session = this.bot.session({
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

    this.bot.dispatch(session)
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

  private appendMessage(authorId: string, conversationId: string, content: string): SandboxMessage {
    const conversation = this.scene.conversations.find(({ id }) => id === conversationId)
    if (!conversation) throw new Error(`会话不存在：${conversationId}`)

    const message: SandboxMessage = {
      id: Random.id(),
      authorId,
      conversationId,
      content,
      createdAt: new Date().toISOString(),
    }
    this.scene.messages.push(message)
    conversation.messageIds.push(message.id)
    this.scene.revision += 1
    return message
  }
}
