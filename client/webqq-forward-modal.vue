<template>
  <Teleport to="body">
    <div
      ref="backdropRef"
      class="webqq-forward-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="合并转发消息"
      tabindex="0"
      @click.self="emit('close')"
      @keydown.esc="emit('close')"
    >
      <div class="webqq-forward-modal" @click.stop>
        <header class="webqq-forward-modal-header">
          <button
            v-if="canNavigateBack"
            type="button"
            aria-label="返回上一层合并转发"
            @click="emit('back')"
          >
            <IconChevronLeft :size="18" aria-hidden="true" />
          </button>
          <span v-else class="webqq-forward-modal-header-placeholder" aria-hidden="true" />
          <strong>{{ title || '合并转发' }}</strong>
          <button type="button" aria-label="关闭合并转发消息" @click="emit('close')">
            <IconX :size="18" aria-hidden="true" />
          </button>
        </header>
        <div v-webqq-scrollbar="{ showOverlay: false }" class="webqq-forward-modal-body">
          <article
            v-for="(item, itemIndex) in items"
            :key="`forward:${itemIndex}`"
            class="webqq-message-row is-incoming"
            :class="[getForwardNodeClusterClass(items, itemIndex), { 'is-merged': isMergedForwardNode(items, itemIndex) }]"
          >
            <!-- TIM 合并项依赖 wrapper 保留头像占位并隐藏重复头像，弹窗需和普通消息保持同一结构。 -->
            <span class="webqq-message-avatar-wrap">
              <WebqqAvatar
                class="webqq-message-avatar"
                :kind="isBotParticipant(item.userId) ? 'bot' : 'user'"
                :name="item.nickname"
                :avatar="getParticipantAvatar(item.userId)"
              />
            </span>
            <div class="webqq-message-content">
              <div v-if="!isMergedForwardNode(items, itemIndex)" class="webqq-sender-line">
                <span class="webqq-message-author">{{ item.nickname }}</span>
              </div>
              <div class="webqq-message-body">
                <div class="webqq-message-stack">
                  <div class="webqq-message-bubble">
                    <button
                      v-if="item.forwardId"
                      class="webqq-message-quote webqq-message-forward"
                      type="button"
                      aria-label="查看合并转发消息"
                      @click.stop="emit('openForward', item.forwardId)"
                    >
                      <strong class="webqq-message-quote-title">{{ getNestedForwardTitle(item) }}</strong>
                      <template v-if="getNestedForwardLines(item).length">
                        <span
                          v-for="(line, lineIndex) in getNestedForwardLines(item)"
                          :key="`forward:${itemIndex}:line:${lineIndex}`"
                        >{{ line }}</span>
                        <span class="webqq-message-forward-entry">查看{{ getNestedForwardTotal(item) }}条转发消息</span>
                      </template>
                      <span v-else>{{ item.content || '[合并转发]' }}</span>
                    </button>
                    <template v-else>
                      <div v-for="media in item.media ?? []" :key="media.id" class="webqq-message-media">
                        <button
                          v-if="media.type === 'image' && getMediaSource(media.id)"
                          class="webqq-message-image"
                          type="button"
                          aria-label="查看大图"
                          @click="emit('openImage', getMediaSource(media.id))"
                        >
                          <img :src="getMediaSource(media.id)" :alt="media.name">
                        </button>
                        <audio v-else-if="media.type === 'audio' && getMediaSource(media.id)" :src="getMediaSource(media.id)" controls preload="metadata" />
                        <video v-else-if="media.type === 'video' && getMediaSource(media.id)" :src="getMediaSource(media.id)" controls preload="metadata" />
                        <a v-else-if="media.type === 'file' && getMediaSource(media.id)" :href="getMediaSource(media.id)" :download="media.name" class="webqq-message-file">
                          <IconPaperclip :size="18" aria-hidden="true" />
                          <span><strong>{{ media.name }}</strong><small>{{ formatMediaSize(media.size) }}</small></span>
                        </a>
                        <span v-else class="webqq-message-media-loading">{{ mediaLoadFailures[media.id] ? '媒体不可用' : '媒体加载中...' }}</span>
                      </div>
                      <span v-if="getNodeText(item)" class="webqq-message-text">{{ getNodeText(item) }}</span>
                      <span v-else-if="!item.media?.length" class="webqq-message-text">[消息]</span>
                    </template>
                  </div>
                </div>
              </div>
            </div>
          </article>
          <div v-if="!items.length" class="webqq-forward-modal-empty">暂无消息</div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { IconChevronLeft, IconPaperclip, IconX } from '@tabler/icons-vue'
import { onMounted, ref } from 'vue'
import WebqqAvatar from './webqq-avatar.vue'
import { buildForwardPreview } from './webqq/forward-preview'
import { getForwardNodeClusterClass, isMergedForwardNode } from './webqq/forward-cluster'
import { vWebqqScrollbar } from './webqq-scrollbar'
import type { SandboxForward, SandboxForwardNode, SandboxMedia } from '../src/types'

const props = defineProps<{
  title: string
  items: SandboxForwardNode[]
  // 已加载的转发资源，用于嵌套卡片摘要。
  nestedForwards?: Record<string, SandboxForward>
  canNavigateBack: boolean
  participants: Record<string, { name: string; avatar?: string; isBot: boolean }>
  mediaSources: Record<string, string>
  mediaLoadFailures: Record<string, true>
}>()

const emit = defineEmits<{
  back: []
  close: []
  openForward: [forwardId: string]
  openImage: [url: string]
}>()

const backdropRef = ref<HTMLDivElement>()

// 打开即聚焦遮罩，保证 ESC 立即可用（与 onebot-webqq 行为一致）。
onMounted(() => backdropRef.value?.focus())

function getParticipantAvatar(userId: string) {
  return props.participants[userId]?.avatar
}

function isBotParticipant(userId: string) {
  return props.participants[userId]?.isBot ?? false
}

function getMediaSource(mediaId: string) {
  return props.mediaSources[mediaId] ?? ''
}

function formatMediaSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function getMediaLabel(media: SandboxMedia) {
  return media.type === 'image' ? '图片' : media.type === 'audio' ? '语音' : media.type === 'video' ? '视频' : '文件'
}

function getNodeText(item: SandboxForwardNode) {
  if (item.media?.length === 1 && item.content === `[${getMediaLabel(item.media[0])}] ${item.media[0].name}`) return ''
  return item.content
}

function getNestedForward(item: SandboxForwardNode) {
  return item.forwardId ? props.nestedForwards?.[item.forwardId] : undefined
}

function getNestedForwardTitle(item: SandboxForwardNode) {
  const nested = getNestedForward(item)
  return nested ? buildForwardPreview(nested).title : '合并转发'
}

function getNestedForwardLines(item: SandboxForwardNode) {
  const nested = getNestedForward(item)
  return nested ? buildForwardPreview(nested).lines : []
}

function getNestedForwardTotal(item: SandboxForwardNode) {
  const nested = getNestedForward(item)
  return nested ? buildForwardPreview(nested).total : 0
}
</script>
