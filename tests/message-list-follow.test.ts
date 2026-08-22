import { describe, expect, it } from 'vitest'
import { createMessageListFollowController, type MessageListScrollBox } from '../client/webqq/message-list-follow'
import { shouldFollowMessageListTail } from '../client/webqq/message-list-scroll'

function createHarness(box: MessageListScrollBox) {
  const frames = new Map<number, FrameRequestCallback>()
  let nextFrameId = 1
  let nextTickResolvers: Array<() => void> = []

  const follow = createMessageListFollowController({
    getBox: () => box,
    nextTick: () => new Promise<void>((resolve) => {
      nextTickResolvers.push(resolve)
    }),
    requestAnimationFrame: (callback) => {
      const id = nextFrameId++
      frames.set(id, callback)
      return id
    },
    cancelAnimationFrame: (id) => {
      frames.delete(id)
    },
  })

  return {
    follow,
    flushNextTick() {
      const resolvers = nextTickResolvers
      nextTickResolvers = []
      for (const resolve of resolvers) resolve()
      return Promise.resolve()
    },
    flushFrames() {
      const batch = [...frames.values()]
      frames.clear()
      for (const callback of batch) callback(0)
    },
  }
}

const previousTail = { conversationId: 'private:1:2', lastMessageId: 'old', thinkingIds: [] }
const nextTail = { conversationId: 'private:1:2', lastMessageId: 'new', thinkingIds: [] }

describe('消息列表置底追踪', () => {
  it('置底时内容增高触发的滚动不能取消追踪', async () => {
    const box = { scrollTop: 760, scrollHeight: 1000, clientHeight: 240 }
    const { follow, flushNextTick, flushFrames } = createHarness(box)

    box.scrollHeight = 1200
    follow.handleScroll()

    expect(shouldFollowMessageListTail(previousTail, nextTail, follow.stickingToBottom)).toBe(true)

    follow.setStickingToBottom(true)
    const scheduled = follow.scheduleBottom()
    await flushNextTick()
    await scheduled
    flushFrames()
    flushFrames()

    expect(box.scrollTop).toBe(1200)
    expect(follow.stickingToBottom).toBe(true)
  })

  it('已开始跟随时内容增高触发的滚动仍要置底', async () => {
    const box = { scrollTop: 760, scrollHeight: 1000, clientHeight: 240 }
    const { follow, flushNextTick, flushFrames } = createHarness(box)

    const scheduled = follow.scheduleBottom()
    box.scrollHeight = 1200
    follow.handleScroll()
    await flushNextTick()
    await scheduled
    flushFrames()
    flushFrames()

    expect(box.scrollTop).toBe(1200)
    expect(follow.stickingToBottom).toBe(true)
  })

  it('置底时内容增高会自行调度置底', async () => {
    const box = { scrollTop: 760, scrollHeight: 1000, clientHeight: 240 }
    const { follow, flushNextTick, flushFrames } = createHarness(box)

    box.scrollHeight = 1200
    follow.handleScroll()
    await flushNextTick()
    flushFrames()
    flushFrames()

    expect(box.scrollTop).toBe(1200)
    expect(follow.stickingToBottom).toBe(true)
  })

  it('会话切换可强制置底', async () => {
    const box = { scrollTop: 120, scrollHeight: 1000, clientHeight: 240 }
    const { follow, flushNextTick, flushFrames } = createHarness(box)
    follow.setStickingToBottom(false)

    const scheduled = follow.scheduleBottom(true)
    await flushNextTick()
    await scheduled
    flushFrames()
    flushFrames()

    expect(box.scrollTop).toBe(1000)
    expect(follow.stickingToBottom).toBe(true)
  })

  it('用户上滑后不再追踪新消息', async () => {
    const box = { scrollTop: 760, scrollHeight: 1000, clientHeight: 240 }
    const { follow, flushNextTick, flushFrames } = createHarness(box)

    follow.handleUserScrollIntent()
    box.scrollTop = 400
    follow.handleScroll()

    expect(follow.stickingToBottom).toBe(false)
    expect(shouldFollowMessageListTail(previousTail, nextTail, follow.stickingToBottom)).toBe(false)

    const scheduled = follow.scheduleBottom()
    await flushNextTick()
    await scheduled
    flushFrames()
    flushFrames()

    expect(box.scrollTop).toBe(400)
  })
})
