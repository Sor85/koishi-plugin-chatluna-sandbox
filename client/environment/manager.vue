<template>
  <section class="environment-manager" aria-label="模拟 QQ 环境管理">
    <header class="environment-header">
      <div>
        <h1>环境管理</h1>
        <p>查看模拟 QQ 环境中的普通用户、机器人、群组、MCP 凭证和能力</p>
      </div>
    </header>

    <div class="environment-split">
      <section class="environment-list-pane" aria-label="环境管理范围">
        <header class="environment-list-toolbar webqq-overlay-header">
          <h2>管理范围</h2>
        </header>
        <nav class="environment-navigation" aria-label="环境目录类型">
          <Button
            v-for="item in sections"
            :key="item.id"
            :variant="section === item.id ? 'secondary' : 'ghost'"
            :aria-current="section === item.id ? 'page' : undefined"
            @click="section = item.id"
          >
            <component :is="item.icon" data-icon="inline-start" aria-hidden="true" />
            <span>{{ item.label }}</span>
            <Badge v-if="item.count !== undefined" variant="outline">{{ item.count }}</Badge>
          </Button>
        </nav>
      </section>

      <section class="environment-detail-pane" :aria-label="`${activeSection.label}目录`">
        <header class="environment-detail-toolbar">
          <div>
            <h2>{{ activeSection.label }}</h2>
            <p>{{ activeSection.description }}</p>
          </div>
        </header>

        <div v-if="section === 'users'" v-webqq-scrollbar class="directory-list">
          <article v-for="user in users" :key="user.id" class="directory-card">
            <WebqqAvatar class="directory-avatar" kind="user" :name="user.name" :avatar="user.avatar" />
            <span class="directory-copy"><strong>{{ user.name }}</strong><small>{{ user.id }}</small></span>
          </article>
          <p v-if="!users.length" class="environment-empty">当前环境没有普通用户</p>
        </div>

        <div v-else-if="section === 'bots'" v-webqq-scrollbar class="directory-list">
          <article v-for="bot in bots" :key="getBotKey(bot)" class="directory-card is-bot-row">
            <WebqqAvatar class="directory-avatar" kind="bot" :name="bot.name" :avatar="bot.avatar" />
            <span class="directory-copy">
              <strong>{{ bot.name }}</strong>
              <small>{{ bot.id }} · {{ bot.implementation === 'napcat' ? 'NapCat' : 'LLBot' }}</small>
            </span>
            <Badge variant="outline" class="directory-source">{{ bot.source.name }}</Badge>
            <Badge :variant="bot.enabled ? 'secondary' : 'outline'">{{ bot.enabled ? '已启用' : '已停用' }}</Badge>
          </article>
          <p v-if="!bots.length" class="environment-empty">当前环境没有机器人</p>
        </div>

        <McpCredentialManager v-else-if="section === 'credentials'" :port="port" />

        <McpCapabilityCatalog
          v-else-if="section === 'mcp-capabilities'"
          :catalog="mcpCapabilities"
          :loading="mcpCapabilitiesLoading"
          :error="mcpCapabilitiesError"
          @retry="loadMcpCapabilities"
        />

        <div v-else v-webqq-scrollbar class="directory-list">
          <article v-for="group in groups" :key="group.id" class="directory-card">
            <WebqqAvatar class="directory-avatar" kind="group" :name="group.name" :avatar="group.avatar" />
            <span class="directory-copy"><strong>{{ group.name }}</strong><small>{{ group.id }} · {{ group.members.length }} 人</small></span>
          </article>
          <p v-if="!groups.length" class="environment-empty">当前环境没有群组</p>
        </div>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import { IconKey, IconRobot, IconServerCog, IconUser, IconUsers } from '@tabler/icons-vue'
import { computed, onMounted, ref } from 'vue'
import { Badge } from '#client/components/ui/badge'
import { Button } from '#client/components/ui/button'
import McpCapabilityCatalog from '#client/mcp/capability-catalog.vue'
import McpCredentialManager from '#client/mcp/credential-manager.vue'
import WebqqAvatar from '#client/shared/avatar.vue'
import type { EnvironmentDirectoryModel } from './directory-model'
import type { McpAdminPort } from '#client/mcp/port'
import { createMcpCapabilityCatalogLoader } from '#client/mcp/shell'
import { vWebqqScrollbar } from '#client/shared/scrollbar'
import type { SandboxDirectoryBot } from '../../src/types'

const props = defineProps<{
  directory: EnvironmentDirectoryModel
  port: McpAdminPort
}>()
const users = computed(() => props.directory.users)
const bots = computed(() => props.directory.bots)
const groups = computed(() => props.directory.groups)

type EnvironmentSection = 'users' | 'bots' | 'groups' | 'credentials' | 'mcp-capabilities'
const section = ref<EnvironmentSection>('users')
const {
  catalog: mcpCapabilities,
  error: mcpCapabilitiesError,
  load: loadMcpCapabilities,
  loading: mcpCapabilitiesLoading,
} = createMcpCapabilityCatalogLoader(props.port)

const sections = computed(() => [
  { id: 'users' as const, label: '普通用户', description: '主环境中的普通 QQ 用户', icon: IconUser, count: users.value.length },
  { id: 'bots' as const, label: '机器人', description: '主环境和 AI 测试空间中的 OneBot 机器人', icon: IconRobot, count: bots.value.length },
  { id: 'groups' as const, label: '群组', description: '主环境中的 QQ 群组及成员数量', icon: IconUsers, count: groups.value.length },
  { id: 'credentials' as const, label: 'MCP 凭证', description: '管理 MCP 测试控制器的访问凭证', icon: IconKey, count: undefined },
  { id: 'mcp-capabilities' as const, label: 'MCP 能力', description: '查看服务器提供的工具、资源和协议能力', icon: IconServerCog, count: mcpCapabilities.value?.tools.length },
])
const activeSection = computed(() => sections.value.find(({ id }) => id === section.value) ?? sections.value[0])

function getBotKey(bot: SandboxDirectoryBot) {
  return bot.source.type === 'main' ? `main:${bot.id}` : `space:${bot.source.spaceId}:${bot.id}`
}

onMounted(() => void loadMcpCapabilities())
</script>

<style scoped>
.environment-manager {
  display: grid;
  min-width: 0;
  min-height: 0;
  flex: 1;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 16px;
  overflow: hidden;
  padding: 24px;
  color: var(--webqq-text);
  background: var(--webqq-bg);
}

.environment-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}

.environment-header h1 {
  margin: 0 0 8px;
  font-size: var(--webqq-font-3xl);
  font-weight: 700;
}

.environment-header p,
.environment-detail-toolbar p,
.directory-copy small,
.environment-empty {
  margin: 0;
  color: var(--webqq-muted);
  font-size: var(--webqq-font-md);
}

.environment-split {
  display: grid;
  grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);
  gap: 16px;
  min-height: 0;
}

.environment-list-pane,
.environment-detail-pane {
  display: grid;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--webqq-border);
  border-radius: 16px;
  background: var(--webqq-surface);
}

.environment-list-pane {
  grid-template-rows: auto minmax(0, 1fr);
}

.environment-detail-pane {
  grid-template-rows: auto minmax(0, 1fr);
}

.environment-list-toolbar,
.environment-detail-toolbar {
  display: flex;
  min-height: 56px;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--webqq-border);
  background: var(--webqq-surface);
}

.environment-list-toolbar {
  z-index: 2;
  --webqq-overlay-header-surface: var(--webqq-surface);
}

.environment-list-toolbar::before {
  border-radius: 15px 15px 0 0;
}

/* 左侧目录滚动到标题后方，保留原来的首项位置。 */
.environment-navigation {
  margin-top: -56px;
  padding-top: 64px;
  scroll-padding-top: 64px;
}

.environment-list-toolbar h2,
.environment-detail-toolbar h2 {
  margin: 0;
  color: var(--webqq-text);
  font-size: var(--webqq-font-xl);
  font-weight: 600;
}

.environment-detail-toolbar h2 {
  margin-bottom: 4px;
}

.environment-detail-toolbar p {
  font-size: var(--webqq-font-sm);
}

.environment-navigation {
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 4px;
  padding-right: 8px;
  padding-bottom: 8px;
  padding-left: 8px;
}

.environment-navigation [data-slot="button"] {
  width: 100%;
  justify-content: flex-start;
}

.environment-navigation [data-slot="badge"] {
  margin-left: auto;
}

.directory-list {
  display: grid;
  min-height: 0;
  align-content: start;
  gap: 8px;
  overflow: auto;
  padding: 8px;
}

.directory-card {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: transparent;
}

.directory-card:hover {
  background: var(--webqq-hover);
}

.directory-card.is-bot-row {
  grid-template-columns: 38px minmax(0, 1fr) auto auto;
}

.directory-source {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.directory-avatar {
  --webqq-avatar-size: 36px;

  display: inline-flex;
  width: 36px;
  height: 36px;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: #fff;
  /* 普通用户与 WebQQ 会话列表同用主题色；机器人/群组由 is-bot、is-group 覆盖。 */
  background: var(--webqq-accent);
  font-size: var(--webqq-font-sm);
  font-weight: 700;
}

.directory-avatar.is-group {
  background: #0f766e;
}

.directory-copy,
.directory-copy strong,
.directory-copy small {
  min-width: 0;
}

.directory-copy strong,
.directory-copy small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.directory-copy strong {
  font-size: var(--webqq-font-md);
}

.directory-copy small {
  margin-top: 3px;
  font-size: var(--webqq-font-xs);
}

.environment-empty {
  padding: 32px 16px;
  text-align: center;
}

@media (max-width: 960px) {
  .environment-manager {
    padding: 16px;
  }

  .environment-split {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(180px, 36%) minmax(0, 1fr);
  }

  .environment-navigation {
    overflow: auto;
  }
}

@media (max-width: 560px) {
  .environment-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .directory-card.is-bot-row {
    grid-template-columns: 38px minmax(0, 1fr) auto;
  }

  .directory-card.is-bot-row .directory-source {
    grid-column: 2;
    justify-self: start;
  }

  .directory-card.is-bot-row > [data-slot="badge"]:last-child {
    grid-column: 3;
    grid-row: 1 / span 2;
  }
}
</style>
