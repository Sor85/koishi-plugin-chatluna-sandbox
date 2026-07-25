import { App, Universal } from '@koishijs/core'
import { afterEach, describe, expect, it } from 'vitest'
import { SandboxControlService } from '../src/control-service'

const runningApps: App[] = []

afterEach(async () => {
  await Promise.all(runningApps.splice(0).map((app) => app.stop()))
})

async function createControl() {
  const app = new App()
  let control: SandboxControlService | undefined
  app.plugin((ctx) => {
    control = new SandboxControlService(ctx)
  })
  runningApps.push(app)
  await app.start()
  if (!control) throw new Error('沙盒控制服务未注册')
  control.createBot({ id: '20002', name: '第二机器人', implementation: 'llbot', enabled: true })
  const group = control.getSnapshot().groups[0]
  control.updateGroup({
    id: group.id,
    name: group.name,
    members: [...group.members, { participantId: '20002', role: 'admin' }],
  })
  return { app, control }
}

function createGroupSession(control: SandboxControlService, botParticipantId: string) {
  return control.getRuntimeBot(botParticipantId).session({
    type: 'message',
    user: { id: '10001', name: '测试用户1' },
    channel: { id: 'group:30001', type: Universal.Channel.Type.TEXT },
    guild: { id: '30001', name: '测试群' },
  })
}

function createDirectSession(control: SandboxControlService, botParticipantId: string) {
  return control.getRuntimeBot(botParticipantId).session({
    type: 'message',
    user: { id: '10001', name: '测试用户1' },
    channel: { id: `private:10001:${botParticipantId}`, type: Universal.Channel.Type.DIRECT },
  })
}

async function emit(app: App, event: string, ...args: unknown[]) {
  await (app.parallel as unknown as (event: string, ...args: unknown[]) => Promise<void>)(event, ...args)
}

describe('ChatLuna 多机器人对话状态', () => {
  it('同一机器人在私聊和群聊并发时分别记录状态与 Token 用量', async () => {
    const { app, control } = await createControl()
    const directSession = createDirectSession(control, '20001')
    const groupSession = createGroupSession(control, '20001')

    await emit(app, 'chatluna/before-chat', 'chatluna:direct', {}, {}, {}, directSession)
    await emit(app, 'chatluna/before-chat', 'chatluna:group', {}, {}, {}, groupSession)
    await emit(app, 'chatluna/model-usage', {
      context: { conversationId: 'chatluna:direct' },
      usageMetadata: { input_tokens: 8, output_tokens: 3, total_tokens: 11 },
    })
    await emit(app, 'chatluna/model-usage', {
      context: { conversationId: 'chatluna:group' },
      usageMetadata: { input_tokens: 21, output_tokens: 13, total_tokens: 34 },
    })

    expect(control.getChatLunaStates()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        botParticipantId: '20001',
        conversationId: 'private:10001:20001',
        thinking: true,
        usage: { inputTokens: 8, outputTokens: 3, totalTokens: 11 },
      }),
      expect.objectContaining({
        botParticipantId: '20001',
        conversationId: 'group:30001',
        thinking: true,
        usage: { inputTokens: 21, outputTokens: 13, totalTokens: 34 },
      }),
    ]))
  })

  it('按机器人参与者和逻辑会话分别记录思考状态与 Token 用量', async () => {
    const { app, control } = await createControl()
    const firstSession = createGroupSession(control, '20001')
    const secondSession = createGroupSession(control, '20002')

    await emit(app, 'chatluna/before-chat', 'chatluna:first', {}, {}, {}, firstSession)
    await emit(app, 'chatluna/before-chat', 'chatluna:second', {}, {}, {}, secondSession)
    await emit(app, 'chatluna/model-usage', {
      context: { conversationId: 'chatluna:first' },
      usageMetadata: { input_tokens: 12, output_tokens: 5, total_tokens: 17 },
    })
    await emit(app, 'chatluna/model-usage', {
      context: { conversationId: 'chatluna:second' },
      usageMetadata: { input_tokens: 20, output_tokens: 8, total_tokens: 28 },
    })

    expect(control.getChatLunaStates()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        botParticipantId: '20001',
        conversationId: 'group:30001',
        thinking: true,
        usage: { inputTokens: 12, outputTokens: 5, totalTokens: 17 },
      }),
      expect.objectContaining({
        botParticipantId: '20002',
        conversationId: 'group:30001',
        thinking: true,
        usage: { inputTokens: 20, outputTokens: 8, totalTokens: 28 },
      }),
    ]))

    control.getVisibleSnapshot('10001')
    control.getVisibleSnapshot('20002')
    await emit(app, 'chatluna/after-chat', 'chatluna:first', {}, {}, {}, {}, firstSession)

    expect(control.getChatLunaStates()).toEqual(expect.arrayContaining([
      expect.objectContaining({ botParticipantId: '20001', conversationId: 'group:30001', thinking: false }),
      expect.objectContaining({ botParticipantId: '20002', conversationId: 'group:30001', thinking: true }),
    ]))
  })

  it('无法唯一确定机器人或逻辑会话时不记录或串联状态', async () => {
    const { app, control } = await createControl()
    const firstSession = createGroupSession(control, '20001')
    const secondSession = createGroupSession(control, '20002')

    await emit(app, 'chatluna/before-chat', 'chatluna:shared', {}, {}, {}, firstSession)
    await emit(app, 'chatluna/before-chat', 'chatluna:shared', {}, {}, {}, secondSession)
    await emit(app, 'chatluna/model-usage', {
      context: { conversationId: 'chatluna:shared' },
      usageMetadata: { input_tokens: 99, output_tokens: 99, total_tokens: 198 },
    })
    await emit(app, 'chatluna/before-chat', 'chatluna:invalid', {}, {}, {}, {
      selfId: '10001',
      channelId: 'group:30001',
    })
    await emit(app, 'chatluna/model-usage', {
      context: { conversationId: 'chatluna:missing' },
      usageMetadata: { input_tokens: 50, output_tokens: 50, total_tokens: 100 },
    })

    expect(control.getChatLunaStates()).toHaveLength(2)
    expect(control.getChatLunaStates().every(({ usage }) => usage === undefined)).toBe(true)

    await emit(app, 'chatluna/after-chat-error', new Error('测试错误'), 'chatluna:shared')
    expect(control.getChatLunaStates()).toEqual([])
  })

  it('兼容 chatluna-character 的思考开始与结束事件', async () => {
    const { app, control } = await createControl()
    const session = createGroupSession(control, '20001')

    await emit(app, 'chatluna_character/message_collect', session, [])
    expect(control.getChatLunaStates()).toEqual([
      expect.objectContaining({ botParticipantId: '20001', conversationId: 'group:30001', thinking: true }),
    ])

    await emit(app, 'chatluna_character/after-chat', { session })
    expect(control.getChatLunaStates()).toEqual([
      expect.objectContaining({ botParticipantId: '20001', conversationId: 'group:30001', thinking: false }),
    ])
  })
})
