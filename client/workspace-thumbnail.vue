<template>
  <div class="webqq-space-thumbnail" aria-hidden="true">
    <span class="webqq-space-thumbnail-rail" />
    <div class="webqq-space-thumbnail-list">
      <i v-for="participant in snapshot.participants.slice(0, 4)" :key="participant.id" />
    </div>
    <div class="webqq-space-thumbnail-chat">
      <span v-for="message in snapshot.messages.slice(-3)" :key="message.id" :class="{ 'is-self': message.authorId === snapshot.participants[0]?.id }" />
    </div>
    <div class="webqq-space-thumbnail-details"><i /><i /><i /></div>
  </div>
</template>
<script setup lang="ts">
import type { SandboxSnapshot } from '../src/types'
defineProps<{ snapshot: SandboxSnapshot }>()
</script>
