<template>
  <div class="webqq-notification-menu">
    <div class="webqq-notification-tabs">
      <Button variant="ghost" size="sm" :class="{ 'is-active': tab === 'friends' }" @click="tab = 'friends'">好友申请</Button>
      <Button variant="ghost" size="sm" :class="{ 'is-active': tab === 'groups' }" @click="tab = 'groups'">群通知</Button>
    </div>
    <div v-webqq-scrollbar class="webqq-notification-body">
      <div v-if="errorText" class="webqq-notification-empty is-error">{{ errorText }}</div>
      <div v-else-if="!visibleRequests.length" class="webqq-notification-empty">暂无通知</div>
      <div v-else class="webqq-notifications">
        <article v-for="request in visibleRequests" :key="request.id" class="webqq-notification-card">
          <span class="webqq-notification-avatar">{{ getInitial(getParticipantName(request.requesterId)) }}</span>
          <div class="webqq-notification-main">
            <strong class="webqq-notification-title">{{ getRequestTitle(request) }}</strong>
            <span>{{ getRequestSubtitle(request) }}</span>
            <small v-if="request.comment" class="webqq-notification-comment">{{ request.comment }}</small>
          </div>
          <div class="webqq-notification-side">
            <span class="webqq-notification-actions">
              <Button variant="ghost" size="xs" :disabled="handlingRequestId === request.id" @click="emit('handle', request.id, true)">同意</Button>
              <Button variant="ghost" size="xs" :disabled="handlingRequestId === request.id" @click="emit('handle', request.id, false)">拒绝</Button>
            </span>
            <time class="webqq-notification-time">{{ formatNoticeTime(request.createdAt) }}</time>
          </div>
        </article>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Button } from './components/ui/button'
import { vWebqqScrollbar } from './webqq-scrollbar'
import type { SandboxRelationshipRequest, SandboxSnapshot } from '../src/types'

const props = defineProps<{
  friends: SandboxRelationshipRequest[]
  groups: SandboxRelationshipRequest[]
  snapshot: SandboxSnapshot
  handlingRequestId: string
  errorText: string
}>()

const emit = defineEmits<{
  handle: [requestId: string, approve: boolean]
}>()

const tab = defineModel<'friends' | 'groups'>('tab', { required: true })
const visibleRequests = computed(() => tab.value === 'friends' ? props.friends : props.groups)

function getParticipantName(id: string) {
  return props.snapshot.users.find((user) => user.id === id)?.name
    ?? props.snapshot.bots.find((bot) => bot.id === id)?.name
    ?? id
}

function getInitial(value: string) {
  return value.trim().slice(0, 1).toUpperCase() || '?'
}

function getRequestTitle(request: SandboxRelationshipRequest) {
  if (request.type === 'friend') return getParticipantName(request.requesterId)
  return props.snapshot.groups.find(({ id }) => id === request.groupId)?.name ?? '群通知'
}

function getRequestSubtitle(request: SandboxRelationshipRequest) {
  if (request.type === 'friend') return `来自 QQ ${request.requesterId}`
  return `${getParticipantName(request.requesterId)} 申请加入群聊`
}

function formatNoticeTime(value: string) {
  const date = new Date(value)
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
</script>
