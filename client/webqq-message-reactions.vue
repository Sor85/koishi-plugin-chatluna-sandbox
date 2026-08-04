<template>
  <div v-if="reactions.length" class="webqq-message-reactions" :class="{ 'is-readonly': readonly }">
    <button
      v-for="reaction in reactions"
      :key="reaction.emojiId"
      type="button"
      class="webqq-message-reaction"
      :class="{ 'is-readonly': readonly }"
      :disabled="readonly"
      :aria-label="reactionLabel(reaction)"
      @click.stop="emit('toggle', reaction.emojiId)"
    >
      <img
        v-if="getFace(reaction.emojiId)?.url"
        class="webqq-message-reaction-emoji"
        :src="getFace(reaction.emojiId)!.url"
        :alt="getFace(reaction.emojiId)!.label"
      >
      <span v-else class="webqq-message-reaction-label">{{ getFace(reaction.emojiId)?.label ?? reaction.emojiId }}</span>
      <span v-if="reaction.participantIds.length" class="webqq-message-reaction-users">
        <span
          v-for="(participantId, userIndex) in visibleParticipants(reaction)"
          :key="participantId"
          class="webqq-message-reaction-avatar"
          :title="getParticipantName(participantId)"
          :style="{ zIndex: visibleParticipants(reaction).length - userIndex }"
        >
          <WebqqAvatar
            class="webqq-message-reaction-avatar-image"
            :kind="isBotParticipant(participantId) ? 'bot' : 'user'"
            :name="getParticipantName(participantId)"
            :avatar="getParticipantAvatar(participantId)"
          />
        </span>
      </span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { getSandboxEmojiFace } from './webqq/emoji-catalog'
import WebqqAvatar from './webqq-avatar.vue'
import type { SandboxMessageReaction } from '../src/types'

const props = defineProps<{
  reactions: SandboxMessageReaction[]
  currentOperatorId?: string
  readonly?: boolean
  participants: Record<string, { name: string; avatar?: string; isBot: boolean }>
}>()

const emit = defineEmits<{
  toggle: [emojiId: string]
}>()

function getFace(emojiId: string) {
  return getSandboxEmojiFace(emojiId)
}

const MAX_VISIBLE_REACTION_AVATARS = 3

// TIM 风格 chip 只叠少量头像，避免窄屏被长列表撑破。
function visibleParticipants(reaction: SandboxMessageReaction) {
  return reaction.participantIds.slice(0, MAX_VISIBLE_REACTION_AVATARS)
}

function getParticipantName(id: string) {
  return props.participants[id]?.name ?? id
}

function getParticipantAvatar(id: string) {
  return props.participants[id]?.avatar
}

function isBotParticipant(id: string) {
  return props.participants[id]?.isBot ?? false
}

function reactionLabel(reaction: SandboxMessageReaction) {
  const face = getFace(reaction.emojiId)
  const name = face?.label ?? reaction.emojiId
  return `${name} ${reaction.participantIds.length}`
}
</script>
