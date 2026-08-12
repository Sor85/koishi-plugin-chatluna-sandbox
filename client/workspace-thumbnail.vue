<template>
  <div class="webqq-space-thumbnail" aria-hidden="true">
    <!-- 直接渲染正式工作区组件并整体等比缩小；inert 保证这份视觉副本不会进入键盘焦点链。 -->
    <div
      inert
      class="webqq-workspace webqq-space-thumbnail-workspace is-details-open"
      :class="{
        'is-frosted': appearance.enableWebQQFrostedGlass,
        'has-tim-tail': appearance.webQQTimBubbleTail,
      }"
      :data-color-mode="colorMode"
      data-mobile-view="messages"
      :style="{ '--webqq-accent': appearance.webQQAccentColor }"
    >
      <WebqqSidebar :model="models.sidebar" :color-mode="colorMode" />
      <WebqqChatPane :model="models.chatPane" preview />
      <WebqqDetailsPanel :model="models.detailsPanel" />
    </div>
    <!-- AI 控制中的游走光标放在 scale 层之外，保持真实尺寸覆盖在缩略图上。 -->
    <AgentCursor v-if="running" :size="16" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import AgentCursor from './agent-cursor.vue'
import WebqqChatPane from './webqq-chat-pane.vue'
import WebqqDetailsPanel from './webqq-details-panel.vue'
import WebqqSidebar from './webqq-sidebar.vue'
import { buildWorkspaceThumbnailModels } from './webqq/workspace-thumbnail-model'
import type { SandboxAppearance, SandboxSnapshot } from '../src/types'

const props = defineProps<{
  snapshot: SandboxSnapshot
  appearance: SandboxAppearance
  colorMode: 'light' | 'dark'
  running?: boolean
}>()
const models = computed(() => buildWorkspaceThumbnailModels(props.snapshot, props.appearance, props.colorMode))
</script>
