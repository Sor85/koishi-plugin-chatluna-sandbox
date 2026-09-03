import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import {
  COMPOSER_CARET_ANCHOR,
  createComposerDraftHost,
  planComposerHostNodes,
  readComposerDraftTokens,
  resolveComposerCaretFromReading,
  resolveComposerCaretTarget,
  resolveComposerHostTextOffset,
  isComposerMentionBoundary,
  resolveComposerMentionMenu,
  routeComposerKey,
  type ComposerDraftHostAdapter,
  type ComposerHostCaretReading,
  type ComposerHostCaretTarget,
  type ComposerHostNodePlan,
  type ComposerHostNodeReading,
} from '../client/webqq/composer-draft-host'
import type { ComposerDraftToken, MentionCandidate } from '../client/webqq/composer-draft'

function text(value: string): ComposerHostNodeReading {
  return { kind: 'text', text: value }
}

function mention(id: string, name: string): ComposerHostNodeReading {
  return { kind: 'mention', id, name }
}

/**
 * 造假宿主：把编辑器的子节点与 Selection 读数换成内存里的朴素结构，并把「下一拍」交给测试排。
 *
 * `nextTick` 不自己解决，而是攒进 `pending` 等 `flush()`：只有这样才能驱动
 * 「input 已触发、Selection 尚未更新」那个中间态，断言此刻草稿没有被过早读回。
 */
function createFakeHost(initial: readonly ComposerHostNodePlan[] = [{ kind: 'text', text: '' }]) {
  const pending: Array<() => void> = []
  const calls: string[] = []
  const renders: ComposerHostNodePlan[][] = []
  const carets: ComposerHostCaretTarget[] = []
  // 候选表来自上层模型，在真实组件里是响应式的 props；造假宿主用 ref 提供同样的响应性。
  const candidates = ref<MentionCandidate[]>([])
  const state = {
    nodes: [...initial] as ComposerHostNodePlan[],
    caret: undefined as ComposerHostCaretReading | undefined,
    detached: false,
    get candidates() {
      return candidates.value
    },
    set candidates(next: MentionCandidate[]) {
      candidates.value = next
    },
  }

  const adapter: ComposerDraftHostAdapter = {
    readNodes: () => {
      calls.push('read-nodes')
      if (state.detached) return undefined
      return state.nodes.map((node): ComposerHostNodeReading => node.kind === 'text'
        ? { kind: 'text', text: node.text }
        : { kind: 'mention', id: node.id, name: node.name })
    },
    renderNodes: (plan) => {
      calls.push('render-nodes')
      renders.push([...plan])
      state.nodes = [...plan]
    },
    readCaret: () => {
      calls.push('read-caret')
      return state.caret
    },
    writeCaret: (target) => {
      calls.push('write-caret')
      carets.push(target)
    },
    nextTick: () => {
      calls.push('next-tick')
      return new Promise<void>((resolve) => pending.push(resolve))
    },
    focus: () => calls.push('focus'),
    readMentionCandidates: () => state.candidates,
  }

  async function flush() {
    for (let guard = 0; guard < 8 && pending.length; guard += 1) {
      for (const resolve of pending.splice(0)) resolve()
      await Promise.resolve()
      await Promise.resolve()
    }
  }

  return { adapter, calls, renders, carets, state, flush }
}

const TOKENS_WITH_MENTION: ComposerDraftToken[] = [
  { type: 'text', text: '你好 ' },
  { type: 'mention', id: '10002', name: '测试用户2' },
  { type: 'text', text: ' 在吗' },
]

describe('WebQQ 发送控件草稿宿主', () => {
  describe('从子节点回读出草稿', () => {
    it('纯文本节点回读成一个文本 token', () => {
      expect(readComposerDraftTokens([text('你好')])).toEqual([{ type: 'text', text: '你好' }])
    })

    /** 提及在宿主里是一个不可编辑的芯片；回读时前后各补一个文本 token 作为光标锚点。 */
    it('单个提及回读成提及 token，并在前后留出光标锚点', () => {
      expect(readComposerDraftTokens([mention('10002', '测试用户2')])).toEqual([
        { type: 'text', text: '' },
        { type: 'mention', id: '10002', name: '测试用户2' },
        { type: 'text', text: '' },
      ])
    })

    it('文本与提及交替时按宿主顺序回读', () => {
      expect(readComposerDraftTokens([text('你好 '), mention('10002', '测试用户2'), text(' 在吗')]))
        .toEqual(TOKENS_WITH_MENTION)
    })

    /** 渲染时补进去的零宽锚点不是用户输入的正文，回读必须把它去掉，否则草稿永远不算空。 */
    it('零宽光标锚点不算正文', () => {
      expect(readComposerDraftTokens([text(COMPOSER_CARET_ANCHOR)])).toEqual([{ type: 'text', text: '' }])
    })

    /** 浏览器在 contenteditable 里换行时插入 <br>，它是正文里的一个换行而不是一个空节点。 */
    it('宿主插入的换行节点回读成换行字符', () => {
      expect(readComposerDraftTokens([text('上'), { kind: 'line-break' }, text('下')]))
        .toEqual([{ type: 'text', text: '上\n下' }])
    })

    /** 浏览器编辑时会把内容包进 <div>、<span> 之类的容器；回读要摊平而不是丢掉里面的正文。 */
    it('宿主套进容器的正文被摊平', () => {
      expect(readComposerDraftTokens([
        { kind: 'container', children: [text('你好 '), mention('10002', '测试用户2')] },
        text(' 在吗'),
      ])).toEqual(TOKENS_WITH_MENTION)
    })

    it('宿主一个子节点都没有时回读成空草稿', () => {
      expect(readComposerDraftTokens([])).toEqual([{ type: 'text', text: '' }])
    })
  })

  describe('把草稿渲染成节点', () => {
    it('文本与提及各渲染成一个节点', () => {
      expect(planComposerHostNodes(TOKENS_WITH_MENTION)).toEqual([
        { kind: 'text', text: '你好 ' },
        { kind: 'mention', id: '10002', name: '测试用户2' },
        { kind: 'text', text: ' 在吗' },
      ])
    })

    /** 空文本 token 渲染成零宽字符：否则那个位置在宿主里没有节点，用户点不出光标。 */
    it('空文本 token 渲染成零宽光标锚点', () => {
      expect(planComposerHostNodes([{ type: 'text', text: '' }]))
        .toEqual([{ kind: 'text', text: COMPOSER_CARET_ANCHOR }])
    })

    it('渲染后再回读得到同一份草稿', () => {
      for (const tokens of [
        TOKENS_WITH_MENTION,
        [{ type: 'text', text: '' }] as ComposerDraftToken[],
        [{ type: 'text', text: '' }, { type: 'mention', id: '20001', name: 'Koishi' }, { type: 'text', text: ' ' }] as ComposerDraftToken[],
      ]) {
        const readings = planComposerHostNodes(tokens).map((node): ComposerHostNodeReading => node.kind === 'text'
          ? { kind: 'text', text: node.text }
          : { kind: 'mention', id: node.id, name: node.name })
        expect(readComposerDraftTokens(readings)).toEqual(tokens)
      }
    })
  })

  describe('按 token 与偏移写光标', () => {
    it('写到文本 token 的第几个偏移', () => {
      expect(resolveComposerCaretTarget(TOKENS_WITH_MENTION, 0, 2))
        .toEqual({ kind: 'child', childIndex: 0, offset: 2 })
    })

    /** 提及芯片不可编辑，落在它上面的光标要挪到后一个文本节点起点，否则用户接着打字打不进去。 */
    it('写到提及之后而不是提及内部', () => {
      expect(resolveComposerCaretTarget(TOKENS_WITH_MENTION, 1, 0))
        .toEqual({ kind: 'child', childIndex: 2, offset: 0 })
    })

    it('写到末尾', () => {
      expect(resolveComposerCaretTarget(TOKENS_WITH_MENTION, 2, 3))
        .toEqual({ kind: 'child', childIndex: 2, offset: 3 })
    })

    /** 目标越界时落到编辑器末尾，而不是留在原地——原地在刚替换过节点的宿主里可能已经不存在。 */
    it('目标 token 不存在时兜底落到编辑器末尾', () => {
      expect(resolveComposerCaretTarget(TOKENS_WITH_MENTION, 9, 0)).toEqual({ kind: 'editor-end' })
      expect(resolveComposerCaretTarget([], 0, 0)).toEqual({ kind: 'editor-end' })
    })

    /**
     * 上限交给宿主：空文本 token 在宿主里是一个零宽字符节点，长度是 1 而不是 0，
     * 只有宿主知道真实节点长度。模块只负责不给出负偏移。
     */
    it('负偏移收成 0，上限留给宿主夹紧', () => {
      expect(resolveComposerCaretTarget(TOKENS_WITH_MENTION, 0, -5))
        .toEqual({ kind: 'child', childIndex: 0, offset: 0 })
      expect(resolveComposerCaretTarget(TOKENS_WITH_MENTION, 0, 999))
        .toEqual({ kind: 'child', childIndex: 0, offset: 999 })
    })
  })

  describe('读回光标', () => {
    it('落在文本节点里时按偏移归属那个 token', () => {
      expect(resolveComposerCaretFromReading(TOKENS_WITH_MENTION, { kind: 'child', childIndex: 2, offset: 2 }))
        .toEqual({ tokenIndex: 2, offset: 2 })
    })

    it('偏移超过文本长度时夹到末尾', () => {
      expect(resolveComposerCaretFromReading(TOKENS_WITH_MENTION, { kind: 'child', childIndex: 0, offset: 99 }))
        .toEqual({ tokenIndex: 0, offset: 3 })
    })

    /** 光标落进提及芯片内部（点了芯片上的文字）时统一归到它后面那个文本 token 的起点。 */
    it('落在提及节点内部时归到提及之后', () => {
      expect(resolveComposerCaretFromReading(TOKENS_WITH_MENTION, { kind: 'child', childIndex: 1, offset: 3 }))
        .toEqual({ tokenIndex: 2, offset: 0 })
    })

    it('落在编辑器元素上、下一个子节点是文本时归到该文本起点', () => {
      expect(resolveComposerCaretFromReading(TOKENS_WITH_MENTION, { kind: 'editor', childOffset: 2 }))
        .toEqual({ tokenIndex: 2, offset: 0 })
    })

    /** 落在提及芯片前面：停在前一个文本 token 末尾，用户接着退格删的才是这个提及。 */
    it('落在编辑器元素上、下一个子节点是提及时停在前一个文本末尾', () => {
      expect(resolveComposerCaretFromReading(TOKENS_WITH_MENTION, { kind: 'editor', childOffset: 1 }))
        .toEqual({ tokenIndex: 0, offset: 3 })
    })

    it('子节点序号越界时归到最后一个文本 token 末尾', () => {
      expect(resolveComposerCaretFromReading(TOKENS_WITH_MENTION, { kind: 'editor', childOffset: 3 }))
        .toEqual({ tokenIndex: 2, offset: 3 })
    })
  })

  describe('input 与 Selection 的时序', () => {
    /**
     * contenteditable 的 input 事件有时早于 Selection 更新。此前这条只是一句注释加一次
     * `nextTick`；宿主的「下一拍」经注入取得，因此中间态可以被驱动：input 已经触发、
     * 但这一拍还没过去时，草稿一个字都不读回。
     */
    it('input 触发后、下一拍尚未到来时不读回草稿', async () => {
      const host = createFakeHost()
      const draftHost = createComposerDraftHost(host.adapter)

      host.state.nodes = [{ kind: 'text', text: '你好' }]
      host.state.caret = { kind: 'child', childIndex: 0, offset: 2 }
      const settled = draftHost.handleInput()

      expect(host.calls).toEqual(['next-tick'])
      expect(draftHost.draft.value.tokens).toEqual([{ type: 'text', text: '' }])

      await host.flush()
      await settled
      expect(draftHost.draft.value.tokens).toEqual([{ type: 'text', text: '你好' }])
      expect(draftHost.draft.value.offset).toBe(2)
    })

    /** 等一拍之后读到的才是新光标。读早了会拿到旧光标，表现为「输入 @ 之后菜单不弹」。 */
    it('等一拍之后读到的是更新后的光标', async () => {
      const host = createFakeHost()
      const draftHost = createComposerDraftHost(host.adapter)

      host.state.nodes = [{ kind: 'text', text: '你好 @' }]
      host.state.caret = { kind: 'child', childIndex: 0, offset: 0 }
      const settled = draftHost.handleInput()
      // 宿主在这一拍之内才把 Selection 挪到新位置。
      host.state.caret = { kind: 'child', childIndex: 0, offset: 4 }
      await host.flush()
      await settled

      expect(draftHost.draft.value).toEqual({ tokens: [{ type: 'text', text: '你好 @' }], tokenIndex: 0, offset: 4 })
    })

    it('宿主还没挂上时读回什么都不做', async () => {
      const host = createFakeHost()
      const draftHost = createComposerDraftHost(host.adapter)
      host.state.detached = true

      const settled = draftHost.handleInput()
      await host.flush()
      await settled

      expect(draftHost.draft.value.tokens).toEqual([{ type: 'text', text: '' }])
    })

    it('读不到光标时保留原来的光标位置', async () => {
      const host = createFakeHost()
      const draftHost = createComposerDraftHost(host.adapter)

      host.state.nodes = [{ kind: 'text', text: '你好' }]
      host.state.caret = { kind: 'child', childIndex: 0, offset: 1 }
      let settled = draftHost.handleInput()
      await host.flush()
      await settled

      host.state.nodes = [{ kind: 'text', text: '你好啊' }]
      host.state.caret = undefined
      settled = draftHost.handleInput()
      await host.flush()
      await settled

      expect(draftHost.draft.value).toEqual({ tokens: [{ type: 'text', text: '你好啊' }], tokenIndex: 0, offset: 1 })
    })
  })

  describe('输入法状态', () => {
    /**
     * 组字期间宿主里已经有未上屏的拼音文本节点，读回会把它当成正文：接着发送就把拼音发出去，
     * 接着算提及就用拼音去过滤候选。
     */
    it('组字期间不读回草稿', async () => {
      const host = createFakeHost()
      const draftHost = createComposerDraftHost(host.adapter)

      draftHost.startComposition()
      host.state.nodes = [{ kind: 'text', text: 'ni hao' }]
      host.state.caret = { kind: 'child', childIndex: 0, offset: 6 }
      const settled = draftHost.handleInput()
      await host.flush()
      await settled

      expect(draftHost.composing.value).toBe(true)
      expect(draftHost.draft.value.tokens).toEqual([{ type: 'text', text: '' }])
      expect(host.calls).not.toContain('read-nodes')
    })

    it('上屏之后立刻读回一次，拿到的是上屏后的正文', async () => {
      const host = createFakeHost()
      const draftHost = createComposerDraftHost(host.adapter)

      draftHost.startComposition()
      host.state.nodes = [{ kind: 'text', text: '你好' }]
      host.state.caret = { kind: 'child', childIndex: 0, offset: 2 }
      const settled = draftHost.endComposition()
      await host.flush()
      await settled

      expect(draftHost.composing.value).toBe(false)
      expect(draftHost.draft.value).toEqual({ tokens: [{ type: 'text', text: '你好' }], tokenIndex: 0, offset: 2 })
    })

    /**
     * 占位文案按「有没有在输入」显示，而不是按草稿是否为空：组字期间草稿仍是空的，
     * 但宿主里已经有拼音，占位文案必须让位，否则两段文字叠在一起。
     */
    it('组字期间草稿虽空但不算空草稿', () => {
      const host = createFakeHost()
      const draftHost = createComposerDraftHost(host.adapter)

      expect(draftHost.isEmpty.value).toBe(true)
      draftHost.startComposition()
      expect(draftHost.isEmpty.value).toBe(false)
    })
  })

  describe('施加草稿', () => {
    it('施加后渲染节点，并在下一拍聚焦、写光标', async () => {
      const host = createFakeHost()
      const draftHost = createComposerDraftHost(host.adapter)

      draftHost.apply({ tokens: TOKENS_WITH_MENTION, tokenIndex: 2, offset: 1 })
      expect(host.renders.at(-1)).toEqual([
        { kind: 'text', text: '你好 ' },
        { kind: 'mention', id: '10002', name: '测试用户2' },
        { kind: 'text', text: ' 在吗' },
      ])
      expect(host.carets).toEqual([])

      await host.flush()
      expect(host.calls.filter((call) => call === 'focus')).toHaveLength(1)
      expect(host.carets).toEqual([{ kind: 'child', childIndex: 2, offset: 1 }])
    })

    /** 切换会话时清空草稿不该把焦点抢到输入框：用户可能正在别处操作。 */
    it('重置草稿不聚焦也不写光标', async () => {
      const host = createFakeHost()
      const draftHost = createComposerDraftHost(host.adapter)

      draftHost.reset()
      await host.flush()

      expect(draftHost.draft.value).toEqual({ tokens: [{ type: 'text', text: '' }], tokenIndex: 0, offset: 0 })
      expect(host.renders.at(-1)).toEqual([{ kind: 'text', text: COMPOSER_CARET_ANCHOR }])
      expect(host.calls).not.toContain('focus')
      expect(host.carets).toEqual([])
    })

    it('施加时把 token 规范化一遍，相邻文本合并、提及两侧留锚点', () => {
      const host = createFakeHost()
      const draftHost = createComposerDraftHost(host.adapter)

      draftHost.apply({
        tokens: [{ type: 'text', text: '你' }, { type: 'text', text: '好' }, { type: 'mention', id: '1', name: 'A' }],
        tokenIndex: 0,
        offset: 0,
      }, { focus: false })

      expect(draftHost.draft.value.tokens).toEqual([
        { type: 'text', text: '你好' },
        { type: 'mention', id: '1', name: 'A' },
        { type: 'text', text: '' },
      ])
    })
  })

  describe('把焦点交回输入框', () => {
    /**
     * 消息右键「回复」之后用户要接着打字。光标必须连着写：菜单打开期间焦点先落在菜单容器上，
     * 浏览器为 contenteditable 记住的选区到这时已经作废，只聚焦会让光标落在正文最前面。
     * 两个浏览器实测都是这个结果，因此不能指望它们各自的选区还原。
     */
    it('立刻聚焦并把光标写回草稿记着的位置', () => {
      const host = createFakeHost()
      const draftHost = createComposerDraftHost(host.adapter)
      draftHost.apply({ tokens: TOKENS_WITH_MENTION, tokenIndex: 2, offset: 1 }, { focus: false })
      const rendered = host.renders.length

      draftHost.focus()

      expect(host.calls.filter((call) => call === 'focus')).toHaveLength(1)
      expect(host.carets).toEqual([{ kind: 'child', childIndex: 2, offset: 1 }])
      // 交接焦点不碰正文：整体替换子节点会连带清掉浏览器的撤销栈与输入法状态。
      expect(host.renders).toHaveLength(rendered)
    })
  })

  describe('正文偏移换成节点偏移', () => {
    it('没有锚点时原样返回，超出正文时停在末尾', () => {
      expect(resolveComposerHostTextOffset('你好', 1)).toBe(1)
      expect(resolveComposerHostTextOffset('你好', 2)).toBe(2)
      expect(resolveComposerHostTextOffset('你好', 9)).toBe(2)
      expect(resolveComposerHostTextOffset('你好', -1)).toBe(0)
    })

    /**
     * 用户在空草稿里打字时，那次输入不重渲染，渲染阶段补进去的零宽锚点因此留在节点里，
     * 而草稿 token 里没有它。差这一位的表现是：右键「回复」之后接着打的字插到草稿倒数第二位。
     */
    it('跳过节点里留下的零宽锚点', () => {
      const text = `${COMPOSER_CARET_ANCHOR}你好`

      expect(resolveComposerHostTextOffset(text, 0)).toBe(1)
      expect(resolveComposerHostTextOffset(text, 1)).toBe(2)
      expect(resolveComposerHostTextOffset(text, 2)).toBe(3)
    })

    /** 空文本 token 的节点里只有锚点：光标落在它之后，下一个字才不会插到锚点前面。 */
    it('只有锚点的节点把光标放在锚点之后', () => {
      expect(resolveComposerHostTextOffset(COMPOSER_CARET_ANCHOR, 0)).toBe(1)
    })
  })

  describe('从别处插入提及', () => {
    /** 从消息右键「提及某人」进来时，先按宿主当前 Selection 对齐草稿光标，再插到那个位置。 */
    it('插到当前光标处并把光标留在提及之后', async () => {
      const host = createFakeHost([{ kind: 'text', text: '你好 在吗' }])
      const draftHost = createComposerDraftHost(host.adapter)

      draftHost.apply({ tokens: [{ type: 'text', text: '你好 在吗' }], tokenIndex: 0, offset: 0 }, { focus: false })
      host.state.caret = { kind: 'child', childIndex: 0, offset: 3 }
      draftHost.insertMention({ id: '10002', name: '测试用户2' })
      await host.flush()

      expect(draftHost.draft.value.tokens).toEqual([
        { type: 'text', text: '你好 ' },
        { type: 'mention', id: '10002', name: '测试用户2' },
        // 提及后自动补入的分隔符是不换行空格，序列化时才还原成普通空格。
        { type: 'text', text: '\u00a0在吗' },
      ])
      expect(draftHost.serialize()).toBe('你好 <at id="10002"/> 在吗')
      expect(host.carets.at(-1)).toEqual({ kind: 'child', childIndex: 2, offset: 1 })
    })

    it('读不到宿主光标时插到草稿记着的那个位置', async () => {
      const host = createFakeHost()
      const draftHost = createComposerDraftHost(host.adapter)

      draftHost.apply({ tokens: [{ type: 'text', text: '你好' }], tokenIndex: 0, offset: 2 }, { focus: false })
      host.state.caret = undefined
      draftHost.insertMention({ id: '20001', name: 'Koishi' })
      await host.flush()

      expect(draftHost.serialize()).toBe('你好 <at id="20001"/>')
    })
  })

  describe('光标与宿主对齐', () => {
    it('按宿主当前 Selection 更新草稿光标', () => {
      const host = createFakeHost()
      const draftHost = createComposerDraftHost(host.adapter)

      draftHost.apply({ tokens: TOKENS_WITH_MENTION, tokenIndex: 0, offset: 0 }, { focus: false })
      host.state.caret = { kind: 'child', childIndex: 2, offset: 2 }
      draftHost.syncCaretFromHost()

      expect(draftHost.draft.value.tokenIndex).toBe(2)
      expect(draftHost.draft.value.offset).toBe(2)
    })

    it('读不到光标时不动草稿', () => {
      const host = createFakeHost()
      const draftHost = createComposerDraftHost(host.adapter)

      draftHost.apply({ tokens: TOKENS_WITH_MENTION, tokenIndex: 2, offset: 1 }, { focus: false })
      host.state.caret = undefined
      draftHost.syncCaretFromHost()

      expect(draftHost.draft.value.tokenIndex).toBe(2)
      expect(draftHost.draft.value.offset).toBe(1)
    })
  })

  describe('候选菜单该不该开', () => {
    function menu(text: string, offset: number, overrides: { composing?: boolean, hasCandidates?: boolean } = {}) {
      return resolveComposerMentionMenu({
        tokens: [{ type: 'text', text }],
        tokenIndex: 0,
        offset,
        composing: false,
        hasCandidates: true,
        ...overrides,
      })
    }

    it('输入 @ 之后开，片段就是 @ 后面已经打进去的那几个字', () => {
      expect(menu('@', 1)).toEqual({ tokenIndex: 0, start: 0, query: '' })
      expect(menu('你好 @测', 5)).toEqual({ tokenIndex: 0, start: 3, query: '测' })
    })

    /** 片段里一出现空白就说明用户已经在写正文而不是在挑人，此时菜单必须关掉。 */
    it('片段中出现空白后关', () => {
      expect(menu('你好 @测试 用户', 8)).toBeUndefined()
    })

    /** 私聊没有可提及的人。候选为空时开一个空菜单只是挡住输入区。 */
    it('一个候选都没有时不开', () => {
      expect(menu('@', 1, { hasCandidates: false })).toBeUndefined()
    })

    /** 组字期间宿主里是未上屏的拼音，据它过滤候选等于用拼音去搜人。 */
    it('组字期间不开', () => {
      expect(menu('@', 1, { composing: true })).toBeUndefined()
    })

    /** 光标落在提及 token 上时没有可供检测的文本，菜单不开。 */
    it('光标不在文本 token 上时不开', () => {
      expect(resolveComposerMentionMenu({
        tokens: TOKENS_WITH_MENTION,
        tokenIndex: 1,
        offset: 0,
        composing: false,
        hasCandidates: true,
      })).toBeUndefined()
    })
  })

  describe('按键分流', () => {
    function route(key: string, overrides: Partial<Parameters<typeof routeComposerKey>[0]> = {}) {
      return routeComposerKey({
        key,
        shiftKey: false,
        disabled: false,
        composing: false,
        menuOpen: false,
        mentionBoundary: false,
        ...overrides,
      })
    }

    it('菜单开着时方向键在候选之间移动', () => {
      expect(route('ArrowDown', { menuOpen: true })).toEqual({ kind: 'move-candidate', delta: 1 })
      expect(route('ArrowUp', { menuOpen: true })).toEqual({ kind: 'move-candidate', delta: -1 })
    })

    it('菜单开着时 Enter 与 Tab 都是选中候选', () => {
      expect(route('Enter', { menuOpen: true })).toEqual({ kind: 'select-candidate' })
      expect(route('Tab', { menuOpen: true })).toEqual({ kind: 'select-candidate' })
    })

    /** Esc 只关菜单：正文一个字都不该丢。 */
    it('菜单开着时 Esc 只关菜单', () => {
      expect(route('Escape', { menuOpen: true })).toEqual({ kind: 'close-menu' })
    })

    it('菜单关着时 Enter 才是发送', () => {
      expect(route('Enter')).toEqual({ kind: 'submit' })
    })

    /** shift+Enter 是换行，不是发送。 */
    it('shift+Enter 不发送，交给宿主换行', () => {
      expect(route('Enter', { shiftKey: true })).toEqual({ kind: 'none' })
    })

    /** 组字期间的 Enter 是上屏确认，不是发送——否则把拼音发出去。 */
    it('组字期间 Enter 不发送', () => {
      expect(route('Enter', { composing: true })).toEqual({ kind: 'none' })
    })

    /** 菜单关着时方向键与 Esc 都交给宿主：移动光标、退出输入。 */
    it('菜单关着时方向键与 Esc 都不被消费', () => {
      expect(route('ArrowDown')).toEqual({ kind: 'none' })
      expect(route('ArrowUp')).toEqual({ kind: 'none' })
      expect(route('Escape')).toEqual({ kind: 'none' })
    })

    /**
     * 光标贴在提及右边时退格删掉整块提及。这条改由本模块说了算，两个引擎口径因此一致，
     * 不再依赖各家 contenteditable 对不可编辑节点的处理。
     */
    it('光标贴在提及右边时退格删掉整块提及', () => {
      expect(route('Backspace', { mentionBoundary: true })).toEqual({ kind: 'delete-mention' })
    })

    /** 其余位置的退格照旧交给宿主：删一个字符就是删一个字符。 */
    it('不在提及边界上的退格不被消费', () => {
      expect(route('Backspace')).toEqual({ kind: 'none' })
    })

    /** 组字期间的退格由输入法处理未上屏的拼音，不该动草稿。 */
    it('组字期间的退格不被消费', () => {
      expect(route('Backspace', { mentionBoundary: true, composing: true })).toEqual({ kind: 'none' })
    })

    /** 发送中或没有会话时整个输入区都不接受按键，包括换行与退格。 */
    it('发送中或没有会话时吞掉所有按键', () => {
      expect(route('Enter', { disabled: true })).toEqual({ kind: 'blocked' })
      expect(route('a', { disabled: true })).toEqual({ kind: 'blocked' })
      expect(route('Backspace', { disabled: true, mentionBoundary: true })).toEqual({ kind: 'blocked' })
      expect(route('ArrowDown', { disabled: true, menuOpen: true })).toEqual({ kind: 'blocked' })
    })

    it('普通字符不被消费', () => {
      expect(route('a')).toEqual({ kind: 'none' })
    })
  })

  describe('候选菜单与按键在宿主里合流', () => {
    const CANDIDATES: MentionCandidate[] = [
      { id: '10002', name: '测试用户2', kind: 'user' },
      { id: '10003', name: '管理员', kind: 'user', keywords: ['真实昵称'] },
      { id: '20001', name: 'Koishi', kind: 'bot' },
    ]

    async function typed(text: string, caretOffset = text.length) {
      const host = createFakeHost()
      host.state.candidates = CANDIDATES
      const draftHost = createComposerDraftHost(host.adapter)
      host.state.nodes = [{ kind: 'text', text }]
      host.state.caret = { kind: 'child', childIndex: 0, offset: caretOffset }
      const settled = draftHost.handleInput()
      await host.flush()
      await settled
      return { host, draftHost }
    }

    it('输入 @ 之后菜单开着，候选按片段过滤', async () => {
      const { draftHost } = await typed('你好 @')
      expect(draftHost.mentionMenuOpen.value).toBe(true)
      // 片段为空时不过滤，三个候选都在（排序口径由 composer-draft.test.ts 执行）。
      expect([...draftHost.mentionCandidates.value].map(({ id }) => id).sort()).toEqual(['10002', '10003', '20001'])

      const filtered = await typed('你好 @测')
      expect(filtered.draftHost.mentionCandidates.value.map(({ id }) => id)).toEqual(['10002'])

      // 关键字命中：候选自己的名字里没有「真实」，靠 keywords 命中。
      const byKeyword = await typed('你好 @真实')
      expect(byKeyword.draftHost.mentionCandidates.value.map(({ id }) => id)).toEqual(['10003'])
    })

    it('片段里出现空白后菜单关掉', async () => {
      const { draftHost } = await typed('你好 @测 试')
      expect(draftHost.mentionMenuOpen.value).toBe(false)
    })

    /** 组字期间收到 input：菜单必须关掉，否则未上屏的拼音会被当成提及片段去过滤。 */
    it('组字期间收到输入时菜单关掉，且草稿不读回', async () => {
      const { host, draftHost } = await typed('你好 @')
      expect(draftHost.mentionMenuOpen.value).toBe(true)

      draftHost.startComposition()
      host.state.nodes = [{ kind: 'text', text: '你好 @ceshi' }]
      const settled = draftHost.handleInput()
      await host.flush()
      await settled

      expect(draftHost.mentionMenuOpen.value).toBe(false)
      expect(draftHost.draft.value.tokens).toEqual([{ type: 'text', text: '你好 @' }])
    })

    it('方向键在候选里循环移动，Esc 只关菜单不动正文', async () => {
      const { draftHost } = await typed('你好 @')
      expect(draftHost.mentionMenuIndex.value).toBe(0)

      expect(draftHost.routeKey({ key: 'ArrowDown', shiftKey: false, disabled: false }).kind).toBe('move-candidate')
      expect(draftHost.mentionMenuIndex.value).toBe(1)
      draftHost.routeKey({ key: 'ArrowUp', shiftKey: false, disabled: false })
      expect(draftHost.mentionMenuIndex.value).toBe(0)
      // 到头回绕，用户不必反向按回去。
      draftHost.routeKey({ key: 'ArrowUp', shiftKey: false, disabled: false })
      expect(draftHost.mentionMenuIndex.value).toBe(2)

      draftHost.routeKey({ key: 'Escape', shiftKey: false, disabled: false })
      expect(draftHost.mentionMenuOpen.value).toBe(false)
      expect(draftHost.draft.value.tokens).toEqual([{ type: 'text', text: '你好 @' }])
    })

    /** 选中候选：`@片段` 整段换成提及，光标越过自动补入的分隔空格停在提及之后。 */
    it('Enter 选中候选后提及替换掉 @片段，光标落在提及之后', async () => {
      const { host, draftHost } = await typed('你好 @测')

      expect(draftHost.routeKey({ key: 'Enter', shiftKey: false, disabled: false }).kind).toBe('select-candidate')
      await host.flush()

      expect(draftHost.draft.value.tokens).toEqual([
        { type: 'text', text: '你好 ' },
        { type: 'mention', id: '10002', name: '测试用户2' },
        { type: 'text', text: ' ' },
      ])
      expect(draftHost.draft.value).toMatchObject({ tokenIndex: 2, offset: 1 })
      expect(host.carets.at(-1)).toEqual({ kind: 'child', childIndex: 2, offset: 1 })
      expect(draftHost.mentionMenuOpen.value).toBe(false)
    })

    it('菜单开着但一个候选都过滤不出来时，Enter 不插入也不发送', async () => {
      const { draftHost } = await typed('你好 @查无此人')

      // 片段过滤不出候选，但菜单仍开着（候选列表本身非空），Enter 因此被菜单吞掉。
      expect(draftHost.mentionMenuOpen.value).toBe(true)
      expect(draftHost.mentionCandidates.value).toEqual([])
      expect(draftHost.routeKey({ key: 'Enter', shiftKey: false, disabled: false }).kind).toBe('select-candidate')
      expect(draftHost.draft.value.tokens).toEqual([{ type: 'text', text: '你好 @查无此人' }])
    })

    it('菜单关着时 Enter 交回调用方去发送', async () => {
      const { draftHost } = await typed('你好')
      expect(draftHost.mentionMenuOpen.value).toBe(false)
      expect(draftHost.routeKey({ key: 'Enter', shiftKey: false, disabled: false })).toEqual({ kind: 'submit' })
    })

    it('候选表变短后高亮项跟着收回来，不会指向不存在的候选', async () => {
      const { host, draftHost } = await typed('你好 @')
      draftHost.routeKey({ key: 'ArrowUp', shiftKey: false, disabled: false })
      expect(draftHost.mentionMenuIndex.value).toBe(2)

      host.state.candidates = [CANDIDATES[0]!]
      expect(draftHost.mentionMenuIndex.value).toBe(0)
    })

    it('鼠标悬停可以直接指定高亮项', async () => {
      const { draftHost } = await typed('你好 @')
      draftHost.setMentionSelection(2)
      expect(draftHost.mentionMenuIndex.value).toBe(2)
    })

    it('清空草稿时菜单一起关掉', async () => {
      const { draftHost } = await typed('你好 @')
      draftHost.reset()
      expect(draftHost.mentionMenuOpen.value).toBe(false)
    })
  })

  describe('退格跨提及整块删除', () => {
    const MENTION: ComposerDraftToken = { type: 'mention', id: '10002', name: '测试用户2' }

    /**
     * 提及是原子的：一次退格删掉整块，从不留下半截 `@测试` 文本。这条规则本轮改由宿主执行
     * 而不是各家 contenteditable，因此两个引擎口径一致，并且光标停在提及原来的位置。
     */
    function backspaceAt(tokens: readonly ComposerDraftToken[], tokenIndex: number, offset = 0) {
      const host = createFakeHost()
      const draftHost = createComposerDraftHost(host.adapter)
      draftHost.apply({ tokens: [...tokens], tokenIndex, offset }, { focus: false })
      const action = draftHost.routeKey({ key: 'Backspace', shiftKey: false, disabled: false })
      return { host, draftHost, action }
    }

    it('提及位于两段文本之间时整块消失，光标停在它原来的位置', async () => {
      const { host, draftHost, action } = backspaceAt(
        [{ type: 'text', text: '你好 ' }, MENTION, { type: 'text', text: ' 在吗' }],
        2,
      )
      await host.flush()

      expect(action).toEqual({ kind: 'delete-mention' })
      expect(draftHost.draft.value.tokens).toEqual([{ type: 'text', text: '你好  在吗' }])
      // 提及原来就在「你好 」之后，光标停在那里而不是被推到行尾。
      expect(draftHost.draft.value).toMatchObject({ tokenIndex: 0, offset: 3 })
      expect(host.carets.at(-1)).toEqual({ kind: 'child', childIndex: 0, offset: 3 })
    })

    it('提及位于开头时整块消失，光标落在正文起点', async () => {
      const { host, draftHost, action } = backspaceAt(
        [{ type: 'text', text: '' }, MENTION, { type: 'text', text: '在吗' }],
        2,
      )
      await host.flush()

      expect(action).toEqual({ kind: 'delete-mention' })
      expect(draftHost.draft.value.tokens).toEqual([{ type: 'text', text: '在吗' }])
      expect(draftHost.draft.value).toMatchObject({ tokenIndex: 0, offset: 0 })
    })

    it('提及位于末尾时整块消失，光标停在前一段文本末尾', async () => {
      const { draftHost } = backspaceAt([{ type: 'text', text: '你好 ' }, MENTION, { type: 'text', text: '' }], 2)

      expect(draftHost.draft.value.tokens).toEqual([{ type: 'text', text: '你好 ' }])
      expect(draftHost.draft.value).toMatchObject({ tokenIndex: 0, offset: 3 })
      expect(draftHost.serialize()).toBe('你好')
    })

    /**
     * 选中候选后提及右边会自动补一个不换行空格，光标停在空格之后。那个位置上的退格只删掉
     * 那个空格，提及留着——这是治理前的行为，本轮保留，因此这次按键不被消费。
     */
    it('光标在提及后的分隔空格之后时，退格交给宿主只删那个空格', () => {
      const { draftHost, action } = backspaceAt(
        [{ type: 'text', text: '你好 ' }, MENTION, { type: 'text', text: ' 在吗' }],
        2,
        1,
      )

      expect(action).toEqual({ kind: 'none' })
      // 草稿一个字都没动：这次删除由宿主执行，随后的 input 事件才把结果读回来。
      expect(draftHost.draft.value.tokens).toEqual([
        { type: 'text', text: '你好 ' },
        MENTION,
        { type: 'text', text: ' 在吗' },
      ])
    })

    it('正文中间的退格不动提及', () => {
      const { draftHost, action } = backspaceAt(
        [{ type: 'text', text: '你好 ' }, MENTION, { type: 'text', text: ' 在吗' }],
        0,
        2,
      )

      expect(action).toEqual({ kind: 'none' })
      expect(draftHost.draft.value.tokens).toHaveLength(3)
    })

    /** 删到只剩零宽锚点时草稿算空：占位文案回来，发送按钮回到禁用。 */
    it('删干净后草稿算空', async () => {
      const host = createFakeHost()
      const draftHost = createComposerDraftHost(host.adapter)
      host.state.nodes = [{ kind: 'text', text: COMPOSER_CARET_ANCHOR }]
      host.state.caret = { kind: 'child', childIndex: 0, offset: 1 }
      const settled = draftHost.handleInput()
      await host.flush()
      await settled

      expect(draftHost.isEmpty.value).toBe(true)
      expect(draftHost.serialize()).toBe('')
    })
  })

  describe('提及边界的判定', () => {
    const TOKENS: ComposerDraftToken[] = [
      { type: 'text', text: '你好 ' },
      { type: 'mention', id: '10002', name: '测试用户2' },
      { type: 'text', text: ' 在吗' },
    ]

    it('光标贴在提及右边算边界', () => {
      expect(isComposerMentionBoundary(TOKENS, 2, 0)).toBe(true)
    })

    /** 偏移 1 是自动补入的分隔空格之后，那里的退格只删空格。 */
    it('越过分隔空格之后不算边界', () => {
      expect(isComposerMentionBoundary(TOKENS, 2, 1)).toBe(false)
    })

    it('前面不是提及时不算边界', () => {
      expect(isComposerMentionBoundary(TOKENS, 0, 0)).toBe(false)
      expect(isComposerMentionBoundary([{ type: 'text', text: '你好' }], 0, 0)).toBe(false)
    })

    /** 读回光标永远不会停在提及 token 上，这一条只是把不变量钉住。 */
    it('光标落在提及 token 上不算边界', () => {
      expect(isComposerMentionBoundary(TOKENS, 1, 0)).toBe(false)
    })
  })
})
