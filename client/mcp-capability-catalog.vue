<template>
  <section v-webqq-scrollbar class="mcp-capability-catalog">
    <div v-if="loading" class="mcp-capability-state">正在读取 MCP 能力…</div>
    <div v-else-if="error" class="mcp-capability-state is-error">
      <p>{{ error }}</p>
      <Button size="sm" variant="outline" @click="$emit('retry')">重试</Button>
    </div>
    <template v-else-if="catalog">
      <div class="mcp-capability-summary" aria-label="MCP 能力摘要">
        <article><strong>{{ catalog.tools.length }}</strong><span>工具</span></article>
        <article><strong>{{ catalog.resources.length }}</strong><span>资源</span></article>
        <article><strong>{{ catalog.scopes.length }}</strong><span>权限范围</span></article>
      </div>

      <div class="mcp-capability-protocol">
        <span>Server capabilities</span>
        <Badge :variant="catalog.serverCapabilities.tools ? 'secondary' : 'outline'">Tools</Badge>
        <Badge :variant="catalog.serverCapabilities.resources ? 'secondary' : 'outline'">Resources</Badge>
        <Badge :variant="catalog.serverCapabilities.prompts ? 'secondary' : 'outline'">Prompts · 未提供</Badge>
      </div>

      <div class="mcp-capability-toolbar">
        <div class="mcp-capability-search">
          <IconSearch aria-hidden="true" />
          <Input v-model="query" placeholder="搜索工具名称、描述或权限" aria-label="搜索 MCP 工具" />
        </div>
        <div class="mcp-capability-tabs" aria-label="MCP 能力类型">
          <Button size="sm" :variant="kind === 'tools' ? 'secondary' : 'ghost'" @click="kind = 'tools'">工具</Button>
          <Button size="sm" :variant="kind === 'resources' ? 'secondary' : 'ghost'" @click="kind = 'resources'">资源</Button>
        </div>
      </div>

      <div v-if="kind === 'tools'" class="mcp-capability-filters" aria-label="工具权限筛选">
        <Button size="sm" :variant="scope === 'all' ? 'secondary' : 'ghost'" @click="scope = 'all'">全部</Button>
        <Button v-for="item in scopeOptions" :key="item.value" size="sm" :variant="scope === item.value ? 'secondary' : 'ghost'" @click="scope = item.value">
          {{ item.label }}
        </Button>
      </div>

      <div v-if="kind === 'tools'" class="mcp-capability-list">
        <Collapsible v-for="tool in filteredTools" :key="tool.name" class="mcp-capability-card">
          <CollapsibleTrigger class="mcp-capability-trigger">
            <span><strong>{{ tool.name }}</strong><small>{{ tool.description }}</small></span>
            <Badge variant="outline">{{ scopeLabel(tool.scope) }}</Badge>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div class="mcp-capability-schema">
              <span>输入 Schema</span>
              <pre>{{ formatSchema(tool.inputSchema) }}</pre>
            </div>
          </CollapsibleContent>
        </Collapsible>
        <p v-if="!filteredTools.length" class="mcp-capability-empty">没有匹配的 MCP 工具</p>
      </div>

      <div v-else class="mcp-capability-list">
        <article v-for="resource in filteredResources" :key="resource.uri" class="mcp-capability-card is-resource">
          <span><strong>{{ resource.name }}</strong><small>{{ resource.uri }}</small></span>
          <div class="mcp-capability-badges">
            <Badge v-for="requiredScope in resource.requiredScopes" :key="requiredScope" variant="outline">{{ scopeLabel(requiredScope) }}</Badge>
            <Badge variant="secondary">{{ resource.mimeType }}</Badge>
          </div>
        </article>
        <p v-if="!filteredResources.length" class="mcp-capability-empty">没有匹配的 MCP 资源</p>
      </div>
    </template>
    <div v-else class="mcp-capability-state">MCP 服务不可用</div>
  </section>
</template>

<script setup lang="ts">
import { IconSearch } from '@tabler/icons-vue'
import { computed, ref } from 'vue'
import { Badge } from './components/ui/badge'
import { Button } from './components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './components/ui/collapsible'
import { Input } from './components/ui/input'
import { vWebqqScrollbar } from './webqq-scrollbar'
import type { SandboxMcpCapabilityCatalog, SandboxMcpScope } from '../src/mcp/types'

defineEmits<{ retry: [] }>()
const props = defineProps<{
  catalog?: SandboxMcpCapabilityCatalog
  loading?: boolean
  error?: string
}>()

const query = ref('')
const kind = ref<'tools' | 'resources'>('tools')
const scope = ref<'all' | SandboxMcpScope>('all')
const scopeOptions = [
  { value: 'read' as const, label: '读取' },
  { value: 'interact' as const, label: '交互' },
  { value: 'manage' as const, label: '环境管理' },
  { value: 'debug' as const, label: '调试' },
]

const normalizedQuery = computed(() => query.value.trim().toLocaleLowerCase())
const filteredTools = computed(() => (props.catalog?.tools ?? []).filter((tool) => {
  if (scope.value !== 'all' && tool.scope !== scope.value) return false
  if (!normalizedQuery.value) return true
  return [tool.name, tool.description, scopeLabel(tool.scope)].some((value) => value.toLocaleLowerCase().includes(normalizedQuery.value))
}))
const filteredResources = computed(() => (props.catalog?.resources ?? []).filter((resource) => {
  if (!normalizedQuery.value) return true
  return [resource.name, resource.uri, resource.mimeType].some((value) => value.toLocaleLowerCase().includes(normalizedQuery.value))
}))

function scopeLabel(value: SandboxMcpScope) {
  return scopeOptions.find((item) => item.value === value)?.label ?? value
}

function formatSchema(schema: Record<string, unknown>) {
  return JSON.stringify(schema, null, 2)
}
</script>

<style scoped>
.mcp-capability-catalog {
  display: grid;
  min-height: 0;
  align-content: start;
  gap: 16px;
  overflow: auto;
  padding: 20px 28px 28px;
}

.mcp-capability-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.mcp-capability-summary article {
  display: grid;
  gap: 4px;
  padding: 12px 16px;
  border: 1px solid var(--webqq-border);
  border-radius: 12px;
  background: var(--webqq-surface-muted);
}

.mcp-capability-summary strong { font-size: 20px; }
.mcp-capability-summary span,
.mcp-capability-protocol > span,
.mcp-capability-card small,
.mcp-capability-schema > span,
.mcp-capability-empty,
.mcp-capability-state { color: var(--webqq-muted); font-size: 12px; }

.mcp-capability-protocol,
.mcp-capability-toolbar,
.mcp-capability-tabs,
.mcp-capability-filters,
.mcp-capability-badges {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mcp-capability-toolbar { justify-content: space-between; }
.mcp-capability-search { position: relative; min-width: 220px; flex: 1; }
.mcp-capability-search > svg { position: absolute; top: 50%; left: 12px; z-index: 1; width: 16px; height: 16px; color: var(--webqq-muted); transform: translateY(-50%); }
.mcp-capability-search [data-slot="input"] { padding-left: 36px; }
.mcp-capability-filters { flex-wrap: wrap; }
.mcp-capability-list { display: grid; gap: 8px; }

.mcp-capability-card {
  overflow: hidden;
  border: 1px solid var(--webqq-border);
  border-radius: 12px;
  background: var(--webqq-surface);
}

.mcp-capability-trigger,
.mcp-capability-card.is-resource {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border: 0;
  padding: 12px 16px;
  color: inherit;
  background: transparent;
  font: inherit;
  text-align: left;
}

.mcp-capability-trigger:hover { background: var(--webqq-hover); }
.mcp-capability-trigger > span,
.mcp-capability-card.is-resource > span { min-width: 0; }
.mcp-capability-card strong,
.mcp-capability-card small { display: block; }
.mcp-capability-card strong { overflow-wrap: anywhere; font-size: 13px; }
.mcp-capability-card small { margin-top: 4px; overflow-wrap: anywhere; }
.mcp-capability-badges { flex-shrink: 0; }

.mcp-capability-schema { display: grid; gap: 8px; padding: 0 16px 16px; }
.mcp-capability-schema pre {
  max-height: 280px;
  margin: 0;
  overflow: auto;
  padding: 12px;
  border-radius: 8px;
  color: var(--webqq-text);
  background: var(--webqq-surface-muted);
  font-size: 11px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.mcp-capability-state,
.mcp-capability-empty { padding: 32px 16px; text-align: center; }
.mcp-capability-state p { margin: 0 0 12px; }
.mcp-capability-state.is-error { color: #dc2626; }

@media (max-width: 640px) {
  .mcp-capability-catalog { padding-right: 14px; padding-left: 14px; }
  .mcp-capability-summary { grid-template-columns: 1fr; }
  .mcp-capability-toolbar { align-items: stretch; flex-direction: column; }
  .mcp-capability-search { min-width: 0; }
  .mcp-capability-trigger,
  .mcp-capability-card.is-resource { align-items: flex-start; flex-direction: column; }
  .mcp-capability-badges { flex-wrap: wrap; }
}
</style>
