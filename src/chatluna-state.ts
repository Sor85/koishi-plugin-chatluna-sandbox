import type { Context } from 'koishi'
import { parseThinkContent, readChatLunaResponseText } from './chatluna-thinking'
import type { SandboxChatLunaState, SandboxMessageChatLuna } from './types'

type ValidateTarget = (botParticipantId: string, conversationId: string) => boolean
type ArchiveResult = (botParticipantId: string, conversationId: string, result: SandboxMessageChatLuna) => void

interface ChatLunaModelUsagePayload {
  context?: {
    conversationId?: unknown
  }
  usageMetadata?: {
    input_tokens?: unknown
    output_tokens?: unknown
    total_tokens?: unknown
  }
}

interface ChatLunaCharacterPayload {
  session?: unknown
  lastResponseMessage?: unknown
  completionMessages?: unknown
  text?: unknown
}

interface ChatLunaEventRegistrar {
  (event: 'chatluna/before-chat', listener: (
    conversationId: string,
    message: unknown,
    variables: unknown,
    chatInterface: unknown,
    session: unknown,
  ) => void): () => void
  (event: 'chatluna/after-chat', listener: (
    conversationId: string,
    sourceMessage: unknown,
    responseMessage: unknown,
    variables: unknown,
    chatInterface: unknown,
    session: unknown,
  ) => void): () => void
  (event: 'chatluna/after-chat-error', listener: (
    error: unknown,
    conversationId: string,
  ) => void): () => void
  (event: 'chatluna/model-usage', listener: (payload: ChatLunaModelUsagePayload) => void): () => void
  (event: 'chatluna_character/message_collect', listener: (session: unknown) => void): () => void
  (event: 'chatluna_character/after-chat', listener: (payload: ChatLunaCharacterPayload) => void): () => void
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : undefined
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined
}

function readNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
}

function readSessionTarget(session: unknown) {
  const value = readRecord(session)
  const bot = readRecord(value?.bot)
  const channel = readRecord(value?.channel)
  const botParticipantId = readString(value?.selfId) ?? readString(bot?.selfId)
  const conversationId = readString(value?.channelId) ?? readString(channel?.id)
  if (!botParticipantId || !conversationId) return
  return { botParticipantId, conversationId }
}

function createStateKey(botParticipantId: string, conversationId: string) {
  return `${botParticipantId}\u0000${conversationId}`
}

export class SandboxChatLunaStateStore {
  private states = new Map<string, SandboxChatLunaState>()
  private activeStateKeys = new Map<string, Set<string>>()
  private thinkingStartedAt = new Map<string, number>()
  private disposers: Array<() => void> = []

  constructor(
    ctx: Context,
    private validateTarget: ValidateTarget,
    private onChange: () => void = () => {},
    private archiveResult: ArchiveResult = () => {},
  ) {
    const on = ctx.on.bind(ctx) as unknown as ChatLunaEventRegistrar
    this.disposers.push(on('chatluna/before-chat', (conversationId, _message, _variables, _chatInterface, session) => {
      this.begin(session, conversationId)
    }))
    this.disposers.push(on('chatluna/after-chat', (conversationId, _sourceMessage, responseMessage, _variables, _chatInterface, session) => {
      this.finish(conversationId, session, { lastResponseMessage: responseMessage })
    }))
    this.disposers.push(on('chatluna/after-chat-error', (_error, conversationId) => {
      this.finish(conversationId)
    }))
    this.disposers.push(on('chatluna/model-usage', (payload) => {
      this.recordUsage(payload)
    }))
    this.disposers.push(on('chatluna_character/message_collect', (session) => {
      this.begin(session)
    }))
    this.disposers.push(on('chatluna_character/after-chat', (payload) => {
      this.finish(undefined, payload?.session, payload)
    }))
  }

  getStates(): SandboxChatLunaState[] {
    return structuredClone([...this.states.values()])
  }

  clear(): void {
    this.states.clear()
    this.activeStateKeys.clear()
    this.thinkingStartedAt.clear()
  }

  dispose(): void {
    for (const dispose of this.disposers.splice(0)) dispose()
    this.clear()
  }

  deleteByBotParticipant(botParticipantId: string): void {
    this.deleteWhere(({ botParticipantId: id }) => id === botParticipantId)
  }

  deleteByConversationIds(conversationIds: ReadonlySet<string>): void {
    this.deleteWhere(({ conversationId }) => conversationIds.has(conversationId))
  }

  private begin(session: unknown, chatLunaConversationId?: string): void {
    const target = readSessionTarget(session)
    if (!target || !this.validateTarget(target.botParticipantId, target.conversationId)) return
    const key = createStateKey(target.botParticipantId, target.conversationId)
    const current = this.states.get(key)
    // chatluna-character 可能在核心 before-chat 前后重复报告同一次思考；
    // 无内部会话 ID 的补充事件不能清掉核心事件已经建立的 Token 归属映射。
    if (!chatLunaConversationId && current?.thinking) {
      current.updatedAt = new Date().toISOString()
      // 上一轮如果因为上游报错没收到结束事件，thinking 会一直挂着，
      // 此时不刷新起点会把上一轮的等待时间算进这一轮的思考时长。
      this.thinkingStartedAt.set(key, Date.now())
      return
    }
    this.detachStateKey(key)
    this.states.set(key, {
      ...target,
      thinking: true,
      updatedAt: new Date().toISOString(),
    })
    // updatedAt 会被 Token 用量事件刷新，思考时长必须独立记录起点。
    this.thinkingStartedAt.set(key, Date.now())
    if (chatLunaConversationId) {
      const keys = this.activeStateKeys.get(chatLunaConversationId) ?? new Set<string>()
      keys.add(key)
      this.activeStateKeys.set(chatLunaConversationId, keys)
    }
    // 等待态是不落场景快照的瞬时状态，必须单独广播，否则聊天页面要等下一条消息才刷新，届时思考早已结束。
    this.onChange()
  }

  private finish(chatLunaConversationId?: string, session?: unknown, payload?: ChatLunaCharacterPayload): void {
    const target = readSessionTarget(session)
    const targetKey = target && this.validateTarget(target.botParticipantId, target.conversationId)
      ? createStateKey(target.botParticipantId, target.conversationId)
      : undefined
    const activeKeys = chatLunaConversationId ? this.activeStateKeys.get(chatLunaConversationId) : undefined
    const key = targetKey ?? (activeKeys?.size === 1 ? [...activeKeys][0] : undefined)
    let changed = false
    if (key) changed = this.finishState(key, payload)
    if (chatLunaConversationId && activeKeys && !key) {
      // 错误事件没有 Session 且同一 ChatLuna 会话映射到多个机器人时无法判定归属；
      // 删除这些瞬时状态比把一个全局完成状态错误地串到任意机器人更安全。
      for (const activeKey of activeKeys) {
        changed = this.states.delete(activeKey) || changed
        this.thinkingStartedAt.delete(activeKey)
      }
    }
    if (chatLunaConversationId) this.activeStateKeys.delete(chatLunaConversationId)
    if (changed) this.onChange()
  }

  private recordUsage(payload: ChatLunaModelUsagePayload): void {
    const key = this.resolveUsageKey(readString(payload?.context?.conversationId))
    if (!key) return
    const state = this.states.get(key)
    if (!state) return
    const inputTokens = readNumber(payload.usageMetadata?.input_tokens)
    const outputTokens = readNumber(payload.usageMetadata?.output_tokens)
    const totalTokens = readNumber(payload.usageMetadata?.total_tokens) || inputTokens + outputTokens
    state.usage = {
      inputTokens: (state.usage?.inputTokens ?? 0) + inputTokens,
      outputTokens: (state.usage?.outputTokens ?? 0) + outputTokens,
      totalTokens: (state.usage?.totalTokens ?? 0) + totalTokens,
    }
    state.updatedAt = new Date().toISOString()
  }

  // model-usage 本身没有机器人 selfId，只能靠唯一性归属：
  // 核心链路用内部会话 ID 的活动映射，chatluna-character 链路没有该 ID，退回到全局唯一思考状态。
  // 两种情况下只要无法唯一确定就丢弃，避免把 Token 串到其他机器人。
  private resolveUsageKey(chatLunaConversationId?: string): string | undefined {
    const activeKeys = chatLunaConversationId ? this.activeStateKeys.get(chatLunaConversationId) : undefined
    if (activeKeys) return activeKeys.size === 1 ? [...activeKeys][0] : undefined
    const thinkingKeys = [...this.states].filter(([, state]) => state.thinking).map(([key]) => key)
    return thinkingKeys.length === 1 ? thinkingKeys[0] : undefined
  }

  private finishState(key: string, payload?: ChatLunaCharacterPayload): boolean {
    const state = this.states.get(key)
    const startedAt = this.thinkingStartedAt.get(key)
    this.thinkingStartedAt.delete(key)
    if (!state) return false
    state.thinking = false
    state.updatedAt = new Date().toISOString()
    const thought = payload ? parseThinkContent(readChatLunaResponseText(payload)) : ''
    // 思考内容与本轮用量归档到机器人消息上，下一轮对话开始后仍然可以展开查看历史。
    if (thought || state.usage) {
      this.archiveResult(state.botParticipantId, state.conversationId, {
        thought,
        ...(thought && startedAt !== undefined ? { thoughtDurationMs: Math.max(0, Date.now() - startedAt) } : {}),
        ...(state.usage ? { usage: { ...state.usage } } : {}),
      })
    }
    this.detachStateKey(key)
    return true
  }

  private detachStateKey(key: string): void {
    for (const [conversationId, keys] of this.activeStateKeys) {
      keys.delete(key)
      if (!keys.size) this.activeStateKeys.delete(conversationId)
    }
  }

  private deleteWhere(predicate: (state: SandboxChatLunaState) => boolean): void {
    for (const [key, state] of this.states) {
      if (!predicate(state)) continue
      this.states.delete(key)
      this.thinkingStartedAt.delete(key)
      this.detachStateKey(key)
    }
  }
}
