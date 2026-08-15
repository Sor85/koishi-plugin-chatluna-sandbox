import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function collectVueFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name)
    return entry.isDirectory()
      ? collectVueFiles(path)
      : entry.name.endsWith('.vue') ? [path] : []
  })
}

describe('WebQQ 聊天区域', () => {
  it('确保宿主 Console Vite 可解析 shadcn-vue 组件导入', () => {
    const uiRoot = resolve('client/components/ui')
    const componentFiles = collectVueFiles(uiRoot)

    for (const file of componentFiles) {
      const source = readFileSync(file, 'utf8')
      expect(source, file).not.toMatch(/from\s+['"]@\//)
    }
  })

  it('组合顶栏、消息列表与发送控件', () => {
    const source = readFileSync(resolve('client/webqq-chat-pane.vue'), 'utf8')
    const pageSource = readFileSync(resolve('client/page.vue'), 'utf8')

    expect(source).toContain('<main class="chatluna-sandbox-chat"')
    expect(source).toContain('<WebqqMessageList')
    expect(source).toContain('<WebqqComposer')
    expect(source).toContain('formatMentionContent(replyingToMessage.value.content, props.model.participantNames)')
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
    expect(pageSource).toContain(':scroll-scope="activeSpaceId ?? \'main\'"')
    expect(source).toContain(':scroll-scope="scrollScope"')
    expect(pageSource).toContain('@send-forward-message="sendForwardMessage"')
    expect(pageSource).toContain('@get-forward-message="getForwardMessage"')
    expect(pageSource).not.toContain('class="chatluna-sandbox-chat-header"')
  })

  it('在顶栏提供查找聊天记录并定位历史消息', () => {
    const source = readFileSync(resolve('client/webqq-chat-pane.vue'), 'utf8')
    const searchSource = readFileSync(resolve('client/webqq-message-search.vue'), 'utf8')
    const styles = readFileSync(resolve('client/styles/webqq-chat.css'), 'utf8')
    const pageSource = readFileSync(resolve('client/page.vue'), 'utf8')
    const shellSource = readFileSync(resolve('client/webqq/workspace-shell.ts'), 'utf8')
    const messageListSource = readFileSync(resolve('client/webqq-message-list.vue'), 'utf8')

    expect(source).toContain('aria-label="查找聊天记录"')
    expect(source).toContain('class="chatluna-sandbox-chat-search-shell"')
    expect(source).toContain("'is-expanded': searchOpen")
    expect(source).toContain(':aria-expanded="searchOpen"')
    expect(source).toContain('aria-controls="chatluna-sandbox-message-search-results"')
    expect(source).toContain('<WebqqMessageSearch')
    expect(source.indexOf('class="chatluna-sandbox-chat-header-actions"')).toBeLessThan(source.indexOf('<WebqqMessageSearch'))
    expect(source.indexOf('<WebqqMessageSearch')).toBeLessThan(source.indexOf('</header>'))
    expect(source).toContain('@close="closeSearch(true)"')
    expect(source).toContain('searchTriggerRef.value?.focus()')
    expect(source).toContain('searchConversationMessages:')
    expect(source).toContain('ensureMessageLoaded(')
    expect(source).toContain('messageListRef.value?.revealMessage')
    expect(source).toContain('closeSearch()')
    expect(source).toContain('resetSearchState()')
    expect(searchSource).toContain('id="chatluna-sandbox-message-search-results"')
    expect(searchSource).toContain('v-if="hasCriteria"')
    expect(searchSource).toContain('const trimmedQuery = computed(() => query.value.trim())')
    expect(searchSource).toContain('const hasCriteria = computed(() => !!trimmedQuery.value || !!selectedDate.value)')
    expect(searchSource).not.toContain('type="date"')
    expect(searchSource).not.toContain("from './components/ui/input'")
    expect(searchSource).not.toContain("from './components/ui/label'")
    expect(searchSource).toContain("import { Calendar } from './components/ui/calendar'")
    expect(searchSource).toContain('<Popover v-slot="{ close }" v-model:open="datePopoverOpen">')
    expect(searchSource).toContain('<Calendar')
    expect(searchSource).toContain('v-model="calendarDate"')
    expect(searchSource).toContain(':default-placeholder="defaultCalendarPlaceholder"')
    expect(searchSource).toContain('layout="month-and-year"')
    expect(searchSource).toContain('@update:model-value="close"')
    expect(searchSource).toContain('localDateToCalendarValue(selectedDate.value)')
    expect(searchSource).toContain('calendarValueToLocalDate(value)')
    expect(searchSource).not.toContain('RangeCalendar')
    expect(searchSource).not.toContain('chatluna-sandbox-message-search-date-actions')
    expect(searchSource).toContain('按日期筛选聊天记录')
    expect(searchSource).toContain(':aria-pressed="!!selectedDate"')
    expect(searchSource).toContain('data-chatluna-sandbox-message-search-date')
    expect(searchSource).toContain('@interact-outside="handleDateInteractOutside"')
    expect(searchSource).not.toContain('@pointer-down-outside="handleDatePointerDownOutside"')
    expect(searchSource).toContain("search: [criteria: WebqqMessageSearchCriteria]")
    expect(searchSource).toContain('datePopoverChange: [open: boolean]')
    expect(searchSource).not.toContain('输入关键词查找当前会话消息')
    expect(searchSource).toContain('role="status"')
    expect(searchSource).toContain('aria-live="polite"')
    expect(searchSource).toContain('查找聊天记录...')
    expect(searchSource).toContain("query ? '清空搜索' : '关闭查找聊天记录'")
    expect(searchSource).toContain("query ? clearQuery() : emit('close')")
    expect(searchSource).toContain('@keydown.esc.prevent="emit(\'close\')"')
    expect(searchSource).toContain('inputElement.value?.focus()')
    expect(searchSource).toContain("}, { immediate: true })")
    expect(source).toContain('ref="searchShellRef"')
    expect(source).toContain('handleSearchOutsidePointerDown')
    expect(source).toContain('searchShellRef.value?.contains(target)')
    expect(source).toContain("document.addEventListener('pointerdown', handleSearchOutsidePointerDown)")
    expect(source).toContain("document.removeEventListener('pointerdown', handleSearchOutsidePointerDown)")
    expect(source).toContain('@date-popover-change="searchDatePopoverOpen = $event"')
    expect(source).toContain("target.closest('[data-chatluna-sandbox-message-search-date]')")
    expect(source).toContain('localDateToMessageSearchRange(criteria.localDate)')
    expect(source).toContain('const searchCriteria = ref<SearchCriteriaSnapshot>')
    expect(source).toContain('...criteria,')
    expect(source).toContain('const serial = ++searchRequestSerial')
    expect(source).toContain('void closeSearch(true)')
    expect(searchSource).toContain('setTimeout(emitSearch, 250)')
    expect(source).toContain(':participants="model.messageList.participants"')
    expect(searchSource).toContain("import WebqqAvatar from './webqq-avatar.vue'")
    expect(searchSource).toContain('<WebqqAvatar')
    expect(searchSource).toContain('participant(hit.authorId).isBot')
    expect(searchSource).toContain('participant(hit.authorId).avatar')
    expect(searchSource).toContain('participant(hit.authorId).name')
    expect(searchSource).toContain('formatSearchTime(hit.createdAt)')
    expect(searchSource).toContain('formatSummary(hit.summary)')
    const chatRule = styles.slice(styles.indexOf('.chatluna-sandbox-chat {')).split('}')[0]
    expect(chatRule).toContain('grid-template-rows: auto minmax(0, 1fr)')
    const searchShellRule = styles.slice(styles.indexOf('.chatluna-sandbox-chat-search-shell {')).split('}')[0]
    expect(searchShellRule).toContain('width: 36px')
    expect(styles).toContain('.chatluna-sandbox-chat-search-shell.is-expanded')
    const resultsRule = styles.slice(styles.indexOf('.chatluna-sandbox-message-search-results {')).split('}')[0]
    expect(resultsRule).toContain('position: absolute')
    expect(resultsRule).toContain('width: 100%')
    expect(resultsRule).toContain('max-width: 100%')
    expect(resultsRule).toContain('z-index:')
    const triggerRule = styles.slice(styles.indexOf('.chatluna-sandbox-chat-search-trigger {')).split('}')[0]
    expect(triggerRule).toContain('color: var(--webqq-accent)')
    const fieldIconRule = styles.slice(styles.indexOf('.chatluna-sandbox-message-search-field > svg {')).split('}')[0]
    expect(fieldIconRule).toContain('var(--webqq-accent)')
    expect(searchSource).toContain('class="chatluna-sandbox-message-search-date-popover w-auto rounded-md p-0 shadow-md"')
    expect(styles).toContain('.chatluna-sandbox-message-search-date-trigger.is-active')
    // 悬停/聚焦规则只允许关 outline-style：outline: none 简写会把 outline-color/width
    // 重置为 currentColor/3px，与其他插件无 layer 的 outline: 2px solid transparent
    // 底座叠加按钮的 transition-all，产生"黑圈变大再消失"的闪烁动画。
    const dateTriggerFocusRule = styles.slice(styles.indexOf('.chatluna-sandbox-message-search-date-trigger:focus-visible {')).split('}')[0]
    expect(dateTriggerFocusRule).toContain('outline-style: none')
    // 带分号匹配声明本身，避免误伤规则内解释"为什么不能用简写"的注释文本。
    expect(dateTriggerFocusRule).not.toContain('outline: none;')
    expect(styles).not.toContain('.chatluna-sandbox-message-search-date-actions')
    const datePopoverRule = styles.slice(styles.indexOf('.chatluna-sandbox-message-search-date-popover {')).split('}')[0]
    expect(datePopoverRule).toContain('--popover: var(--webqq-bg)')
    expect(datePopoverRule).toContain('--popover-foreground: var(--webqq-text)')
    expect(datePopoverRule).toContain('--input: var(--webqq-border)')
    expect(datePopoverRule).toContain('--ring: var(--webqq-accent)')
    expect(datePopoverRule).not.toContain('width: 242px')
    // 尺寸/圆角/阴影必须完全交给 registry 的 Tailwind 工具类；本文件无 layer，
    // 任何手写复刻都会压过 @layer utilities 里的类，破坏 1:1 还原。
    expect(datePopoverRule).not.toContain('border-radius')
    expect(datePopoverRule).not.toContain('box-shadow')
    expect(styles).not.toContain('.chatluna-sandbox-message-search-date-popover [data-slot="calendar-prev-button"]')
    expect(styles).not.toContain('.chatluna-sandbox-message-search-date-popover [data-slot="calendar-cell-trigger"]')
    expect(styles).not.toContain('.chatluna-sandbox-message-search-date-popover [data-slot="native-select"]')
    // 月/年下拉必须用 shadcn-vue Select：原生 <select> 的下拉面板无法定制样式，
    // 且"透明 select + 覆盖文字"的宽度对不齐会让箭头叠在文字上。
    // 年份范围由调用方收紧为近 10 年；下拉面板不显示原生滚动条。
    const calendarSource = readFileSync(resolve('client/components/ui/calendar/Calendar.vue'), 'utf8')
    expect(calendarSource).toContain("import { Select, SelectContent, SelectItem, SelectTrigger } from '../select'")
    expect(calendarSource).not.toContain('NativeSelect')
    expect(calendarSource).toContain('[scrollbar-width:none]')
    expect(calendarSource).toContain('[&::-webkit-scrollbar]:hidden')
    expect(calendarSource).toContain(':open="monthSelectOpen"')
    expect(calendarSource).toContain(':open="yearSelectOpen"')
    expect(calendarSource).toContain('@pointerdown.capture="monthSelectOpen = false"')
    expect(calendarSource).toContain('@pointerdown.capture="yearSelectOpen = false"')
    expect(searchSource).toContain('style="pointer-events: auto"')
    expect(searchSource).toContain(':year-range="calendarYearRange"')
    expect(searchSource).toContain('subtract({ years: 9 })')
    // shadcn 语义工具类由 build:css 从 tailwind.source.css 预编译（宿主控制台
    // devMode 的 vite 没有 Tailwind 插件，无法现场生成）；宿主的全局 table
    // 样式需要在日历范围内用无 layer 规则归零，否则出现行分隔线和超大内边距。
    const tailwindSource = readFileSync(resolve('client/styles/tailwind.source.css'), 'utf8')
    expect(tailwindSource).toContain('@theme inline')
    expect(tailwindSource).toContain('--color-muted-foreground: var(--muted-foreground)')
    expect(tailwindSource).toContain('--color-primary: var(--primary)')
    const themeStyles = readFileSync(resolve('client/styles/shadcn-theme.css'), 'utf8')
    expect(themeStyles).toContain('[data-slot="calendar"] tr')
    expect(themeStyles).toContain('[data-slot="calendar"] td')
    // 其他插件无 layer 的 UnoCSS .shadow-* 引用 var(--un-*)，在本插件元素上整条
    // box-shadow 失效回退为 none；必须在表面范围内重申 Tailwind v4 合成 box-shadow。
    expect(themeStyles).toContain('.shadow-md')
    expect(themeStyles).toContain('box-shadow: var(--tw-inset-shadow), var(--tw-inset-ring-shadow), var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow)')
    const entryStyles = readFileSync(resolve('client/style.css'), 'utf8')
    expect(entryStyles).toContain('@import "./styles/tailwind.generated.css"')
    expect(entryStyles).toContain('@import "./styles/shadcn-theme.css"')
    expect(entryStyles).not.toContain('@import "tailwindcss";')
    const hitRule = styles.slice(styles.indexOf('.chatluna-sandbox-message-search-hit {')).split('}')[0]
    expect(hitRule).toContain('grid-template-columns: 32px minmax(0, 1fr)')
    const avatarRule = styles.slice(styles.indexOf('.chatluna-sandbox-message-search-avatar {')).split('}')[0]
    expect(avatarRule).toContain('--webqq-avatar-size: 32px')
    expect(styles).toContain('.chatluna-sandbox-chat-header-actions')
    expect(styles).not.toContain('cursor:')
    expect(pageSource).toContain('@search-conversation-messages="searchConversationMessages"')
    expect(shellSource).toContain('async function searchConversationMessages')
    expect(shellSource).toContain('workspaceController.searchConversationMessages(input)')
    expect(messageListSource).toContain('highlightMessageElement')
    expect(messageListSource).toContain('defineExpose({')
    expect(messageListSource).toContain('revealMessage,')
  })
})
