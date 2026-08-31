import { describe, expect, it } from 'vitest'
import {
  createComposerSendController,
  type ComposerSendAdapter,
  type ComposerSendIntent,
  type ComposerSendMedia,
  type ComposerSendRequest,
} from '../client/webqq/composer-send'

const MEDIA: ComposerSendMedia[] = [{ fileName: 'shot.png', mimeType: 'image/png', dataBase64: 'SHOT' }]

/**
 * 造假宿主：记录动作顺序，因此「先解锁、再等一拍、再问焦点模块」这条顺序可以被断言。
 *
 * `deliver` 与 `readMedia` 的解决时机由测试排，因此发送进行中的第二次触发能被驱动。
 */
function createFakeHost(overrides: {
  request?: Partial<ComposerSendRequest>
  media?: ComposerSendMedia[] | undefined
  mediaError?: Error
  deliverError?: Error
  shouldRestore?: boolean
} = {}) {
  const calls: string[] = []
  const intents: ComposerSendIntent[] = []
  const focusRequests: Array<{ conversationId: string, operatorId: string }> = []
  // 闸门提前建好：`release()` 可以在 `deliver` 真正跑到之前调用，顺序不敏感。
  let openGate!: () => void
  const gate = new Promise<void>((resolve) => {
    openGate = resolve
  })

  const adapter: ComposerSendAdapter = {
    readRequest: () => {
      calls.push('read-request')
      return {
        content: '你好',
        attachmentCount: 0,
        conversationId: 'group:30001',
        operatorId: '10001',
        composing: false,
        ...overrides.request,
      }
    },
    closeMentionMenu: () => calls.push('close-menu'),
    captureFocus: (request) => {
      calls.push('capture-focus')
      focusRequests.push(request)
      return {
        shouldRestore: () => {
          calls.push('should-restore')
          return overrides.shouldRestore ?? true
        },
        restore: () => calls.push('restore-focus'),
      }
    },
    readMedia: async () => {
      calls.push('read-media')
      if (overrides.mediaError) throw overrides.mediaError
      return overrides.media
    },
    deliver: async (intent) => {
      calls.push('deliver')
      intents.push(intent)
      await gate
      if (overrides.deliverError) throw overrides.deliverError
    },
    clearDraft: () => calls.push('clear-draft'),
    clearAttachments: () => calls.push('clear-attachments'),
    clearReply: () => calls.push('clear-reply'),
    nextTick: async () => {
      calls.push('next-tick')
    },
  }

  return {
    adapter,
    calls,
    intents,
    focusRequests,
    release: () => openGate(),
  }
}

describe('WebQQ 发送控件发送编排', () => {
  describe('发不出去的四种情况', () => {
    async function refuse(request: Partial<ComposerSendRequest>) {
      const host = createFakeHost({ request })
      const controller = createComposerSendController(host.adapter)
      await controller.submit()
      return host
    }

    it('正文为空且没有附件时不发', async () => {
      const host = await refuse({ content: '', attachmentCount: 0 })
      expect(host.calls).not.toContain('deliver')
    })

    it('只有附件没有正文时照样发', async () => {
      const host = createFakeHost({ request: { content: '', attachmentCount: 1 }, media: MEDIA })
      const controller = createComposerSendController(host.adapter)
      const settled = controller.submit()
      host.release()
      await settled

      expect(host.intents).toEqual([{ conversationId: 'group:30001', content: '', replyToMessageId: undefined, media: MEDIA }])
    })

    it('没有会话或没有当前操作者时不发', async () => {
      expect((await refuse({ conversationId: undefined })).calls).not.toContain('deliver')
      expect((await refuse({ operatorId: undefined })).calls).not.toContain('deliver')
    })

    /** 组字期间的 Enter 是上屏确认；此时草稿里还没有上屏的正文，发出去就是半句话。 */
    it('组字期间不发', async () => {
      const host = await refuse({ composing: true })
      expect(host.calls).not.toContain('deliver')
    })

    /** 被拒的这几种情况都不该点亮错误文案：用户什么都没做错。 */
    it('被拒时不显示错误文案，也不动锁', async () => {
      const host = createFakeHost({ request: { content: '', attachmentCount: 0 } })
      const controller = createComposerSendController(host.adapter)
      await controller.submit()

      expect(controller.error.value).toBe('')
      expect(controller.sending.value).toBe(false)
    })
  })

  describe('单请求锁', () => {
    it('发送进行中不接受第二次触发', async () => {
      const host = createFakeHost()
      const controller = createComposerSendController(host.adapter)

      const first = controller.submit()
      expect(controller.sending.value).toBe(true)
      await controller.submit()
      expect(host.calls.filter((call) => call === 'deliver')).toHaveLength(1)

      host.release()
      await first
      expect(controller.sending.value).toBe(false)
    })

    /** 锁解开之后可以立刻再发一条，支持连续「输入—回车」。 */
    it('上一条结束后可以立刻再发', async () => {
      const host = createFakeHost()
      const controller = createComposerSendController(host.adapter)

      const first = controller.submit()
      host.release()
      await first
      const second = controller.submit()
      host.release()
      await second

      expect(host.calls.filter((call) => call === 'deliver')).toHaveLength(2)
    })
  })

  describe('成功路径的动作顺序', () => {
    it('锁住、读附件、外发、清草稿与附件与回复、解锁、等一拍、再问焦点', async () => {
      const host = createFakeHost({ request: { attachmentCount: 1, replyToMessageId: 'm-1' }, media: MEDIA })
      const controller = createComposerSendController(host.adapter)

      const settled = controller.submit()
      host.release()
      await settled

      expect(host.calls).toEqual([
        'close-menu',
        'read-request',
        'capture-focus',
        'read-media',
        'deliver',
        'clear-draft',
        'clear-attachments',
        'clear-reply',
        'next-tick',
        'should-restore',
        'restore-focus',
      ])
      expect(host.intents).toEqual([{
        conversationId: 'group:30001',
        content: '你好',
        replyToMessageId: 'm-1',
        media: MEDIA,
      }])
    })

    /** 打开着的候选菜单必须先关掉，否则它会盖在刚清空的输入区上。 */
    it('发送开始就关掉候选菜单', async () => {
      const host = createFakeHost()
      const controller = createComposerSendController(host.adapter)
      const settled = controller.submit()
      host.release()
      await settled

      expect(host.calls[0]).toBe('close-menu')
    })

    it('没有附件时不给媒体载荷', async () => {
      const host = createFakeHost({ media: undefined })
      const controller = createComposerSendController(host.adapter)
      const settled = controller.submit()
      host.release()
      await settled

      expect(host.intents[0]?.media).toBeUndefined()
    })
  })

  describe('失败路径的动作顺序', () => {
    /** 失败后正文与附件一个都不能丢：用户要能改一改立刻重发。 */
    it('外发失败时显示错误文案，草稿与附件都不清', async () => {
      const host = createFakeHost({ deliverError: new Error('机器人未启用') })
      const controller = createComposerSendController(host.adapter)

      const settled = controller.submit()
      host.release()
      await settled

      expect(controller.error.value).toBe('机器人未启用')
      expect(host.calls).toEqual([
        'close-menu',
        'read-request',
        'capture-focus',
        'read-media',
        'deliver',
        'next-tick',
        'should-restore',
        'restore-focus',
      ])
      expect(controller.sending.value).toBe(false)
    })

    it('读附件失败时同样不清草稿，也不外发', async () => {
      const host = createFakeHost({
        request: { attachmentCount: 1 },
        mediaError: new Error('无法读取媒体内容'),
      })
      const controller = createComposerSendController(host.adapter)
      await controller.submit()

      expect(controller.error.value).toBe('无法读取媒体内容')
      expect(host.calls).not.toContain('deliver')
      expect(host.calls).not.toContain('clear-draft')
    })

    /** 抛出来的不是 Error 时给一句兜底文案，而不是把 undefined 显示给用户。 */
    it('抛出的不是 Error 时给兜底文案', async () => {
      const host = createFakeHost()
      const adapter: ComposerSendAdapter = {
        ...host.adapter,
        deliver: async () => {
          throw '坏了'
        },
      }
      const controller = createComposerSendController(adapter)
      await controller.submit()

      expect(controller.error.value).toBe('发送失败')
    })

    /** 上一次的错误文案不能挂在下一次发送上。 */
    it('新的一次发送先清掉上一次的错误文案', async () => {
      const host = createFakeHost({ deliverError: new Error('机器人未启用') })
      const controller = createComposerSendController(host.adapter)
      let settled = controller.submit()
      host.release()
      await settled
      expect(controller.error.value).toBe('机器人未启用')

      const ok = createFakeHost()
      const next = createComposerSendController(ok.adapter)
      next.error.value = '上一次的错误'
      settled = next.submit()
      ok.release()
      await settled

      expect(next.error.value).toBe('')
    })
  })

  describe('焦点还原', () => {
    /**
     * 判定仍在 `composer-focus`：编排捕获发起这一刻的会话与操作者，问它该不该还，
     * 自己不重新判一遍。重新判等于把一份已经验证过的判定重新埋起来。
     */
    it('按发起时的会话与操作者去问焦点判定', async () => {
      const host = createFakeHost({ request: { conversationId: 'private:10001:20001', operatorId: '20001' } })
      const controller = createComposerSendController(host.adapter)
      const settled = controller.submit()
      host.release()
      await settled

      expect(host.focusRequests).toEqual([{ conversationId: 'private:10001:20001', operatorId: '20001' }])
    })

    /** 用户在发送期间切走了会话：焦点判定说不该还，编排就不还。 */
    it('焦点判定说不该还时不还焦点', async () => {
      const host = createFakeHost({ shouldRestore: false })
      const controller = createComposerSendController(host.adapter)
      const settled = controller.submit()
      host.release()
      await settled

      expect(host.calls).toContain('should-restore')
      expect(host.calls).not.toContain('restore-focus')
    })

    /**
     * 顺序是判定：先解锁再等一拍再还焦点。输入区在发送中是 `aria-disabled`，
     * 浏览器会忽略对禁用控件的焦点请求，早一拍还就还不上。
     */
    it('解锁之后才等一拍还焦点', async () => {
      const host = createFakeHost()
      let sendingAtNextTick: boolean | undefined
      const adapter: ComposerSendAdapter = {
        ...host.adapter,
        nextTick: async () => {
          host.calls.push('next-tick')
          sendingAtNextTick = controller.sending.value
        },
      }
      const controller = createComposerSendController(adapter)
      const settled = controller.submit()
      host.release()
      await settled

      expect(sendingAtNextTick).toBe(false)
      expect(host.calls.indexOf('next-tick')).toBeLessThan(host.calls.indexOf('should-restore'))
    })
  })
})
