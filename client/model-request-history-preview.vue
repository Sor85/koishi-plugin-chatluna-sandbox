<template>
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
        <span class="webqq-model-history-content"><MessageJumpButton v-if="isBotMessage(message) && canOpenMessage(message)" :message-id="message.messageId!" placement="before" /><span>{{ message.content || '（空消息）' }}</span><MessageJumpButton v-if="!isBotMessage(message) && canOpenMessage(message)" :message-id="message.messageId!" placement="after" /></span>
      </div>
    </article>
  </div>
</template>

<script setup lang="ts">
import { IconExternalLink } from '@tabler/icons-vue'
import { defineComponent, h, type PropType, type VNode } from 'vue'
import { Badge } from './components/ui/badge'
import { Button } from './components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './components/ui/tooltip'
import type { ModelRequestHistoryMessage } from './webqq/model-request-history'

const props = defineProps<{
  messages: readonly ModelRequestHistoryMessage[]
  botId?: string
  navigable?: boolean
}>()
const emit = defineEmits<{
  openMessage: [messageId: string]
}>()

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

function canOpenMessage(message: ModelRequestHistoryMessage): boolean {
  return Boolean(props.navigable && message.messageId)
}

function metadataClass(message: ModelRequestHistoryMessage, item: MetadataItem): string | undefined {
  if (item.key === 'id') return 'is-id'
  if (item.key !== 'name' || !props.botId) return undefined
  return isBotMessage(message) ? 'is-name is-bot' : 'is-name is-user'
}

const MessageJumpButton = defineComponent({
  name: 'MessageJumpButton',
  props: {
    messageId: { type: String, required: true },
    placement: { type: String as PropType<'before' | 'after'>, required: true },
  },
  setup(buttonProps) {
    return () => h(TooltipProvider, { delayDuration: 500 }, () => h(Tooltip, {}, {
      default: () => [
        h(TooltipTrigger, { asChild: true }, () => h(Button, {
          type: 'button',
          size: 'icon-sm',
          variant: 'ghost',
          class: ['webqq-model-history-jump', `is-${buttonProps.placement}`],
          'aria-label': '在消息页面中查看',
          onClick: () => emit('openMessage', buttonProps.messageId),
        }, () => h(IconExternalLink, { 'aria-hidden': 'true' }))),
        h(TooltipContent, {}, () => '在消息页面中查看'),
      ],
    }))
  },
})

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
