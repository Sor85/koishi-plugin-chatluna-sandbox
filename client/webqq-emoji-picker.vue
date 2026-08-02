<template>
  <section ref="panelRef" v-if="open" class="webqq-secondary-page webqq-emoji-picker-page" :style="panelStyle" aria-label="贴表情">
    <header class="webqq-secondary-page-header">
      <strong>贴表情</strong>
    </header>
    <div v-webqq-scrollbar="{ tone: 'accent' }" class="webqq-emoji-picker">
      <Input
        v-model="query"
        class="webqq-emoji-picker-search"
        type="search"
        placeholder="搜索表情名称、拼音或 ID"
        aria-label="搜索表情"
      />
      <section v-if="!query.trim() && recentFaces.length" class="webqq-emoji-picker-section">
        <header>常用</header>
        <div class="webqq-emoji-picker-grid">
          <button
            v-for="face in recentFaces"
            :key="`recent:${face.id}`"
            type="button"
            class="webqq-emoji-picker-item"
            :title="face.label"
            @click="select(face.id)"
          >
            <img v-if="face.url" :src="face.url" :alt="face.label">
            <span v-else>{{ face.label }}</span>
          </button>
        </div>
      </section>
      <section v-if="!query.trim()" class="webqq-emoji-picker-section">
        <header>推荐</header>
        <div class="webqq-emoji-picker-grid">
          <button
            v-for="face in commonFaces"
            :key="`common:${face.id}`"
            type="button"
            class="webqq-emoji-picker-item"
            :title="face.label"
            @click="select(face.id)"
          >
            <img v-if="face.url" :src="face.url" :alt="face.label">
            <span v-else>{{ face.label }}</span>
          </button>
        </div>
      </section>
      <section class="webqq-emoji-picker-section">
        <header>{{ query.trim() ? '搜索结果' : '全部表情' }}</header>
        <div class="webqq-emoji-picker-grid">
          <button
            v-for="face in visibleFaces"
            :key="face.id"
            type="button"
            class="webqq-emoji-picker-item"
            :title="face.label"
            @click="select(face.id)"
          >
            <img v-if="face.url" :src="face.url" :alt="face.label">
            <span v-else>{{ face.label }}</span>
          </button>
          <p v-if="!visibleFaces.length" class="webqq-emoji-picker-empty">没有匹配的表情</p>
        </div>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Input } from './components/ui/input'
import {
  getCommonSandboxEmojiFaces,
  getSandboxEmojiFace,
  loadRecentSandboxEmojiIds,
  rememberSandboxEmojiId,
  searchSandboxEmojiFaces,
  type SandboxEmojiFace,
} from './webqq/emoji-catalog'
import { getFloatingPanelStyle } from './webqq/floating-panel'
import { vWebqqScrollbar } from './webqq-scrollbar'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [open: boolean]
  select: [emojiId: string]
}>()

const query = ref('')
const panelRef = ref<HTMLElement>()
const panelStyle = ref<Record<string, string>>({})
const recentIds = ref(loadRecentSandboxEmojiIds())
const commonFaces = getCommonSandboxEmojiFaces()

const recentFaces = computed(() => recentIds.value
  .map((id) => getSandboxEmojiFace(id))
  .filter((face): face is SandboxEmojiFace => !!face))

const visibleFaces = computed(() => searchSandboxEmojiFaces(query.value))

watch(() => props.open, (open) => {
  if (open) {
    query.value = ''
    panelStyle.value = getFloatingPanelStyle({ height: 520 })
    recentIds.value = loadRecentSandboxEmojiIds()
  }
})

function closeOnOutsidePointer(event: PointerEvent) {
  if (!props.open || panelRef.value?.contains(event.target as Node)) return
  emit('update:open', false)
}

onMounted(() => document.addEventListener('pointerdown', closeOnOutsidePointer))
onBeforeUnmount(() => document.removeEventListener('pointerdown', closeOnOutsidePointer))

function select(emojiId: string) {
  recentIds.value = rememberSandboxEmojiId(emojiId)
  emit('select', emojiId)
  emit('update:open', false)
}
</script>
