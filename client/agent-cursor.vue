<template>
  <div
    class="webqq-agent-cursor"
    :class="{ 'is-clicking': clicking, 'is-loading': loading }"
    :style="{ top: position.top, left: position.left }"
    aria-hidden="true"
    @transitionend="handleArrival"
  >
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
// 单次移动由 CSS transition 完成（0.9s，easing 同 ego 魔法光标 cubic-bezier(0.6,0,0.4,1)）。
const position = ref({ top: '38%', left: '55%' })
// ego Actor Overlay 的动作链：移动到位 → 400ms 点击挤压（triggerClickAnimation）→
// 静止 200ms 后进入 loading 浮动（startLoadingTimer_），下次移动前先撤掉 loading。
const clicking = ref(false)
const loading = ref(false)
let jumpTimer: ReturnType<typeof setTimeout> | undefined
let clickTimer: ReturnType<typeof setTimeout> | undefined
let loadingTimer: ReturnType<typeof setTimeout> | undefined

function clearActionTimers() {
  if (clickTimer) clearTimeout(clickTimer)
  if (loadingTimer) clearTimeout(loadingTimer)
}

function scheduleJump() {
  jumpTimer = setTimeout(() => {
    clearActionTimers()
    clicking.value = false
    loading.value = false
    position.value = { top: `${22 + Math.random() * 52}%`, left: `${18 + Math.random() * 60}%` }
    scheduleJump()
  }, 5200 + Math.random() * 3800)
}

function handleArrival(event: TransitionEvent) {
  // top 与 left 各触发一次 transitionend，只认其中一个避免动作链跑两遍。
  if (event.propertyName !== 'top') return
  clearActionTimers()
  clicking.value = true
  clickTimer = setTimeout(() => {
    clicking.value = false
    loadingTimer = setTimeout(() => { loading.value = true }, 200)
  }, 400)
}

onMounted(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  loadingTimer = setTimeout(() => { loading.value = true }, 200)
  scheduleJump()
})
onBeforeUnmount(() => {
  if (jumpTimer) clearTimeout(jumpTimer)
  clearActionTimers()
})
</script>
