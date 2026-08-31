import { describe, expect, it } from 'vitest'
import {
  createMessageListContentResizeBinding,
  routeMessageListContentResize,
  switchMessageListConversation,
  type MessageListConversationSwitchAdapter,
} from '../client/webqq/message-list-conversation-switch'
import {
  createMessageListScrollRestoreScheduler,
} from '../client/webqq/message-list-scroll-restore'
import type { MessageListScrollState } from '../client/webqq/message-list-scroll-state'

/** 把五步顺序记成一串可比对的字符串。缺一步、错一步都会让这串对不上。 */
function recordingAdapter(restored: boolean) {
  const calls: string[] = []
  const adapter: MessageListConversationSwitchAdapter = {
    saveScrollState: (key) => calls.push(`save:${key}`),
    finishRestore: () => calls.push('finish'),
    cancelFollow: () => calls.push('cancel'),
    adoptKey: (key) => calls.push(`adopt:${key ?? '无'}`),
    restoreScrollState: (key) => {
      calls.push(`restore:${key ?? '无'}`)
      return restored
    },
    stickToBottom: () => calls.push('stick'),
  }
  return { adapter, calls }
}

describe('消息列表的会话切换编排', () => {
  describe('切换的五步顺序', () => {
    /**
     * 顺序错一步的表现是「切回去位置不对」或「新消息不再自动跟随」，两者都不报错。
     *
     * 换键必须排在恢复之前：恢复是分趟排程的，每一趟施加前都会重新问「当前活动键」，
     * 键还没换过来就排程等于让这一趟按旧键校验，前一次的排程会施加到新会话上。
     */
    it('存旧、结束恢复、取消追踪、换键、恢复，恰是这个顺序', () => {
      const { adapter, calls } = recordingAdapter(true)
      switchMessageListConversation({ preview: false, previousKey: 'A', nextKey: 'B' }, adapter)

      expect(calls).toEqual(['save:A', 'finish', 'cancel', 'adopt:B', 'restore:B'])
    })

    it('恢复不到状态时才置底，恢复成功就到此为止', () => {
      const restored = recordingAdapter(true)
      switchMessageListConversation({ preview: false, previousKey: 'A', nextKey: 'B' }, restored.adapter)
      expect(restored.calls).not.toContain('stick')

      const fresh = recordingAdapter(false)
      switchMessageListConversation({ preview: false, previousKey: 'A', nextKey: 'B' }, fresh.adapter)
      expect(fresh.calls).toEqual(['save:A', 'finish', 'cancel', 'adopt:B', 'restore:B', 'stick'])
    })

    /** 第一次进入工作台时没有旧键，不该凭空写一条空键的状态。 */
    it('没有旧键时不存旧，其余四步照旧', () => {
      const { adapter, calls } = recordingAdapter(false)
      switchMessageListConversation({ preview: false, previousKey: undefined, nextKey: 'B' }, adapter)

      expect(calls).toEqual(['finish', 'cancel', 'adopt:B', 'restore:B', 'stick'])
    })

    /** 会话被清空（没有新键）时不置底：没有内容可置底，置底会把状态写成贴底。 */
    it('没有新键时换键与结束恢复照做，但不置底', () => {
      const { adapter, calls } = recordingAdapter(false)
      switchMessageListConversation({ preview: false, previousKey: 'A', nextKey: undefined }, adapter)

      expect(calls).toEqual(['save:A', 'finish', 'cancel', 'adopt:无', 'restore:无'])
    })

    /** 缩略图里的消息列表不是用户在读的那一份，整条编排都不该跑。 */
    it('预览态一步都不做', () => {
      const { adapter, calls } = recordingAdapter(false)
      switchMessageListConversation({ preview: true, previousKey: 'A', nextKey: 'B' }, adapter)

      expect(calls).toEqual([])
    })
  })

  /**
   * 快速来回切换的污染路径：A 的恢复排程还没跑，用户已经切到 B。
   *
   * 这一条要靠真的排程器才能证明——它把「换键在恢复之前」这条顺序的**后果**验出来，
   * 而不只是验调用顺序。
   */
  it('前一次的排程不施加到后一次的会话上', () => {
    const applied: MessageListScrollState[] = []
    const frames: Array<() => void> = []
    let activeKey: string | undefined
    let nextFrameId = 0
    const scheduler = createMessageListScrollRestoreScheduler({
      requestAnimationFrame: (callback) => {
        nextFrameId += 1
        frames.push(callback)
        return nextFrameId
      },
      cancelAnimationFrame: () => {},
      apply: (state) => applied.push(state),
      getActiveKey: () => activeKey,
    })
    const states: Record<string, MessageListScrollState> = {
      A: { scrollTop: 100, stickingToBottom: false },
      B: { scrollTop: 900, stickingToBottom: false },
    }
    const adapter: MessageListConversationSwitchAdapter = {
      saveScrollState: () => {},
      finishRestore: () => scheduler.finish(),
      cancelFollow: () => {},
      adoptKey: (key) => {
        activeKey = key
      },
      restoreScrollState: (key) => {
        const state = key ? states[key] : undefined
        if (!state) return false
        scheduler.begin(state)
        scheduler.schedule(key)
        return true
      },
      stickToBottom: () => {},
    }

    switchMessageListConversation({ preview: false, previousKey: undefined, nextKey: 'A' }, adapter)
    switchMessageListConversation({ preview: false, previousKey: 'A', nextKey: 'B' }, adapter)
    while (frames.length) frames.shift()!()

    expect(applied).toEqual([states.B, states.B])
  })

  describe('容器尺寸变化的二选一', () => {
    /**
     * 新消息里的媒体与思考内容会在 Vue 更新之后继续增高，因此容器尺寸变化时要补一次位置。
     * 补哪一种是二选一：恢复中补的是恢复目标，否则只在用户本来就贴底时才补到底部。
     * 选错的表现是「切回会话后被弹到底部」或「新消息不再跟随」。
     */
    it('恢复中就重排恢复，不置底', () => {
      expect(routeMessageListContentResize({ restoring: true, stickingToBottom: true }))
        .toEqual({ kind: 'reschedule-restore' })
      expect(routeMessageListContentResize({ restoring: true, stickingToBottom: false }))
        .toEqual({ kind: 'reschedule-restore' })
    })

    it('不在恢复中且处于贴底状态才置底', () => {
      expect(routeMessageListContentResize({ restoring: false, stickingToBottom: true }))
        .toEqual({ kind: 'stick-to-bottom' })
    })

    it('既不在恢复中也没贴底时什么都不做', () => {
      expect(routeMessageListContentResize({ restoring: false, stickingToBottom: false }))
        .toEqual({ kind: 'none' })
    })
  })

  describe('容器观察器的建立与断开', () => {
    function harness(available = true) {
      const observers: Array<{ observed: object[], disconnected: number, callback: () => void }> = []
      let resized = 0
      const binding = createMessageListContentResizeBinding({
        createObserver: (callback) => {
          if (!available) return undefined
          const observer = { observed: [] as object[], disconnected: 0, callback }
          observers.push(observer)
          return {
            observe: (target: object) => observer.observed.push(target),
            disconnect: () => {
              observer.disconnected += 1
            },
          }
        },
        onResize: () => {
          resized += 1
        },
      })
      return { binding, observers, resized: () => resized }
    }

    const box = { name: 'box' }
    const content = { name: 'content' }

    it('同时观察滚动容器与内容列表', () => {
      const { binding, observers } = harness()
      binding.bind({ preview: false, box, content })

      expect(observers).toHaveLength(1)
      expect(observers[0]!.observed).toEqual([box, content])
    })

    /** 内容列表在空会话下不渲染；只有容器时也要观察，否则窗口变化后位置不补齐。 */
    it('内容列表还没渲染时只观察滚动容器', () => {
      const { binding, observers } = harness()
      binding.bind({ preview: false, box })

      expect(observers[0]!.observed).toEqual([box])
    })

    it('重新绑定先断开上一个观察器，不留下两个都在报尺寸的观察器', () => {
      const { binding, observers } = harness()
      binding.bind({ preview: false, box })
      binding.bind({ preview: false, box, content })

      expect(observers).toHaveLength(2)
      expect(observers[0]!.disconnected).toBe(1)
      expect(observers[1]!.disconnected).toBe(0)
    })

    it('卸载时断开', () => {
      const { binding, observers } = harness()
      binding.bind({ preview: false, box })
      binding.disconnect()

      expect(observers[0]!.disconnected).toBe(1)
    })

    it('预览态不建立观察器，且先断开已有的那个', () => {
      const { binding, observers } = harness()
      binding.bind({ preview: false, box })
      binding.bind({ preview: true, box, content })

      expect(observers).toHaveLength(1)
      expect(observers[0]!.disconnected).toBe(1)
    })

    it('容器还没挂上时不建立观察器', () => {
      const { binding, observers } = harness()
      binding.bind({ preview: false, box: undefined, content })

      expect(observers).toEqual([])
    })

    /** 宿主没有 ResizeObserver 时降级成不观察，不能抛错让整个列表挂掉。 */
    it('宿主不提供观察器时安静降级', () => {
      const { binding } = harness(false)
      expect(() => binding.bind({ preview: false, box, content })).not.toThrow()
      expect(() => binding.disconnect()).not.toThrow()
    })

    it('观察器报尺寸变化时把处置权交回调用方', () => {
      const { binding, observers, resized } = harness()
      binding.bind({ preview: false, box })

      expect(resized()).toBe(0)
      observers[0]!.callback()
      expect(resized()).toBe(1)
    })
  })
})
