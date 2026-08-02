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

  it('禁用的输入框、附件和发送按钮不使用 not-allowed 光标，但保留 disabled 与透明度', () => {
    const css = readFileSync(resolve('client/styles/webqq-composer.css'), 'utf8')
    const source = readFileSync(resolve('client/webqq-composer.vue'), 'utf8')

    // 禁用选择器上不得再声明 cursor: not-allowed（注释里的说明文字不算）。
    expect(css).not.toMatch(/:disabled\s*\{[^}]*cursor:\s*not-allowed/)
    expect(css).toMatch(/\.webqq-composer-action:disabled\s*\{[^}]*opacity:\s*0\.45/)
    expect(css).toMatch(/\.webqq-composer-action:disabled\s*\{[^}]*cursor:\s*default/)
    expect(css).toMatch(/\.webqq-composer textarea:disabled\s*\{[^}]*cursor:\s*text/)
    // disabled 语义仍绑定 sending / 空内容 / 无会话。
    expect(source).toContain(':disabled="sending || !model.conversationId"')
    expect(source).toContain(':disabled="sending || (!input.trim() && !mentions.length && !sendFiles.length) || !model.conversationId"')
  })
})
