<template>
  <!-- ego lite 被控空间覆盖层的 Web 复刻：scrim 渐变 + 点阵纹理 + WebGL 边缘跑马灯 + agent 光标 + 任务栏。
       跑马灯 shader 逐字取自 ego lite 应用资源；WebGL 不可用时仅保留 scrim 与点阵。 -->
  <div class="webqq-agent-observe" aria-live="polite">
    <div class="webqq-agent-observe-dots" aria-hidden="true" />
    <canvas ref="canvasRef" class="webqq-agent-observe-canvas" aria-hidden="true" />
    <AgentCursor label="AI" />
    <!-- ego lite 空间内任务栏的 1:1 复刻；ego 放在底部，本项目按需求置于顶部。 -->
    <div class="webqq-agent-taskbar">
      <span class="webqq-agent-taskbar-pause" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
          <rect x="7" y="5" width="3" height="14" rx="1.2" />
          <rect x="14" y="5" width="3" height="14" rx="1.2" />
        </svg>
      </span>
      <span class="webqq-agent-taskbar-control-icon" aria-hidden="true">
        <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <g transform="translate(1.6 1)">
            <path d="M8.4.9v2.5M3.33 3.33 5.1 5.1M1.2 8.4h2.5M3.33 13.47l1.77-1.77M13.47 3.33 11.7 5.1M13.1 8.4h2.5" transform="translate(.3 0)" />
            <path d="M9.3 16.3 8.08 9.53a.63 0 0 1 .85-.69L15 11.35a.63 0 0 1-.03 1.18l-2.93 1a.63 0 0 0-.37.34l-1.18 2.6a.63 0 0 1-1.19-.17Z" transform="translate(0 .35)" fill="currentColor" stroke="none" />
          </g>
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
import { onBeforeUnmount, onMounted, ref } from 'vue'
import AgentCursor from './agent-cursor.vue'
import { mountAgentOverlayEffect } from './webqq/agent-overlay-effect'

defineProps<{ spaceName: string }>()
defineEmits<{ takeOver: []; terminate: [] }>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
let dispose: (() => void) | null = null

onMounted(() => {
  if (!canvasRef.value) return
  dispose = mountAgentOverlayEffect(canvasRef.value)
})
onBeforeUnmount(() => {
  dispose?.()
  dispose = null
})
</script>
