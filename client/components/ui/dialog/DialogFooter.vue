<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '../../../lib/utils'

const props = defineProps<{ class?: HTMLAttributes['class'] }>()
</script>

<template>
  <footer data-slot="dialog-footer" class="sandbox-dialog-footer" :class="cn(props.class)">
    <slot />
  </footer>
</template>

<style scoped>
.sandbox-dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--webqq-secondary-row-gap, 8px);
  padding-top: var(--webqq-secondary-row-gap, 8px);
}
</style>
