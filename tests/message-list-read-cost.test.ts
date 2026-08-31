import { describe, expect, it } from 'vitest'
import { getMessageClusterClass, isMergedMessage } from '../client/webqq/message-cluster'
import {
  getForwardPreview,
  getReplyMessage,
  readMessageCapabilities,
  type MessagePresentationContext,
} from '../client/webqq/message-presentation'
import { NO_MESSAGE_CAPABILITIES, type MessageCapabilities } from '../src/message-capabilities'
import type { SandboxForwardPreview, SandboxMessage } from '../src/types'

/**
 * 读取成本守卫：本轮下沉涉及的三处查表不得随渲染次数放大。
 *
 * 理由是这类回归行为断言全都沉默——上一轮唯一被抓到的真实回归就是两级 computed 被合成一级，
 * 导致每次按键为每一行重复归一化五个字段，只有成本守卫当场变红。消息列表是全仓最容易被读取
 * 放大伤到的地方：保留窗口内消息条数上限两千，任何「每条消息重算一次」的写法在小场景里跑得
 * 飞快、在真实场景里卡死。
 *
 * 断言的是**读取次数**这条 interface 的性能特征，不是实现写法：把查表换成等价的另一种 O(1)
 * 写法不会让它变红，换成遍历会。
 */

/** 记录每次属性读取的计数代理。用它可以区分「查一个键」和「扫一遍表」。 */
function counting<T extends object>(target: T): { value: T, reads: () => number, keys: () => string[] } {
  const touched: string[] = []
  const value = new Proxy(target, {
    get(object, key, receiver) {
      if (typeof key === 'string') touched.push(key)
      return Reflect.get(object, key, receiver)
    },
    ownKeys(object) {
      touched.push('<ownKeys>')
      return Reflect.ownKeys(object)
    },
  }) as T
  return { value, reads: () => touched.length, keys: () => touched }
}

function message(id: string, overrides: Partial<SandboxMessage> = {}): SandboxMessage {
  return {
    id,
    authorId: '10001',
    conversationId: 'c1',
    content: id,
    createdAt: '2026-08-30T09:00:00.000Z',
    ...overrides,
  } as SandboxMessage
}

function context(overrides: Partial<MessagePresentationContext> = {}): MessagePresentationContext {
  return {
    replyMessages: {},
    forwardPreviews: {},
    messageCapabilities: {},
    participantNames: {},
    markRecalledMessages: true,
    currentConversationId: 'c1',
    currentOperatorId: '10001',
    ...overrides,
  }
}

const LARGE = 2000

describe('消息列表的读取成本', () => {
  describe('能力位映射', () => {
    function largeCapabilityMap(): Record<string, MessageCapabilities> {
      return Object.fromEntries(
        Array.from({ length: LARGE }, (_, index) => [`m${index}`, NO_MESSAGE_CAPABILITIES]),
      )
    }

    it('读一条消息的能力位只碰一个键，与表的大小无关', () => {
      const map = counting(largeCapabilityMap())
      readMessageCapabilities(message('m1500'), context({ messageCapabilities: map.value }))

      expect(map.keys()).toEqual(['m1500'])
    })

    /**
     * 渲染整份列表的总成本必须与消息条数成正比，而不是平方。表换成数组再 `find` 一遍
     * 在两千条的真实场景里就是四百万次比较，行为断言一条都不会红。
     */
    it('渲染整份列表的读取次数与条数成正比', () => {
      const map = counting(largeCapabilityMap())
      const ctx = context({ messageCapabilities: map.value })
      for (let index = 0; index < LARGE; index += 1) readMessageCapabilities(message(`m${index}`), ctx)

      expect(map.reads()).toBe(LARGE)
    })

    it('投影里没有这条消息时也只碰一个键，不退化成扫表', () => {
      const map = counting(largeCapabilityMap())
      readMessageCapabilities(message('缺席'), context({ messageCapabilities: map.value }))

      expect(map.keys()).toEqual(['缺席'])
    })
  })

  describe('引用消息查表', () => {
    function largeReplyMap(): Record<string, SandboxMessage> {
      return Object.fromEntries(
        Array.from({ length: LARGE }, (_, index) => [`m${index}`, message(`m${index}`)]),
      )
    }

    it('查一条引用只碰一个键', () => {
      const map = counting(largeReplyMap())
      getReplyMessage(message('m1', { replyToMessageId: 'm900' }), context({ replyMessages: map.value }))

      expect(map.keys()).toEqual(['m900'])
    })

    /** 没有引用标识的消息一次表都不该查：绝大多数消息都是这一类。 */
    it('没有引用标识的消息一次表都不查', () => {
      const map = counting(largeReplyMap())
      getReplyMessage(message('m1'), context({ replyMessages: map.value }))

      expect(map.reads()).toBe(0)
    })

    it('渲染整份列表的读取次数不超过带引用的消息条数', () => {
      const map = counting(largeReplyMap())
      const ctx = context({ replyMessages: map.value })
      const messages = Array.from({ length: LARGE }, (_, index) => (
        index % 10 === 0 ? message(`m${index}`, { replyToMessageId: 'm0' }) : message(`m${index}`)
      ))
      for (const item of messages) getReplyMessage(item, ctx)

      expect(map.reads()).toBe(LARGE / 10)
    })

    /** 转发预览走同一条查表路径，同样先看消息自己再查表。 */
    it('转发预览同样只在有转发标识时查一个键', () => {
      const previews = counting(Object.fromEntries(
        Array.from({ length: LARGE }, (_, index) => [`m${index}`, { title: 't', total: 1, lines: [] } as SandboxForwardPreview]),
      ))
      const ctx = context({ forwardPreviews: previews.value })

      getForwardPreview(message('m1'), ctx)
      expect(previews.reads()).toBe(0)

      getForwardPreview(message('m2', { forwardId: 'f1' }), ctx)
      expect(previews.keys()).toEqual(['m2'])
    })
  })

  describe('消息分簇', () => {
    /**
     * 分簇沿相邻消息走，遇到发送者变化就停。作者交替的列表里每一行只看一两个邻居，
     * 因此整份列表的总读取次数必须与条数成正比。
     */
    it('作者交替时渲染整份列表的读取次数与条数成正比', () => {
      const messages = Array.from({ length: LARGE }, (_, index) => message(`m${index}`, {
        authorId: index % 2 === 0 ? '10001' : '20001',
      }))
      const list = counting(messages)

      for (let index = 0; index < LARGE; index += 1) {
        getMessageClusterClass(list.value as SandboxMessage[], index, '10001')
        isMergedMessage(list.value as SandboxMessage[], index, '10001')
      }

      // 每行固定看「自己 + 前一条 + 后一条」这个量级，因此总数落在条数的常数倍内。
      expect(list.reads()).toBeLessThan(LARGE * 12)
    })

    /**
     * 同一人连发的长串里，纯图片消息会被跳过去找下一个气泡。这是分簇判定本身要的行为，
     * 但它让最坏情况随连发长度增长——守卫钉住这个上界，改动让它变成平方时会当场变红。
     */
    it('同一人连发纯图片时单行的读取次数不超过连发长度的常数倍', () => {
      const RUN = 200
      const messages = Array.from({ length: RUN }, (_, index) => message(`m${index}`, {
        media: [{ id: `a${index}`, type: 'image', name: `图${index}.png`, size: 1024, mimeType: 'image/png', reference: `media:a${index}` }],
        content: `[图片] 图${index}.png`,
      }))
      const list = counting(messages)

      getMessageClusterClass(list.value as SandboxMessage[], RUN / 2, '10001')

      expect(list.reads()).toBeLessThan(RUN * 3)
    })
  })
})
