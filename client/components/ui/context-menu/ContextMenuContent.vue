<script setup lang="ts">
import type { ContextMenuContentEmits, ContextMenuContentProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { ContextMenuContent, ContextMenuPortal, useForwardPropsEmits } from 'reka-ui'
import { cn } from '../../../lib/utils'

defineOptions({ inheritAttrs: false })

const props = defineProps<ContextMenuContentProps & { class?: HTMLAttributes['class'] }>()
const emits = defineEmits<ContextMenuContentEmits>()
const delegatedProps = reactiveOmit(props, 'class')
const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <ContextMenuPortal>
    <ContextMenuContent
      data-slot="context-menu-content"
      v-bind="{ ...$attrs, ...forwarded }"
      :class="cn(
        'z-50 min-w-44 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 text-slate-900 shadow-2xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100',
        props.class,
      )"
    >
      <slot />
    </ContextMenuContent>
  </ContextMenuPortal>
</template>
