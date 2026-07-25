import type { Context } from 'koishi'
import type { SandboxChatLunaState } from './types'

type ValidateTarget = (botParticipantId: string, conversationId: string) => boolean

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
  private disposers: Array<() => void> = []

  constructor(ctx: Context, private validateTarget: ValidateTarget) {
    const on = ctx.on.bind(ctx) as unknown as ChatLunaEventRegistrar
    this.disposers.push(on('chatluna/before-chat', (conversationId, _message, _variables, _chatInterface, session) => {
      this.begin(session, conversationId)
    }))
    this.disposers.push(on('chatluna/after-chat', (conversationId, _sourceMessage, _responseMessage, _variables, _chatInterface, session) => {
      this.finish(conversationId, session)
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
      this.finish(undefined, payload?.session)
    }))
  }

  getStates(): SandboxChatLunaState[] {
    return structuredClone([...this.states.values()])
  }

  clear(): void {
    this.states.clear()
    this.activeStateKeys.clear()
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
      return
    }
    this.detachStateKey(key)
    this.states.set(key, {
      ...target,
      thinking: true,
      updatedAt: new Date().toISOString(),
    })
    if (!chatLunaConversationId) return
    const keys = this.activeStateKeys.get(chatLunaConversationId) ?? new Set<string>()
    keys.add(key)
    this.activeStateKeys.set(chatLunaConversationId, keys)
  }

  private finish(chatLunaConversationId?: string, session?: unknown): void {
    const target = readSessionTarget(session)
    const targetKey = target && this.validateTarget(target.botParticipantId, target.conversationId)
      ? createStateKey(target.botParticipantId, target.conversationId)
      : undefined
    const activeKeys = chatLunaConversationId ? this.activeStateKeys.get(chatLunaConversationId) : undefined
    const key = targetKey ?? (activeKeys?.size === 1 ? [...activeKeys][0] : undefined)
    if (key) this.finishState(key)
    if (chatLunaConversationId && activeKeys && !key) {
      // 错误事件没有 Session 且同一 ChatLuna 会话映射到多个机器人时无法判定归属；
      // 删除这些瞬时状态比把一个全局完成状态错误地串到任意机器人更安全。
      for (const activeKey of activeKeys) this.states.delete(activeKey)
    }
    if (chatLunaConversationId) this.activeStateKeys.delete(chatLunaConversationId)
  }

  private recordUsage(payload: ChatLunaModelUsagePayload): void {
    const chatLunaConversationId = readString(payload?.context?.conversationId)
    if (!chatLunaConversationId) return
    const activeKeys = this.activeStateKeys.get(chatLunaConversationId)
    // model-usage 本身没有机器人 selfId；只有唯一活动映射时才能安全归属。
    if (activeKeys?.size !== 1) return
    const key = [...activeKeys][0]
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

  private finishState(key: string): void {
    const state = this.states.get(key)
    if (!state) return
    state.thinking = false
    state.updatedAt = new Date().toISOString()
    this.detachStateKey(key)
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
      this.detachStateKey(key)
    }
  }
}
