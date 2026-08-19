<script setup lang="ts">
import type { ContextMenuSubContentEmits, ContextMenuSubContentProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { ContextMenuPortal, ContextMenuSubContent, useForwardPropsEmits } from 'reka-ui'
import { cn } from '../../../lib/utils'

defineOptions({ inheritAttrs: false })

const props = defineProps<ContextMenuSubContentProps & { class?: HTMLAttributes['class'] }>()
const emits = defineEmits<ContextMenuSubContentEmits>()
const delegatedProps = reactiveOmit(props, 'class')
const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <!-- 二级面板必须独立 Teleport 到 body，避免被一级菜单的 overflow 裁剪。 -->
  <ContextMenuPortal>
    <ContextMenuSubContent
      data-slot="chatluna-sandbox-context-menu-sub-content"
      v-bind="{ ...$attrs, ...forwarded }"
      :class="cn('z-50 min-w-44 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 text-slate-900 shadow-2xl outline-none dark:border-[#52525b] dark:bg-[#39393f] dark:text-[#f4f4f5]', props.class)"
    >
      <slot />
    </ContextMenuSubContent>
  </ContextMenuPortal>
</template>
