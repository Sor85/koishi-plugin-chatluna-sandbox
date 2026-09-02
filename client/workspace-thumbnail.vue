<template>
  <div ref="thumbnailRef" class="webqq-space-thumbnail" aria-hidden="true">
    <div ref="liveHostRef" class="webqq-space-thumbnail-live-host" />
    <!-- 从未进入过的空间、或捕获的是独立页时，用消息工作区快照绘制首屏。 -->
    <div
      v-if="!liveCapture"
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
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AgentCursor from './agent-cursor.vue'
import WebqqChatPane from './webqq-chat-pane.vue'
import WebqqDetailsPanel from './webqq-details-panel.vue'
import WebqqSidebar from './webqq-sidebar.vue'
import {
  instantiateWorkspaceThumbnail,
  isWorkspaceThumbnailView,
  restoreWorkspaceThumbnailScroll,
  type WorkspaceThumbnailCapture,
} from '#client/webqq/workspace-thumbnail-capture'
import type { WorkspaceThumbnailModels } from '#client/webqq/workspace-thumbnail-model'
import { calculateContainedWorkspaceThumbnailTransform } from '#client/webqq/workspace-thumbnail-scale'
import type { SandboxAppearance } from '../src/types'

const THUMBNAIL_CANVAS_WIDTH = 1440
const THUMBNAIL_CANVAS_HEIGHT = 760

const props = defineProps<{
  models: WorkspaceThumbnailModels
  capture?: WorkspaceThumbnailCapture
  appearance: SandboxAppearance
  colorMode: 'light' | 'dark'
  running?: boolean
}>()
const thumbnailRef = ref<HTMLElement>()
const liveHostRef = ref<HTMLElement>()
const liveCapture = computed(() => {
  const capture = props.capture
  if (!capture) return
  return isWorkspaceThumbnailView(capture.element.getAttribute('data-mobile-view')) ? capture : undefined
})
let resizeObserver: ResizeObserver | undefined

function renderCapture() {
  const host = liveHostRef.value
  const capture = liveCapture.value
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
  const capture = liveCapture.value
  if (capture) {
    const element = liveHostRef.value?.firstElementChild
    if (element instanceof HTMLElement) applyContainedScale(element, capture.width, capture.height)
    return
  }
  const element = thumbnailRef.value?.querySelector<HTMLElement>('.webqq-space-thumbnail-workspace')
  if (element) applyContainedScale(element, THUMBNAIL_CANVAS_WIDTH, THUMBNAIL_CANVAS_HEIGHT)
}

watch(liveCapture, () => {
  renderCapture()
  void nextTick(scaleThumbnail)
})
onMounted(() => {
  renderCapture()
  void nextTick(scaleThumbnail)
  resizeObserver = new ResizeObserver(scaleThumbnail)
  if (thumbnailRef.value) resizeObserver.observe(thumbnailRef.value)
})
onBeforeUnmount(() => resizeObserver?.disconnect())
</script>
