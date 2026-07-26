import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

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
})
