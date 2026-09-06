<template>
  <Teleport to="body">
    <div
      ref="overlayRef"
      class="chatluna-sandbox-image-preview"
      :class="{ 'is-zoomed': zoom.scale.value > IMAGE_PREVIEW_ZOOM_MIN }"
      role="dialog"
      aria-label="图片预览"
      @click.self="handleOverlayClick"
      @keydown.esc="emit('close')"
      @wheel.prevent="zoom.handleWheel($event)"
    >
      <button ref="closeRef" type="button" class="chatluna-sandbox-image-preview-close" aria-label="关闭预览" @click="emit('close')">
        <IconX :size="20" aria-hidden="true" />
      </button>
      <img
        ref="imageRef"
        :src="url"
        alt="预览图片"
        :style="imageStyle"
        draggable="false"
        @load="handleImageLoad"
        @pointerdown="handlePointerDown"
        @pointermove="zoom.handlePointerMove($event)"
        @pointerup="zoom.finishDrag($event)"
        @pointercancel="zoom.finishDrag($event)"
      >
      <output v-if="zoom.scale.value > IMAGE_PREVIEW_ZOOM_MIN" class="chatluna-sandbox-image-preview-scale">{{ scaleLabel }}</output>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { IconX } from '@tabler/icons-vue'
import { computed, onMounted, ref, watch } from 'vue'
import { createImagePreviewZoom, IMAGE_PREVIEW_ZOOM_MIN } from './image-preview-zoom'

const props = defineProps<{ url: string }>()
const emit = defineEmits<{ close: [] }>()
const closeRef = ref<HTMLButtonElement>()
const overlayRef = ref<HTMLElement>()
const imageRef = ref<HTMLImageElement>()

/**
 * 贴合尺寸取图片自己的布局盒，可视区取遮罩。倍率写在 transform 上而不改布局盒，
 * 因此这两个读数在缩放过程中保持不变，锚点算术始终以贴合态为基准。
 */
const zoom = createImagePreviewZoom({
  metrics: () => {
    const image = imageRef.value
    const overlay = overlayRef.value
    if (!image || !overlay || !image.offsetWidth) return undefined
    return {
      baseWidth: image.offsetWidth,
      baseHeight: image.offsetHeight,
      viewportWidth: overlay.clientWidth,
      viewportHeight: overlay.clientHeight,
    }
  },
  center: () => {
    const overlay = overlayRef.value
    if (!overlay) return undefined
    const rect = overlay.getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  },
  captureTarget: () => imageRef.value,
})

const imageStyle = computed(() => ({
  transform: `translate(${zoom.offset.value.x}px, ${zoom.offset.value.y}px) scale(${zoom.scale.value})`,
}))

const scaleLabel = computed(() => `${Math.round(zoom.scale.value * 100)}%`)

// 打开即聚焦关闭按钮，保证 ESC 立即可用（与 onebot-webqq 行为一致）。
onMounted(() => closeRef.value?.focus())

// 换图时回到贴合态，否则新图会带着上一张的倍率与位移突然出现。
watch(() => props.url, () => zoom.reset())

function handleImageLoad() {
  zoom.reset()
}

/** 拖动结束那一拍的 click 落在遮罩上，吃掉它，否则拖一下图片就把预览关了。 */
function handleOverlayClick() {
  if (zoom.consumeSuppressedClick()) return
  emit('close')
}

function handlePointerDown(event: PointerEvent) {
  zoom.handlePointerDown(event)
  // 放大态下按住图片是平移，不应触发浏览器的原生图片拖拽。
  if (zoom.scale.value > IMAGE_PREVIEW_ZOOM_MIN) event.preventDefault()
}
</script>
