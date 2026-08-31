import { describe, expect, it } from 'vitest'
import {
  createMessageListScrollRestoreScheduler,
  resolveMessageListScrollRestore,
  resolveMessageListScrollSave,
  revealMessageListMessage,
  selectMessageListScrollAnchor,
  type ScrollAnchorRow,
} from '../client/webqq/message-list-scroll-restore'
import type { MessageListScrollState } from '../client/webqq/message-list-scroll-state'

function row(messageId: string, top: number, height = 40): ScrollAnchorRow {
  return { messageId, top, bottom: top + height }
}

/** 容器顶缘在 100；前两行整体在它上方，第三行跨过它。 */
const ROWS = [row('m1', 0), row('m2', 40), row('m3', 80), row('m4', 140), row('m5', 200)]
const CONTAINER_TOP = 100

describe('消息列表滚动锚点与单次恢复', () => {
  describe('锚点选取', () => {
    /**
     * 取「顶缘越过」会选到上一行——那一行绝大部分已经滚出视口，恢复后用户看到的第一行
     * 不是离开时看到的那一行。这条判定改了会静默漂移。
     */
    it('取第一个底缘越过容器顶缘的那一行', () => {
      expect(selectMessageListScrollAnchor(CONTAINER_TOP, ROWS))
        .toEqual({ messageId: 'm3', offsetTop: -20 })
    })

    it('底缘恰好贴在容器顶缘上的那一行不算越过', () => {
      const rows = [row('m1', 60), row('m2', 100)]
      expect(selectMessageListScrollAnchor(100, rows)?.messageId).toBe('m2')
    })

    it('第一行就越过时锚点是它，偏移为正', () => {
      expect(selectMessageListScrollAnchor(0, ROWS)).toEqual({ messageId: 'm1', offsetTop: 0 })
    })

    /** 一行都没越过（列表为空，或全部在容器顶缘上方）时不给锚点，恢复退回直写滚动位置。 */
    it('一行都没越过时取不到锚点', () => {
      expect(selectMessageListScrollAnchor(CONTAINER_TOP, [])).toBeUndefined()
      expect(selectMessageListScrollAnchor(9999, ROWS)).toBeUndefined()
    })
  })

  describe('恢复的三分支', () => {
    function restore(state: MessageListScrollState, rows: readonly ScrollAnchorRow[] = ROWS) {
      return resolveMessageListScrollRestore({
        state,
        containerTop: CONTAINER_TOP,
        currentScrollTop: 500,
        rows,
      })
    }

    /** 贴底时保存的 scrollTop 属于旧内容高度，直写会落在中间，因此这一支优先。 */
    it('离开时贴底就直接置底，不看锚点', () => {
      expect(restore({ scrollTop: 123, stickingToBottom: true, anchor: { messageId: 'm3', offsetTop: 0 } }))
        .toEqual({ kind: 'bottom' })
    })

    it('没有锚点时直写滚动位置', () => {
      expect(restore({ scrollTop: 123, stickingToBottom: false }))
        .toEqual({ kind: 'scroll-top', scrollTop: 123 })
    })

    /** 锚点那条消息可能已被保留窗口淘汰；无从补偿，退回直写。 */
    it('锚点对不上时也直写滚动位置', () => {
      expect(restore({ scrollTop: 123, stickingToBottom: false, anchor: { messageId: '已淘汰', offsetTop: 0 } }))
        .toEqual({ kind: 'scroll-top', scrollTop: 123 })
    })

    it('锚点命中时走锚点补偿算术', () => {
      const outcome = restore({ scrollTop: 123, stickingToBottom: false, anchor: { messageId: 'm3', offsetTop: -20 } })
      // 500 + 80 - 100 - (-20)
      expect(outcome).toEqual({ kind: 'anchored', scrollTop: 500 })
    })

    it('补偿量随锚点当前位置变化', () => {
      const moved = [row('m3', 300)]
      const outcome = resolveMessageListScrollRestore({
        state: { scrollTop: 123, stickingToBottom: false, anchor: { messageId: 'm3', offsetTop: 10 } },
        containerTop: CONTAINER_TOP,
        currentScrollTop: 500,
        rows: moved,
      })
      // 500 + 300 - 100 - 10
      expect(outcome).toEqual({ kind: 'anchored', scrollTop: 690 })
    })
  })

  describe('保存的两条边界', () => {
    function save(overrides: Partial<Parameters<typeof resolveMessageListScrollSave>[0]> = {}) {
      return resolveMessageListScrollSave({
        preview: false,
        box: { scrollTop: 420 },
        stickingToBottom: false,
        containerTop: CONTAINER_TOP,
        rows: ROWS,
        ...overrides,
      })
    }

    it('正常路径保存滚动位置与锚点', () => {
      expect(save()).toEqual({
        scrollTop: 420,
        stickingToBottom: false,
        anchor: { messageId: 'm3', offsetTop: -20 },
      })
    })

    it('贴底时不保存锚点', () => {
      expect(save({ stickingToBottom: true })).toEqual({ scrollTop: 420, stickingToBottom: true, anchor: undefined })
    })

    /** 缩略图里的消息列表不是用户在读的那一份，让它写状态会把真实位置覆盖掉。 */
    it('预览态直接短路，一个字都不写', () => {
      expect(save({ preview: true })).toBeUndefined()
      expect(save({ preview: true, restoring: { scrollTop: 1, stickingToBottom: false } })).toBeUndefined()
    })

    /**
     * 恢复分两趟施加，中途读到的是一个还没走完的位置；把它写回去等于用中间态覆盖目标，
     * 表现为「切回来位置差一点」。这一条此前只是一句注释。
     */
    it('正在恢复时写回待恢复状态，而不是当前读数', () => {
      const pending: MessageListScrollState = {
        scrollTop: 999,
        stickingToBottom: false,
        anchor: { messageId: 'm5', offsetTop: 7 },
      }
      expect(save({ restoring: pending })).toBe(pending)
    })

    it('还没挂上容器时什么都不写', () => {
      expect(save({ box: undefined })).toBeUndefined()
    })
  })

  describe('分趟排程', () => {
    function harness(activeKey: () => string | undefined) {
      const frames: Array<{ id: number, callback: () => void }> = []
      const cancelled: number[] = []
      const applied: MessageListScrollState[] = []
      let nextFrameId = 0
      const scheduler = createMessageListScrollRestoreScheduler({
        requestAnimationFrame: (callback) => {
          nextFrameId += 1
          frames.push({ id: nextFrameId, callback })
          return nextFrameId
        },
        cancelAnimationFrame: (id) => cancelled.push(id),
        apply: (state) => applied.push(state),
        getActiveKey: activeKey,
      })
      const runNextFrame = () => {
        frames.shift()?.callback()
      }
      return { scheduler, applied, cancelled, runNextFrame, pending: () => frames.length }
    }

    const state: MessageListScrollState = { scrollTop: 200, stickingToBottom: false }

    it('恢复分两趟施加', () => {
      const { scheduler, applied, runNextFrame } = harness(() => 'A')
      scheduler.begin(state)
      scheduler.schedule('A')

      runNextFrame()
      expect(applied).toEqual([state])
      runNextFrame()
      expect(applied).toEqual([state, state])
    })

    it('没有开始恢复时排程什么都不做', () => {
      const { scheduler, pending } = harness(() => 'A')
      scheduler.schedule('A')
      expect(pending()).toBe(0)
    })

    /**
     * 快速来回切换时前一次的排程必须不能污染后一次，否则会把 A 会话的位置施加到 B 会话上。
     * 每一趟施加前都重新问一次当前键，因此第一趟就会被丢弃。
     */
    it('第一趟施加前键已变时整条排程丢弃', () => {
      let key = 'A'
      const { scheduler, applied, runNextFrame } = harness(() => key)
      scheduler.begin(state)
      scheduler.schedule('A')

      key = 'B'
      runNextFrame()
      expect(applied).toEqual([])
    })

    it('第二趟施加前键变了也要丢弃', () => {
      let key = 'A'
      const { scheduler, applied, runNextFrame } = harness(() => key)
      scheduler.begin(state)
      scheduler.schedule('A')

      runNextFrame()
      expect(applied).toEqual([state])
      key = 'B'
      runNextFrame()
      expect(applied).toEqual([state])
    })

    it('结束恢复后已排的帧不再施加', () => {
      const { scheduler, applied, runNextFrame } = harness(() => 'A')
      scheduler.begin(state)
      scheduler.schedule('A')

      scheduler.finish()
      runNextFrame()
      expect(applied).toEqual([])
      expect(scheduler.restoring).toBeUndefined()
    })

    it('重复排程会取消上一次已排的帧', () => {
      const { scheduler, cancelled, runNextFrame } = harness(() => 'A')
      scheduler.begin(state)
      scheduler.schedule('A')
      runNextFrame()
      scheduler.schedule('A')

      expect(cancelled).toContain(2)
    })

    it('开始恢复后待恢复状态可读，保存路径据此写回它', () => {
      const { scheduler } = harness(() => 'A')
      expect(scheduler.restoring).toBeUndefined()
      scheduler.begin(state)
      expect(scheduler.restoring).toBe(state)
    })
  })

  describe('定位揭示的编排', () => {
    /**
     * 顺序是判定：反过来的话平滑滚动到目标的过程会和贴底排程抢 scrollTop，
     * 表现为「跳过去又被拽回底部」。
     */
    it('先停掉贴底追踪，再滚到那一行并高亮', () => {
      const calls: string[] = []
      const revealed = revealMessageListMessage({
        stopFollowing: () => calls.push('stop'),
        highlight: () => {
          calls.push('highlight')
          return true
        },
      })

      expect(calls).toEqual(['stop', 'highlight'])
      expect(revealed).toBe(true)
    })

    it('目标不在列表里时如实返回失败，但贴底追踪已经停掉', () => {
      const calls: string[] = []
      const revealed = revealMessageListMessage({
        stopFollowing: () => calls.push('stop'),
        highlight: () => false,
      })

      expect(revealed).toBe(false)
      expect(calls).toEqual(['stop'])
    })
  })
})
