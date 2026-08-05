import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { shouldRestoreComposerFocus } from '../client/webqq/composer-focus'

function createConnectedTextarea() {
  return {
    isConnected: true,
    focus() {},
  } as HTMLTextAreaElement
}

function createDetachedTextarea() {
  return {
    isConnected: false,
    focus() {},
  } as HTMLTextAreaElement
}

const TEST_COMPOSER_ID = Symbol('composer')

describe('WebQQ 发送控件', () => {
  it('以只读模型和领域事件隔离页面状态', () => {
    const composerSource = readFileSync(resolve('client/webqq-composer.vue'), 'utf8')
    const chatPaneSource = readFileSync(resolve('client/webqq-chat-pane.vue'), 'utf8')

    expect(composerSource).toContain('model: WebqqComposerModel')
    expect(composerSource).toContain('send: [input: WebqqComposerSendIntent')
    expect(composerSource).toContain('selectOperator: [participantId: string')
    expect(composerSource).toContain('manageEnvironment: [input: ManageSandboxEnvironmentInput')
    expect(composerSource).toContain("const input = ref('')")
    expect(composerSource).toContain('const sendFiles = ref<ComposerSendFile[]>([])')
    expect(composerSource).toContain('const sending = ref(false)')
    expect(chatPaneSource).toContain('<WebqqComposer')
    expect(chatPaneSource).not.toContain('class="webqq-composer"')
  })

  it('保留 Tooltip 与 ContextMenu 的原始嵌套边界', () => {
    const source = readFileSync(resolve('client/webqq-composer.vue'), 'utf8')

    expect(source).toContain('<TooltipTrigger as-child>')
    expect(source).toContain('<ContextMenu>')
    expect(source).toContain('class="webqq-composer-user-menu" style="z-index: 160"')
    expect(source).toContain('recordUserStackLayout')
    expect(source).toContain("await layout.animate({ duration: 260, ease: 'out(3)' })")
  })

  it('发送成功或失败后仅在原会话、原操作者和原输入控件仍有效时恢复焦点', () => {
    const textarea = createConnectedTextarea()

    expect(shouldRestoreComposerFocus({
      requestConversationId: 'private:10001:20001',
      requestOperatorId: '10001',
      activeConversationId: 'private:10001:20001',
      activeOperatorId: '10001',
      requestComposerId: TEST_COMPOSER_ID,
      activeComposerId: TEST_COMPOSER_ID,
      inputElement: textarea,
    })).toBe(true)

    // 成功路径：同一控件、同一会话与操作者应恢复，支持连续“输入—回车”。
    expect(shouldRestoreComposerFocus({
      requestConversationId: 'group:30001',
      requestOperatorId: '10001',
      activeConversationId: 'group:30001',
      activeOperatorId: '10001',
      requestComposerId: TEST_COMPOSER_ID,
      activeComposerId: TEST_COMPOSER_ID,
      inputElement: textarea,
    })).toBe(true)

    // 失败后同样可恢复，便于立即修改重试。
    expect(shouldRestoreComposerFocus({
      requestConversationId: 'private:10001:20001',
      requestOperatorId: '10001',
      activeConversationId: 'private:10001:20001',
      activeOperatorId: '10001',
      requestComposerId: TEST_COMPOSER_ID,
      activeComposerId: TEST_COMPOSER_ID,
      inputElement: textarea,
    })).toBe(true)

    // 切换会话后，旧请求不得抢焦点。
    expect(shouldRestoreComposerFocus({
      requestConversationId: 'private:10001:20001',
      requestOperatorId: '10001',
      activeConversationId: 'group:30001',
      activeOperatorId: '10001',
      requestComposerId: TEST_COMPOSER_ID,
      activeComposerId: TEST_COMPOSER_ID,
      inputElement: textarea,
    })).toBe(false)

    // 切换当前操作者后，旧请求不得影响新身份输入。
    expect(shouldRestoreComposerFocus({
      requestConversationId: 'private:10001:20001',
      requestOperatorId: '10001',
      activeConversationId: 'private:10001:20001',
      activeOperatorId: '20001',
      requestComposerId: TEST_COMPOSER_ID,
      activeComposerId: TEST_COMPOSER_ID,
      inputElement: textarea,
    })).toBe(false)

    // 同一会话与操作者下，旧 composer 实例也不能抢新实例焦点。
    expect(shouldRestoreComposerFocus({
      requestConversationId: 'private:10001:20001',
      requestOperatorId: '10001',
      activeConversationId: 'private:10001:20001',
      activeOperatorId: '10001',
      requestComposerId: TEST_COMPOSER_ID,
      activeComposerId: Symbol('replacement-composer'),
      inputElement: textarea,
    })).toBe(false)

    // 组件卸载或 textarea 失效后不得 focus。
    expect(shouldRestoreComposerFocus({
      requestConversationId: 'private:10001:20001',
      requestOperatorId: '10001',
      activeConversationId: 'private:10001:20001',
      activeOperatorId: '10001',
      requestComposerId: TEST_COMPOSER_ID,
      activeComposerId: TEST_COMPOSER_ID,
      inputElement: createDetachedTextarea(),
    })).toBe(false)

    expect(shouldRestoreComposerFocus({
      requestConversationId: 'private:10001:20001',
      requestOperatorId: '10001',
      activeConversationId: 'private:10001:20001',
      activeOperatorId: '10001',
      requestComposerId: TEST_COMPOSER_ID,
      activeComposerId: TEST_COMPOSER_ID,
      inputElement: null,
    })).toBe(false)
  })

  it('发送控件通过稳定 textarea ref 与 nextTick 恢复焦点，并保持单请求锁', () => {
    const source = readFileSync(resolve('client/webqq-composer.vue'), 'utf8')

    expect(source).toContain('ref="inputRef"')
    expect(source).toContain('const inputRef = ref<HTMLTextAreaElement>()')
    expect(source).toContain('shouldRestoreComposerFocus')
    expect(source).toContain('from \'./webqq/composer-focus\'')
    // 成功与失败共用 finally：先解锁，再 nextTick 后条件恢复焦点。
    expect(source).toMatch(/finally\s*\{[\s\S]*sending\.value = false[\s\S]*await nextTick\(\)[\s\S]*shouldRestoreComposerFocus[\s\S]*requestInput\?\.focus\(\)/)
    // 单请求锁：sending 为真时直接返回，不引入队列。
    expect(source).toContain('|| sending.value) return')
    expect(source).not.toMatch(/sendQueue|messageQueue|pendingSends/)
    // 发起发送时捕获原会话、原操作者和原 textarea，避免闭包读到切换后的状态。
    expect(source).toMatch(/requestConversationId|const \{[^}]*conversationId/)
    expect(source).toContain('const composerInstanceId = Symbol(\'webqq-composer\')')
    expect(source).toContain('activeComposerInstanceId = undefined')
    expect(source).toContain('inputElement: requestInput')
  })

  it('回复上下文固定在最左并与附件共用可换行浮层', () => {
    const css = readFileSync(resolve('client/styles/webqq-composer.css'), 'utf8')
    const source = readFileSync(resolve('client/webqq-composer.vue'), 'utf8')
    const contextRule = css.slice(css.indexOf('.webqq-composer-context {'), css.indexOf('.webqq-composer-reply {'))
    const replyRule = css.slice(css.indexOf('.webqq-composer-reply {'), css.indexOf('.webqq-composer-reply span'))
    const replyTextRule = css.slice(css.indexOf('.webqq-composer-reply span {'), css.indexOf('.webqq-composer-reply button {'))
    const replyButtonRule = css.slice(css.indexOf('.webqq-composer-reply button {'), css.indexOf('.webqq-composer-reply button:hover'))
    const contextIndex = source.indexOf('class="webqq-composer-context"')
    const replyIndex = source.indexOf('class="webqq-composer-reply"', contextIndex)
    const attachmentIndex = source.indexOf('class="webqq-composer-attachment-file"', contextIndex)

    expect(source).toContain('model.replyingTo || mentions.length || sendFiles.length')
    expect(contextIndex).toBeGreaterThan(-1)
    expect(replyIndex).toBeGreaterThan(contextIndex)
    expect(attachmentIndex).toBeGreaterThan(replyIndex)
    expect(contextRule).toContain('position: absolute')
    expect(contextRule).toContain('right: 14px')
    expect(contextRule).toContain('left: 14px')
    expect(contextRule).toContain('bottom: calc(100% + 8px)')
    expect(contextRule).toContain('flex-wrap: wrap')
    expect(contextRule).toContain('align-items: flex-end')
    expect(replyRule).not.toContain('position: absolute')
    expect(replyRule).toContain('width: max-content')
    expect(replyRule).toContain('max-width: 100%')
    expect(replyTextRule).toContain('flex: 1 1 auto')
    expect(replyTextRule).toContain('text-overflow: ellipsis')
    expect(replyButtonRule).toContain('flex: none')
    expect(source).not.toContain('class="webqq-composer-attachments"')
    expect(attachmentIndex).toBeGreaterThan(replyIndex)
    expect(css).not.toContain('.webqq-composer-attachments')
    expect(css).not.toContain('.webqq-composer-attachments.has-reply')
    expect(css).not.toContain('bottom: calc(100% + 54px)')
    expect(source).toContain('ref="composerContextRef"')
    expect(source).toContain('const context = composerContextRef.value')
    expect(source).toContain('composerSpaceObserver.observe(context)')
    expect(source).not.toContain("querySelectorAll('.webqq-composer-reply, .webqq-composer-attachments')")
    expect(source).toContain('aria-label="清除回复与提及"')
  })

  it('禁用的输入框、附件和发送按钮不改变鼠标样式，但保留 disabled 与透明度', () => {
    const css = readFileSync(resolve('client/styles/webqq-composer.css'), 'utf8')
    const source = readFileSync(resolve('client/webqq-composer.vue'), 'utf8')

    expect(css).not.toContain('cursor:')
    expect(css).toMatch(/\.webqq-composer-action:disabled\s*\{[^}]*opacity:\s*0\.45/)
    // disabled 语义仍绑定 sending / 空内容 / 无会话。
    expect(source).toContain(':disabled="sending || !model.conversationId"')
    expect(source).toContain(':disabled="sending || (!input.trim() && !mentions.length && !sendFiles.length) || !model.conversationId"')
  })
})
