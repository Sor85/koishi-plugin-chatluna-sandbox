import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('WebQQ 聊天区域', () => {
  it('组合顶栏、消息列表与发送控件', () => {
    const source = readFileSync(resolve('client/webqq-chat-pane.vue'), 'utf8')
    const pageSource = readFileSync(resolve('client/page.vue'), 'utf8')

    expect(source).toContain('<main class="webqq-chat"')
    expect(source).toContain('<WebqqMessageList')
    expect(source).toContain('<WebqqComposer')
    expect(source).toContain('watch(() => props.model.conversationId')
    expect(source).toContain('forwardTargets: WebqqForwardTargetModel')
    expect(source).toContain('sendForwardMessage:')
    expect(source).toContain('getForwardMessage:')
    expect(source).toContain('<WebqqForwardModal')
    expect(source).toContain('@open-forward="openForwardDialog"')
    expect(source).toContain('const forwardStack = ref<ForwardDialogFrame[]>([])')
    expect(source).toContain('const forwardDialog = computed(() => forwardStack.value.at(-1))')
    expect(source).toContain(':can-navigate-back="forwardStack.length > 1"')
    expect(source).toContain('@back="popForwardDialog"')
    expect(source).toContain("mode === 'push' ? [...forwardStack.value, frame] : [frame]")
    expect(source).toContain("openForwardByInput(input, 'replace')")
    expect(source).toContain("openForwardByInput({ forwardId }, 'push')")
    expect(source).toContain('forwardStack.value = forwardStack.value.slice(0, -1)')
    expect(source).toContain('forwardStack.value = []')
    expect(source).not.toContain('koishiWorkspacePort')
    expect(pageSource).toContain('<WebqqChatPane')
    expect(pageSource).toContain('@send-forward-message="sendForwardMessage"')
    expect(pageSource).toContain('@get-forward-message="getForwardMessage"')
    expect(pageSource).not.toContain('class="webqq-chat-header"')
  })
})
