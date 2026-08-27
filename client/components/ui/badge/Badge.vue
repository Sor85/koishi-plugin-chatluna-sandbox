<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import type { BadgeVariants } from '.'
import { cn } from '../../../lib/utils'
import { badgeVariants } from '.'

interface Props {
  variant?: BadgeVariants['variant']
  class?: HTMLAttributes['class']
}

const props = defineProps<Props>()
</script>

<template>
  <span
    data-slot="badge"
    :data-variant="variant ?? 'default'"
    class="sandbox-badge"
    :class="cn(badgeVariants({ variant }), props.class)"
  >
    <slot />
  </span>
</template>

<style scoped>
.sandbox-badge {
  display: inline-flex;
  flex-shrink: 0;
  height: 18px;
  align-items: center;
  justify-content: center;
  padding: 0 6px;
  border: 0;
  border-radius: 5px;
  font-size: var(--webqq-font-2xs);
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
}

.sandbox-badge[data-variant='secondary'] {
  color: #64748b;
  background: #e2e8f0;
}

:global(.dark) .sandbox-badge[data-variant='secondary'] {
  color: #cbd5e1;
  background: #334155;
}
</style>
