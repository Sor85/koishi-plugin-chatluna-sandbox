import type { Context } from 'koishi'
import { identifyCharacterTurnSession } from './character-turn-session'
import { parseThinkContent, readChatLunaResponseText } from './thinking'
import type {
  SandboxChatLunaState,
  SandboxMessageChatLuna,
  SandboxMessageModelRequestReference,
} from '../types'

type ValidateTarget = (botParticipantId: string, conversationId: string) => boolean
type ArchiveResult = (
  botParticipantId: string,
  conversationId: string,
  result: SandboxMessageChatLuna,
  messageIds: readonly string[],
) => void
type ArchiveError = (error: unknown, target: SandboxChatLunaErrorTarget) => void

export interface SandboxChatLunaErrorTarget {
  botParticipantId: string
  conversationId: string
}

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

interface FinishStateOptions {
  allowReplyFallback: boolean
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
  (event: 'chatluna_character/message_collect', listener: (session: unknown) => void, options?: { prepend?: boolean }): () => void
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
  private modelRequests = new Map<string, SandboxMessageModelRequestReference[]>()
  private replyMessageIds = new Map<string, string[]>()
  private characterSessionStateKeys = new WeakMap<object, string>()
  private activeCharacterSessions = new Map<string, object>()
  private activeCoreSessions = new Map<string, object>()
  private disposers: Array<() => void> = []

  constructor(
    private ctx: Context,
    private validateTarget: ValidateTarget,
    private onChange: () => void = () => {},
    private archiveResult: ArchiveResult = () => {},
    private archiveError: ArchiveError = () => {},
  ) {
    const on = this.ctx.on.bind(this.ctx) as unknown as ChatLunaEventRegistrar
    this.disposers.push(on('chatluna/before-chat', (conversationId, _message, _variables, _chatInterface, session) => {
      this.begin(session, conversationId)
    }))
    this.disposers.push(on('chatluna/after-chat', (conversationId, _sourceMessage, responseMessage, _variables, _chatInterface, session) => {
      this.finish(conversationId, session, { lastResponseMessage: responseMessage })
    }))
    this.disposers.push(on('chatluna/after-chat-error', (error, conversationId) => {
      const targets = this.resolveErrorTargets(conversationId)
      if (targets.length === 1) this.archiveError(error, targets[0]!)
      this.finish(conversationId)
    }))
    this.disposers.push(on('chatluna/model-usage', (payload) => {
      this.recordUsage(payload)
    }))
    this.disposers.push(on('chatluna_character/message_collect', (session) => {
      this.beginCharacterTurn(session)
    }, { prepend: true }))
    this.disposers.push(on('chatluna_character/after-chat', (payload) => {
      if (this.finishCharacterTurn(payload?.session, payload)) this.onChange()
    }))
  }

  getStates(): SandboxChatLunaState[] {
    return structuredClone([...this.states.values()])
  }

  /**
   * 结束由同一个 Character Session 启动的当前轮。
   *
   * 成功路径的 after-chat 与最外层 finally 的 release 会先后到达；Session 代次映射让第二次调用成为
   * no-op，也阻止过期 Session 按相同 bot/conversation 误删后继轮。
   */
  finishCharacterTurn(session: unknown, payload?: ChatLunaCharacterPayload): boolean {
    const identity = identifyCharacterTurnSession(session)
    if (!identity) return false
    const key = this.characterSessionStateKeys.get(identity)
    if (!key) return false
    this.characterSessionStateKeys.delete(identity)
    if (this.activeCharacterSessions.get(key) !== identity) return false
    this.activeCharacterSessions.delete(key)
    const state = this.states.get(key)
    if (!state?.thinking) return false
    return this.finishState(key, payload, { allowReplyFallback: payload !== undefined })
  }

  recordModelRequest(
    botParticipantId: string,
    conversationId: string,
    reference: SandboxMessageModelRequestReference,
  ): void {
    const key = createStateKey(botParticipantId, conversationId)
    const state = this.states.get(key)
    if (!state?.thinking) return
    const references = this.modelRequests.get(key) ?? []
    if (!references.some(({ scopeId, recordId }) => scopeId === reference.scopeId && recordId === reference.recordId)) {
      references.push({ ...reference })
      this.modelRequests.set(key, references)
    }
  }

  recordReplyMessage(
    botParticipantId: string,
    conversationId: string,
    messageId: string,
  ): void {
    const key = createStateKey(botParticipantId, conversationId)
    if (!this.states.get(key)?.thinking) return
    const messageIds = this.replyMessageIds.get(key) ?? []
    if (!messageIds.includes(messageId)) {
      messageIds.push(messageId)
      this.replyMessageIds.set(key, messageIds)
    }
  }

  clear(): void {
    this.states.clear()
    this.activeStateKeys.clear()
    this.thinkingStartedAt.clear()
    this.modelRequests.clear()
    this.replyMessageIds.clear()
    this.characterSessionStateKeys = new WeakMap()
    this.activeCharacterSessions.clear()
    this.activeCoreSessions.clear()
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

  private beginCharacterTurn(session: unknown): void {
    const identity = identifyCharacterTurnSession(session)
    if (!identity) return
    const key = this.begin(session, undefined, identity)
    if (!key) return
    this.characterSessionStateKeys.set(identity, key)
    this.activeCharacterSessions.set(key, identity)
  }

  private begin(
    session: unknown,
    chatLunaConversationId?: string,
    characterIdentity?: object,
  ): string | undefined {
    const target = readSessionTarget(session)
    if (!target || !this.validateTarget(target.botParticipantId, target.conversationId)) return
    const key = createStateKey(target.botParticipantId, target.conversationId)
    const current = this.states.get(key)
    const coreIdentity = chatLunaConversationId
      ? identifyCharacterTurnSession(session)
      : undefined
    // Character collect 既可能重复报告自己的同一轮，也可能补充同一 Session 已由 Core before-chat
    // 建立的轮次。两种情况都保留 Core 会话映射、usage 与请求引用；不同 Character Session 仍重建。
    if (!chatLunaConversationId && characterIdentity && current?.thinking
      && (
        this.activeCharacterSessions.get(key) === characterIdentity
        || this.activeCoreSessions.get(key) === characterIdentity
      )) {
      current.updatedAt = new Date().toISOString()
      this.thinkingStartedAt.set(key, Date.now())
      return key
    }
    this.detachStateKey(key)
    this.modelRequests.delete(key)
    this.replyMessageIds.delete(key)
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
      if (coreIdentity) this.activeCoreSessions.set(key, coreIdentity)
    }
    // 等待态是不落场景快照的瞬时状态，必须单独广播，否则聊天页面要等下一条消息才刷新，届时思考早已结束。
    this.onChange()
    return key
  }

  private resolveErrorTargets(chatLunaConversationId: string): SandboxChatLunaErrorTarget[] {
    const activeKeys = this.activeStateKeys.get(chatLunaConversationId)
    if (!activeKeys) return []
    return [...activeKeys].flatMap((key) => {
      const state = this.states.get(key)
      return state ? [{ botParticipantId: state.botParticipantId, conversationId: state.conversationId }] : []
    })
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
        this.modelRequests.delete(activeKey)
        this.replyMessageIds.delete(activeKey)
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

  private finishState(
    key: string,
    payload?: ChatLunaCharacterPayload,
    options: FinishStateOptions = { allowReplyFallback: true },
  ): boolean {
    const state = this.states.get(key)
    const startedAt = this.thinkingStartedAt.get(key)
    this.thinkingStartedAt.delete(key)
    if (!state) return false
    state.thinking = false
    state.updatedAt = new Date().toISOString()
    const thought = payload ? parseThinkContent(readChatLunaResponseText(payload)) : ''
    const modelRequests = this.modelRequests.get(key)
    const replyMessageIds = this.replyMessageIds.get(key) ?? []
    // release 没有权威响应载荷；若本轮也没有明确捕获回复 ID，调用兼容 fallback 会把失败请求贴到
    // 上一轮最后一条机器人消息。成功 after-chat 仍保留该 fallback，部分回复后失败则只归档明确 ID。
    const hasResult = Boolean(thought || state.usage || modelRequests?.length)
    if (hasResult && (options.allowReplyFallback || replyMessageIds.length > 0)) {
      this.archiveResult(
        state.botParticipantId,
        state.conversationId,
        {
          thought,
          ...(thought && startedAt !== undefined ? { thoughtDurationMs: Math.max(0, Date.now() - startedAt) } : {}),
          ...(state.usage ? { usage: { ...state.usage } } : {}),
          ...(modelRequests?.length ? { modelRequests: modelRequests.map((reference) => ({ ...reference })) } : {}),
        },
        replyMessageIds,
      )
    }
    this.modelRequests.delete(key)
    this.replyMessageIds.delete(key)
    this.detachStateKey(key)
    return true
  }

  private detachStateKey(key: string): void {
    this.activeCharacterSessions.delete(key)
    this.activeCoreSessions.delete(key)
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
      this.modelRequests.delete(key)
      this.replyMessageIds.delete(key)
      this.detachStateKey(key)
    }
  }
}
