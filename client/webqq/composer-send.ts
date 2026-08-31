import { ref } from 'vue'

/**
 * 发送编排：单请求锁、错误文案与动作顺序。
 *
 * 顺序全是判定，改坏了都不报错：清空早于外发会把用户的正文吞掉；焦点早于解锁会还不上
 * （输入区在发送中是 `aria-disabled`，浏览器忽略对禁用控件的焦点请求）；锁漏掉一次会把同一条
 * 消息发两遍。判定进这个模块，外发、清空与聚焦按最小结构接口注入（ADR 0075）。
 *
 * 「该不该把焦点还回输入框」留在既有的 `composer-focus`：那是一份已经有断言的判定，
 * 编排调用它而不吸收它。
 */

export interface ComposerSendMedia {
  readonly fileName: string
  readonly mimeType: string
  readonly dataBase64: string
}

/** 发起这一刻的读数。 */
export interface ComposerSendRequest {
  /** 序列化后的正文。 */
  readonly content: string
  readonly attachmentCount: number
  readonly conversationId?: string
  readonly operatorId?: string
  readonly replyToMessageId?: string
  /** 输入法组字中。此刻草稿里还没有上屏的正文。 */
  readonly composing: boolean
}

export interface ComposerSendIntent {
  readonly conversationId: string
  readonly content: string
  readonly replyToMessageId?: string
  readonly media?: ComposerSendMedia[]
}

/** 发起发送这一刻捕获的焦点还原动作。判定由 `composer-focus` 给出，这里只是它的调用面。 */
export interface ComposerSendFocusHandle {
  shouldRestore(): boolean
  restore(): void
}

export interface ComposerSendAdapter {
  /** 读发起这一刻的正文、附件数、会话、操作者、回复目标与输入法状态。 */
  readRequest(): ComposerSendRequest
  /** 关掉候选菜单。开着的话它会盖在刚清空的输入区上。 */
  closeMentionMenu(): void
  /**
   * 捕获发起这一刻的输入控件与身份。
   *
   * 必须在第一个 `await` 之前捕获：请求完成时当前引用可能已经指向新节点，
   * 那不是应该被还回焦点的那一个。
   */
  captureFocus(request: { conversationId: string, operatorId: string }): ComposerSendFocusHandle
  /** 把附件读成媒体载荷；没有附件时给 undefined。 */
  readMedia(): Promise<ComposerSendMedia[] | undefined>
  /** 外发一条消息。失败时抛出。 */
  deliver(intent: ComposerSendIntent): Promise<void>
  clearDraft(): void
  clearAttachments(): void
  clearReply(): void
  /** 等一拍，让「发送中」的禁用态先解除。 */
  nextTick(): Promise<void>
}

export function createComposerSendController(adapter: ComposerSendAdapter) {
  const sending = ref(false)
  const error = ref('')

  async function submit() {
    adapter.closeMentionMenu()
    const request = adapter.readRequest()
    // 单请求锁：进行中直接返回，不排队——排队会让用户以为没发出去而再按一次。
    if (sending.value) return
    // 组字期间的 Enter 是上屏确认，不是发送。
    if (request.composing) return
    if (!request.content && !request.attachmentCount) return
    if (!request.conversationId || !request.operatorId) return

    const focus = adapter.captureFocus({
      conversationId: request.conversationId,
      operatorId: request.operatorId,
    })
    sending.value = true
    error.value = ''
    try {
      const media = await adapter.readMedia()
      await adapter.deliver({
        conversationId: request.conversationId,
        content: request.content,
        replyToMessageId: request.replyToMessageId,
        media,
      })
      // 清空只在成功之后：失败时正文与附件一个都不能丢，用户要能改一改立刻重发。
      adapter.clearDraft()
      adapter.clearAttachments()
      adapter.clearReply()
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '发送失败'
    } finally {
      sending.value = false
      await adapter.nextTick()
      if (focus.shouldRestore()) focus.restore()
    }
  }

  return { sending, error, submit }
}

export type ComposerSendController = ReturnType<typeof createComposerSendController>
