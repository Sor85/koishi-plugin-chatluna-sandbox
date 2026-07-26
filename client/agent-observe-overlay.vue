<template>
  <!-- ego lite AgentTaskOverlayView 的 Web 复刻：边缘内发光 + 点阵纹理 + 顶部控制条 + agent 光标 -->
  <div class="webqq-agent-observe" aria-live="polite">
    <div class="webqq-agent-observe-dots" aria-hidden="true" />
    <div class="webqq-agent-observe-glow" aria-hidden="true" />
    <AgentCursor label="AI" />
    <div class="webqq-agent-observe-bar">
      <span class="webqq-agent-pulse-dot" aria-hidden="true" />
      <span class="webqq-agent-observe-bar-text">AI 控制中 · {{ spaceName }}</span>
      <Button size="xs" variant="secondary" @click="$emit('takeOver')">接管</Button>
    </div>
  </div>
</template>
<script setup lang="ts">
import AgentCursor from './agent-cursor.vue'
import { Button } from './components/ui/button'

defineProps<{ spaceName: string }>()
defineEmits<{ takeOver: [] }>()
</script>
