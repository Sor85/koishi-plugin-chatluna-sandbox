import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('WebQQ 消息多选与目标选择', () => {
  it('消息列表提供多选入口、默认选中与行内 toggle', () => {
    const source = readFileSync(resolve('client/webqq-message-list.vue'), 'utf8')

    expect(source).toContain("emit('enterSelection', message.id)")
    expect(source).toContain('多选')
    expect(source).toContain('selectionMode?: boolean')
    expect(source).toContain('selectedMessageIds?: string[]')
    expect(source).toContain("emit('toggleSelection', message.id)")
    expect(source).toContain("{ 'is-selected': model.selectionMode && isMessageSelected(message.id) }")
    expect(source).toContain('isMessageSelectable(message)')
    expect(source).toContain('class="webqq-message-select-marker"')
    // 多选态禁用普通右键操作，避免和勾选冲突。
    expect(source).toContain(':disabled="isRecalledMessage(message) || model.selectionMode"')
  })

  it('chat-pane 管理多选态、Esc/切会话清空，并在多选时替换 composer', () => {
    const source = readFileSync(resolve('client/webqq-chat-pane.vue'), 'utf8')

    expect(source).toContain('const selectionMode = ref(false)')
    expect(source).toContain('const selectedMessageIds = ref<string[]>([])')
    expect(source).toContain('function enterSelection(messageId: string)')
    expect(source).toContain('selectedMessageIds.value = [messageId]')
    expect(source).toContain('function toggleSelection(messageId: string)')
    expect(source).toContain('function exitSelection()')
    expect(source).toContain("event.key !== 'Escape'")
    expect(source).toContain('watch(() => props.model.conversationId')
    expect(source).toContain('exitSelection()')
    expect(source).toContain('已选 {{ selectedMessageIds.length }} 条')
    expect(source).toContain('合并转发')
    expect(source).toContain('<WebqqComposer\n      v-else')
    expect(source).toContain('sendForwardMessage: [input: { conversationId: string, messageIds: string[] }')
    expect(source).toContain('<WebqqForwardTargetDialog')
  })

  it('目标会话对话框支持最近/好友/群/搜索/单选', () => {
    const source = readFileSync(resolve('client/webqq-forward-target-dialog.vue'), 'utf8')
    const shellSource = readFileSync(resolve('client/webqq/workspace-shell.ts'), 'utf8')
    const pageSource = readFileSync(resolve('client/page.vue'), 'utf8')

    expect(source).toContain("label: '最近'")
    expect(source).toContain("label: '好友'")
    expect(source).toContain("label: '群组'")
    expect(source).toContain("placeholder=\"搜索最近、好友或群组...\"")
    expect(source).toContain('selectedConversationId')
    expect(source).toContain("emit('confirm', conversationId, resolve, reject)")
    expect(shellSource).toContain('const forwardTargets = computed<WebqqForwardTargetModel>')
    expect(shellSource).toContain('forwardTargets: forwardTargets.value')
    expect(shellSource).toContain('Phase D 多选目标确认后由 chat-pane 调用')
    expect(pageSource).toContain('@send-forward-message="sendForwardMessage"')
    expect(pageSource).toContain('sendForwardMessage,')
  })

  it('多选样式独立于 webqq-messages.css 的 forward 规则', () => {
    const selectionStyles = readFileSync(resolve('client/styles/webqq-message-selection.css'), 'utf8')
    const styleEntry = readFileSync(resolve('client/style.css'), 'utf8')
    const messageStyles = readFileSync(resolve('client/styles/webqq-messages.css'), 'utf8')

    expect(styleEntry).toContain('./styles/webqq-message-selection.css')
    expect(selectionStyles).toContain('.webqq-selection-bar')
    expect(selectionStyles).toContain('.webqq-message-row.is-selecting.is-selected')
    expect(selectionStyles).toContain('.webqq-forward-target-item')
    // 本阶段不实现 forward 卡片/modal，也不改 messages.css 中 forward 规则。
    expect(selectionStyles).not.toContain('webqq-message-forward')
    expect(messageStyles).not.toContain('webqq-selection-bar')
  })
})
