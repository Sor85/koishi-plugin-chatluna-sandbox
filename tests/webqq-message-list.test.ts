import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('WebQQ 消息列表', () => {
  it('从页面提取消息渲染与消息交互', () => {
    const source = readFileSync(resolve('client/webqq-message-list.vue'), 'utf8')
    const chatPaneSource = readFileSync(resolve('client/webqq-chat-pane.vue'), 'utf8')

    expect(source).toContain('model: WebqqMessageListModel')
    expect(source).toContain('getMessageClusterClass')
    expect(source).toContain('replyMessages: Record<string, SandboxMessage>')
    expect(source).toContain('props.model.replyMessages[message.replyToMessageId]')
    expect(source).toContain('isMergedMessage')
    expect(source).toContain('class="webqq-message-quote is-clickable"')
    expect(source).toContain('class="webqq-message-event"')
    expect(source).toContain("message.authorId === model.currentOperatorId ? 'is-outgoing' : 'is-incoming'")
    expect(source).toContain('loadHistory: [resolve: () => void')
    expect(chatPaneSource).toContain('<WebqqMessageList')
    expect(chatPaneSource).not.toContain('class="webqq-messages"')
  })

  it('显式深色主题下当前操作者气泡仍使用强调色', () => {
    const styles = readFileSync(resolve('client/styles/webqq-messages.css'), 'utf8')
    const darkIncomingRule = styles.indexOf('.webqq-workspace[data-color-mode="dark"] .webqq-message-bubble')
    const darkOutgoingRule = styles.lastIndexOf('.webqq-workspace[data-color-mode="dark"] .webqq-message-row.is-outgoing .webqq-message-bubble')

    expect(darkOutgoingRule).toBeGreaterThan(darkIncomingRule)
    expect(styles.slice(darkOutgoingRule, darkOutgoingRule + 260)).toContain('background: var(--webqq-accent)')
  })
})
