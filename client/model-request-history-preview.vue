<template>
  <section
    ref="previewElement"
    class="webqq-model-history-preview-wrap"
    :class="{ 'is-collapsed': collapsible && !expanded }"
    :style="{ '--webqq-model-history-collapse-height': collapsedHeight }"
  >
    <div class="webqq-model-history-preview" role="list" aria-label="历史消息预览">
      <article
        v-for="(message, index) in messages"
        :key="`${message.messageId || message.id || message.name || 'message'}:${index}`"
        class="webqq-model-history-message"
        :class="{ 'is-bot': isBotMessage(message) }"
        role="listitem"
      >
        <HistoryQuote v-if="message.quote" :message="message.quote" />
        <div class="webqq-model-history-line">
          <div v-if="metadata(message).length" class="webqq-model-history-meta" aria-label="消息元数据">
            <TooltipProvider v-for="item in metadata(message)" :key="item.key" :delay-duration="500">
              <Tooltip>
                <TooltipTrigger as-child>
                  <Badge
                    variant="secondary"
                    :class="metadataClass(message, item)"
                    tabindex="0"
                  >{{ item.value }}</Badge>
                </TooltipTrigger>
                <TooltipContent>{{ item.label }}：{{ item.value }}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <span class="webqq-model-history-content">{{ message.content || '（空消息）' }}</span>
        </div>
      </article>
    </div>
    <button
      v-if="collapsible"
      type="button"
      class="webqq-model-analysis-expand webqq-model-history-expand"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      {{ expanded ? '收起' : `展开全部（${characters} 字符）` }}
      <IconChevronDown :size="12" aria-hidden="true" />
    </button>
  </section>
</template>

<script setup lang="ts">
import { IconChevronDown } from '@tabler/icons-vue'
import { computed, defineComponent, h, nextTick, onBeforeUnmount, onMounted, ref, watch, type PropType, type VNode } from 'vue'
import { Badge } from './components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './components/ui/tooltip'
import type { ModelRequestHistoryMessage } from './webqq/model-request-history'

const props = withDefaults(defineProps<{
  messages: readonly ModelRequestHistoryMessage[]
  botId?: string
  characters?: number
  maxHeight?: number
}>(), {
  maxHeight: 420,
})

const expanded = ref(false)
const collapsible = ref(false)
const collapsedHeight = computed(() => `${props.maxHeight}px`)
const previewElement = ref<HTMLElement>()
const characters = computed(() => props.characters ?? props.messages.reduce((total, message) => total + historyMessageCharacters(message), 0))
let resizeObserver: ResizeObserver | undefined

function historyMessageCharacters(message: ModelRequestHistoryMessage): number {
  return (message.name?.length ?? 0)
    + (message.id?.length ?? 0)
    + (message.timestamp?.length ?? 0)
    + message.content.length
    + (message.quote ? historyMessageCharacters(message.quote) : 0)
}

function measurePreview() {
  const preview = previewElement.value?.querySelector<HTMLElement>('.webqq-model-history-preview')
  if (!preview) return
  collapsible.value = preview.scrollHeight > props.maxHeight + 1
}

watch(
  [() => props.messages, () => props.maxHeight],
  async () => {
    await nextTick()
    measurePreview()
  },
  { deep: true },
)

onMounted(async () => {
  await nextTick()
  measurePreview()
  const preview = previewElement.value?.querySelector<HTMLElement>('.webqq-model-history-preview')
  if (typeof ResizeObserver === 'undefined' || !preview) return
  resizeObserver = new ResizeObserver(measurePreview)
  resizeObserver.observe(preview)
})

onBeforeUnmount(() => resizeObserver?.disconnect())

interface MetadataItem {
  key: 'name' | 'id' | 'timestamp'
  label: string
  value: string
}

function metadata(message: ModelRequestHistoryMessage): MetadataItem[] {
  const items = [
    message.name ? { key: 'name', label: '名称', value: message.name } : undefined,
    message.id ? { key: 'id', label: 'ID', value: message.id } : undefined,
    message.timestamp ? { key: 'timestamp', label: '时间', value: message.timestamp } : undefined,
  ].filter((item): item is MetadataItem => item !== undefined)
  return isBotMessage(message) ? items.reverse() : items
}

function isBotMessage(message: ModelRequestHistoryMessage): boolean {
  return Boolean(props.botId && message.id === props.botId)
}

function metadataClass(message: ModelRequestHistoryMessage, item: MetadataItem): string | undefined {
  if (item.key === 'id') return 'is-id'
  if (item.key !== 'name' || !props.botId) return undefined
  return isBotMessage(message) ? 'is-name is-bot' : 'is-name is-user'
}

const HistoryQuote = defineComponent({
  name: 'HistoryQuote',
  props: {
    message: { type: Object as PropType<ModelRequestHistoryMessage>, required: true },
  },
  setup(quoteProps) {
    return () => renderHistoryQuote(quoteProps.message)
  },
})

function renderHistoryQuote(message: ModelRequestHistoryMessage): VNode {
  return h('blockquote', { class: 'chatluna-sandbox-message-quote webqq-model-history-quote' }, [
    h('strong', { class: 'chatluna-sandbox-message-quote-title' }, [
      message.name || '引用消息',
      message.id ? h('span', { class: 'webqq-model-history-quote-id' }, ` · ${message.id}`) : undefined,
    ]),
    message.quote ? renderHistoryQuote(message.quote) : undefined,
    h('span', message.content || '（空消息）'),
  ])
}
</script>
