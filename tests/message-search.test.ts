import { describe, expect, it, vi } from 'vitest'
import {
  createMessageSearchController,
  planMessageSearchQuery,
  shouldCloseMessageSearchOnOutsidePointer,
  type MessageSearchAdapter,
} from '../client/webqq/message-search'
import type { SandboxMessageSearchHit, SandboxMessageSearchResult } from '../src/types'

function hit(messageId: string): SandboxMessageSearchHit {
  return {
    messageId,
    conversationId: 'c1',
    authorId: '10001',
    createdAt: '2026-08-30T09:00:00.000Z',
    summary: messageId,
  }
}

function harness(overrides: Partial<MessageSearchAdapter> = {}) {
  const requests: Array<Record<string, unknown>> = []
  const calls: string[] = []
  let result: SandboxMessageSearchResult = { hits: [] }
  let loadedIds = new Set<string>()
  const adapter: MessageSearchAdapter = {
    getConversationId: () => 'c1',
    search: async (input) => {
      requests.push(input as unknown as Record<string, unknown>)
      calls.push('search')
      return result
    },
    isMessageLoaded: (messageId) => loadedIds.has(messageId),
    canLoadMore: () => false,
    getOldestLoadedMessageId: () => undefined,
    loadMore: async () => {
      calls.push('loadMore')
    },
    revealMessage: (messageId) => {
      calls.push(`reveal:${messageId}`)
      return true
    },
    settle: async () => {
      calls.push('settle')
    },
    focusTrigger: () => calls.push('focus'),
    isSelectionActive: () => false,
    exitSelection: () => calls.push('exitSelection'),
    ...overrides,
  }
  const controller = createMessageSearchController(adapter)
  return {
    controller,
    requests,
    calls,
    setResult: (next: SandboxMessageSearchResult) => {
      result = next
    },
    setLoaded: (ids: string[]) => {
      loadedIds = new Set(ids)
    },
  }
}

describe('聊天记录搜索的查询条件', () => {
  it('关键词去掉首尾空白后落到查询参数上', () => {
    expect(planMessageSearchQuery({ query: '  好感度  ' })).toEqual({
      query: { query: '好感度' },
      outcome: 'search',
    })
  })

  /** 日期按本地日历日换算成半开区间，跨夏令时那天不能按固定 24 小时推。 */
  it('选中日期换算成本地日历日的半开区间', () => {
    const plan = planMessageSearchQuery({ query: '', localDate: '2026-08-30' })

    expect(plan.outcome).toBe('search')
    expect(plan.query.createdAtStart).toBe(new Date(2026, 7, 30).toISOString())
    expect(plan.query.createdAtEnd).toBe(new Date(2026, 7, 31).toISOString())
  })

  it('关键词与日期同时给出时两者都进查询参数', () => {
    const plan = planMessageSearchQuery({ query: '好感度', localDate: '2026-08-30' })

    expect(plan.outcome).toBe('search')
    expect(plan.query.query).toBe('好感度')
    expect(plan.query.createdAtStart).toBeDefined()
  })

  it('什么条件都没有时不发请求，也不报错', () => {
    expect(planMessageSearchQuery({ query: '   ' })).toEqual({ query: { query: '' }, outcome: 'empty' })
  })

  it('选了日期但换算不出范围时报错', () => {
    expect(planMessageSearchQuery({ query: '好感度', localDate: '2026-02-30' }).outcome).toBe('invalid-date')
    expect(planMessageSearchQuery({ query: '好感度', localDate: '不是日期' }).outcome).toBe('invalid-date')
  })

  /**
   * 顺序判定：先「什么都没有」再「日期无效」。清空关键词后留下一个非法日期时，面板本就没有
   * 可搜的条件，此时报错会变成噪声。颠倒过来用户会看到「筛选日期无效」而不是空面板。
   */
  it('关键词也空时非法日期算「没有条件」而不是报错', () => {
    expect(planMessageSearchQuery({ query: '', localDate: '2026-02-30' }).outcome).toBe('empty')
  })
})

describe('聊天记录搜索的外点关闭', () => {
  const inside = { open: true, insideShell: false, insideDatePopover: false, insideSelectContent: false }

  it('点在搜索壳子外面就关闭', () => {
    expect(shouldCloseMessageSearchOnOutsidePointer(inside)).toBe(true)
  })

  it('点在搜索壳子里面不关闭', () => {
    expect(shouldCloseMessageSearchOnOutsidePointer({ ...inside, insideShell: true })).toBe(false)
  })

  /** 日期弹层与它的月/年下拉都 portal 到 body，不豁免就会「点一下月份整条搜索栏消失」。 */
  it('日期弹层与月年下拉都算搜索内部', () => {
    expect(shouldCloseMessageSearchOnOutsidePointer({ ...inside, insideDatePopover: true })).toBe(false)
    expect(shouldCloseMessageSearchOnOutsidePointer({ ...inside, insideSelectContent: true })).toBe(false)
  })

  it('搜索没打开时任何点击都不触发关闭', () => {
    expect(shouldCloseMessageSearchOnOutsidePointer({ ...inside, open: false })).toBe(false)
  })
})

describe('聊天记录搜索的编排', () => {
  describe('发起查询', () => {
    it('按会话与条件发一次请求，命中与下一页游标写回面板', async () => {
      const { controller, requests, setResult } = harness()
      setResult({ hits: [hit('m9'), hit('m8')], nextBeforeMessageId: 'm8' })

      await controller.run({ query: '  好感度 ' })

      expect(requests).toEqual([{ conversationId: 'c1', query: '好感度', limit: 30 }])
      expect(controller.hits.value.map(({ messageId }) => messageId)).toEqual(['m9', 'm8'])
      expect(controller.nextBeforeMessageId.value).toBe('m8')
      expect(controller.loading.value).toBe(false)
    })

    it('没有会话时一次请求都不发', async () => {
      const { controller, requests } = harness({ getConversationId: () => undefined })
      await controller.run({ query: '好感度' })

      expect(requests).toEqual([])
    })

    it('条件为空时清掉上一轮结果，不发请求也不报错', async () => {
      const { controller, requests, setResult } = harness()
      setResult({ hits: [hit('m9')], nextBeforeMessageId: 'm9' })
      await controller.run({ query: '好感度' })

      await controller.run({ query: '' })

      expect(requests).toHaveLength(1)
      expect(controller.hits.value).toEqual([])
      expect(controller.nextBeforeMessageId.value).toBeUndefined()
      expect(controller.error.value).toBe('')
    })

    it('非法日期报出错误，不发请求', async () => {
      const { controller, requests } = harness()
      await controller.run({ query: '好感度', localDate: '2026-02-30' })

      expect(requests).toEqual([])
      expect(controller.error.value).toBe('筛选日期无效')
      expect(controller.loading.value).toBe(false)
    })

    it('请求在途时是加载态，结束后落下', async () => {
      let release = () => {}
      const { controller } = harness({
        search: () => new Promise((resolve) => {
          release = () => resolve({ hits: [hit('m1')] })
        }),
      })

      const running = controller.run({ query: '好感度' })
      expect(controller.loading.value).toBe(true)
      release()
      await running
      expect(controller.loading.value).toBe(false)
    })

    it('请求失败时报出错误并清空结果', async () => {
      const { controller, setResult } = harness()
      setResult({ hits: [hit('m9')] })
      await controller.run({ query: '好感度' })

      const failing = harness({ search: () => Promise.reject(new Error('数据库连不上')) })
      await failing.controller.run({ query: '好感度' })

      expect(failing.controller.error.value).toBe('数据库连不上')
      expect(failing.controller.hits.value).toEqual([])
      expect(failing.controller.loading.value).toBe(false)
    })

    /** 慢的那次回来时面板已经在搜另一个词；写回去会让结果与输入框对不上。 */
    it('在途请求的结果被后一次查询作废', async () => {
      const pending: Array<(result: SandboxMessageSearchResult) => void> = []
      const { controller } = harness({
        search: () => new Promise((resolve) => pending.push(resolve)),
      })

      const first = controller.run({ query: '第一次' })
      const second = controller.run({ query: '第二次' })
      pending[1]!({ hits: [hit('新')] })
      pending[0]!({ hits: [hit('旧')] })
      await Promise.all([first, second])

      expect(controller.hits.value.map(({ messageId }) => messageId)).toEqual(['新'])
    })
  })

  describe('翻页取更多命中', () => {
    async function paged() {
      const context = harness()
      context.setResult({ hits: [hit('m9'), hit('m8')], nextBeforeMessageId: 'm8' })
      await context.controller.run({ query: '好感度' })
      return context
    }

    it('带上游标与同一份条件取下一页，追加在已有命中之后', async () => {
      const context = await paged()
      context.setResult({ hits: [hit('m7')], nextBeforeMessageId: 'm7' })

      await context.controller.loadMore()

      expect(context.requests[1]).toEqual({
        conversationId: 'c1',
        query: '好感度',
        beforeMessageId: 'm8',
        limit: 30,
      })
      expect(context.controller.hits.value.map(({ messageId }) => messageId)).toEqual(['m9', 'm8', 'm7'])
      expect(context.controller.nextBeforeMessageId.value).toBe('m7')
    })

    /** 服务端按游标取，边界那条可能重复出现；重复的 key 会让 Vue 报警并错位。 */
    it('与已有命中重复的那条被去掉', async () => {
      const context = await paged()
      context.setResult({ hits: [hit('m8'), hit('m7')] })

      await context.controller.loadMore()

      expect(context.controller.hits.value.map(({ messageId }) => messageId)).toEqual(['m9', 'm8', 'm7'])
    })

    it('没有下一页游标时不再请求', async () => {
      const context = harness()
      context.setResult({ hits: [hit('m9')] })
      await context.controller.run({ query: '好感度' })

      await context.controller.loadMore()

      expect(context.requests).toHaveLength(1)
    })

    it('上一页还在路上时不叠加请求', async () => {
      const pending: Array<(result: SandboxMessageSearchResult) => void> = []
      const context = harness({ search: () => new Promise((resolve) => pending.push(resolve)) })
      const running = context.controller.run({ query: '好感度' })
      pending[0]!({ hits: [hit('m9')], nextBeforeMessageId: 'm9' })
      await running

      const first = context.controller.loadMore()
      await context.controller.loadMore()

      expect(pending).toHaveLength(2)
      pending[1]!({ hits: [] })
      await first
    })

    it('还没搜过时翻页什么都不做', async () => {
      const { controller, requests } = harness()
      await controller.loadMore()

      expect(requests).toEqual([])
    })

    it('翻页失败时报错但保住已有命中', async () => {
      let attempt = 0
      const context = harness({
        search: async () => {
          attempt += 1
          if (attempt === 1) return { hits: [hit('m9'), hit('m8')], nextBeforeMessageId: 'm8' }
          throw new Error('取更多失败')
        },
      })
      await context.controller.run({ query: '好感度' })

      await context.controller.loadMore()

      expect(context.controller.error.value).toBe('取更多失败')
      expect(context.controller.hits.value.map(({ messageId }) => messageId)).toEqual(['m9', 'm8'])
      expect(context.controller.loading.value).toBe(false)
    })
  })

  describe('跳到命中那一条', () => {
    it('目标已在列表里时等一拍再跳，并记下当前命中', async () => {
      const { controller, calls, setLoaded } = harness()
      setLoaded(['m9'])

      await controller.revealHit(hit('m9'))

      expect(calls).toEqual(['settle', 'reveal:m9'])
      expect(controller.activeMessageId.value).toBe('m9')
      expect(controller.error.value).toBe('')
    })

    /** 目标可能还在更早的历史里；没加载就跳等于跳空。 */
    it('目标未加载时先加载更早历史再跳', async () => {
      let loaded = false
      const { controller, calls } = harness({
        isMessageLoaded: () => loaded,
        canLoadMore: () => true,
        getOldestLoadedMessageId: () => (loaded ? 'm9' : 'm50'),
        loadMore: async () => {
          loaded = true
        },
      })

      await controller.revealHit(hit('m9'))

      expect(calls).toEqual(['settle', 'reveal:m9'])
      expect(controller.activeMessageId.value).toBe('m9')
    })

    it('没有更多历史也找不到目标时报错', async () => {
      const { controller, calls } = harness({ isMessageLoaded: () => false, canLoadMore: () => false })

      await controller.revealHit(hit('m9'))

      expect(controller.error.value).toBe('消息尚未加载，且没有更多历史消息')
      expect(calls).toEqual([])
      expect(controller.activeMessageId.value).toBe('')
    })

    it('跳转失败时如实报出来', async () => {
      const { controller, setLoaded } = harness({ revealMessage: () => false })
      setLoaded(['m9'])

      await controller.revealHit(hit('m9'))

      expect(controller.error.value).toBe('无法定位到该消息')
      expect(controller.activeMessageId.value).toBe('')
    })

    it('加载历史抛错时报错，跳转态照样结束', async () => {
      const { controller } = harness({
        isMessageLoaded: () => false,
        canLoadMore: () => true,
        loadMore: () => Promise.reject(new Error('读取历史失败')),
      })

      await controller.revealHit(hit('m9'))

      expect(controller.error.value).toBe('读取历史失败')
      expect(controller.revealingMessageId.value).toBe('')
    })

    /** 连点两条会让两次「加载更早」互相插队，结果落在错的那一条上。 */
    it('一次只跳一条', async () => {
      const pending: Array<() => void> = []
      const { controller, calls } = harness({
        isMessageLoaded: () => true,
        settle: () => new Promise((resolve) => pending.push(() => resolve())),
      })

      const first = controller.revealHit(hit('m9'))
      await controller.revealHit(hit('m8'))
      expect(calls).toEqual([])

      pending[0]!()
      await first
      expect(calls).toEqual(['reveal:m9'])
    })

    it('跳转期间面板显示正在定位的那一条', async () => {
      const pending: Array<() => void> = []
      const { controller } = harness({
        isMessageLoaded: () => true,
        settle: () => new Promise((resolve) => pending.push(() => resolve())),
      })

      const running = controller.revealHit(hit('m9'))
      expect(controller.revealingMessageId.value).toBe('m9')
      // 「确保已加载」是异步的，等它把控制权交出来之后才排到 settle。
      await Promise.resolve()
      pending[0]!()
      await running
      expect(controller.revealingMessageId.value).toBe('')
    })
  })

  describe('开合、重置与焦点还原', () => {
    it('没有会话时打不开', () => {
      const { controller } = harness({ getConversationId: () => undefined })
      controller.toggle()

      expect(controller.open.value).toBe(false)
    })

    it('打开后再点入口就关闭', () => {
      const { controller } = harness()
      controller.toggle()
      expect(controller.open.value).toBe(true)

      controller.toggle()
      expect(controller.open.value).toBe(false)
    })

    /** 结果面板与多选的悬浮操作栏叠在同一区域会抢焦点。 */
    it('打开搜索时退出多选', () => {
      const { controller, calls } = harness({ isSelectionActive: () => true })
      controller.toggle()

      expect(calls).toContain('exitSelection')
      expect(controller.open.value).toBe(true)
    })

    it('关闭时把上一轮结果、条件与错误一并清掉', async () => {
      const { controller, setResult } = harness()
      setResult({ hits: [hit('m9')], nextBeforeMessageId: 'm9' })
      controller.toggle()
      await controller.run({ query: '好感度' })

      await controller.close()

      expect(controller.open.value).toBe(false)
      expect(controller.hits.value).toEqual([])
      expect(controller.nextBeforeMessageId.value).toBeUndefined()
      expect(controller.criteria.value).toEqual({ query: '' })
      expect(controller.activeMessageId.value).toBe('')
      expect(controller.datePopoverOpen.value).toBe(false)
    })

    /** 键盘关闭要把焦点还给入口按钮，否则焦点落到 body，继续按 Tab 会从页首重来。 */
    it('要求还原焦点时等一拍再聚焦入口', async () => {
      const { controller, calls } = harness()
      controller.toggle()

      await controller.close(true)

      expect(calls).toEqual(['settle', 'focus'])
    })

    it('外点关闭不抢焦点，让点到的元素自然接管', async () => {
      const { controller, calls } = harness()
      controller.toggle()

      await controller.close()

      expect(calls).toEqual([])
    })

    it('重新打开时状态是干净的', async () => {
      const { controller, setResult } = harness()
      setResult({ hits: [hit('m9')], nextBeforeMessageId: 'm9' })
      controller.toggle()
      await controller.run({ query: '好感度' })
      await controller.close()

      controller.toggle()

      expect(controller.open.value).toBe(true)
      expect(controller.hits.value).toEqual([])
      expect(controller.error.value).toBe('')
    })

    /** 关闭时作废在途请求：不然上一次的结果会写进重新打开后的空面板。 */
    it('关闭作废在途请求，重新打开后不被旧结果污染', async () => {
      const pending: Array<(result: SandboxMessageSearchResult) => void> = []
      const { controller } = harness({
        search: () => new Promise((resolve) => pending.push(resolve)),
      })
      controller.toggle()
      const running = controller.run({ query: '好感度' })

      await controller.close()
      controller.toggle()
      pending[0]!({ hits: [hit('旧')] })
      await running

      expect(controller.hits.value).toEqual([])
      expect(controller.loading.value).toBe(false)
    })

    it('换会话时收起面板并清空结果', async () => {
      const { controller, setResult } = harness()
      setResult({ hits: [hit('m9')] })
      controller.toggle()
      await controller.run({ query: '好感度' })

      controller.leaveConversation()

      expect(controller.open.value).toBe(false)
      expect(controller.hits.value).toEqual([])
    })

    it('关闭时不调用消息列表的跳转方法', async () => {
      const revealMessage = vi.fn(() => true)
      const { controller } = harness({ revealMessage })
      controller.toggle()
      await controller.close(true)

      expect(revealMessage).not.toHaveBeenCalled()
    })
  })
})
