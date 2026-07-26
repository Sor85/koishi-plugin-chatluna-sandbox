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
    expect(source).not.toContain('koishiWorkspacePort')
    expect(pageSource).toContain('<WebqqChatPane')
    expect(pageSource).not.toContain('class="webqq-chat-header"')
  })
})
