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

  it('按机器人参与者和逻辑会话渲染 ChatLuna 等待态', () => {
    const source = readFileSync(resolve('client/webqq-message-list.vue'), 'utf8')
    const styles = readFileSync(resolve('client/styles/webqq-messages.css'), 'utf8')

    expect(source).toContain('chatLunaStates: SandboxChatLunaState[]')
    expect(source).toContain("state.botParticipantId === model.currentOperatorId ? 'is-outgoing' : 'is-incoming'")
    expect(styles).toContain('.webqq-chatluna-thinking-dots')
    expect(styles).toContain('@keyframes webqq-chatluna-thinking-dot')
  })

  it('思考指标 1:1 复用 onebot-webqq 的结构与交互', () => {
    const source = readFileSync(resolve('client/webqq-message-list.vue'), 'utf8')
    const styles = readFileSync(resolve('client/styles/webqq-messages.css'), 'utf8')

    expect(source).toContain('class="webqq-thinking-row"')
    expect(source).toContain('getMessageThinking(message)')
    expect(source).toContain('class="webqq-thinking-row is-usage-only"')
    expect(source).toContain('getMessageUsage(message)')
    // 思考归档在消息上，多轮对话后每条机器人消息各自保留指标。
    expect(source).toContain('message.chatLuna?.thought')
    expect(source).toContain('<Transition name="webqq-thinking" @before-leave="prepareThinkingPanelLeave">')
    expect(source).toContain('class="webqq-thinking-content"')
    expect(source).toContain('webqq-thinking-usage-icon is-input')
    expect(source).toContain('webqq-thinking-usage-icon is-output')
    // 思考行不能复用带头像的消息行，否则会渲染成一条独立机器人消息。
    expect(source).not.toContain('webqq-message-row webqq-thinking-row')
    expect(source).toContain('v-show="state.thinking"')
    // Token 指标默认隐藏，仅在悬停或聚焦折叠按钮时淡入。
    expect(styles).toContain('.webqq-thinking-toggle:hover .webqq-thinking-usage')
    expect(styles).toContain('.webqq-thinking-row.is-usage-only .webqq-thinking-usage')
    expect(styles).toContain('.webqq-thinking-row .webqq-thinking-chevron.is-expanded')
    expect(styles).toContain('transform: rotate(90deg)')
    expect(styles).toContain('max-width: min(360px, 100%)')
    expect(styles).toContain('white-space: pre-wrap')
    expect(styles).toContain('.webqq-thinking-row.is-incoming')
  })

  it('机器人在左侧时 Token 镜像到右侧但箭头仍紧跟思考时长', () => {
    const source = readFileSync(resolve('client/webqq-message-list.vue'), 'utf8')
    const styles = readFileSync(resolve('client/styles/webqq-messages.css'), 'utf8')
    const readRule = (selector: string) => styles.slice(styles.indexOf(`\n${selector} {`) + 1).split('}')[0]

    expect(source).toContain('class="webqq-thinking-duration"')
    expect(readRule('.webqq-thinking-row.is-incoming .webqq-thinking-duration')).toContain('order: 1')
    expect(readRule('.webqq-thinking-row.is-incoming .webqq-thinking-chevron')).toContain('order: 2')
    expect(readRule('.webqq-thinking-row.is-incoming .webqq-thinking-usage')).toContain('order: 3')
    // 箭头贴到行首会被误读成换行符，两侧朝向必须一致。
    expect(readRule('.webqq-thinking-row.is-incoming .webqq-thinking-toggle')).not.toContain('flex-direction')
    expect(readRule('.webqq-thinking-row .webqq-thinking-chevron.is-expanded')).toContain('transform: rotate(90deg)')
    expect(styles).not.toContain('transform: rotate(180deg)')
    // 指标行换行会把箭头挤到第二行，必须始终单行。
    expect(readRule('.webqq-thinking-toggle')).not.toContain('flex-wrap')
    expect(readRule('.webqq-thinking-toggle')).toContain('white-space: nowrap')
    expect(readRule('.webqq-thinking-usage')).not.toContain('flex-wrap')
    expect(readRule('.webqq-thinking-usage')).toContain('white-space: nowrap')
  })

  it('固定 TIM 并显示消息时间与群身份', () => {
    const source = readFileSync(resolve('client/webqq-message-list.vue'), 'utf8')
    const styles = readFileSync(resolve('client/styles/webqq-messages.css'), 'utf8')

    expect(source).toContain('formatMessageTime(message.createdAt)')
    expect(source).toContain('class="webqq-message-time"')
    expect(source).toContain('getMessageAuthorName(message.authorId)')
    expect(source).toContain('getMessageRoleBadge(message.authorId)')
    expect(source).not.toContain('chatStyle')
    expect(styles).toContain('.webqq-message-time')
    expect(styles).toContain('opacity: 0')
    expect(styles).toContain('.webqq-message-row:hover .webqq-message-time')
    expect(styles).toContain('opacity: 1')
    expect(styles).toContain('.webqq-message-row.is-outgoing .webqq-message-body')
    expect(styles).toContain('flex-direction: row-reverse')
    expect(styles).toContain('.webqq-role-badge.is-owner')
    expect(styles).toContain('.webqq-role-badge.is-admin')
    expect(styles).not.toContain('data-chat-style')
  })
})
