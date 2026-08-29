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

describe('从消息创建分支', () => {
  it('新实例带上分叉点及其之前的历史，复制体有新身份且引用指向复制体', async () => {
    const { app, control: resolve } = await createControl()
    await app.start()
    const control = resolve()

    const first = await control.sendMessage({ operatorId: '10001', conversationId: 'private:10001:20001', content: '第一条' })
    const second = await control.sendMessage({
      operatorId: '10001',
      conversationId: 'private:10001:20001',
      content: '第二条引用第一条',
      replyToMessageId: first.messageId,
    })
    await control.sendMessage({ operatorId: '10001', conversationId: 'private:10001:20001', content: '分叉点之后' })

    const { conversationId } = control.branchConversationInstance({
      operatorId: '10001',
      conversationId: 'private:10001:20001',
      messageId: second.messageId,
    })

    const scene = control.getSnapshot()
    const branch = resolveConversation(scene, conversationId)!
    const copies = branch.messageIds.map((id) => scene.messages.find((message) => message.id === id)!)
    expect(copies.map(({ content }) => content)).toEqual(['第一条', '第二条引用第一条'])
    // 复制体拥有新的消息身份，并归属新实例。
    expect(copies.map(({ id }) => id)).not.toEqual([first.messageId, second.messageId])
    expect(copies.every(({ conversationId: owner }) => owner === conversationId)).toBe(true)
    // 复制范围内的引用指向复制体，而不是原会话里的消息。
    expect(copies[1]?.replyToMessageId).toBe(copies[0]?.id)
    // 原会话一条不少、一条不改。
    expect(resolveConversation(scene, 'private:10001:20001')?.messageIds).toHaveLength(3)
  })

  it('分叉点之后的引用不会跨会话指向原消息', async () => {
    const { app, control: resolve } = await createControl()
    await app.start()
    const control = resolve()

    const first = await control.sendMessage({ operatorId: '10001', conversationId: 'private:10001:20001', content: '第一条' })
    await control.sendMessage({
      operatorId: '10001',
      conversationId: 'private:10001:20001',
      content: '引用第一条',
      replyToMessageId: first.messageId,
    })

    // 只复制到第一条：第二条的引用不在复制范围内，因此第二条根本不会出现。
    const { conversationId } = control.branchConversationInstance({
      operatorId: '10001',
      conversationId: 'private:10001:20001',
      messageId: first.messageId,
    })

    const scene = control.getSnapshot()
    const copies = resolveConversation(scene, conversationId)!.messageIds
      .map((id) => scene.messages.find((message) => message.id === id)!)
    expect(copies).toHaveLength(1)
    expect(copies[0]).not.toHaveProperty('replyToMessageId')
  })

  it('默认标题指出来源会话，从实例再分支时指向实例名并归一化到同一根会话', async () => {
    const { app, control: resolve } = await createControl()
    await app.start()
    const control = resolve()

    const direct = await control.sendMessage({ operatorId: '10001', conversationId: 'private:10001:20001', content: '私聊消息' })
    const group = await control.sendMessage({ operatorId: '10001', conversationId: 'group:30001', content: '群消息' })

    const fromDirect = control.branchConversationInstance({
      operatorId: '10001',
      conversationId: 'private:10001:20001',
      messageId: direct.messageId,
    })
    const fromGroup = control.branchConversationInstance({
      operatorId: '10001',
      conversationId: 'group:30001',
      messageId: group.messageId,
    })

    const scene = control.getSnapshot()
    expect(resolveConversation(scene, fromDirect.conversationId)?.title).toBe('分支：Koishi')
    expect(resolveConversation(scene, fromGroup.conversationId)?.title).toBe('分支：测试群')

    const nested = control.branchConversationInstance({
      operatorId: '10001',
      conversationId: fromDirect.conversationId,
      messageId: resolveConversation(scene, fromDirect.conversationId)!.messageIds[0]!,
    })
    const nestedConversation = resolveConversation(control.getSnapshot(), nested.conversationId)
    expect(nestedConversation?.title).toBe('分支：分支：Koishi')
    // 层级严格两层：从实例分叉仍然挂在同一个根会话下。
    expect(nestedConversation?.rootConversationId).toBe('private:10001:20001')
  })

  it('在分支里发消息时插件看到的上下文包含被复制的历史', async () => {
    const { app, control: resolve } = await createControl()
    const observed: Array<{ channelId?: string, history: string[] }> = []
    app.middleware(async (session) => {
      const messages = await session.bot.getMessageList(session.channelId!)
      observed.push({
        channelId: session.channelId,
        history: messages.data.map(({ content }) => content ?? ''),
      })
    })
    await app.start()
    const control = resolve()

    const first = await control.sendMessage({ operatorId: '10001', conversationId: 'private:10001:20001', content: '分叉点之前' })
    const { conversationId } = control.branchConversationInstance({
      operatorId: '10001',
      conversationId: 'private:10001:20001',
      messageId: first.messageId,
    })
    await control.sendMessage({ operatorId: '10001', conversationId, content: '换一种问法' })

    expect(observed.at(-1)).toEqual({
      channelId: conversationId,
      history: ['分叉点之前', '换一种问法'],
    })
  })

  it('分叉点消息不在该会话里时按消息不存在拒绝', async () => {
    const { app, control: resolve } = await createControl()
    await app.start()
    const control = resolve()
    const sent = await control.sendMessage({ operatorId: '10001', conversationId: 'group:30001', content: '群消息' })

    expect(() => control.branchConversationInstance({
      operatorId: '10001',
      conversationId: 'private:10001:20001',
      messageId: sent.messageId,
    })).toThrow(`消息不存在：${sent.messageId}`)
  })
})
