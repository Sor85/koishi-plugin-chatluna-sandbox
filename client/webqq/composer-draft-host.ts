import { computed, ref } from 'vue'
import {
  createEmptyComposerDraft,
  insertComposerMention,
  isComposerDraftEmpty,
  normalizeComposerTokens,
  serializeComposerDraft,
  type ComposerDraft,
  type ComposerDraftToken,
} from './composer-draft'

/**
 * 草稿与 contenteditable 之间的双向转换、光标读写与输入法状态。
 *
 * 纯 token 计算早就下沉了（`composer-draft.ts`）；真正会出问题的是「怎么把它和 contenteditable
 * 对上」：从子节点遍历回读出草稿、把草稿渲染成节点、把光标放到第几个 token 的第几个偏移、
 * 输入法未上屏时不许读回、input 事件早于 Selection 更新时要等一拍。这几块此前全留在发送控件里，
 * 一条行为断言都没有，而它们的失效形态都是静默的——光标跳到开头、中文输入法上屏后前一个字符
 * 消失、退格删掉半个提及——不报错，只能靠人在界面上敲出来。
 *
 * 判定进这个模块，带副作用与有时序的宿主操作按最小结构接口注入（ADR 0075）：不注入 DOM 类型，
 * 视图负责把 Text 节点、提及芯片与 Selection 映射成下面这几个朴素结构。
 */

/** 编辑器一个子节点的结构读数。视图从 DOM 映射出来，映射本身是机械动作。 */
export type ComposerHostNodeReading =
  | { readonly kind: 'text', readonly text: string }
  | { readonly kind: 'mention', readonly id: string, readonly name: string }
  /** 浏览器在 contenteditable 里换行时插入的 `<br>`。 */
  | { readonly kind: 'line-break' }
  /** 浏览器编辑时套上的容器元素，正文在它的子节点里。 */
  | { readonly kind: 'container', readonly children: readonly ComposerHostNodeReading[] }

/** 要渲染进编辑器的节点。与 token 一一对应，视图按它造 Text 节点与提及芯片。 */
export type ComposerHostNodePlan =
  | { readonly kind: 'text', readonly text: string }
  | { readonly kind: 'mention', readonly id: string, readonly name: string }

/** 光标在宿主里的落点读数。 */
export type ComposerHostCaretReading =
  /** 落在编辑器元素本身上，偏移是子节点序号。 */
  | { readonly kind: 'editor', readonly childOffset: number }
  /** 落在第 `childIndex` 个子节点里，含落进提及芯片内部的文字。 */
  | { readonly kind: 'child', readonly childIndex: number, readonly offset: number }

/** 光标要写到哪里。 */
export type ComposerHostCaretTarget =
  | { readonly kind: 'child', readonly childIndex: number, readonly offset: number }
  /** 目标 token 不存在：落到编辑器末尾。 */
  | { readonly kind: 'editor-end' }

export interface ComposerDraftCaret {
  readonly tokenIndex: number
  readonly offset: number
}

/**
 * 空文本 token 的光标锚点。
 *
 * 提及芯片不可编辑，两侧必须各有一个真实文本节点，用户才点得出光标；空文本节点在宿主里没有
 * 可点面积，因此填一个零宽字符。回读时它不算正文，由 `normalizeComposerTokens` 去掉。
 */
export const COMPOSER_CARET_ANCHOR = '​'

/** 从子节点结构读数回读出草稿 token。容器被摊平，换行成为正文里的换行字符。 */
export function readComposerDraftTokens(
  readings: readonly ComposerHostNodeReading[],
): ComposerDraftToken[] {
  const tokens: ComposerDraftToken[] = []
  const walk = (reading: ComposerHostNodeReading) => {
    if (reading.kind === 'text') {
      tokens.push({ type: 'text', text: reading.text })
      return
    }
    if (reading.kind === 'mention') {
      tokens.push({ type: 'mention', id: reading.id, name: reading.name })
      return
    }
    if (reading.kind === 'line-break') {
      tokens.push({ type: 'text', text: '\n' })
      return
    }
    reading.children.forEach(walk)
  }
  readings.forEach(walk)
  return normalizeComposerTokens(tokens)
}

/** 把草稿渲染成节点计划。 */
export function planComposerHostNodes(
  tokens: readonly ComposerDraftToken[],
): ComposerHostNodePlan[] {
  const plan = tokens.map((token): ComposerHostNodePlan => token.type === 'text'
    ? { kind: 'text', text: token.text || COMPOSER_CARET_ANCHOR }
    : { kind: 'mention', id: token.id, name: token.name })
  // 浏览器在空 contenteditable 里常插入 `<br>`；至少留一个文本节点，光标与 `:empty` 判定才成立。
  return plan.length ? plan : [{ kind: 'text', text: '' }]
}

/**
 * 把光标夹到一个可落脚的位置。
 *
 * 提及 token 上没有可落脚的偏移（芯片不可编辑），统一挪到后一个文本 token 起点；
 * `normalizeComposerTokens` 保证每个提及后面都有一个文本 token。
 */
function clampDraftCaret(
  tokens: readonly ComposerDraftToken[],
  tokenIndex: number,
  offset: number,
): ComposerDraftCaret {
  const lastIndex = Math.max(0, tokens.length - 1)
  const index = Math.min(Math.max(tokenIndex, 0), lastIndex)
  const token = tokens[index]
  if (token?.type === 'text') {
    return { tokenIndex: index, offset: Math.min(Math.max(offset, 0), token.text.length) }
  }
  return { tokenIndex: Math.min(index + 1, lastIndex), offset: 0 }
}

/**
 * 读回光标落在第几个 token 的第几个偏移。
 *
 * 落在编辑器元素上有两种含义：下一个子节点是文本时归到它的起点；是提及芯片时停在**前一个**
 * 文本 token 末尾——用户此时看到的光标就贴在芯片左侧，接着退格删的应当是这个提及。
 *
 * 子节点序号按「一个 token 一个节点」对应。浏览器换行插入的 `<br>` 会在回读时并进相邻文本
 * token，节点数从此多于 token 数，落在换行之后的光标因此夹到最后一个 token 上——这是治理前
 * 就有的口径，本轮逐字保留，不在这里顺手改判。
 */
export function resolveComposerCaretFromReading(
  tokens: readonly ComposerDraftToken[],
  reading: ComposerHostCaretReading,
): ComposerDraftCaret {
  if (reading.kind === 'editor') {
    const next = tokens[reading.childOffset]
    if (!next) return clampDraftCaret(tokens, tokens.length - 1, Number.MAX_SAFE_INTEGER)
    if (next.type === 'mention') {
      return clampDraftCaret(tokens, reading.childOffset - 1, Number.MAX_SAFE_INTEGER)
    }
    return clampDraftCaret(tokens, reading.childOffset, 0)
  }
  const token = tokens[reading.childIndex]
  return clampDraftCaret(tokens, reading.childIndex, token?.type === 'text' ? reading.offset : 0)
}

/**
 * 把「第几个 token 的第几个偏移」换成宿主的落点。
 *
 * 偏移只收下界不收上界：空文本 token 在宿主里是一个零宽字符节点，长度是 1 而不是 0，
 * 真实节点长度只有宿主知道，上限由视图夹紧。
 */
export function resolveComposerCaretTarget(
  tokens: readonly ComposerDraftToken[],
  tokenIndex: number,
  offset: number,
): ComposerHostCaretTarget {
  const token = tokens[tokenIndex]
  if (!token) return { kind: 'editor-end' }
  if (token.type === 'text') {
    return { kind: 'child', childIndex: tokenIndex, offset: Math.max(offset, 0) }
  }
  // 提及芯片不可编辑：光标写到它后面那个文本节点起点。
  return { kind: 'child', childIndex: tokenIndex + 1, offset: 0 }
}

/** 宿主操作。带副作用、有时序，全部按最小结构接口注入。 */
export interface ComposerDraftHostAdapter {
  /** 回读编辑器子节点；宿主还没挂上时返回 undefined。 */
  readNodes(): readonly ComposerHostNodeReading[] | undefined
  /** 按计划整体替换编辑器子节点。 */
  renderNodes(plan: readonly ComposerHostNodePlan[]): void
  /** 读光标落点；光标不在编辑器里时返回 undefined。 */
  readCaret(): ComposerHostCaretReading | undefined
  /** 把光标写到目标落点。 */
  writeCaret(target: ComposerHostCaretTarget): void
  /** 等下一拍。contenteditable 的 input 事件有时早于 Selection 更新。 */
  nextTick(): Promise<void>
  /** 聚焦输入控件。 */
  focus(): void
}

export function createComposerDraftHost(adapter: ComposerDraftHostAdapter) {
  const draft = ref<ComposerDraft>(createEmptyComposerDraft())
  /** 输入法组字中。此前是模板上两个内联赋值，四处判定各读一次。 */
  const composing = ref(false)
  /**
   * 占位文案与发送按钮的可用性都看这一项。
   *
   * 组字期间草稿仍是空的（不读回），但宿主里已经有未上屏的拼音；此时若按「草稿为空」显示占位
   * 文案，它会和拼音叠在一起。因此组字中一律不算空。
   */
  const isEmpty = computed(() => !composing.value && isComposerDraftEmpty(draft.value.tokens))
  /** 程序化替换节点期间不读回：宿主若把这次替换报成 input，读回会拿到半份内容。 */
  let suppressRead = false

  function render() {
    suppressRead = true
    adapter.renderNodes(planComposerHostNodes(draft.value.tokens))
    suppressRead = false
  }

  function apply(next: ComposerDraft, options: { focus?: boolean } = {}) {
    draft.value = {
      tokens: normalizeComposerTokens(next.tokens),
      tokenIndex: next.tokenIndex,
      offset: next.offset,
    }
    render()
    if (options.focus === false) return
    // 等节点替换生效后再聚焦写光标；同一拍里写会落在已经被替换掉的旧节点上。
    void adapter.nextTick().then(() => {
      adapter.focus()
      const current = draft.value
      adapter.writeCaret(resolveComposerCaretTarget(current.tokens, current.tokenIndex, current.offset))
    })
  }

  /** 清空草稿。切换会话时用，不抢焦点——用户可能正在别处操作。 */
  function reset() {
    apply(createEmptyComposerDraft(), { focus: false })
  }

  function readCaret(tokens: readonly ComposerDraftToken[]): ComposerDraftCaret | undefined {
    const reading = adapter.readCaret()
    if (!reading) return
    return resolveComposerCaretFromReading(tokens, reading)
  }

  /** 按宿主当前 Selection 对齐草稿光标。指针与方向键之后用。 */
  function syncCaretFromHost() {
    const caret = readCaret(draft.value.tokens)
    if (!caret) return
    draft.value = { ...draft.value, ...caret }
  }

  /**
   * 宿主报出一次输入。
   *
   * 两条时序都在这里：组字期间一个字都不读回；读回前先等一拍，否则读到的是旧光标，
   * 表现为「单独输入 @ 之后候选菜单不弹」。
   */
  async function handleInput() {
    if (suppressRead || composing.value) return
    await adapter.nextTick()
    const readings = adapter.readNodes()
    if (!readings) return
    const tokens = readComposerDraftTokens(readings)
    const caret = readCaret(tokens)
    draft.value = {
      tokens,
      tokenIndex: caret?.tokenIndex ?? draft.value.tokenIndex,
      offset: caret?.offset ?? draft.value.offset,
    }
  }

  function startComposition() {
    composing.value = true
  }

  /** 上屏。此刻宿主里的正文才是最终结果，立刻读回一次。 */
  async function endComposition() {
    composing.value = false
    await handleInput()
  }

  /** 从别处（消息右键「提及某人」）插入一个提及。 */
  function insertMention(mention: { id: string, name: string }) {
    syncCaretFromHost()
    const current = draft.value
    const token = current.tokens[current.tokenIndex]
    const offset = token?.type === 'text' ? current.offset : 0
    apply(insertComposerMention(current.tokens, current.tokenIndex, offset, mention))
  }

  function serialize() {
    return serializeComposerDraft(draft.value.tokens)
  }

  return {
    draft,
    composing,
    isEmpty,
    render,
    apply,
    reset,
    syncCaretFromHost,
    handleInput,
    startComposition,
    endComposition,
    insertMention,
    serialize,
    focus: () => adapter.focus(),
  }
}

export type ComposerDraftHost = ReturnType<typeof createComposerDraftHost>
