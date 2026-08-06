<template>
  <section
    v-if="open"
    class="webqq-message-search"
    role="search"
    aria-label="查找聊天记录"
  >
    <label class="webqq-message-search-field">
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
      <button
        v-if="query"
        type="button"
        class="webqq-message-search-clear"
        aria-label="清空搜索"
        @click="clearQuery"
      >
        <IconX :size="16" aria-hidden="true" />
      </button>
    </label>

    <div
      v-webqq-scrollbar="{ tone: 'accent' }"
      class="webqq-message-search-results"
      role="listbox"
      aria-label="搜索结果"
    >
      <p v-if="statusText" class="webqq-message-search-status">{{ statusText }}</p>
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
        <span class="webqq-message-search-hit-meta">
          <strong>{{ authorName(hit.authorId) }}</strong>
          <time :datetime="hit.createdAt">{{ formatSearchTime(hit.createdAt) }}</time>
        </span>
        <span class="webqq-message-search-hit-summary">{{ formatSummary(hit.summary) }}</span>
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
import { IconSearch, IconX } from '@tabler/icons-vue'
import { computed, nextTick, ref, watch } from 'vue'
import type { SandboxMessageSearchHit } from '../src/types'
import { formatMentionContent } from './webqq/mention'
import { vWebqqScrollbar } from './webqq-scrollbar'

const props = defineProps<{
  open: boolean
  loading: boolean
  errorMessage: string
  hits: SandboxMessageSearchHit[]
  nextBeforeMessageId?: string
  participantNames: Record<string, string>
  activeMessageId?: string
  revealingMessageId?: string
}>()

const emit = defineEmits<{
  close: []
  search: [query: string]
  loadMore: []
  select: [hit: SandboxMessageSearchHit]
}>()

const query = ref('')
const inputElement = ref<HTMLInputElement>()
let debounceTimer: ReturnType<typeof setTimeout> | undefined

const statusText = computed(() => {
  if (props.errorMessage) return props.errorMessage
  if (props.loading && !props.hits.length) return '搜索中...'
  if (props.revealingMessageId) return '正在定位消息...'
  const trimmed = query.value.trim()
  if (!trimmed) return '输入关键词查找当前会话消息'
  if (!props.loading && !props.hits.length) return '没有匹配的聊天记录'
  return ''
})

watch(() => props.open, async (open) => {
  if (!open) {
    query.value = ''
    if (debounceTimer) clearTimeout(debounceTimer)
    return
  }
  await nextTick()
  inputElement.value?.focus()
})

watch(query, (value) => {
  if (debounceTimer) clearTimeout(debounceTimer)
  // 防抖首帧避免每次按键都打 RPC；空串立即清空结果。
  if (!value.trim()) {
    emit('search', '')
    return
  }
  debounceTimer = setTimeout(() => {
    emit('search', value)
  }, 250)
})

function clearQuery() {
  query.value = ''
  inputElement.value?.focus()
}

function authorName(authorId: string) {
  return props.participantNames[authorId] ?? authorId
}

function formatSummary(summary: string) {
  return formatMentionContent(summary, props.participantNames)
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
