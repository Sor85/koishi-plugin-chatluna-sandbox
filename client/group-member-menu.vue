<template>
  <component :is="sub ? ContextMenuSubContent : ContextMenuContent" style="z-index: 140">
    <ContextMenuItem v-if="actions.includes('mention')" @select="emit('mention')">
      <IconAt :size="16" aria-hidden="true" /> @ 用户
    </ContextMenuItem>
    <ContextMenuItem v-if="actions.includes('poke')" @select="emit('poke')">
      <IconHandClick :size="16" aria-hidden="true" /> 戳一戳
    </ContextMenuItem>
    <ContextMenuItem v-if="actions.includes('set-card')" @select="emit('set-card')">
      <IconTag :size="16" aria-hidden="true" /> 修改群名片
    </ContextMenuItem>
    <ContextMenuItem v-if="actions.includes('set-admin')" @select="emit('set-admin', true)">
      <IconUserPlus :size="16" aria-hidden="true" /> 设为管理员
    </ContextMenuItem>
    <ContextMenuItem v-if="actions.includes('unset-admin')" @select="emit('set-admin', false)">
      <IconUserMinus :size="16" aria-hidden="true" /> 取消管理员
    </ContextMenuItem>
    <ContextMenuItem v-if="actions.includes('transfer-owner')" @select="emit('transfer-owner')">
      <IconCrown :size="16" aria-hidden="true" /> 转让群主
    </ContextMenuItem>
    <ContextMenuItem
      v-if="actions.includes('kick')"
      class="text-red-600 focus:bg-red-50 focus:text-red-700 dark:focus:bg-red-950/40"
      @select="emit('kick')"
    >
      <IconUserMinus :size="16" aria-hidden="true" /> 踢出群组
    </ContextMenuItem>
    <ContextMenuItem v-else-if="kickDisabledReason" disabled>
      <IconUserMinus :size="16" aria-hidden="true" /> {{ kickDisabledReason }}
    </ContextMenuItem>
  </component>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { IconAt, IconCrown, IconHandClick, IconTag, IconUserMinus, IconUserPlus } from '@tabler/icons-vue'
import { ContextMenuContent, ContextMenuItem, ContextMenuSubContent } from './components/ui/context-menu'
import { getGroupMemberMenuActions } from './webqq/group-menu'
import type { SandboxGroupMember } from '../src/types'

const props = defineProps<{
  actor?: SandboxGroupMember
  target: SandboxGroupMember
  sub?: boolean
}>()

const emit = defineEmits<{
  mention: []
  poke: []
  'set-card': []
  'set-admin': [enabled: boolean]
  'transfer-owner': []
  kick: []
}>()

const actions = computed(() => getGroupMemberMenuActions(props.actor, props.target))
const kickDisabledReason = computed(() => {
  if (!props.actor || props.actor.participantId === props.target.participantId) return ''
  if (props.actor.role === 'member') return '需要管理员权限才能踢人'
  if (props.actor.role === 'admin' && props.target.role !== 'member') return '管理员不能管理群主或管理员'
  return ''
})
</script>
