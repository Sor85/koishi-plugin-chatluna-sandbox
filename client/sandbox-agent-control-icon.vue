<template>
  <!-- ego lite 任务栏控制图标：光标静止，射线绕 (8.7, 8.4) 旋转。
       运行态在图标外再套一圈双层反向光带——被控覆盖层边缘跑马灯的圆形缩写。 -->
  <span class="sandbox-agent-control" :class="{ 'is-running': running }" aria-hidden="true">
    <span class="sandbox-agent-control-orbit">
      <span class="sandbox-agent-control-orbit-band is-inner" />
      <span class="sandbox-agent-control-orbit-band is-outer" />
    </span>
    <svg
      class="sandbox-agent-control-icon"
      viewBox="0 0 20 20"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g transform="translate(1.6 1)">
        <g transform="translate(8.7 8.4)">
          <g class="sandbox-agent-control-icon-rays">
            <g transform="translate(-8.7 -8.4)">
              <path d="M8.4.9v2.5M3.33 3.33 5.1 5.1M1.2 8.4h2.5M3.33 13.47l1.77-1.77M13.47 3.33 11.7 5.1M13.1 8.4h2.5" transform="translate(.3 0)" />
            </g>
          </g>
        </g>
        <path d="M9.3 16.3 8.08 9.53a.63 .63 0 0 1 .85-.69L15 11.35a.63 .63 0 0 1-.03 1.18l-2.93 1a.63 .63 0 0 0-.37.34l-1.18 2.6a.63 .63 0 0 1-1.19-.17Z" transform="translate(0 .35)" fill="currentColor" stroke="none" />
      </g>
    </svg>
  </span>
</template>
<script setup lang="ts">
defineProps<{ running?: boolean }>()
</script>
