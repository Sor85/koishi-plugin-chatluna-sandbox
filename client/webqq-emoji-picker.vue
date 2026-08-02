<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="webqq-emoji-picker-dialog" style="z-index: 180">
      <DialogHeader>
        <DialogTitle>贴表情</DialogTitle>
        <DialogDescription>选择本地 OneBot/QFace 目录中的表情回应</DialogDescription>
      </DialogHeader>
      <div class="webqq-emoji-picker">
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
          <div class="webqq-emoji-picker-grid is-scrollable">
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
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './components/ui/dialog'
import { Input } from './components/ui/input'
import {
  getCommonSandboxEmojiFaces,
  getSandboxEmojiFace,
  loadRecentSandboxEmojiIds,
  rememberSandboxEmojiId,
  searchSandboxEmojiFaces,
  type SandboxEmojiFace,
} from './webqq/emoji-catalog'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [open: boolean]
  select: [emojiId: string]
}>()

const query = ref('')
const recentIds = ref(loadRecentSandboxEmojiIds())
const commonFaces = getCommonSandboxEmojiFaces()

const recentFaces = computed(() => recentIds.value
  .map((id) => getSandboxEmojiFace(id))
  .filter((face): face is SandboxEmojiFace => !!face))

const visibleFaces = computed(() => searchSandboxEmojiFaces(query.value))

watch(() => props.open, (open) => {
  if (open) {
    query.value = ''
    recentIds.value = loadRecentSandboxEmojiIds()
  }
})

function select(emojiId: string) {
  recentIds.value = rememberSandboxEmojiId(emojiId)
  emit('select', emojiId)
  emit('update:open', false)
}
</script>
