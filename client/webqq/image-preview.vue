<template>
  <Teleport to="body">
    <div class="chatluna-sandbox-image-preview" role="dialog" aria-label="图片预览" @click.self="emit('close')" @keydown.esc="emit('close')">
      <button ref="closeRef" type="button" class="chatluna-sandbox-image-preview-close" aria-label="关闭预览" @click="emit('close')">
        <IconX :size="20" aria-hidden="true" />
      </button>
      <img :src="url" alt="预览图片">
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { IconX } from '@tabler/icons-vue'
import { onMounted, ref } from 'vue'

defineProps<{ url: string }>()
const emit = defineEmits<{ close: [] }>()
const closeRef = ref<HTMLButtonElement>()

// 打开即聚焦关闭按钮，保证 ESC 立即可用（与 onebot-webqq 行为一致）。
onMounted(() => closeRef.value?.focus())
</script>
