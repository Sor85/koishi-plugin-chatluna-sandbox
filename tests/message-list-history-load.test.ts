import { describe, expect, it } from 'vitest'
import {
  loadEarlierMessageListHistory,
  type MessageListGeometry,
  type MessageListHistoryLoadAdapter,
} from '../client/webqq/message-list-history-load'
import {
  createMessageListScrollRestoreScheduler,
  resolveMessageListScrollRestore,
  type ScrollAnchorRow,
} from '../client/webqq/message-list-scroll-restore'
import type { MessageListScrollState } from '../client/webqq/message-list-scroll-state'

function row(messageId: string, top: number, height = 40): ScrollAnchorRow {
  return { messageId, top, bottom: top + height }
}

/** 加载前：容器顶缘在 100，`m3` 是第一个底缘越过顶缘的行，偏移 -20。 */
const BEFORE: MessageListGeometry = {
  containerTop: 100,
  scrollTop: 400,
  rows: [row('m1', 0), row('m2', 40), row('m3', 80), row('m4', 140)],
}

function harness(overrides: Partial<MessageListHistoryLoadAdapter> = {}) {
  const calls: string[] = []
  const restored: MessageListScrollState[] = []
  let loading = false
  const adapter: MessageListHistoryLoadAdapter = {
    isLoading: () => loading,
    setLoading: (value) => {
      loading = value
      calls.push(`loading:${value}`)
    },
    isStickingToBottom: () => false,
    readGeometry: () => {
      calls.push('geometry')
      return BEFORE
    },
    requestHistory: async () => {
      calls.push('request')
    },
    restoreAnchored: (state) => {
      calls.push('restore')
      restored.push(state)
    },
    ...overrides,
  }
  return {
    adapter,
    calls,
    restored,
    isLoading: () => loading,
    markLoading: () => {
      loading = true
    },
  }
}

describe('消息列表加载更早历史', () => {
  describe('加载闸门', () => {
    it('加载中不重复触发', async () => {
      const { adapter, calls, markLoading } = harness()
      markLoading()
      await loadEarlierMessageListHistory(adapter)

      expect(calls).toEqual([])
    })

    it('一趟加载结束后闸门重新打开', async () => {
      const { adapter, calls, isLoading } = harness()
      await loadEarlierMessageListHistory(adapter)

      expect(calls[0]).toBe('loading:true')
      expect(isLoading()).toBe(false)
    })
  })

  describe('按锚点补偿位置', () => {
    /**
     * 锚点必须在加载前读、补偿必须在加载之后交出去。顺序错了读到的是被新内容推走之后的几何，
     * 补出来的位置就是「加载更早后当前这一行跳走」本身。
     */
    it('加载前读锚点，加载后把补偿目标交给恢复排程', async () => {
      const { adapter, calls, restored } = harness()
      await loadEarlierMessageListHistory(adapter)

      expect(calls).toEqual(['loading:true', 'geometry', 'request', 'loading:false', 'restore'])
      expect(restored).toEqual([{
        scrollTop: 400,
        stickingToBottom: false,
        anchor: { messageId: 'm3', offsetTop: -20 },
      }])
    })

    /**
     * 贴底与锚点补偿互斥。用户贴在底部时他读的就是底部：内容从上方插进来，把他放回底部才是
     * 「位置没变」，按锚点补偿反而会把他钉在半路，新消息也不再跟随。
     */
    it('贴在底部时不补偿，位置交给贴底追踪', async () => {
      const { adapter, calls, restored } = harness({ isStickingToBottom: () => true })
      await loadEarlierMessageListHistory(adapter)

      expect(restored).toEqual([])
      expect(calls).toEqual(['loading:true', 'request', 'loading:false'])
    })

    it('列表一行都没有时不补偿', async () => {
      const { adapter, restored } = harness({
        readGeometry: () => ({ containerTop: 100, scrollTop: 0, rows: [] }),
      })
      await loadEarlierMessageListHistory(adapter)

      expect(restored).toEqual([])
    })

    it('容器还没挂上时照样加载，只是不补偿', async () => {
      const { adapter, calls } = harness({ readGeometry: () => undefined })
      await loadEarlierMessageListHistory(adapter)

      expect(calls).toEqual(['loading:true', 'request', 'loading:false'])
    })

    /**
     * 补偿的最终落点：把锚点那一行推回它离开时的偏移。
     *
     * 这一条用真的恢复排程跑完整条链——加载前的锚点、锚点算术、分趟施加——因为「补偿量算对了」
     * 不等于「补偿真的落到 DOM 上」。补偿之所以走排程而不是一次性写死：新插进来的消息里有媒体
     * 与思考面板，它们在 Vue 更新之后继续增高，一次写死的位置会落在半路。
     */
    it('补偿落点让锚点那一行回到原来的偏移', async () => {
      // 加载后：50 条更早消息把 m3 从 80 顶到 700，容器读数仍是加载前那个 400。
      const grown: MessageListGeometry = {
        containerTop: 100,
        scrollTop: 400,
        rows: [row('e1', 380), row('e2', 460), row('m1', 620), row('m2', 660), row('m3', 700)],
      }
      const applied: number[] = []
      const frames: Array<() => void> = []
      let frameId = 0
      let scrollTop = grown.scrollTop
      const scheduler = createMessageListScrollRestoreScheduler({
        requestAnimationFrame: (callback) => {
          frameId += 1
          frames.push(callback)
          return frameId
        },
        cancelAnimationFrame: () => {},
        apply: (state) => {
          const outcome = resolveMessageListScrollRestore({
            state,
            containerTop: grown.containerTop,
            currentScrollTop: scrollTop,
            // 写 scrollTop 会同步把行往上带走，替身必须照做，否则第二趟会按错的几何再算一遍。
            rows: grown.rows.map(({ messageId, top, bottom }) => {
              const shift = scrollTop - grown.scrollTop
              return { messageId, top: top - shift, bottom: bottom - shift }
            }),
          })
          if (outcome.kind === 'bottom') return
          scrollTop = outcome.scrollTop
          applied.push(outcome.scrollTop)
        },
        getActiveKey: () => 'A',
      })
      const { adapter } = harness({
        restoreAnchored: (state) => {
          scheduler.begin(state)
          scheduler.schedule('A')
        },
      })

      await loadEarlierMessageListHistory(adapter)
      while (frames.length) frames.shift()!()

      // 400 + 700 - 100 - (-20) = 1020：m3 的偏移回到 -20，正是加载前用户看到的那一行。
      // 第二趟按施加后的几何再算一次，得到同一个数——补偿是收敛的，不会来回跳。
      expect(applied).toEqual([1020, 1020])
    })
  })

  describe('外发事件的拒绝', () => {
    /**
     * 加载历史是「把 resolve/reject 交给外层」的外发事件。拒绝必须在这里吞掉：
     * 页面控制层负责展示具体错误，列表只需要结束加载态，否则事件 Promise 会泄漏成未处理拒绝。
     */
    it('加载失败时不抛出，加载态照样结束', async () => {
      const { adapter, calls, isLoading } = harness({
        requestHistory: () => Promise.reject(new Error('读取历史失败')),
      })

      await expect(loadEarlierMessageListHistory(adapter)).resolves.toBeUndefined()
      expect(isLoading()).toBe(false)
      expect(calls).toContain('loading:false')
    })

    it('加载失败时不补偿：没有新内容插进来', async () => {
      const { adapter, restored } = harness({
        requestHistory: () => Promise.reject(new Error('读取历史失败')),
      })
      await loadEarlierMessageListHistory(adapter)

      expect(restored).toEqual([])
    })
  })
})
