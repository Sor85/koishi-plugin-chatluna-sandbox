import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('WebQQ 消息列表', () => {
  it('从页面提取消息渲染与消息交互', () => {
    const source = readFileSync(resolve('client/webqq-message-list.vue'), 'utf8')
    const chatPaneSource = readFileSync(resolve('client/webqq-chat-pane.vue'), 'utf8')

    expect(source).toContain('model: WebqqMessageListModel')
    expect(source).toContain('getMessageClusterClass')
    expect(source).toContain('isMergedMessage')
    expect(source).toContain('class="webqq-message-quote is-clickable"')
    expect(source).toContain('class="webqq-message-event"')
    expect(source).toContain('loadHistory: [resolve: () => void')
    expect(chatPaneSource).toContain('<WebqqMessageList')
    expect(chatPaneSource).not.toContain('class="webqq-messages"')
  })
})
