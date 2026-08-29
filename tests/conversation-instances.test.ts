import { App, Universal } from '@koishijs/core'
import { afterEach, describe, expect, it } from 'vitest'
import { SandboxControlService, createDefaultScene } from '../src/control-service'
import { listRootConversationInstances, resolveConversation } from '../src/conversation-resolution'
import type { SandboxSnapshot } from '../src/types'
import { createDirectSession, emitChatLunaEvent } from './helpers/chatluna-state-broadcast'

const runningApps: App[] = []

afterEach(async () => {
  await Promise.all(runningApps.splice(0).map((app) => app.stop()))
})

async function createControl(scene?: SandboxSnapshot) {
  const app = new App()
  let control: SandboxControlService | undefined
  app.plugin((ctx) => {
    control = new SandboxControlService(ctx, scene ? { initialScene: scene } : {})
  })
  runningApps.push(app)
  return { app, control: () => {
    if (!control) throw new Error('沙盒控制服务未注册')
    return control
  } }
}

describe('会话实例端到端', () => {
  it('在实例里发消息时插件收到的是一个独立会话，标准 Koishi 回复回到同一个实例', async () => {
    const { app, control: resolve } = await createControl()
    const observed: Array<{ channelId?: string, channelType?: number, guildId?: string, content?: string }> = []
    app.middleware(async (session, next) => {
      observed.push({
        channelId: session.channelId,
        channelType: session.event.channel?.type,
        guildId: session.guildId,
        content: session.content,
      })
      if (session.content === '在实例里提问') await session.send('实例里的回复')
      return next()
    })
    await app.start()
    const control = resolve()

    const { conversationId } = control.createConversationInstance({
      operatorId: '10001',
      rootConversationId: 'private:10001:20001',
    })
    await control.sendMessage({ operatorId: '10001', conversationId, content: '在实例里提问' })
    await control.sendMessage({ operatorId: '10001', conversationId: 'private:10001:20001', content: '根会话里提问' })

    // 插件看到的会话标识是实例本身，不是它的根会话。
    expect(observed.map(({ channelId }) => channelId)).toEqual([conversationId, 'private:10001:20001'])
    const instance = resolveConversation(control.getSnapshot(), conversationId)
    const reply = control.getSnapshot().messages.find(({ content }) => content === '实例里的回复')
    expect(reply?.conversationId).toBe(conversationId)
    expect(instance?.messageIds).toEqual([
      expect.any(String),
      reply?.id,
    ])
    // 根会话只有它自己那一条：两条对话线互不污染。
    expect(resolveConversation(control.getSnapshot(), 'private:10001:20001')?.messageIds).toHaveLength(1)
  })

  it('ChatLuna 对话状态按实例分叉，状态键与根会话不同', async () => {
    const { app, control: resolve } = await createControl()
    await app.start()
    const control = resolve()
    const { conversationId } = control.createConversationInstance({
      operatorId: '10001',
      rootConversationId: 'private:10001:20001',
    })

    // 状态的组合键是「机器人参与者 ID + 逻辑会话 ID」，实例因此天然是另一个键，不需要额外规则。
    const instanceSession = control.getRuntimeBot('20001').session({
      type: 'message',
      user: { id: '10001', name: '测试用户1' },
      channel: { id: conversationId, type: Universal.Channel.Type.DIRECT },
    })
    const rootSession = createDirectSession(control, '20001')
    await emitChatLunaEvent(app, 'chatluna/before-chat', 'chatluna:instance', {}, {}, {}, instanceSession)
    await emitChatLunaEvent(app, 'chatluna/before-chat', 'chatluna:root', {}, {}, {}, rootSession)

    expect(control.getChatLunaStates().map((state) => ({
      botParticipantId: state.botParticipantId,
      conversationId: state.conversationId,
      thinking: state.thinking,
    }))).toEqual([
      { botParticipantId: '20001', conversationId, thinking: true },
      { botParticipantId: '20001', conversationId: 'private:10001:20001', thinking: true },
    ])
  })

  it('群组的实例在插件那里仍然是群会话', async () => {
    const { app, control: resolve } = await createControl()
    const observed: Array<{ channelId?: string, guildId?: string, messageType?: unknown }> = []
    app.middleware((session) => {
      observed.push({
        channelId: session.channelId,
        guildId: session.guildId,
        messageType: (session as { onebot?: { message_type?: unknown } }).onebot?.message_type,
      })
    })
    await app.start()
    const control = resolve()

    const { conversationId } = control.createConversationInstance({
      operatorId: '10001',
      rootConversationId: 'group:30001',
    })
    await control.sendMessage({ operatorId: '10001', conversationId, content: '群实例提问' })

    expect(observed).toEqual([{ channelId: conversationId, guildId: '30001', messageType: 'group' }])
  })

  it('消息搜索能命中实例里的消息', async () => {
    const { app, control: resolve } = await createControl()
    await app.start()
    const control = resolve()
    const { conversationId } = control.createConversationInstance({
      operatorId: '10001',
      rootConversationId: 'private:10001:20001',
    })
    const sent = await control.sendMessage({ operatorId: '10001', conversationId, content: '只存在于实例里的关键词' })

    expect(control.searchConversationMessages({
      operatorId: '10001',
      conversationId,
      query: '只存在于实例里',
    }).hits.map(({ messageId }) => messageId)).toEqual([sent.messageId])
    // 根会话不该命中实例里的消息：会话仍然是搜索的边界。
    expect(control.searchConversationMessages({
      operatorId: '10001',
      conversationId: 'private:10001:20001',
      query: '只存在于实例里',
    }).hits).toEqual([])
  })

  it('实例是一等会话：撤回、贴表情、引用与历史分页都可用', async () => {
    const { app, control: resolve } = await createControl()
    await app.start()
    const control = resolve()
    const { conversationId } = control.createConversationInstance({
      operatorId: '10001',
      rootConversationId: 'private:10001:20001',
    })

    const first = await control.sendMessage({ operatorId: '10001', conversationId, content: '第一条' })
    const second = await control.sendMessage({
      operatorId: '10001',
      conversationId,
      content: '引用第一条',
      replyToMessageId: first.messageId,
    })
    await control.setMessageReaction({ operatorId: '10001', messageId: second.messageId, emojiId: '4', enabled: true })
    await control.recallMessage({ operatorId: '10001', conversationId, messageId: first.messageId })

    const messages = control.getMessageHistory({ operatorId: '10001', conversationId, limit: 10 }).messages
    expect(messages.map(({ content }) => content)).toEqual(['第一条', '引用第一条'])
    expect(messages[0]?.lifecycle).toMatchObject({ status: 'recalled', operatorId: '10001' })
    expect(messages[1]).toMatchObject({
      replyToMessageId: first.messageId,
      reactions: [{ emojiId: '4', participantIds: ['10001'] }],
    })
  })

  it('实例对根会话的全部可见参与者可见，切换当前操作者后仍在', async () => {
    const { app, control: resolve } = await createControl()
    await app.start()
    const control = resolve()

    const { conversationId } = control.createConversationInstance({
      operatorId: '10001',
      rootConversationId: 'private:10001:20001',
    })

    for (const operatorId of ['10001', '20001']) {
      expect(control.getVisibleSnapshot(operatorId).conversationInstances?.map(({ id }) => id)).toEqual([conversationId])
    }
    // 不在根会话里的参与者看不到它。
    expect(control.getVisibleSnapshot('10002').conversationInstances).toEqual([])
  })

  it('默认场景不生成会话实例', async () => {
    expect(createDefaultScene().conversationInstances).toEqual([])
  })

  it('保留窗口按时间最旧优先淘汰实例与根会话的消息，空实例不被删除', async () => {
    const app = new App()
    let control: SandboxControlService | undefined
    app.plugin((ctx) => {
      control = new SandboxControlService(ctx, { sceneMessageLimit: 2 })
    })
    runningApps.push(app)
    await app.start()
    if (!control) throw new Error('沙盒控制服务未注册')

    const { conversationId } = control.createConversationInstance({
      operatorId: '10001',
      rootConversationId: 'private:10001:20001',
    })
    // 先写实例、再写根会话：淘汰必须按时间最旧优先，与会话种类无关。
    await control.sendMessage({ operatorId: '10001', conversationId, content: '实例第一条' })
    await control.sendMessage({ operatorId: '10001', conversationId, content: '实例第二条' })
    await control.sendMessage({ operatorId: '10001', conversationId: 'private:10001:20001', content: '根会话消息' })

    const scene = control.getSnapshot()
    expect(scene.messages.map(({ content }) => content)).toEqual(['实例第二条', '根会话消息'])
    expect(resolveConversation(scene, conversationId)?.messageIds).toHaveLength(1)

    await control.sendMessage({ operatorId: '10001', conversationId: 'private:10001:20001', content: '再一条根会话消息' })

    const trimmed = control.getSnapshot()
    // 实例最后一条消息被淘汰后实例本身仍然存在：空实例是合法状态。
    expect(listRootConversationInstances(trimmed, 'private:10001:20001').map(({ id, messageIds }) => ({ id, messageIds })))
      .toEqual([{ id: conversationId, messageIds: [] }])
  })
})
