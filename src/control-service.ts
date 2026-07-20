import { Context, h, Random, Universal } from 'koishi'
import { SandboxBot } from './bot'
import type {
  SandboxMessage,
  SandboxSnapshot,
  SendMessageInput,
  SendMessageResult,
} from './types'

const DEFAULT_USER_ID = '10001'
const DEFAULT_BOT_ID = '20001'
const DEFAULT_CONVERSATION_ID = `private:${DEFAULT_USER_ID}:${DEFAULT_BOT_ID}`

export class SandboxControlService {
  readonly bot: SandboxBot

  private scene: SandboxSnapshot = {
    revision: 0,
    users: [{ id: DEFAULT_USER_ID, name: '测试用户' }],
    bots: [{ id: DEFAULT_BOT_ID, name: 'OneBot Sandbox' }],
    conversations: [{
      id: DEFAULT_CONVERSATION_ID,
      userId: DEFAULT_USER_ID,
      botId: DEFAULT_BOT_ID,
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
    if (!input.content.trim()) throw new Error('消息内容不能为空')

    const message = this.appendMessage(user.id, conversation.id, input.content.trim())
    const session = this.bot.session({
      type: 'message',
      timestamp: Date.now(),
      user: { id: user.id, name: user.name },
      channel: {
        id: conversation.id,
        type: Universal.Channel.Type.DIRECT,
      },
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
