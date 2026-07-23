import { describe, expect, it } from 'vitest'
import type { SandboxMessage } from '../src/types'
import {
  getMessageClusterClass,
  isImageOnlyMessage,
  isMergedMessage,
} from '../client/webqq/message-cluster'

function message(id: string, authorId: string, content = id): SandboxMessage {
  return {
    id,
    authorId,
    botId: '20001',
    conversationId: 'private:10001:20001',
    content,
    createdAt: '2026-07-21T00:00:00.000Z',
  }
}

describe('TIM 消息簇', () => {
  it('连续同发送者消息标记首中尾并隐藏后续头像', () => {
    const messages = [message('1', '10001'), message('2', '10001'), message('3', '10001')]

    expect(messages.map((_, index) => getMessageClusterClass(messages, index, 'tim', '10001')))
      .toEqual(['is-cluster-first', 'is-cluster-middle', 'is-cluster-last'])
    expect(messages.map((_, index) => isMergedMessage(messages, index, 'tim', '10001')))
      .toEqual([false, true, true])
  })

  it('QQ 模式和发送者变化不会合并', () => {
    const messages = [message('1', '10001'), message('2', '20001')]

    expect(getMessageClusterClass(messages, 0, 'tim', '10001')).toBe('')
    expect(isMergedMessage(messages, 1, 'tim', '10001')).toBe(false)
    expect(getMessageClusterClass([message('1', '10001'), message('2', '10001')], 0, 'qq', '10001')).toBe('')
  })

  it('纯图片消息不打断前后文本气泡的连续圆角', () => {
    const image = {
      ...message('image', '20001', '[图片] example.png'),
      media: [{
        id: 'media:image',
        type: 'image' as const,
        name: 'example.png',
        mimeType: 'image/png',
        size: 1,
        reference: 'image.bin',
      }],
    }
    const messages = [message('1', '20001'), image, message('2', '20001')]

    expect(isImageOnlyMessage(image)).toBe(true)
    expect(getMessageClusterClass(messages, 0, 'tim', '10001')).toBe('is-cluster-first')
    expect(getMessageClusterClass(messages, 2, 'tim', '10001')).toBe('is-cluster-last')
  })

  it('戳一戳事件会中断连续消息合并', () => {
    const event: SandboxMessage = {
      ...message('poke', '10001', '测试用户 戳了戳机器人'),
      event: { type: 'poke', targetId: '20001' },
    }
    const messages = [message('1', '20001'), event, message('2', '20001')]

    expect(messages.map((_, index) => getMessageClusterClass(messages, index, 'tim', '10001')))
      .toEqual(['', '', ''])
  })
})
