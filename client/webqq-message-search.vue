<template>
  <section
    v-if="open"
    class="webqq-message-search"
    role="search"
    aria-label="查找聊天记录"
  >
    <div class="webqq-message-search-field">
      <IconSearch :size="18" aria-hidden="true" />
      <input
        ref="inputElement"
        v-model="query"
        type="search"
        aria-label="搜索消息正文"
        placeholder="查找聊天记录..."
        autocomplete="off"
        @keydown.esc.prevent="emit('close')"
      >
      <Popover v-slot="{ close }" v-model:open="datePopoverOpen">
        <PopoverTrigger as-child>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            class="webqq-message-search-date-trigger"
            :class="{ 'is-active': !!selectedDate }"
            :aria-label="dateTriggerLabel"
            :aria-pressed="!!selectedDate"
          >
            <IconCalendar :size="17" aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          class="webqq-message-search-date-popover w-auto rounded-md p-0 shadow-md"
          data-webqq-message-search-date
          @escape-key-down.stop
          @pointer-down-outside="handleDatePointerDownOutside"
        >
          <Calendar
            v-model="calendarDate"
            locale="zh-CN"
            :default-placeholder="defaultCalendarPlaceholder"
            layout="month-and-year"
            initial-focus
            @update:model-value="close"
          />
        </PopoverContent>
      </Popover>
      <button
        type="button"
        class="webqq-message-search-clear"
        :aria-label="query ? '清空搜索' : '关闭查找聊天记录'"
        @click="query ? clearQuery() : emit('close')"
      >
        <IconX :size="16" aria-hidden="true" />
      </button>
    </div>

    <div
      v-if="hasCriteria"
      id="webqq-message-search-results"
      v-webqq-scrollbar="{ tone: 'accent' }"
      class="webqq-message-search-results"
      role="listbox"
      aria-label="搜索结果"
    >
      <p
        v-if="statusText"
        class="webqq-message-search-status"
        role="status"
        aria-live="polite"
      >
        {{ statusText }}
      </p>
      <button
        v-for="hit in hits"
        :key="hit.messageId"
        type="button"
        role="option"
        class="webqq-message-search-hit"
        :class="{ 'is-active': activeMessageId === hit.messageId || revealingMessageId === hit.messageId }"
        :disabled="!!revealingMessageId"
        :aria-selected="activeMessageId === hit.messageId"
        @click="emit('select', hit)"
      >
        <WebqqAvatar
          class="webqq-message-search-avatar"
          :kind="participant(hit.authorId).isBot ? 'bot' : 'user'"
          :name="participant(hit.authorId).name"
          :avatar="participant(hit.authorId).avatar"
        />
        <span class="webqq-message-search-hit-body">
          <span class="webqq-message-search-hit-meta">
            <strong>{{ participant(hit.authorId).name }}</strong>
            <time :datetime="hit.createdAt">{{ formatSearchTime(hit.createdAt) }}</time>
          </span>
          <span class="webqq-message-search-hit-summary">{{ formatSummary(hit.summary) }}</span>
        </span>
      </button>
      <button
        v-if="nextBeforeMessageId && hits.length"
        type="button"
        class="webqq-message-search-more"
        :disabled="loading || !!revealingMessageId"
        @click="emit('loadMore')"
      >
        {{ loading ? '加载中...' : '加载更多结果' }}
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { DateValue } from '@internationalized/date'
import { getLocalTimeZone, today } from '@internationalized/date'
import { IconCalendar, IconSearch, IconX } from '@tabler/icons-vue'
import { computed, nextTick, ref, watch } from 'vue'
import { Button } from './components/ui/button'
import { Calendar } from './components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from './components/ui/popover'
import type { SandboxMessageSearchHit } from '../src/types'
import WebqqAvatar from './webqq-avatar.vue'
import {
  calendarValueToLocalDate,
  localDateToCalendarValue,
} from './webqq/message-search-date'
import { formatMentionContent } from './webqq/mention'
import { vWebqqScrollbar } from './webqq-scrollbar'

export interface WebqqMessageSearchCriteria {
  query: string
  localDate?: string
}

const props = defineProps<{
  open: boolean
  loading: boolean
  errorMessage: string
  hits: SandboxMessageSearchHit[]
  nextBeforeMessageId?: string
  participants: Record<string, { name: string; avatar?: string; isBot: boolean }>
  activeMessageId?: string
  revealingMessageId?: string
}>()

const emit = defineEmits<{
  close: []
  search: [criteria: WebqqMessageSearchCriteria]
  loadMore: []
  select: [hit: SandboxMessageSearchHit]
  datePopoverChange: [open: boolean]
}>()

const query = ref('')
const selectedDate = ref('')
const datePopoverOpen = ref(false)
const inputElement = ref<HTMLInputElement>()
let debounceTimer: ReturnType<typeof setTimeout> | undefined

const trimmedQuery = computed(() => query.value.trim())
const defaultCalendarPlaceholder = today(getLocalTimeZone())
const calendarDate = computed<DateValue | undefined>({
  get: () => localDateToCalendarValue(selectedDate.value),
  set: (value) => {
    selectedDate.value = calendarValueToLocalDate(value)
  },
})
const hasCriteria = computed(() => !!trimmedQuery.value || !!selectedDate.value)
const dateTriggerLabel = computed(() => selectedDate.value
  ? `筛选日期，当前为 ${selectedDate.value}`
  : '按日期筛选聊天记录')
const participantNames = computed(() => Object.fromEntries(
  Object.entries(props.participants).map(([id, value]) => [id, value.name]),
))

const statusText = computed(() => {
  if (props.errorMessage) return props.errorMessage
  if (props.loading && !props.hits.length) return '搜索中...'
  if (props.revealingMessageId) return '正在定位消息...'
  if (!props.loading && !props.hits.length) return '没有匹配的聊天记录'
  return ''
})

watch(() => props.open, async (open) => {
  if (!open) {
    query.value = ''
    selectedDate.value = ''
    datePopoverOpen.value = false
    if (debounceTimer) clearTimeout(debounceTimer)
    return
  }
  await nextTick()
  inputElement.value?.focus()
}, { immediate: true })

watch(datePopoverOpen, (open) => emit('datePopoverChange', open))

watch(query, () => {
  if (debounceTimer) clearTimeout(debounceTimer)
  // 关键词保持防抖；若清空后仍有日期，继续按日期检索而不是清空结果。
  if (!trimmedQuery.value) {
    emitSearch()
    return
  }
  debounceTimer = setTimeout(emitSearch, 250)
})

watch(selectedDate, () => {
  if (debounceTimer) clearTimeout(debounceTimer)
  emitSearch()
})

function emitSearch() {
  emit('search', {
    query: trimmedQuery.value,
    ...(selectedDate.value ? { localDate: selectedDate.value } : {}),
  })
}

function clearQuery() {
  query.value = ''
  inputElement.value?.focus()
}

function handleDatePointerDownOutside(event: Event) {
  const target = event.target
  if (target instanceof Node && document.querySelector('.webqq-chat-search-shell')?.contains(target)) {
    event.preventDefault()
  }
}

function participant(authorId: string) {
  return props.participants[authorId] ?? {
    name: authorId,
    avatar: undefined,
    isBot: false,
  }
}

function formatSummary(summary: string) {
  return formatMentionContent(summary, participantNames.value)
}

function formatSearchTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}
</script>
