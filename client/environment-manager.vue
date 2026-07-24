<template>
  <section class="environment-manager" aria-label="模拟 QQ 环境管理">
    <header class="environment-header">
      <div>
        <small>环境管理</small>
        <h1>模拟 QQ 环境</h1>
        <p>集中查看模拟 QQ 环境中的普通用户、机器人和群组。</p>
      </div>
    </header>

    <nav class="environment-tabs" aria-label="环境目录类型">
      <button
        v-for="item in sections"
        :key="item.id"
        type="button"
        :class="{ 'is-active': section === item.id }"
        :aria-current="section === item.id ? 'page' : undefined"
        @click="section = item.id"
      >
        <component :is="item.icon" :size="17" aria-hidden="true" />
        {{ item.label }}
        <span>{{ item.count }}</span>
      </button>
    </nav>
    <div v-if="section === 'users'" v-webqq-scrollbar class="directory-list">
      <article v-for="user in users" :key="user.id" class="directory-card">
        <WebqqAvatar class="directory-avatar" kind="user" :name="user.name" :avatar="user.avatar" />
        <span class="directory-copy"><strong>{{ user.name }}</strong><small>{{ user.id }}</small></span>
      </article>
    </div>

    <div v-else-if="section === 'bots'" v-webqq-scrollbar class="directory-list">
      <article v-for="bot in bots" :key="bot.id" class="directory-card">
        <WebqqAvatar class="directory-avatar" kind="bot" :name="bot.name" :avatar="bot.avatar" />
        <span class="directory-copy">
          <strong>{{ bot.name }}</strong>
          <small>{{ bot.id }} · {{ bot.implementation === 'napcat' ? 'NapCat' : 'LLBot' }}</small>
        </span>
        <span :class="['status-pill', bot.enabled ? 'is-online' : 'is-offline']">
          {{ bot.enabled ? '已启用' : '已停用' }}
        </span>
      </article>
    </div>

    <div v-else v-webqq-scrollbar class="directory-list">
      <article v-for="group in snapshot.groups" :key="group.id" class="directory-card">
        <WebqqAvatar class="directory-avatar" kind="group" :name="group.name" />
        <span class="directory-copy"><strong>{{ group.name }}</strong><small>{{ group.id }} · {{ group.members.length }} 人</small></span>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { IconRobot, IconUser, IconUsers } from '@tabler/icons-vue'
import { computed, ref } from 'vue'
import WebqqAvatar from './webqq-avatar.vue'
import { vWebqqScrollbar } from './webqq-scrollbar'
import { getSandboxBots, getSandboxUsers, type SandboxSnapshot } from '../src/types'

const props = defineProps<{ snapshot: SandboxSnapshot }>()
const users = computed(() => getSandboxUsers(props.snapshot))
const bots = computed(() => getSandboxBots(props.snapshot))

type EnvironmentSection = 'users' | 'bots' | 'groups'
const section = ref<EnvironmentSection>('users')

const sections = computed(() => [
  { id: 'users' as const, label: '普通用户', icon: IconUser, count: users.value.length },
  { id: 'bots' as const, label: '机器人', icon: IconRobot, count: bots.value.length },
  { id: 'groups' as const, label: '群组', icon: IconUsers, count: props.snapshot.groups.length },
])

</script>

<style scoped>
.environment-manager {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  color: var(--webqq-text);
}

.environment-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 26px 28px 20px;
  border-bottom: 1px solid var(--webqq-border);
}

.environment-header small,
.environment-header p,
.directory-copy small {
  color: var(--webqq-muted);
}

.environment-header h1,
.environment-header p {
  margin: 0;
}

.environment-header h1 {
  margin-top: 4px;
  font-size: 22px;
}

.environment-header p {
  margin-top: 7px;
  font-size: 12px;
}

.environment-tabs {
  display: flex;
  gap: 8px;
  padding: 14px 28px;
  border-bottom: 1px solid var(--webqq-border);
}

.environment-tabs button {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  gap: 7px;
  padding: 0 11px;
  border-radius: 9px;
  color: var(--webqq-muted);
  background: transparent;
  font-size: 12px;
}

.environment-tabs button:hover,
.environment-tabs button:focus-visible,
.environment-tabs button.is-active {
  color: var(--webqq-accent);
  background: color-mix(in srgb, var(--webqq-accent) 10%, transparent);
}

.environment-tabs button span {
  min-width: 18px;
  padding: 1px 5px;
  border-radius: 999px;
  background: color-mix(in srgb, currentColor 10%, transparent);
  text-align: center;
  font-size: 10px;
}

.directory-list {
  display: grid;
  min-height: 0;
  align-content: start;
  gap: 8px;
  overflow: auto;
  padding: 20px 28px 28px;
}

.directory-card {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 11px 12px;
  border: 1px solid var(--webqq-border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--webqq-bg) 84%, transparent);
}

.directory-avatar {
  --webqq-avatar-size: 36px;
  --webqq-bot-badge-size: 15px;
  --webqq-bot-badge-offset: -2px;
  --webqq-bot-badge-border: 2px;

  display: inline-flex;
  width: 36px;
  height: 36px;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: #fff;
  background: #64748b;
  font-size: 12px;
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
  font-size: 13px;
}

.directory-copy small {
  margin-top: 3px;
  font-size: 11px;
}

.status-pill {
  padding: 3px 7px;
  border-radius: 999px;
  font-size: 10px;
}

.status-pill.is-online {
  color: #15803d;
  background: #dcfce7;
}

.status-pill.is-offline {
  color: #64748b;
  background: #e2e8f0;
}

@media (max-width: 560px) {
  .environment-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .environment-header,
  .environment-tabs,
  .directory-list {
    padding-right: 14px;
    padding-left: 14px;
  }

  .environment-tabs {
    flex-wrap: wrap;
  }
}
</style>
