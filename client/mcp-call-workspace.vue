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

    <section class="webqq-mcp-call-filters" aria-label="MCP 调用筛选">
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
    </section>

    <p v-if="error" class="webqq-mcp-call-error" role="alert">{{ error }}</p>
    <div class="webqq-mcp-call-split">
      <section class="webqq-mcp-call-list-pane" aria-label="MCP 调用列表">
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
              <div class="webqq-mcp-call-item-title">
                <strong>{{ item.tool }}</strong>
                <Badge :class="item.status === 'error' ? 'webqq-mcp-call-status-error' : 'webqq-mcp-call-status-success'">
                  {{ item.status === 'error' ? '错误' : '成功' }}
                </Badge>
              </div>
              <time>{{ formatTime(item.createdAt) }} · {{ formatDuration(item.durationMs) }}</time>
            </header>
            <p>{{ item.credentialName }}{{ item.sourceIp ? ` · ${item.sourceIp}` : '' }}{{ item.spaceId ? ` · ${item.spaceId}` : '' }}</p>
            <p v-if="item.errorCode" class="webqq-mcp-call-trace">{{ item.errorCode }}</p>
          </button>
        </div>
      </section>

      <section class="webqq-mcp-call-detail-pane" aria-label="MCP 调用详情">
        <div v-if="detailLoading && !detail" class="webqq-mcp-call-empty">正在读取调用详情…</div>
        <div v-else-if="!detail" class="webqq-mcp-call-empty">选择一条记录查看参数和结果</div>
        <article v-else v-webqq-scrollbar class="webqq-mcp-call-detail">
          <header>
            <div class="webqq-mcp-call-item-title">
              <strong>{{ detail.tool }}</strong>
              <Badge :class="detail.status === 'error' ? 'webqq-mcp-call-status-error' : 'webqq-mcp-call-status-success'">
                {{ detail.status === 'error' ? '错误' : '成功' }}
              </Badge>
            </div>
            <time>{{ formatTime(detail.createdAt) }} · {{ formatDuration(detail.durationMs) }}</time>
          </header>
          <p>{{ detail.credentialName }}{{ detail.sourceIp ? ` · ${detail.sourceIp}` : '' }}{{ detail.spaceId ? ` · ${detail.spaceId}` : '' }}</p>
          <p v-if="detail.testRunId">测试关联：{{ detail.testRunId }}</p>
          <p v-if="detail.error" class="webqq-mcp-call-trace">
            {{ detail.error.code }} · {{ detail.error.message }}
          </p>
          <div class="webqq-mcp-call-payloads">
            <section>
              <h2>参数</h2>
              <pre v-webqq-scrollbar>{{ formatPayload(detail.arguments) }}</pre>
            </section>
            <section v-if="detail.result !== undefined">
              <h2>结果</h2>
              <pre v-webqq-scrollbar>{{ formatPayload(detail.result) }}</pre>
            </section>
            <section v-if="detail.error">
              <h2>错误</h2>
              <pre v-webqq-scrollbar>{{ formatPayload(detail.error) }}</pre>
            </section>
          </div>
        </article>
      </section>
    </div>
  </main>
</template>

<script setup lang="ts">
import { IconRefresh, IconTrash } from '@tabler/icons-vue'
import { computed, ref } from 'vue'
import { Badge } from './components/ui/badge'
import { Button } from './components/ui/button'
import { Checkbox } from './components/ui/checkbox'
import { Input } from './components/ui/input'
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
const selectedRecordId = computed(() => props.detail?.id)

function applyFilters() {
  emit('query', {
    tool: tool.value.trim() || undefined,
    credentialName: credentialName.value.trim() || undefined,
    spaceId: spaceId.value.trim() || undefined,
    testRunId: testRunId.value.trim() || undefined,
    errorsOnly: errorsOnly.value || undefined,
  })
}

function openRecord(recordId: string) {
  emit('open', { recordId })
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value))
}

function formatPayload(value: unknown) {
  return JSON.stringify(value, null, 2)
}
</script>
