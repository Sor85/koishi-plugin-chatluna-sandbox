import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { expectUserFacingCopies, expectUserFacingCopy } from './helpers/user-facing-copy'

const readSource = (path: string) => readFileSync(resolve(path), 'utf8')

describe('WebQQ 消息列表', () => {
  it('消息行按方向、分簇与呈现状态挂类名', () => {
    const source = readSource('client/webqq/message-list.vue')

    /**
     * 类别：DOM 结构与元素顺序（ADR 0073 五类判据第 3 类，全留）。
     * 依据：这些类名与 `client/webqq/messages.css` 的选择器构成结构契约，改名会让样式静默失效。
     * 判定本身住在 message-cluster、message-presentation 两个模块，由它们的行为断言逐条执行。
     */
    expect(source).toContain("message.authorId === model.currentOperatorId ? 'is-outgoing' : 'is-incoming'")
    expect(source).toContain('class="chatluna-sandbox-message-quote is-clickable"')
    expect(source).toContain('class="chatluna-sandbox-message-quote chatluna-sandbox-message-forward"')
    expect(source).toContain('class="chatluna-sandbox-message-forward-entry"')
    expect(source).toContain('class="chatluna-sandbox-message-event"')
    expect(source).toContain('<ol v-else ref="messagesContentElement">')
  })

  it('多选态的入口、勾选标记与右键禁用', () => {
    const source = readSource('client/webqq/message-list.vue')

    /**
     * 类别：实现细节契约（肯定式）。
     * 依据：多选流程尚未下沉，这些断言是它当前行为的唯一记录；
     * 负责人 message-chain-behaviour-modules 04。
     */
    expect(source).toContain('selectionMode?: boolean')
    expect(source).toContain('enterSelection: [messageId: string]')
    expect(source).toContain('<ContextMenuTrigger as-child :disabled="preview || model.selectionMode || !model.currentConversation">')
  })

  it('滚动追踪、位置恢复与加载更早历史的接线', () => {
    const source = readSource('client/webqq/message-list.vue')
    const styles = readSource('client/webqq/messages.css')
    const scrollbarSource = readSource('client/shared/scrollbar.ts')

    /**
     * 类别：实现细节契约（肯定式）。
     * 依据：锚点选取、恢复的三分支、保存的两条边界与分趟排程住在 message-list-scroll-restore；
     * 会话切换的五步顺序、容器尺寸变化的二选一与观察器的建立断开住在
     * message-list-conversation-switch；加载更早历史的闸门、拒绝吞掉与锚点补偿住在
     * message-list-history-load。三者各有行为断言逐条执行。
     *
     * 这里保留的是**接线**：哪几个 DOM 事件通向哪个处理器、哪个 watcher 触发切换编排与观察器
     * 绑定、卸载时断开哪些东西。模块看不到接线，少接一根线的表现是「某种滚动方式不再被识别」，
     * 而不是判定出错。
     */
    expect(source).toContain('ref="messagesElement"')
    expect(source).toContain('@scroll="handleMessagesScroll"')
    expect(source).toContain("from './message-list-scroll'")
    expect(source).toContain("from './message-reveal'")
    expect(source).toContain("from './message-list-scroll-restore'")
    expect(source).toContain("from './message-list-conversation-switch'")
    expect(source).toContain("from './message-list-history-load'")
    expect(source).toContain('function revealMessage(messageId: string)')
    expect(source).toContain('defineExpose({')
    expect(source).toContain('createMessageListFollowController')
    expect(source).toContain('shouldFollowMessageListTail(')
    expect(source).toContain('follow.handleScroll()')
    expect(source).toContain('follow.handleUserScrollIntent()')
    expect(source).toContain('follow.scheduleBottom')
    expect(source).toContain('contentResize.bind(')
    expect(source).toContain('contentResize.disconnect()')
    expect(source).toContain('watch(scrollStateKey')
    expect(source).toContain('saveMessageListScrollState()')
    expect(source).toContain("from './message-list-scroll-state'")
    expect(source).toContain('@wheel.passive="handleMessageListUserScroll"')
    expect(source).toContain('@touchstart.passive="handleMessageListUserScroll"')
    expect(source).toContain('@pointerdown="finishMessageListScrollRestore"')
    expect(source).toContain("from './message-list-follow'")

    // 类别：样式文本（ADR 0073 第一类例外）。浏览器的滚动锚定会和自定义恢复算术打架。
    expect(styles).toContain('overflow-anchor: none')

    /**
     * 类别：实现细节契约（否定式）。
     * 依据：贴底追踪曾经住在滚动条指令里；加回去会让两处各判一次。
     */
    expect(scrollbarSource).not.toContain('stickingToBottom')
    expect(scrollbarSource).not.toContain('shouldFollowMessageListTail')
  })

  it('二级面与浮层里的滚动条隐藏 body 轨道', () => {
    /**
     * 类别：实现细节契约（肯定式）。
     * 依据：这三处的行为由各自组件的候选负责，不在本轮范围内。
     */
    expect(readSource('client/webqq/emoji-picker.vue')).toContain("v-webqq-scrollbar=\"{ showOverlay: false, tone: 'accent', zIndex: 140 }\"")
    expect(readSource('client/webqq/forward-modal.vue')).toContain('v-webqq-scrollbar="{ showOverlay: false }"')
    expect(readSource('client/webqq/forward-target-dialog.vue')).toContain("v-webqq-scrollbar=\"{ showOverlay: false, tone: 'accent' }\"")
  })

  it('空会话显示欢迎页，机器人会话多一段状态说明', () => {
    const source = readSource('client/webqq/message-list.vue')

    // 类别：DOM 结构与元素顺序。这些类名与 client/webqq/messages.css 的欢迎页规则构成结构契约。
    expect(source).toContain('class="webqq-welcome"')
    expect(source).toContain("'is-bot': model.avatarKind === 'bot'")
    expect(source).toContain('class="webqq-welcome-status"')
    expect(source).toContain('class="webqq-welcome-divider"')

    // 类别：用户可见文案。在不引入组件挂载测试的前提下，这是守住界面文案不被误删的唯一手段。
    expectUserFacingCopies(source, [
      '在线 · OneBot 机器人',
      '发送一条消息开始测试',
      '在模拟 QQ 环境中体验 OneBot 的消息交互',
      '发送消息，验证插件在模拟 QQ 环境中的响应',
    ])
  })

  it('消息操作菜单只能由气泡本身触发', () => {
    const source = readSource('client/webqq/message-list.vue')

    /**
     * 类别：DOM 结构与元素顺序。
     * 依据：触发区域是结构事实——挂到整条 `<li>` 上会让头像、时间与行内空白都能唤出菜单。
     */
    const messageActionMenuSource = source.slice(
      source.indexOf('<ContextMenu v-else>'),
      source.indexOf('<li\n          v-if="shouldShowThinking(message)"'),
    )
    expect(messageActionMenuSource).toContain('<ContextMenuTrigger as-child :disabled="isRecalledMessage(message) || model.selectionMode">\n                      <div class="chatluna-sandbox-message-bubble"')
    expect(messageActionMenuSource).not.toContain('<ContextMenuTrigger as-child :disabled="isRecalledMessage(message) || model.selectionMode">\n            <li')
  })

  it('右键「回复」与「@ 用户」把焦点交给消息输入框', () => {
    const source = readSource('client/webqq/message-list.vue')
    const chatPaneSource = readSource('client/webqq/chat-pane.vue')
    const composerSource = readSource('client/webqq/composer.vue')

    /**
     * 类别：实现细节契约（肯定式）。
     * 依据：让位与否的判定已下沉到 menu-focus-handoff 并由它的五条行为断言逐条执行；聚焦时机
     * 与光标落点住在 composer-draft-host。这里保留的是三根线——菜单项记下交接意图、reka-ui 的
     * 还焦事件接到判定上、聊天区域把焦点交给发送控件。少接任何一根的表现都一样：回复条或提及
     * 出现了，输入框里却没有光标，因为 reka-ui 在菜单卸载后把焦点还给右键之前那个元素（消息
     * 气泡不可聚焦，通常是 document.body；Firefox 还会把它还给刚被右键的头像按钮）。
     *
     * 气泡菜单与头像菜单挂在同一条消息上，标识必须分开，否则一个的关闭会消费掉另一个的意图。
     */
    expect(source).toContain("menuFocusHandoff.request(message.id); emit('reply', message.id)")
    expect(source).toContain('@close-auto-focus="handleMenuCloseAutoFocus(message.id, $event)"')
    expect(source).toContain("menuFocusHandoff.request(avatarMenuId(message.id)); emit('mentionGroupMember', message.authorId)")
    expect(source).toContain('@close-auto-focus="handleMenuCloseAutoFocus(avatarMenuId(message.id), $event)"')
    expect(source).toContain('if (!menuFocusHandoff.consume(menuId)) return\n  event.preventDefault()')
    expect(chatPaneSource).toContain('@focus-composer="focusComposer"')
    expect(composerSource).toContain('defineExpose({ focus: () => draftHost.focus() })')
  })

  it('清空会话与跳转到对应请求的入口', () => {
    const source = readSource('client/webqq/message-list.vue')
    const chatPaneSource = readSource('client/webqq/chat-pane.vue')

    // 类别：用户可见文案。
    expectUserFacingCopy(source, '清空会话记录')
    expectUserFacingCopy(source, '跳转到对应请求')

    /**
     * 类别：实现细节契约（肯定式）。
     * 依据：两个入口都从列表冒泡到聊天区域再到页面。这段接线是纯转发管道，按本轮规格
     * 「不下沉的三块」明确留在组件里——把它下沉不会集中复杂度，只会搬家；因此这里的断言
     * 是这条管道唯一的观察面。客户端守卫「消息动作入口必须由能力位守门」已经把它判为管道
     * 而不是动作入口，两者口径一致。
     */
    expect(source).toContain("emit('openModelRequest', message.chatLuna.modelRequests.at(-1)!)")
    expect(chatPaneSource).toContain('@clear-conversation="emit(\'clearConversation\')"')
    expect(chatPaneSource).toContain('@open-model-request="emit(\'openModelRequest\', $event)"')
    expect(chatPaneSource).toContain('openModelRequest: [reference: SandboxMessageModelRequestReference]')
    expect(chatPaneSource).toContain('clearConversation: []')
  })

  it('聊天区域装配消息列表与合并转发弹窗，自己不画消息容器', () => {
    const chatPaneSource = readSource('client/webqq/chat-pane.vue')

    // 类别：DOM 结构与元素顺序。消息容器只能有一处，否则会出现两层滚动区。
    expect(chatPaneSource).toContain('<WebqqMessageList')
    expect(chatPaneSource).toContain('<WebqqForwardModal')
    expect(chatPaneSource).toContain('@open-forward="openForwardDialog"')
    expect(chatPaneSource).not.toContain('class="chatluna-sandbox-messages"')
  })

  it('合并转发卡片 1:1 复刻 quote/forward 尺寸与入口文案', () => {
    const source = readSource('client/webqq/message-list.vue')
    const styles = readSource('client/webqq/messages.css')
    const modalSource = readSource('client/webqq/forward-modal.vue')
    const overlays = readSource('client/workspace/overlays.css')

    /**
     * 类别：用户可见文案。转发预览的查表判定（含「没有转发标识就不算转发」这条边界）
     * 已下沉到 message-presentation 并由它的行为断言逐条执行，这里只守文案。
     */
    expectUserFacingCopy(source, '条转发消息')
    expectUserFacingCopy(source, '合并转发')

    // 类别：样式文本。
    expect(styles).toContain('.chatluna-sandbox-message-quote.chatluna-sandbox-message-forward')
    expect(styles).toContain('width: 260px')
    expect(styles).toContain('.chatluna-sandbox-message-forward-entry')
    expect(styles).toContain("content: \"›\"")
    expect(styles).toContain('border-left-color: rgb(161 161 170 / 62%)')
    expect(styles).toContain('background: rgb(39 39 42 / 62%)')
    expect(styles).toContain('border-top-color: rgb(161 161 170 / 28%)')
    expect(modalSource).toContain('class="chatluna-sandbox-forward-modal-backdrop"')
    expect(modalSource).toContain('aria-label="合并转发消息"')
    expect(modalSource).toContain('@keydown.esc="emit(\'close\')"')
    expect(modalSource).toContain('IconChevronLeft')
    expect(modalSource).toContain('canNavigateBack: boolean')
    expect(modalSource).toContain("back: []")
    expect(modalSource).toContain('aria-label="返回上一层合并转发"')
    expect(modalSource).toContain('getForwardNodeClusterClass')
    expect(modalSource).toContain('class="chatluna-sandbox-message-quote chatluna-sandbox-message-forward"')
    expect(overlays).toContain('.chatluna-sandbox-forward-modal-backdrop')
    expect(overlays).toContain('z-index: 160')
    expect(overlays).toContain('width: min(480px, calc(100vw - 32px))')
    expect(overlays).toContain('max-height: min(80vh, 620px)')
    expect(overlays).toContain('padding: 14px 16px 28px')
    const forwardModalRule = overlays.slice(overlays.indexOf('.chatluna-sandbox-forward-modal {')).split('}')[0]
    const darkForwardModalRule = overlays.slice(overlays.indexOf('body[data-sandbox-color-scheme="dark"] .chatluna-sandbox-forward-modal {')).split('}')[0]
    expect(forwardModalRule).toContain('border: 1px solid transparent')
    expect(darkForwardModalRule).toContain('border-color: transparent')
    expect(darkForwardModalRule).toContain('background: rgb(44 44 48 / 98%)')
    expect(overlays).not.toContain('cursor:')
  })

  it('显式深色主题下区分其他用户与当前操作者气泡', () => {
    const styles = readSource('client/webqq/messages.css')
    const darkIncomingRule = styles.indexOf(
      '.webqq-workspace[data-color-mode="dark"] .chatluna-sandbox-message-bubble {\n  --webqq-bubble-bg:',
    )
    const darkOutgoingRule = styles.lastIndexOf('.webqq-workspace[data-color-mode="dark"] .chatluna-sandbox-message-row.is-outgoing .chatluna-sandbox-message-bubble')

    const darkIncomingBubble = styles.slice(darkIncomingRule, darkIncomingRule + 420)
    expect(darkIncomingBubble).toContain('--webqq-bubble-bg: rgb(57 57 63)')
    expect(darkIncomingBubble).toContain('--webqq-reaction-bg: rgb(47 47 52)')
    expect(darkIncomingBubble).toContain('border-color: rgb(113 113 122 / 36%)')
    expect(darkIncomingBubble).toContain('background: var(--webqq-bubble-bg)')

    expect(darkOutgoingRule).toBeGreaterThan(darkIncomingRule)
    const darkOutgoingBubble = styles.slice(darkOutgoingRule, darkOutgoingRule + 360)
    expect(darkOutgoingBubble).toContain('--webqq-bubble-bg: var(--webqq-accent)')
    expect(darkOutgoingBubble).toContain('background: var(--webqq-bubble-bg)')
    expect(darkOutgoingBubble).not.toContain('box-shadow: none')
    expect(styles).toContain('box-shadow: 0 2px 8px rgb(15 23 42 / 16%)')
  })

  it('按机器人参与者和逻辑会话渲染 ChatLuna 等待态', () => {
    const source = readSource('client/webqq/message-list.vue')
    const styles = readSource('client/webqq/messages.css')

    expect(source).toContain('chatLunaStates: SandboxChatLunaState[]')
    expect(source).toContain("state.botParticipantId === model.currentOperatorId ? 'is-outgoing' : 'is-incoming'")
    expect(styles).toContain('.webqq-chatluna-thinking-dots')
    expect(styles).toContain('@keyframes webqq-chatluna-thinking-dot')
  })

  it('思考指标 1:1 复用 onebot-webqq 的结构与交互', () => {
    const source = readSource('client/webqq/message-list.vue')
    const styles = readSource('client/webqq/messages.css')

    /**
     * 类别：DOM 结构与元素顺序。
     * 依据：「有思考内容」与「只有用量」的取值判定已下沉到 message-presentation
     * 并由它的行为断言逐条执行；这里守的是两种形态各自的类名与结构。
     */
    expect(source).toContain('class="chatluna-sandbox-thinking-row"')
    expect(source).toContain('class="chatluna-sandbox-thinking-row is-usage-only"')
    /**
     * 类别：实现细节契约（肯定式）。
     * 依据：离场冻结的判定（钉左缘还是钉右缘、解除宽度百分比约束）已下沉到 thinking-panel
     * 并由它的行为断言逐条执行；这里保留的是「Transition 真的接上了那个钩子」这条接线——
     * 钩子没接上时面板会继续占住文档流，模块的行为断言看不到这件事。
     */
    expect(source).toContain('<Transition name="chatluna-sandbox-thinking" @before-leave="prepareThinkingPanelLeave">')
    expect(source).toContain('class="chatluna-sandbox-thinking-content"')
    expect(source).toContain('chatluna-sandbox-thinking-usage-icon is-input')
    expect(source).toContain('chatluna-sandbox-thinking-usage-icon is-output')
    // 思考行不能复用带头像的消息行，否则会渲染成一条独立机器人消息。
    expect(source).not.toContain('chatluna-sandbox-message-row chatluna-sandbox-thinking-row')
    expect(source).toContain('v-show="state.thinking"')
    // Token 指标默认隐藏，仅在悬停或聚焦折叠按钮时淡入。
    expect(styles).toContain('.chatluna-sandbox-thinking-toggle:hover .chatluna-sandbox-thinking-usage')
    expect(styles).toContain('.chatluna-sandbox-thinking-row.is-usage-only .chatluna-sandbox-thinking-usage')
    expect(styles).toContain('.chatluna-sandbox-thinking-row .chatluna-sandbox-thinking-chevron.is-expanded')
    expect(styles).toContain('transform: rotate(90deg)')
    expect(styles).toContain('max-width: min(360px, 100%)')
    expect(styles).toContain('white-space: pre-wrap')
    expect(styles).toContain('.chatluna-sandbox-thinking-row.is-incoming')
  })

  it('机器人在左侧时 Token 镜像到右侧但箭头仍紧跟思考时长', () => {
    const source = readSource('client/webqq/message-list.vue')
    const styles = readSource('client/webqq/messages.css')
    const readRule = (selector: string) => styles.slice(styles.indexOf(`\n${selector} {`) + 1).split('}')[0]

    // 类别：DOM 结构与元素顺序。时长文案本身由 thinking-panel 的行为断言覆盖三种输入。
    expect(source).toContain('class="chatluna-sandbox-thinking-duration"')
    expect(readRule('.chatluna-sandbox-thinking-row.is-incoming .chatluna-sandbox-thinking-duration')).toContain('order: 1')
    expect(readRule('.chatluna-sandbox-thinking-row.is-incoming .chatluna-sandbox-thinking-chevron')).toContain('order: 2')
    expect(readRule('.chatluna-sandbox-thinking-row.is-incoming .chatluna-sandbox-thinking-usage')).toContain('order: 3')
    // 箭头贴到行首会被误读成换行符，两侧朝向必须一致。
    expect(readRule('.chatluna-sandbox-thinking-row.is-incoming .chatluna-sandbox-thinking-toggle')).not.toContain('flex-direction')
    expect(readRule('.chatluna-sandbox-thinking-row .chatluna-sandbox-thinking-chevron.is-expanded')).toContain('transform: rotate(90deg)')
    expect(styles).not.toContain('transform: rotate(180deg)')
    // 指标行换行会把箭头挤到第二行，必须始终单行。
    expect(readRule('.chatluna-sandbox-thinking-toggle')).not.toContain('flex-wrap')
    expect(readRule('.chatluna-sandbox-thinking-toggle')).toContain('white-space: nowrap')
    expect(readRule('.chatluna-sandbox-thinking-usage')).not.toContain('flex-wrap')
    expect(readRule('.chatluna-sandbox-thinking-usage')).toContain('white-space: nowrap')
  })

  it('固定 TIM 并显示消息时间与群身份', () => {
    const source = readSource('client/webqq/message-list.vue')
    const styles = readSource('client/webqq/messages.css')

    /**
     * 类别：实现细节契约（肯定式，五类判据第 4 类里的接线）。
     * 依据：时刻格式化住在 format-time，时区与语言都是显式参数，跨日、跨年、午夜与非法输入
     * 四个边界各有行为断言。这里保留的是「气泡上真的接了那个格式化器」这条接线——
     * 接错回隐式取环境的写法不会报错，只会在别的时区静默显示错的钟点。
     * 作者名回退与群身份徽标的判定已下沉到 participant-presentation。
     */
    expect(source).toContain('formatSandboxTimeOfDay(message.createdAt)')

    // 类别：实现细节契约（否定式）。隐式取运行机器时区与语言的旧写法不得被加回来。
    expect(source).not.toContain('toLocaleTimeString')

    // 类别：DOM 结构与元素顺序。
    expect(source).toContain('class="chatluna-sandbox-message-time"')

    // 类别：实现细节契约（否定式）。旧的整体聊天皮肤开关已删除，不得被加回来。
    expect(source).not.toContain('chatStyle')
    expect(styles).toContain('.chatluna-sandbox-message-time')
    expect(styles).toContain('opacity: 0')
    expect(styles).toContain('.chatluna-sandbox-message-row:hover .chatluna-sandbox-message-time')
    expect(styles).toContain('opacity: 1')
    expect(styles).toContain('.chatluna-sandbox-message-row.is-outgoing .chatluna-sandbox-message-body')
    expect(styles).toContain('flex-direction: row-reverse')
    expect(styles).toContain('.webqq-role-badge.is-owner')
    expect(styles).toContain('.webqq-role-badge.is-admin')
    expect(styles).not.toContain('data-chat-style')
  })

  it('专属头衔复用群身份徽标位置并提供设置入口', () => {
    const source = readSource('client/webqq/message-list.vue')
    const styles = readSource('client/webqq/messages.css')
    const menuSource = readSource('client/webqq/group-member-menu.vue')
    const detailsSource = readSource('client/webqq/details-panel.vue')
    const overlaySource = readSource('client/workspace/overlay-host.vue')
    const pageSource = readSource('client/workspace/page.vue')

    /**
     * 类别：DOM 结构与元素顺序。头衔沿用同一个徽标槽位，不新增第二个徽标元素。
     * 依据：「群主／管理员／头衔各显示什么」的判定已下沉到 participant-presentation
     * 并由它的行为断言逐条执行。
     */
    expect(source).toContain("emit('setGroupTitle', message.authorId)")
    expect(source).toContain('class="webqq-role-badge"')
    expect(styles).toContain('.webqq-role-badge.is-title')
    expect(menuSource).toContain("actions.includes('set-title')")
    expect(menuSource).toContain('设置专属头衔')
    expect(detailsSource).toContain('class="chatluna-sandbox-group-member-badges"')
    expect(detailsSource).toContain('<em v-if="member.title" class="is-title">')
    expect(overlaySource).toContain("title: { title: '设置专属头衔'")
    expect(pageSource).toContain("@set-group-title=\"openGroupActionDialog('title', $event)\"")
  })

  it('撤回消息按 markRecalledMessages 在原气泡与事件之间切换', () => {
    const source = readSource('client/webqq/message-list.vue')
    const styles = readSource('client/webqq/messages.css')
    const shellSource = readSource('client/workspace/shell.ts')

    /**
     * 类别：DOM 结构与元素顺序。
     * 依据：「事件化」「思考与用量随撤回标记一同隐藏」两条判定已下沉到 message-presentation，
     * 两个方向（开启／关闭撤回标记）各有行为断言；这里守的是撤回态的类名与标签结构。
     */
    expect(source).toContain("{ 'is-recalled': isRecalledMessage(message) }")
    expect(source).toContain('class="chatluna-sandbox-message-recalled-label">已撤回</span>')

    /**
     * 类别：实现细节契约（肯定式）。
     * 依据：多选态下右键禁用属于多选流程，负责人 message-chain-behaviour-modules 04。
     */
    expect(source).toContain('as-child :disabled="isRecalledMessage(message) || model.selectionMode"')

    // 类别：样式文本。
    expect(styles).toContain('.chatluna-sandbox-message-row.is-recalled')
    expect(styles).toContain('.chatluna-sandbox-message-row.is-recalled .chatluna-sandbox-message-text')
    expect(styles).toContain('text-decoration-line: line-through')
    expect(styles).toContain('.chatluna-sandbox-message-row.is-recalled .chatluna-sandbox-message-media audio')
    const mediaRecallLine = styles.slice(
      styles.indexOf('.chatluna-sandbox-message-row.is-recalled .chatluna-sandbox-message-media::after'),
      styles.indexOf('.chatluna-sandbox-message-recalled-label'),
    )
    expect(mediaRecallLine).toContain('pointer-events: none')
    expect(styles).toContain('.chatluna-sandbox-message-recalled-label')
    expect(styles).toContain('.chatluna-sandbox-thinking-row.is-recalled')
    expect(shellSource).toContain('markRecalledMessages: appearance.value.sandboxMarkRecalledMessages')
  })

  it('私聊与群聊展示表情回应，并在聊天区打开二级选择页', () => {
    const source = readSource('client/webqq/message-list.vue')
    const reactionsSource = readSource('client/webqq/message-reactions.vue')
    const pickerSource = readSource('client/webqq/emoji-picker.vue')
    const styles = readSource('client/webqq/messages.css')
    const chatPaneSource = readSource('client/webqq/chat-pane.vue')
    const pageSource = readSource('client/workspace/page.vue')

    // 类别：DOM 结构与元素顺序。
    expect(source).toContain('<WebqqMessageReactions')
    expect(source).toContain('management-only')

    /**
     * 类别：用户可见文案。
     * 依据：「哪几个动作出现在菜单里」的取数（群成员动作、好友动作、以及决定子菜单出不出现的
     * 那张六项管理动作表）已下沉到 participant-presentation；贴表情双闸门下沉到
     * message-presentation。两者各有行为断言，这里只守用户读得到的那几个词。
     */
    expectUserFacingCopies(source, ['贴表情', '创建分支'])

    // 类别：实现细节契约（否定式）。曾经的「好友互动」子菜单层级已删除，不得被加回来。
    expect(source).not.toContain('好友互动')
    expect(reactionsSource).toContain('class="chatluna-sandbox-message-reaction"')
    expect(reactionsSource).toContain('chatluna-sandbox-message-reaction-users')
    expect(reactionsSource).not.toContain('chatluna-sandbox-message-reaction-total')
    expect(reactionsSource).not.toContain("'is-mine'")
    expect(styles).not.toContain('.chatluna-sandbox-message-reaction.is-mine')
    expect(reactionsSource).toContain('MAX_VISIBLE_REACTION_AVATARS')
    expect(pickerSource).toContain('searchSandboxEmojiFaces')
    expect(pickerSource).toContain('常用')
    expect(pickerSource).toContain('搜索表情名称、拼音或 ID')
    expect(pickerSource).toContain('class="chatluna-sandbox-secondary-page chatluna-sandbox-emoji-picker-page chatluna-sandbox-solid-secondary-surface"')
    expect(pickerSource).toContain('<Teleport to="body">')
    expect(pickerSource).toContain("zIndex: 140")
    expect(pickerSource).not.toContain('<Dialog')
    expect(pickerSource).not.toContain('aria-label="返回聊天"')
    expect(styles).toContain('.chatluna-sandbox-message-reactions')
    expect(styles).toContain('min-height: unset')
    expect(styles).toContain('padding: 0 0 0 2px')
    expect(styles).toContain('.chatluna-sandbox-message-reaction-avatar:not(:only-child):not(:last-child)')
    expect(styles).toContain('padding: 1px')
    expect(pickerSource).toContain("document.addEventListener('pointerdown', closeOnOutsidePointer)")
    expect(styles).toContain('.chatluna-sandbox-message-reaction-avatar-image.is-bot')
    expect(styles).toContain('background: var(--webqq-accent)')
    expect(styles).toContain('--webqq-reaction-bg: color-mix(in srgb, var(--webqq-bubble-bg) 88%, #64748b 12%)')
    expect(styles).toContain('--webqq-reaction-bg: rgb(47 47 52)')
    expect(styles).toContain('--webqq-reaction-bg: color-mix(in srgb, var(--webqq-bubble-bg) 88%, #0f172a 12%)')
    expect(styles).not.toContain('var(--webqq-accent) 16%, #ffffff 84%')
    expect(styles).toContain('.chatluna-sandbox-emoji-picker-grid')
    expect(chatPaneSource).toContain('@open-reaction-picker="openReactionPicker"')
    expect(chatPaneSource).toContain('<WebqqEmojiPicker')
    expect(chatPaneSource).toContain("emit('setMessageReaction', messageId, emojiId, true)")
    expect(chatPaneSource).toContain("@set-message-reaction=\"forwardSetMessageReaction\"")
    expect(pageSource).toContain('@set-message-reaction="setMessageReaction"')
  })

  it('继承前缀与其余四类判定都改读投影给出的能力位', () => {
    const source = readSource('client/webqq/message-list.vue')

    // 判定本身住在 src/message-capabilities 并由它的测试逐条执行；能力位接线由 messageList
    // 投影的行为断言守（webqq-message-capabilities.test.ts），三个写入入口各自读到自己那一位
    // 由架构守卫「消息动作入口必须由能力位守门」逐个钉住（webqq-architecture.test.ts）。
    // 这里只剩一条否定式守卫：已删掉的四个组件内推导不得被加回来，否则客户端又会长出第二份口径。
    expect(source).not.toMatch(/function\s+canRecallMessage/)
    expect(source).not.toMatch(/function\s+canReactToMessage/)
    expect(source).not.toMatch(/function\s+isReactionReadonly/)
    expect(source).not.toMatch(/function\s+isMessageSelectable/)
  })

  it('分支在继承前缀与自有消息之间显示分界，继承部分整段弱化', () => {
    const source = readSource('client/webqq/message-list.vue')
    const styles = readSource('client/webqq/messages.css')

    // 分界位置与整段弱化的判定由 fork-boundary 模块的测试逐条执行；这里守的是用户可见文案与
    // 样式两类 ADR-0073 例外。
    expectUserFacingCopy(source, '以上是与原会话共享的记录，在这条分支里只读')
    expect(styles).toContain('.chatluna-sandbox-fork-boundary')
    // 弱化而不是隐藏：继承部分不折叠、不默认收起，看全上下文正是复盘时要做的事。
    expect(styles).toMatch(/\.chatluna-sandbox-message-row\.is-inherited \{[^}]*opacity:/)
  })
})
