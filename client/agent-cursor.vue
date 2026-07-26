<template>
  <div class="webqq-agent-cursor" :style="{ top: position.top, left: position.left }" aria-hidden="true">
    <span class="webqq-agent-cursor-float">
      <!-- ego lite 官方 agent 光标形状（viewBox 0 0 20 20，白描边），从应用资源中提取 -->
      <svg viewBox="0 0 20 20" :width="size" :height="size" fill="none" aria-hidden="true">
        <path
          d="M6.465 15.647 4.511 4.813a1 1 0 0 1 1.366-1.102l9.698 4.007c.853.352.815 1.572-.058 1.87l-4.682 1.6a1 1 0 0 0-.588.534l-1.887 4.16c-.405.894-1.72.73-1.895-.235Z"
          fill="currentColor"
          stroke="#fff"
          stroke-width="1.5"
        />
      </svg>
      <span class="webqq-agent-cursor-label">{{ label }}</span>
    </span>
  </div>
</template>
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

withDefaults(defineProps<{ label?: string; size?: number }>(), { label: 'AI', size: 20 })

// ego lite 的 agent 光标节奏：每 5.2-9s 随机跳到一个新位置（模拟 agent 思考间隔），
// 单次移动由 CSS transition 完成（0.9s cubic-bezier(0.22,1,0.36,1)）。
const position = ref({ top: '38%', left: '55%' })
let jumpTimer: ReturnType<typeof setTimeout> | undefined

function scheduleJump() {
  jumpTimer = setTimeout(() => {
    position.value = { top: `${22 + Math.random() * 52}%`, left: `${18 + Math.random() * 60}%` }
    scheduleJump()
  }, 5200 + Math.random() * 3800)
}

onMounted(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  scheduleJump()
})
onBeforeUnmount(() => {
  if (jumpTimer) clearTimeout(jumpTimer)
})
</script>
