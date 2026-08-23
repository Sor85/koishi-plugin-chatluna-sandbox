<template>
  <main class="chatluna-sandbox-chat webqq-mcp-call-workspace" aria-label="MCP 调用工作台">
    <header class="webqq-mcp-call-header">
      <div>
        <h1>MCP 调用</h1>
        <p>查看外部测试控制器的工具调用</p>
      </div>
      <div class="webqq-mcp-call-actions">
        <Button variant="outline" :disabled="loading" @click="applyFilters">
          <IconRefresh :size="16" aria-hidden="true" />
          刷新
        </Button>
        <Button variant="destructive" :disabled="loading || !records.length" @click="emit('clear')">
          <IconTrash :size="16" aria-hidden="true" />
          清理调用记录
        </Button>
      </div>
    </header>

    <p v-if="error" class="webqq-mcp-call-error" role="alert">{{ error }}</p>
    <div class="webqq-mcp-call-split">
      <section class="webqq-mcp-call-list-pane" aria-label="MCP 调用列表">
        <header class="webqq-mcp-call-list-toolbar">
          <h2>调用列表</h2>
          <div class="webqq-mcp-call-list-tools">
            <Popover v-model:open="filterOpen">
              <PopoverTrigger as-child>
                <Button
                  variant="outline"
                  size="icon-sm"
                  class="webqq-mcp-call-filter-trigger"
                  :class="{ 'is-filtered': filtersActive }"
                  :aria-label="`筛选 MCP 调用，当前：${filterSummary}`"
                >
                  <IconFilter :size="16" aria-hidden="true" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                class="webqq-mcp-call-filter-popover"
                aria-label="MCP 调用筛选"
              >
                <label>
                  <span>工具</span>
                  <Input v-model="tool" class="webqq-mcp-call-control" placeholder="例如 send_message" @keyup.enter="applyFilters" />
                </label>
                <label>
                  <span>凭证</span>
                  <Input v-model="credentialName" class="webqq-mcp-call-control" placeholder="例如 测试凭证" @keyup.enter="applyFilters" />
                </label>
                <label>
                  <span>空间</span>
                  <Input v-model="spaceId" class="webqq-mcp-call-control" placeholder="例如 space-1" @keyup.enter="applyFilters" />
                </label>
                <label>
                  <span>测试关联</span>
                  <Input v-model="testRunId" class="webqq-mcp-call-control" placeholder="例如 run-1" @keyup.enter="applyFilters" />
                </label>
                <label class="webqq-mcp-call-error-filter">
                  <Checkbox v-model="errorsOnly" />
                  <span>仅显示错误</span>
                </label>
                <Button variant="outline" size="sm" @click="resetFilters">重置</Button>
              </PopoverContent>
            </Popover>
          </div>
        </header>

        <div v-if="loading && !records.length" class="webqq-mcp-call-empty">正在读取 MCP 调用记录…</div>
        <div v-else-if="!records.length" class="webqq-mcp-call-empty">暂无符合条件的 MCP 调用记录</div>
        <div v-else v-webqq-scrollbar class="webqq-mcp-call-list">
          <button
            v-for="item in records"
            :key="item.id"
            type="button"
            class="webqq-mcp-call-item"
            :class="{ 'is-active': item.id === selectedRecordId }"
            @click="openRecord(item.id)"
          >
            <header>
              <div class="webqq-mcp-call-item-copy">
                <div class="webqq-mcp-call-item-name">
                  <strong>{{ item.tool }}</strong>
                  <Badge :class="statusClass(item.status)">{{ statusLabel(item.status) }}</Badge>
                  <Badge variant="outline" class="webqq-mcp-call-credential">{{ item.credentialName }}</Badge>
                </div>
                <div class="webqq-mcp-call-timing">
                  <time>
                    <IconCalendarTime :size="14" aria-hidden="true" />
                    {{ formatTime(item.createdAt) }}
                  </time>
                  <span>
                    <IconClock :size="14" aria-hidden="true" />
                    {{ formatDuration(item.durationMs) }}
                  </span>
                </div>
              </div>
            </header>
          </button>
        </div>
      </section>

      <section class="webqq-mcp-call-detail-pane" aria-label="MCP 调用详情">
        <div v-if="detailLoading && !detail" class="webqq-mcp-call-empty">正在读取调用详情…</div>
        <div v-else-if="!detail" class="webqq-mcp-call-empty">选择一条记录查看参数和结果</div>
        <article v-else v-webqq-scrollbar class="webqq-mcp-call-detail">
          <header>
            <div class="webqq-mcp-call-item-copy">
              <div class="webqq-mcp-call-item-name">
                <strong>{{ detail.tool }}</strong>
                <Badge :class="statusClass(detail.status)">{{ statusLabel(detail.status) }}</Badge>
              </div>
              <div class="webqq-mcp-call-timing">
                <time>
                  <IconCalendarTime :size="14" aria-hidden="true" />
                  {{ formatTime(detail.createdAt) }}
                </time>
                <span>
                  <IconClock :size="14" aria-hidden="true" />
                  {{ formatDuration(detail.durationMs) }}
                </span>
              </div>
            </div>
          </header>

          <div class="webqq-mcp-call-meta-list">
            <p class="webqq-mcp-call-meta">
              <IconKey :size="17" aria-hidden="true" />
              <span class="webqq-mcp-call-meta-label">凭证</span>
              <span class="webqq-mcp-call-meta-value">{{ detail.credentialName }}</span>
            </p>
            <p v-if="detail.sourceIp" class="webqq-mcp-call-meta">
              <IconWorld :size="17" aria-hidden="true" />
              <span class="webqq-mcp-call-meta-label">来源</span>
              <span class="webqq-mcp-call-meta-value">{{ detail.sourceIp }}</span>
            </p>
            <p v-if="detail.spaceId" class="webqq-mcp-call-meta">
              <IconBox :size="17" aria-hidden="true" />
              <span class="webqq-mcp-call-meta-label">空间</span>
              <span class="webqq-mcp-call-meta-value">{{ detail.spaceId }}</span>
            </p>
            <p v-if="detail.testRunId" class="webqq-mcp-call-meta">
              <IconTag :size="17" aria-hidden="true" />
              <span class="webqq-mcp-call-meta-label">测试关联</span>
              <span class="webqq-mcp-call-meta-value">{{ detail.testRunId }}</span>
            </p>
          </div>

          <section v-if="detail.error" class="webqq-mcp-call-error-diagnostic" aria-label="错误诊断">
            <header class="webqq-mcp-call-section-heading">
              <span>
                <IconAlertCircle :size="17" aria-hidden="true" />
                <strong>错误诊断</strong>
              </span>
            </header>
            <p class="webqq-mcp-call-trace">{{ detail.error.code }} · {{ detail.error.message }}</p>
          </section>

          <div class="webqq-mcp-call-payloads">
            <section>
              <header class="webqq-mcp-call-section-heading">
                <span>
                  <IconBraces :size="17" aria-hidden="true" />
                  <strong>参数</strong>
                </span>
              </header>
              <pre v-webqq-scrollbar>{{ formatPayload(detail.arguments) }}</pre>
            </section>
            <section v-if="detail.result !== undefined">
              <header class="webqq-mcp-call-section-heading">
                <span>
                  <IconBraces :size="17" aria-hidden="true" />
                  <strong>结果</strong>
                </span>
              </header>
              <pre v-webqq-scrollbar>{{ formatPayload(detail.result) }}</pre>
            </section>
            <section v-if="detail.error">
              <header class="webqq-mcp-call-section-heading">
                <span>
                  <IconAlertCircle :size="17" aria-hidden="true" />
                  <strong>错误</strong>
                </span>
              </header>
              <pre v-webqq-scrollbar>{{ formatPayload(detail.error) }}</pre>
            </section>
          </div>
        </article>
      </section>
    </div>
  </main>
</template>

<script setup lang="ts">
import {
  IconAlertCircle,
  IconBox,
  IconBraces,
  IconCalendarTime,
  IconClock,
  IconFilter,
  IconKey,
  IconRefresh,
  IconTag,
  IconTrash,
  IconWorld,
} from '@tabler/icons-vue'
import { computed, ref, watch } from 'vue'
import { Badge } from './components/ui/badge'
import { Button } from './components/ui/button'
import { Checkbox } from './components/ui/checkbox'
import { Input } from './components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from './components/ui/popover'
import { vWebqqScrollbar } from './webqq-scrollbar'
import { formatDuration } from './webqq/format-duration'
import type { ListSandboxMcpCallRecordsInput } from '../src/mcp/call-records'
import type { SandboxMcpCallRecord, SandboxMcpCallRecordListItem } from '../src/mcp/types'

const props = defineProps<{
  records: readonly SandboxMcpCallRecordListItem[]
  detail?: SandboxMcpCallRecord
  loading: boolean
  detailLoading: boolean
  error: string
}>()
const emit = defineEmits<{
  query: [input: ListSandboxMcpCallRecordsInput]
  open: [input: { recordId: string }]
  clear: []
}>()

const tool = ref('')
const credentialName = ref('')
const spaceId = ref('')
const testRunId = ref('')
const errorsOnly = ref(false)
const filterOpen = ref(false)
const selectedRecordId = computed(() => props.detail?.id)
const filtersActive = computed(() => Boolean(
  tool.value.trim()
  || credentialName.value.trim()
  || spaceId.value.trim()
  || testRunId.value.trim()
  || errorsOnly.value,
))
const filterSummary = computed(() => {
  const parts: string[] = []
  if (tool.value.trim()) parts.push(tool.value.trim())
  if (credentialName.value.trim()) parts.push(credentialName.value.trim())
  if (spaceId.value.trim()) parts.push(spaceId.value.trim())
  if (testRunId.value.trim()) parts.push(testRunId.value.trim())
  if (errorsOnly.value) parts.push('仅错误')
  return parts.length ? parts.join(' · ') : '无筛选'
})

watch(errorsOnly, () => {
  applyFilters()
})

watch(filterOpen, (open, wasOpen) => {
  if (wasOpen && !open) applyFilters()
})

function applyFilters() {
  emit('query', {
    tool: tool.value.trim() || undefined,
    credentialName: credentialName.value.trim() || undefined,
    spaceId: spaceId.value.trim() || undefined,
    testRunId: testRunId.value.trim() || undefined,
    errorsOnly: errorsOnly.value || undefined,
  })
}

function resetFilters() {
  tool.value = ''
  credentialName.value = ''
  spaceId.value = ''
  testRunId.value = ''
  errorsOnly.value = false
  applyFilters()
}

function openRecord(recordId: string) {
  emit('open', { recordId })
}

function statusLabel(status: SandboxMcpCallRecordListItem['status']) {
  return status === 'error' ? '错误' : '成功'
}

function statusClass(status: SandboxMcpCallRecordListItem['status']) {
  return status === 'error' ? 'webqq-mcp-call-status-error' : 'webqq-mcp-call-status-success'
}

function formatTime(value: string) {
  const date = new Date(value)
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function formatPayload(value: unknown) {
  return JSON.stringify(value, null, 2)
}
</script>
