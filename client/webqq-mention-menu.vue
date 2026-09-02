<template>
  <div
    class="chatluna-sandbox-mention-menu"
    role="listbox"
    :aria-label="ariaLabel"
  >
    <button
      v-for="(candidate, index) in candidates"
      :key="candidate.id"
      type="button"
      class="chatluna-sandbox-mention-menu-item"
      role="option"
      :class="{ 'is-active': index === activeIndex }"
      :aria-selected="index === activeIndex"
      @mousedown.prevent="emit('select', candidate)"
      @mouseenter="emit('hover', index)"
    >
      <WebqqAvatar
        class="chatluna-sandbox-mention-menu-avatar"
        :kind="candidate.kind"
        :name="candidate.name"
        :avatar="candidate.avatar"
      />
      <span class="chatluna-sandbox-mention-menu-meta">
        <strong>{{ candidate.name }}</strong>
        <small>{{ candidate.id }}</small>
      </span>
    </button>
    <div v-if="!candidates.length" class="chatluna-sandbox-mention-menu-empty">无匹配成员</div>
  </div>
</template>

<script setup lang="ts">
import WebqqAvatar from './webqq-avatar.vue'
import type { MentionCandidate } from '#client/webqq/composer-draft'

defineProps<{
  candidates: MentionCandidate[]
  activeIndex: number
  ariaLabel?: string
}>()

const emit = defineEmits<{
  select: [candidate: MentionCandidate]
  hover: [index: number]
}>()
</script>
