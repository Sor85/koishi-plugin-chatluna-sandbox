<template>
  <span :class="['webqq-identity-avatar', { 'is-bot': kind === 'bot', 'is-group': kind === 'group' }]">
    <img v-if="avatar && !imageFailed" :src="avatar" :alt="alt || name" @error="imageFailed = true">
    <template v-else>{{ initial }}</template>
  </span>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  kind: 'user' | 'bot' | 'group'
  name?: string
  avatar?: string
  alt?: string
}>(), {
  name: '',
  avatar: '',
  alt: '',
})

const imageFailed = ref(false)
const initial = computed(() => props.name.trim().slice(0, 1).toUpperCase() || '?')

watch(() => props.avatar, () => {
  imageFailed.value = false
})
</script>
