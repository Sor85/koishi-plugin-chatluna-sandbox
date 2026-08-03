<template>
  <section class="webqq-avatar-picker" aria-label="选择头像">
    <header class="webqq-avatar-picker-header">
      <Button type="button" variant="ghost" size="icon-sm" aria-label="返回资料编辑" @click="emit('back')">
        <IconArrowLeft aria-hidden="true" />
      </Button>
      <div>
        <strong>选择头像</strong>
        <p class="webqq-secondary-hint">选择内置头像，或从本地上传图片。</p>
      </div>
    </header>
    <div class="webqq-avatar-picker-grid">
      <button
        v-for="avatar in avatars"
        :key="avatar.id"
        type="button"
        :class="['webqq-avatar-picker-option', { 'is-selected': avatarDataUrl(avatar) === modelValue }]"
        :aria-label="`选择内置头像 ${avatar.id}`"
        @click="emit('select', avatarDataUrl(avatar))"
      >
        <img :src="avatarDataUrl(avatar)" alt="">
      </button>
    </div>
    <div class="webqq-avatar-picker-upload">
      <input
        :id="inputId"
        ref="fileInputRef"
        class="webqq-avatar-picker-file-input"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        @change="selectLocalAvatar"
      >
      <button type="button" class="webqq-avatar-picker-upload-button" @click="fileInputRef?.click()">
        <span class="webqq-avatar-picker-upload-icon">
          <IconUpload aria-hidden="true" />
        </span>
        <span class="webqq-avatar-picker-upload-copy">
          <strong>上传本地图片</strong>
          <small>支持 PNG、JPG、WebP、GIF 和 SVG</small>
        </span>
        <IconChevronRight class="webqq-avatar-picker-upload-arrow" aria-hidden="true" />
      </button>
    </div>
    <p v-if="errorMessage" class="webqq-form-error m-0 rounded-lg px-3 py-2 text-xs" role="alert">
      {{ errorMessage }}
    </p>
  </section>
</template>

<script setup lang="ts">
import { IconArrowLeft, IconChevronRight, IconUpload } from '@tabler/icons-vue'
import { computed, ref } from 'vue'
import { Button } from './components/ui/button'
import { BUILTIN_AVATARS, type BuiltinAvatar, type BuiltinAvatarKind } from '../src/builtin-avatar-options'

const props = defineProps<{
  kind: BuiltinAvatarKind
  modelValue: string
  inputId: string
}>()
const emit = defineEmits<{
  back: []
  select: [avatar: string]
}>()

const errorMessage = ref('')
const fileInputRef = ref<HTMLInputElement>()
const avatars = computed(() => BUILTIN_AVATARS[props.kind])

function avatarDataUrl(avatar: BuiltinAvatar) {
  const bytes = new TextEncoder().encode(avatar.svg)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `data:image/svg+xml;base64,${btoa(binary)}`
}

function selectLocalAvatar(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (!file.type.startsWith('image/')) {
    errorMessage.value = '头像必须是图片'
    return
  }
  const reader = new FileReader()
  reader.addEventListener('load', () => {
    if (typeof reader.result !== 'string') return
    errorMessage.value = ''
    emit('select', reader.result)
  })
  reader.addEventListener('error', () => {
    errorMessage.value = '读取头像图片失败'
  })
  reader.readAsDataURL(file)
}
</script>
