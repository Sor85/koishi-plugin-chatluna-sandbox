import { describe, expect, it } from 'vitest'
import {
  COMPOSER_CARET_ANCHOR,
  createComposerDraftHost,
  planComposerHostNodes,
  readComposerDraftTokens,
  resolveComposerCaretFromReading,
  resolveComposerCaretTarget,
  type ComposerDraftHostAdapter,
  type ComposerHostCaretReading,
  type ComposerHostCaretTarget,
  type ComposerHostNodePlan,
  type ComposerHostNodeReading,
} from '../client/webqq/composer-draft-host'
import type { ComposerDraftToken } from '../client/webqq/composer-draft'

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
  const state = {
    nodes: [...initial] as ComposerHostNodePlan[],
    caret: undefined as ComposerHostCaretReading | undefined,
    detached: false,
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
})
