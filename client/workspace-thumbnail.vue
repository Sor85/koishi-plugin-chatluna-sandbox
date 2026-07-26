<template>
  <div class="webqq-space-thumbnail" aria-hidden="true">
    <!-- 迷你工作区以 4 倍卡片宽度渲染后整体 scale(0.25)，得到与真实工作区一致的字号比例，无需 JS 测量。 -->
    <div class="webqq-space-mini">
      <nav class="webqq-space-mini-rail">
        <span class="webqq-rail-button is-active"><IconMessageCircle :size="22" stroke-width="1.8" /></span>
        <span class="webqq-rail-button"><IconLayoutGrid :size="22" stroke-width="1.8" /></span>
        <span class="webqq-rail-button"><IconBug :size="22" stroke-width="1.8" /></span>
        <span class="webqq-rail-button"><IconUserCircle :size="22" stroke-width="1.8" /></span>
      </nav>
      <aside class="webqq-space-mini-sessions">
        <div v-for="session in preview.sessions" :key="session.id" class="webqq-space-mini-session" :class="{ 'is-active': session.active }">
          <WebqqAvatar class="webqq-avatar" :kind="session.avatarKind" :name="session.title" :avatar="session.avatar" :show-bot-badge="false" />
          <span class="webqq-space-mini-session-copy">
            <strong>{{ session.title }}</strong>
            <small>{{ session.preview }}</small>
          </span>
        </div>
        <p v-if="!preview.sessions.length" class="webqq-space-mini-empty">暂无会话</p>
      </aside>
      <main class="webqq-space-mini-chat">
        <template v-for="message in preview.messages" :key="message.id">
          <span v-if="message.event" class="webqq-message-event">{{ message.text }}</span>
          <div v-else class="webqq-message-row" :class="message.outgoing ? 'is-outgoing' : 'is-incoming'">
            <span class="webqq-message-avatar-wrap">
              <WebqqAvatar class="webqq-message-avatar" :kind="message.avatarKind" :name="message.authorName" :avatar="message.avatar" :show-bot-badge="false" />
            </span>
            <div class="webqq-message-content">
              <div v-if="!message.outgoing" class="webqq-sender-line"><span class="webqq-message-author">{{ message.authorName }}</span></div>
              <div class="webqq-message-body">
                <div class="webqq-message-bubble"><span>{{ message.text }}</span></div>
              </div>
            </div>
          </div>
        </template>
        <p v-if="!preview.messages.length" class="webqq-space-mini-empty">发送消息，验证插件行为</p>
      </main>
    </div>
    <!-- AI 控制中的游走光标放在 scale 层之外，保持真实尺寸覆盖在迷你界面上。 -->
    <AgentCursor v-if="running" :size="16" />
  </div>
</template>
<script setup lang="ts">
import { IconBug, IconLayoutGrid, IconMessageCircle, IconUserCircle } from '@tabler/icons-vue'
import { computed } from 'vue'
import AgentCursor from './agent-cursor.vue'
import WebqqAvatar from './webqq-avatar.vue'
import { buildWorkspacePreview } from './webqq/workspace-preview'
import type { SandboxSnapshot } from '../src/types'

const props = defineProps<{ snapshot: SandboxSnapshot; running?: boolean }>()
const preview = computed(() => buildWorkspacePreview(props.snapshot))
</script>
