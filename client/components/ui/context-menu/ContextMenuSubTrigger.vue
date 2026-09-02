<script setup lang="ts">
import type { ContextMenuSubTriggerProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { IconChevronRight } from '@tabler/icons-vue'
import { reactiveOmit } from '@vueuse/core'
import { ContextMenuSubTrigger, useForwardProps } from 'reka-ui'
import { cn } from '#client/lib/utils'

const props = defineProps<ContextMenuSubTriggerProps & { class?: HTMLAttributes['class'] }>()
const delegatedProps = reactiveOmit(props, 'class')
const forwarded = useForwardProps(delegatedProps)
</script>

<template>
  <ContextMenuSubTrigger
    data-slot="chatluna-sandbox-context-menu-sub-trigger"
    v-bind="forwarded"
    :class="cn('flex cursor-default select-none items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none focus:bg-slate-100 data-[state=open]:bg-slate-100 dark:focus:bg-[#494950] dark:data-[state=open]:bg-[#494950]', props.class)"
  >
    <slot />
    <IconChevronRight class="ml-auto" :size="16" aria-hidden="true" />
  </ContextMenuSubTrigger>
</template>
