<template>
  <!-- ego lite Actor Overlay 的 Web 复刻：scrim 渐变 + 点阵纹理 + 跑马灯描边环 + 呼吸光晕 + agent 光标 + 任务栏 -->
  <div class="webqq-agent-observe" aria-live="polite">
    <div class="webqq-agent-observe-dots" aria-hidden="true" />
    <div class="webqq-agent-observe-stroke" aria-hidden="true" />
    <div class="webqq-agent-observe-glow" aria-hidden="true" />
    <AgentCursor label="AI" />
    <!-- ego lite 空间内任务栏的 1:1 复刻；ego 放在底部，本项目按需求置于顶部。 -->
    <div class="webqq-agent-taskbar">
      <span class="webqq-agent-taskbar-pause" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
          <rect x="7" y="5" width="3" height="14" rx="1.2" />
          <rect x="14" y="5" width="3" height="14" rx="1.2" />
        </svg>
      </span>
      <span class="webqq-agent-taskbar-spinner" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true">
          <line x1="12" y1="3" x2="12" y2="7" />
          <line x1="12" y1="17" x2="12" y2="21" />
          <line x1="3" y1="12" x2="7" y2="12" />
          <line x1="17" y1="12" x2="21" y2="12" />
          <line x1="5.64" y1="5.64" x2="8.46" y2="8.46" />
          <line x1="15.54" y1="15.54" x2="18.36" y2="18.36" />
          <line x1="5.64" y1="18.36" x2="8.46" y2="15.54" />
          <line x1="15.54" y1="8.46" x2="18.36" y2="5.64" />
        </svg>
      </span>
      <span class="webqq-agent-taskbar-text">
        <strong class="webqq-agent-taskbar-title">{{ spaceName }}</strong>
        <span class="webqq-agent-taskbar-subtitle">Agent 正在控制</span>
      </span>
      <button type="button" class="webqq-agent-taskbar-takeover" @click="$emit('takeOver')">接管</button>
      <button type="button" class="webqq-agent-taskbar-terminate" @click="$emit('terminate')">终止任务</button>
    </div>
  </div>
</template>
<script setup lang="ts">
import AgentCursor from './agent-cursor.vue'

defineProps<{ spaceName: string }>()
defineEmits<{ takeOver: []; terminate: [] }>()
</script>
