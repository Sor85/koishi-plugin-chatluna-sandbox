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
    /**
     * 三条指针分流规则（多选下头像不阻断冒泡、气泡在捕获阶段按可转发能力位接管、
     * 整条点击排除气泡区）已下沉到 message-pointer-routing 并由它的行为断言逐条执行。
     * 这里只剩接线与一条否定式守卫：头像上不得出现 `.stop`，加上它多选下点头像就无法勾选。
     */
    expect(source).toContain('@click="handleMessageAvatarClick(message, $event)"')
    expect(source).not.toContain('@click.stop="handleMessageAvatarClick')
    expect(source).toContain("emit('toggleSelection', message.id)")
    expect(source).toContain('@click.capture="handleMessageBubbleClick(message, $event)"')
    expect(source).toContain("{ 'is-selected': model.selectionMode && isMessageSelected(message.id) }")
    expect(source).not.toContain('v-if="model.selectionMode"\n                class="chatluna-sandbox-message-select-marker"')
    expect(source).toContain('class="chatluna-sandbox-message-select-marker"')
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
    expect(source).not.toContain('点击消息切换勾选，Esc 退出多选')
    expect(source).toContain('class="chatluna-sandbox-selection-bar-button"')
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
    expect(source).toContain('placeholder="搜索最近、好友或群组..."')
    expect(source).toContain('aria-label="搜索目标会话"')
    expect(source).toContain('<label class="chatluna-sandbox-forward-target-search">')
    expect(source).not.toContain('class="chatluna-sandbox-search chatluna-sandbox-forward-target-search"')
    expect(source).not.toContain('<span class="sr-only">搜索目标会话</span>')
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
    expect(selectionStyles).toContain('.chatluna-sandbox-selection-bar')
    expect(selectionStyles).toContain('width: max-content')
    expect(selectionStyles).toContain('border-radius: 999px')
    expect(selectionStyles).toContain('.chatluna-sandbox-selection-bar .chatluna-sandbox-selection-bar-button')
    expect(selectionStyles).toContain('.chatluna-sandbox-message-row.is-selecting')
    expect(selectionStyles).toContain('width: 100%')
    expect(selectionStyles).not.toContain('.chatluna-sandbox-message-row.is-selecting:not(.is-selectable)')
    expect(selectionStyles).not.toContain('border-style: dashed')
    expect(selectionStyles).not.toContain('.chatluna-sandbox-message-row.is-selecting.is-selected {')
    expect(selectionStyles).not.toContain('.chatluna-sandbox-message-row.is-selecting.is-selectable:hover')
    expect(selectionStyles).toContain('.chatluna-sandbox-message-row.is-selecting.is-outgoing .chatluna-sandbox-message-select-body')
    expect(selectionStyles).toContain('margin-left: auto')
    expect(selectionStyles).toContain('.chatluna-sandbox-forward-target-search')
    expect(selectionStyles).toContain('grid-template-columns: 18px minmax(0, 1fr)')
    expect(selectionStyles).toContain('box-sizing: border-box')
    expect(selectionStyles).toContain('.chatluna-sandbox-forward-target-search:focus-within')
    expect(selectionStyles).toContain('.chatluna-sandbox-forward-target-item')
    // 本阶段不实现 forward 卡片/modal，也不改 messages.css 中 forward 规则。
    expect(selectionStyles).not.toContain('chatluna-sandbox-message-forward')
    expect(messageStyles).not.toContain('chatluna-sandbox-selection-bar')
  })
})
