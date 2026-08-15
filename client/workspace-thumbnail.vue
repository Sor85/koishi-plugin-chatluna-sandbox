<template>
  <div ref="thumbnailRef" class="webqq-space-thumbnail" aria-hidden="true">
    <div ref="liveHostRef" class="webqq-space-thumbnail-live-host" />
    <!-- 从未进入过的空间没有可捕获 DOM，继续用当前快照绘制首屏作为冷启动兜底。 -->
    <div
      v-if="!capture"
      inert
      class="webqq-workspace webqq-space-thumbnail-workspace is-details-open"
      :class="{
        'is-frosted': appearance.enableSandboxFrostedGlass,
        'has-tim-tail': appearance.sandboxTimBubbleTail,
      }"
      :data-color-mode="colorMode"
      data-mobile-view="messages"
      :style="{ '--webqq-accent': appearance.sandboxAccentColor }"
    >
      <WebqqSidebar :model="models.sidebar" :color-mode="colorMode" preview />
      <WebqqChatPane :model="models.chatPane" preview />
      <WebqqDetailsPanel :model="models.detailsPanel" preview />
    </div>
    <!-- AI 控制中的游走光标放在 scale 层之外，保持真实尺寸覆盖在缩略图上。 -->
    <AgentCursor v-if="running" :size="16" />
  </div>
</template>

<script setup lang="ts">
import { send } from '@koishijs/client'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AgentCursor from './agent-cursor.vue'
import WebqqChatPane from './webqq-chat-pane.vue'
import WebqqDetailsPanel from './webqq-details-panel.vue'
import WebqqSidebar from './webqq-sidebar.vue'
import { buildWorkspaceThumbnailModels } from './webqq/workspace-thumbnail-model'
import {
  instantiateWorkspaceThumbnail,
  restoreWorkspaceThumbnailScroll,
  type WorkspaceThumbnailCapture,
} from './webqq/workspace-thumbnail-capture'
import { calculateContainedWorkspaceThumbnailTransform } from './webqq/workspace-thumbnail-scale'
import type { SandboxAppearance, SandboxSnapshot } from '../src/types'

const THUMBNAIL_CANVAS_WIDTH = 1440
const THUMBNAIL_CANVAS_HEIGHT = 760
const thumbnailMediaCache = new Map<string, string>()

const props = defineProps<{
  snapshot: SandboxSnapshot
  capture?: WorkspaceThumbnailCapture
  spaceId?: string
  appearance: SandboxAppearance
  colorMode: 'light' | 'dark'
  running?: boolean
}>()
const thumbnailRef = ref<HTMLElement>()
const liveHostRef = ref<HTMLElement>()
const resolvedSnapshot = ref(props.snapshot)
const models = computed(() => buildWorkspaceThumbnailModels(resolvedSnapshot.value, props.appearance, props.colorMode))
let resizeObserver: ResizeObserver | undefined
let mediaLoadGeneration = 0

async function resolveSnapshotMedia() {
  const generation = ++mediaLoadGeneration
  if (props.capture) return
  const references = [...props.snapshot.participants.map(({ avatar }) => avatar), ...props.snapshot.groups.map(({ avatar }) => avatar)]
  const mediaIds = [...new Set(references.flatMap((reference) => reference?.match(/^sandbox-media:\/\/([a-f0-9]{32})$/)?.[1] ?? []))]
  const loadedMedia: Array<readonly [string, string] | undefined> = await Promise.all(mediaIds.map(async (mediaId) => {
    const cacheKey = `${props.spaceId ?? 'main'}:${mediaId}`
    const cached = thumbnailMediaCache.get(cacheKey)
    if (cached) return [mediaId, cached] as const
    try {
      const content = await send('chatluna-sandbox/media-content', { spaceId: props.spaceId, operatorId: previewOperatorId(), mediaId })
      const source = `data:${content.mimeType};base64,${content.dataBase64}`
      thumbnailMediaCache.set(cacheKey, source)
      return [mediaId, source] as const
    } catch {
      return undefined
    }
  }))
  const mediaSources = Object.fromEntries(loadedMedia.filter((entry): entry is readonly [string, string] => entry !== undefined))
  if (generation !== mediaLoadGeneration) return
  resolvedSnapshot.value = {
    ...props.snapshot,
    participants: props.snapshot.participants.map((participant) => ({ ...participant, avatar: resolveReference(participant.avatar, mediaSources) })),
    groups: props.snapshot.groups.map((group) => ({ ...group, avatar: resolveReference(group.avatar, mediaSources) })),
  }
}

function previewOperatorId() {
  return props.snapshot.participants.find(({ kind }) => kind === 'user')?.id
    ?? props.snapshot.participants[0]?.id
    ?? ''
}

function resolveReference(reference: string | undefined, mediaSources: Record<string, string>) {
  const id = reference?.match(/^sandbox-media:\/\/([a-f0-9]{32})$/)?.[1]
  return id ? mediaSources[id] ?? '' : reference
}

function renderCapture() {
  const host = liveHostRef.value
  const capture = props.capture
  if (!host) return
  host.replaceChildren()
  if (!capture) return

  const element = instantiateWorkspaceThumbnail(capture)
  host.append(element)
  applyContainedScale(element, capture.width, capture.height)
  // scrollTop/scrollLeft 只有在克隆节点接入文档、完成布局后才会生效。
  nextTick(() => restoreWorkspaceThumbnailScroll(capture, element))
}

function applyContainedScale(element: HTMLElement, canvasWidth: number, canvasHeight: number) {
  const thumbnail = thumbnailRef.value
  if (!thumbnail) return
  // 进入总览时卡片会执行 transform 动画，getBoundingClientRect 会读到动画中的视觉尺寸且 ResizeObserver 不会为 transform 重触发。
  // 使用不受祖先变换影响的布局尺寸，避免把过渡帧比例永久写入缩略图。
  const transform = calculateContainedWorkspaceThumbnailTransform({
    containerWidth: thumbnail.clientWidth,
    containerHeight: thumbnail.clientHeight,
    canvasWidth,
    canvasHeight,
  })
  if (!transform) return
  // 卡片与页面宽高比不一致时必须保留留白；使用 contain 才能避免宽屏或矮屏下裁掉真实页面区域。
  element.style.width = `${canvasWidth}px`
  element.style.height = `${canvasHeight}px`
  element.style.transform = `translate(${transform.left}px, ${transform.top}px) scale(${transform.scale})`
}

function scaleThumbnail() {
  const capture = props.capture
  if (capture) {
    const element = liveHostRef.value?.firstElementChild
    if (element instanceof HTMLElement) applyContainedScale(element, capture.width, capture.height)
    return
  }
  const element = thumbnailRef.value?.querySelector<HTMLElement>('.webqq-space-thumbnail-workspace')
  if (element) applyContainedScale(element, THUMBNAIL_CANVAS_WIDTH, THUMBNAIL_CANVAS_HEIGHT)
}

watch(() => props.capture, () => {
  renderCapture()
  void nextTick(scaleThumbnail)
  void resolveSnapshotMedia()
})
watch(() => props.snapshot, () => {
  resolvedSnapshot.value = props.snapshot
  void resolveSnapshotMedia()
})
onMounted(() => {
  renderCapture()
  void nextTick(scaleThumbnail)
  void resolveSnapshotMedia()
  resizeObserver = new ResizeObserver(scaleThumbnail)
  if (thumbnailRef.value) resizeObserver.observe(thumbnailRef.value)
})
onBeforeUnmount(() => resizeObserver?.disconnect())
</script>
