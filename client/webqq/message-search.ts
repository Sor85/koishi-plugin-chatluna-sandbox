import { ref } from 'vue'
import { ensureMessageLoaded } from './message-reveal'
import { localDateToMessageSearchRange } from './message-search-date'
import type {
  SandboxMessageSearchHit,
  SandboxMessageSearchResult,
  SearchConversationMessagesInput,
} from '../../src/types'

/**
 * 聊天记录搜索的整条编排：发起查询、翻页、跳到命中那条、开合与焦点还原。
 *
 * 这条流程此前完整住在聊天区域的 `script` 里，因此没有任何观察面——分页去重、在途请求作废、
 * 「先加载再跳转」的时序全靠读源码确认。日期换算与「确保目标消息已加载」早已是模块，
 * 编排没有；本模块补上的正是编排。
 *
 * 状态以 `ref` 形式住在这里，视图解构后照常在模板里绑定（ADR 0075）；Console RPC、
 * DOM 聚焦、下一拍与消息列表的跳转方法全部注入。
 */

/** 一页取多少条命中。 */
export const MESSAGE_SEARCH_PAGE_SIZE = 30

/** 搜索面板交出的条件：关键词与按本地日历日选中的那一天。 */
export interface MessageSearchCriteria {
  query: string
  localDate?: string
}

/** 落到 Console RPC 上的查询参数。翻页时原样复用，因此存成快照。 */
export type MessageSearchQuery = Pick<
  SearchConversationMessagesInput,
  'query' | 'createdAtStart' | 'createdAtEnd'
>

export interface MessageSearchQueryPlan {
  /** 写进条件快照的查询参数。无论是否值得发请求都要写：面板据它判断「有没有条件」。 */
  readonly query: MessageSearchQuery
  readonly outcome:
    /** 有条件，发请求。 */
    | 'search'
    /** 关键词与日期都没有：清空结果，不报错——这是刚打开面板时的正常状态。 */
    | 'empty'
    /** 选了日期但换算不出范围：报错，不发请求。 */
    | 'invalid-date'
}

/**
 * 条件构造。日期按**本地日历日**换算成半开区间，换算住在 message-search-date。
 *
 * 两个判定顺序不可颠倒：先判「什么条件都没有」，再判「日期无效」。因此清空关键词后留下一个
 * 非法日期时用户看到的是空结果而不是错误——面板此时本就没有可搜的条件，报错会变成噪声。
 */
export function planMessageSearchQuery(criteria: MessageSearchCriteria): MessageSearchQueryPlan {
  const query = criteria.query.trim()
  const dateRange = criteria.localDate ? localDateToMessageSearchRange(criteria.localDate) : undefined
  const plan: MessageSearchQuery = { query, ...(dateRange ?? {}) }

  if (!query && !dateRange) return { query: plan, outcome: 'empty' }
  if (criteria.localDate && !dateRange) return { query: plan, outcome: 'invalid-date' }
  return { query: plan, outcome: 'search' }
}

/**
 * 搜索框外点击是否该关闭搜索。
 *
 * 两处豁免都不是可选的：日期弹层与它的月/年下拉（shadcn Select）都 portal 到 body，
 * 不在搜索壳子的 DOM 子树里，不豁免就会「点一下月份，整条搜索栏连日期弹层一起消失」。
 * 元素归属的判定（`contains` / `closest`）是机械动作，留在视图里。
 */
export function shouldCloseMessageSearchOnOutsidePointer(input: {
  readonly open: boolean
  readonly insideShell: boolean
  readonly insideDatePopover: boolean
  readonly insideSelectContent: boolean
}): boolean {
  if (!input.open) return false
  return !input.insideShell && !input.insideDatePopover && !input.insideSelectContent
}

export interface MessageSearchAdapter {
  getConversationId(): string | undefined
  search(input: Omit<SearchConversationMessagesInput, 'operatorId'>): Promise<SandboxMessageSearchResult>
  /** 目标消息是否已经在列表里。 */
  isMessageLoaded(messageId: string): boolean
  canLoadMore(): boolean
  getOldestLoadedMessageId(): string | undefined
  loadMore(): Promise<void>
  /** 让消息列表滚到那一条并高亮；返回 false 表示没找到。 */
  revealMessage(messageId: string): boolean
  /** 等 DOM 更新落地。跳转前必须等，新加载的消息才在文档里。 */
  settle(): Promise<void>
  /** 把焦点还给搜索入口按钮。 */
  focusTrigger(): void
  isSelectionActive(): boolean
  exitSelection(): void
}

const SEARCH_FAILED_TEXT = '搜索会话消息失败'

export function createMessageSearchController(adapter: MessageSearchAdapter) {
  const open = ref(false)
  const loading = ref(false)
  const error = ref('')
  const hits = ref<SandboxMessageSearchHit[]>([])
  const nextBeforeMessageId = ref<string>()
  const activeMessageId = ref('')
  const revealingMessageId = ref('')
  const datePopoverOpen = ref(false)
  const criteria = ref<MessageSearchQuery>({ query: '' })
  /**
   * 在途请求的作废凭据。每次发起、翻页与重置都自增，回来的结果先比对一次；
   * 少了它，重新打开搜索后上一次的结果会覆盖当前面板。
   */
  let serial = 0

  function reset() {
    serial += 1
    datePopoverOpen.value = false
    loading.value = false
    error.value = ''
    criteria.value = { query: '' }
    hits.value = []
    nextBeforeMessageId.value = undefined
    activeMessageId.value = ''
    revealingMessageId.value = ''
  }

  async function close(restoreFocus = false) {
    open.value = false
    reset()
    if (!restoreFocus) return
    // 面板此刻才从 DOM 里撤掉，聚焦必须等下一拍，否则焦点落回 body。
    await adapter.settle()
    adapter.focusTrigger()
  }

  function toggle() {
    // 没有会话就没有可搜的记录；入口本身也是禁用态。
    if (!adapter.getConversationId()) return
    if (open.value) {
      void close()
      return
    }
    // 搜索与多选互斥：结果面板与悬浮操作栏叠在同一区域会抢焦点。
    if (adapter.isSelectionActive()) adapter.exitSelection()
    open.value = true
  }

  /** 换会话：结果绑定当前会话，旧命中的 messageId 在新会话里没有意义。 */
  function leaveConversation() {
    reset()
    open.value = false
  }

  async function run(input: MessageSearchCriteria) {
    const conversationId = adapter.getConversationId()
    const plan = planMessageSearchQuery(input)
    const requested = (serial += 1)
    criteria.value = plan.query
    activeMessageId.value = ''
    hits.value = []
    nextBeforeMessageId.value = undefined
    error.value = ''

    if (!conversationId || plan.outcome === 'empty') {
      loading.value = false
      return
    }
    if (plan.outcome === 'invalid-date') {
      loading.value = false
      error.value = '筛选日期无效'
      return
    }

    loading.value = true
    try {
      const result = await adapter.search({
        conversationId,
        ...plan.query,
        limit: MESSAGE_SEARCH_PAGE_SIZE,
      })
      if (requested !== serial) return
      hits.value = result.hits
      nextBeforeMessageId.value = result.nextBeforeMessageId
    } catch (failure) {
      if (requested !== serial) return
      hits.value = []
      nextBeforeMessageId.value = undefined
      error.value = failure instanceof Error ? failure.message : SEARCH_FAILED_TEXT
    } finally {
      if (requested === serial) loading.value = false
    }
  }

  async function loadMore() {
    const conversationId = adapter.getConversationId()
    const beforeMessageId = nextBeforeMessageId.value
    const snapshot = criteria.value
    if (
      !conversationId
      // 没有下一页游标就是「没有更多了」，不再发请求。
      || !beforeMessageId
      || (!snapshot.query && !snapshot.createdAtStart)
      || loading.value
    ) return

    const requested = (serial += 1)
    loading.value = true
    error.value = ''
    try {
      const result = await adapter.search({
        conversationId,
        ...snapshot,
        beforeMessageId,
        limit: MESSAGE_SEARCH_PAGE_SIZE,
      })
      if (requested !== serial) return
      // 去重：服务端按游标取，边界那条可能重复出现，重复的 key 会让 Vue 报警并错位。
      const known = new Set(hits.value.map(({ messageId }) => messageId))
      hits.value = [
        ...hits.value,
        ...result.hits.filter(({ messageId }) => !known.has(messageId)),
      ]
      nextBeforeMessageId.value = result.nextBeforeMessageId
    } catch (failure) {
      if (requested !== serial) return
      error.value = failure instanceof Error ? failure.message : SEARCH_FAILED_TEXT
    } finally {
      if (requested === serial) loading.value = false
    }
  }

  /**
   * 跳到某条命中：先确保它已加载，再等 DOM 落地，最后交给消息列表跳转。
   *
   * 三步顺序都是判定。目标消息可能还在更早的历史里，没加载就跳等于跳空；加载完不等下一拍就跳，
   * 元素还没进文档；跳转失败必须如实报出来，否则用户点一下什么都不发生。
   */
  async function revealHit(hit: SandboxMessageSearchHit) {
    // 一次只跳一条：连点会让两次「加载更早」互相插队。
    if (revealingMessageId.value) return
    revealingMessageId.value = hit.messageId
    error.value = ''
    try {
      const loaded = await ensureMessageLoaded({
        messageId: hit.messageId,
        isLoaded: () => adapter.isMessageLoaded(hit.messageId),
        canLoadMore: () => adapter.canLoadMore(),
        getOldestLoadedMessageId: () => adapter.getOldestLoadedMessageId(),
        loadMore: () => adapter.loadMore(),
      })
      if (!loaded) {
        error.value = '消息尚未加载，且没有更多历史消息'
        return
      }
      await adapter.settle()
      if (!adapter.revealMessage(hit.messageId)) {
        error.value = '无法定位到该消息'
        return
      }
      activeMessageId.value = hit.messageId
    } catch (failure) {
      error.value = failure instanceof Error ? failure.message : '定位消息失败'
    } finally {
      revealingMessageId.value = ''
    }
  }

  return {
    open,
    loading,
    error,
    hits,
    nextBeforeMessageId,
    activeMessageId,
    revealingMessageId,
    datePopoverOpen,
    criteria,
    close,
    toggle,
    leaveConversation,
    run,
    loadMore,
    revealHit,
  }
}
