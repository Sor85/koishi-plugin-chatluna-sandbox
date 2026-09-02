<template>
  <!-- ego lite 任务栏控制图标：光标静止，完整八向射线绕 (8.7, 8.4) 旋转。
       射线层用 CSS mask 挖掉光标轮廓——CSS transform 合成后仍会被裁掉，转到光标里消失、转出后再出现。
       运行态在图标外再套一圈双层反向光带——被控覆盖层边缘跑马灯的圆形缩写。 -->
  <span class="sandbox-agent-control" :class="{ 'is-running': running }" aria-hidden="true">
    <span class="sandbox-agent-control-orbit">
      <span class="sandbox-agent-control-orbit-band is-inner" />
      <span class="sandbox-agent-control-orbit-band is-outer" />
    </span>
    <svg
      class="sandbox-agent-control-icon sandbox-agent-control-rays-layer"
      :style="rayMaskStyle"
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
              <path d="M8.4.9v2.5M3.33 3.33 5.1 5.1M1.2 8.4h2.5M3.33 13.47l1.77-1.77M13.47 3.33 11.7 5.1M13.1 8.4h2.5M8.4 15.9v-2.5M13.47 13.47 11.7 11.7" transform="translate(.3 0)" />
            </g>
          </g>
        </g>
      </g>
    </svg>
    <svg
      class="sandbox-agent-control-icon sandbox-agent-control-pointer"
      viewBox="0 0 20 20"
      width="20"
      height="20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g transform="translate(1.6 1)">
        <path d="M9.3 16.3 8.08 9.53a.63 .63 0 0 1 .85-.69L15 11.35a.63 .63 0 0 1-.03 1.18l-2.93 1a.63 .63 0 0 0-.37.34l-1.18 2.6a.63 .63 0 0 1-1.19-.17Z" transform="translate(0 .35)" fill="currentColor" stroke="none" />
      </g>
    </svg>
  </span>
</template>
<script setup lang="ts">
defineProps<{ running?: boolean }>()

// 白底挖掉放大后的光标；作为 CSS mask 作用在整层 SVG 上，才能裁到 CSS rotate 合成后的射线。
const rayMaskImage = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><defs><mask id="m" maskUnits="userSpaceOnUse"><rect x="-8" y="-8" width="36" height="36" fill="#fff"/><path d="M9.3 16.3 8.08 9.53a.63 .63 0 0 1 .85-.69L15 11.35a.63 .63 0 0 1-.03 1.18l-2.93 1a.63 .63 0 0 0-.37.34l-1.18 2.6a.63 .63 0 0 1-1.19-.17Z" transform="translate(1.6 1) translate(0 .35) translate(10.8 12.4) scale(1.28) translate(-10.8 -12.4)" fill="#000" stroke="#000" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/><ellipse cx="12.6" cy="16.9" rx="4.2" ry="3.4" fill="#000"/><ellipse cx="14.8" cy="14.6" rx="2.6" ry="2.4" fill="#000"/><circle cx="10.6" cy="17.8" r="2.8" fill="#000"/></mask></defs><rect x="-8" y="-8" width="36" height="36" fill="#fff" mask="url(#m)"/></svg>')}")`
const rayMaskStyle = {
  maskImage: rayMaskImage,
  maskSize: '100% 100%',
  maskRepeat: 'no-repeat',
  webkitMaskImage: rayMaskImage,
  webkitMaskSize: '100% 100%',
  webkitMaskRepeat: 'no-repeat',
}
</script>
