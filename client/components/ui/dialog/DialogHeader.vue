<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '#client/lib/utils'

const props = defineProps<{ class?: HTMLAttributes['class'] }>()
</script>

<template>
  <header data-slot="dialog-header" class="sandbox-dialog-header" :class="cn(props.class)">
    <slot />
  </header>
</template>

<style scoped>
.sandbox-dialog-header {
  display: grid;
  gap: var(--webqq-secondary-title-gap, 4px);
  padding-right: 32px;
}
</style>
