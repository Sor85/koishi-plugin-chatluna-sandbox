<template>
  <section class="webqq-space-overview" aria-label="AI 测试空间总览">
    <header class="webqq-space-toolbar">
      <div>
        <h1>AI 测试空间</h1>
        <p>{{ spaces.length }} 个隔离测试空间，按创建时间从旧到新排列</p>
      </div>
      <Select v-model="filter">
        <SelectTrigger class="w-36 border-slate-200 bg-white"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem v-for="item in filters" :key="item.value" :value="item.value">{{ item.label }}</SelectItem></SelectContent>
      </Select>
    </header>

    <div class="webqq-space-grid">
      <article class="webqq-space-card is-main" data-space-id="main" :data-layout-id="createWorkspaceLayoutId()" tabindex="0" @click="openCard(undefined)" @keydown.enter="openCard(undefined)">
        <WorkspaceThumbnail :snapshot="mainSnapshot" />
        <footer><div><strong>主模拟 QQ 环境</strong><small>固定空间 · 不可删除</small></div><Badge variant="secondary">主环境</Badge></footer>
      </article>

      <article
        v-for="space in filteredSpaces"
        :key="space.id"
        class="webqq-space-card"
        :class="{ 'is-running': space.status === 'running' }"
        :data-space-id="space.id"
        :data-layout-id="createWorkspaceLayoutId(space.id)"
        tabindex="0"
        @click="openCard(space.id)"
        @keydown.enter="openCard(space.id)"
      >
        <WorkspaceThumbnail :snapshot="space.snapshot" />
        <footer>
          <div><strong>{{ space.name }}</strong><small>{{ statusLabel(space.status) }} · {{ formatTime(space.createdAt) }}</small></div>
          <div class="webqq-space-card-actions" @click.stop>
            <Button v-if="space.status === 'running'" size="xs" variant="outline" @click="$emit('action', 'take-over', space.id)">接管</Button>
            <Button v-else-if="space.status === 'taken-over'" size="xs" variant="outline" @click="$emit('action', 'return', space.id)">归还</Button>
            <Button v-else size="xs" variant="outline" @click="$emit('action', 'reactivate', space.id)">重新激活</Button>
            <Button size="icon-xs" variant="ghost" aria-label="删除空间" @click="$emit('action', 'delete', space.id)"><IconTrash :size="14" /></Button>
          </div>
        </footer>
      </article>

      <button type="button" class="webqq-space-card webqq-space-create" @click="$emit('create')">
        <IconPlus :size="42" stroke-width="1.4" aria-hidden="true" />
        <strong>创建测试空间</strong>
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { IconPlus, IconTrash } from '@tabler/icons-vue'
import { Badge } from './components/ui/badge'
import { Button } from './components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select'
import WorkspaceThumbnail from './workspace-thumbnail.vue'
import { createWorkspaceLayoutId } from './webqq/workspace-transition'
import type { SandboxSnapshot } from '../src/types'
import type { SandboxTestSpaceStatus, SandboxTestSpaceSummary } from '../src/test-spaces'

const props = defineProps<{ spaces: SandboxTestSpaceSummary[]; mainSnapshot: SandboxSnapshot }>()
const emit = defineEmits<{
  enter: [spaceId?: string]
  create: []
  action: [action: 'take-over' | 'return' | 'reactivate' | 'delete', spaceId: string]
}>()
const filter = ref<'all' | SandboxTestSpaceStatus>('all')
const filters = [
  { value: 'all' as const, label: '全部空间' },
  { value: 'running' as const, label: '运行中' },
  { value: 'taken-over' as const, label: '已接管' },
  { value: 'completed' as const, label: '已完成' },
  { value: 'failed' as const, label: '已失败' },
]
const filteredSpaces = computed(() => filter.value === 'all' ? props.spaces : props.spaces.filter((space) => space.status === filter.value))

function statusLabel(status: SandboxTestSpaceStatus) {
  return status === 'running' ? 'AI 控制中' : status === 'taken-over' ? '用户已接管' : status === 'completed' ? '已完成' : '已失败'
}
function formatTime(value: string) { return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) }
function openCard(spaceId?: string) { emit('enter', spaceId) }
</script>
