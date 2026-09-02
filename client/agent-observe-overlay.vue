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
        <SandboxAgentControlIcon running />
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
import SandboxAgentControlIcon from './sandbox-agent-control-icon.vue'
import { mountAgentOverlayEffect } from '#client/webqq/agent-overlay-effect'

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
