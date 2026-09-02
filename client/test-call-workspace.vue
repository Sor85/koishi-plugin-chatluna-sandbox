<template>
  <main class="chatluna-sandbox-chat webqq-test-call-workspace" aria-label="测试调用工作台">
    <header class="webqq-test-call-header">
      <div>
        <h1>测试调用</h1>
        <p>查看外部测试控制器的工具调用</p>
      </div>
      <div class="webqq-test-call-actions">
        <label class="webqq-test-call-live">
          <Switch v-model="liveRefresh" aria-label="自动刷新" />
          <span>自动刷新</span>
        </label>
        <Button variant="outline" :disabled="loading" @click="refresh">
          <IconRefresh :size="16" aria-hidden="true" />
          刷新
        </Button>
        <Button variant="destructive" :disabled="loading || !records.length" @click="emit('clear')">
          <IconTrash :size="16" aria-hidden="true" />
          清理调用记录
        </Button>
      </div>
    </header>

    <p v-if="error" class="webqq-test-call-error" role="alert">{{ error }}</p>
    <div class="webqq-test-call-split">
      <section class="webqq-test-call-list-pane" aria-label="测试调用列表">
        <header class="webqq-test-call-list-toolbar webqq-overlay-header">
          <h2>调用列表</h2>
          <div class="webqq-test-call-list-tools">
            <button
              type="button"
              class="webqq-test-call-sort"
              :aria-label="sortOrder === 'asc' ? '当前按时间正序，点击改为倒序' : '当前按时间倒序，点击改为正序'"
              @click="toggleSortOrder"
            >
              {{ sortOrder === 'asc' ? '按时间正序' : '按时间倒序' }}
              <IconChevronUp v-if="sortOrder === 'asc'" :size="16" aria-hidden="true" />
              <IconChevronDown v-else :size="16" aria-hidden="true" />
            </button>
            <Popover v-model:open="filterOpen">
              <PopoverTrigger as-child>
                <Button
                  variant="outline"
                  size="icon-sm"
                  class="webqq-test-call-filter-trigger"
                  :class="{ 'is-filtered': filtersActive }"
                  :aria-label="`筛选测试调用，当前：${filterSummary}`"
                >
                  <IconFilter :size="16" aria-hidden="true" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                class="webqq-test-call-filter-popover"
                aria-label="测试调用筛选"
              >
                <label>
                  <span>工具</span>
                  <Input v-model="tool" class="webqq-test-call-control" placeholder="例如 send_message" @keyup.enter="applyFilters" />
                </label>
                <label>
                  <span>凭证</span>
                  <Input v-model="credentialName" class="webqq-test-call-control" placeholder="例如 测试凭证" @keyup.enter="applyFilters" />
                </label>
                <label>
                  <span>来路</span>
                  <Select v-model="transport">
                    <SelectTrigger class="webqq-test-call-control" aria-label="按协议表述筛选">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent :portal-to="filterSelectPortalTarget" class="z-[120]">
                      <SelectItem value="all">全部来路</SelectItem>
                      <SelectItem value="mcp">MCP 客户端</SelectItem>
                      <SelectItem value="http">HTTP 接口</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
                <label>
                  <span>空间</span>
                  <Input v-model="spaceId" class="webqq-test-call-control" placeholder="例如 space-1" @keyup.enter="applyFilters" />
                </label>
                <label>
                  <span>测试关联</span>
                  <Input v-model="testRunId" class="webqq-test-call-control" placeholder="例如 run-1" @keyup.enter="applyFilters" />
                </label>
                <label class="webqq-test-call-error-filter">
                  <Checkbox v-model="errorsOnly" />
                  <span>仅显示错误</span>
                </label>
                <Button variant="outline" size="sm" @click="resetFilters">重置</Button>
                <div
                  ref="filterSelectPortalTarget"
                  class="pointer-events-none absolute inset-0 z-[120] [&_[data-reka-popper-content-wrapper]]:pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>
        </header>

        <div v-if="loading && !records.length" class="webqq-test-call-empty">正在读取测试调用记录…</div>
        <div v-else-if="!records.length" class="webqq-test-call-empty">暂无符合条件的测试调用记录</div>
        <div v-else v-webqq-scrollbar class="webqq-test-call-list">
          <button
            v-for="item in orderedRecords"
            :key="item.id"
            type="button"
            class="webqq-test-call-item"
            :class="{ 'is-active': item.id === selectedRecordId }"
            @click="openRecord(item.id)"
          >
            <header>
              <div class="webqq-test-call-item-copy">
                <div class="webqq-test-call-item-name">
                  <strong>{{ item.tool }}</strong>
                  <Badge :class="statusClass(item.status)">{{ statusLabel(item.status) }}</Badge>
                  <Badge variant="outline" class="webqq-test-call-credential">{{ item.credentialName }}</Badge>
                </div>
                <div class="webqq-test-call-timing">
                  <time>
                    <IconCalendarTime :size="14" aria-hidden="true" />
                    {{ formatTime(item.createdAt) }}
                  </time>
                  <span>
                    <IconClock :size="14" aria-hidden="true" />
                    {{ formatDuration(item.durationMs) }}
                  </span>
                  <span>
                    <IconPlug :size="14" aria-hidden="true" />
                    {{ transportShortLabel(item.transport) }}
                  </span>
                </div>
              </div>
            </header>
          </button>
        </div>
      </section>

      <section class="webqq-test-call-detail-pane" aria-label="测试调用详情">
        <div v-if="detailLoading && !detail" class="webqq-test-call-empty">正在读取调用详情…</div>
        <div v-else-if="!detail" class="webqq-test-call-empty">选择一条记录查看参数和结果</div>
        <article v-else v-webqq-scrollbar class="webqq-test-call-detail">
          <header>
            <div class="webqq-test-call-item-copy">
              <div class="webqq-test-call-item-name">
                <strong>{{ detail.tool }}</strong>
                <Badge :class="statusClass(detail.status)">{{ statusLabel(detail.status) }}</Badge>
              </div>
              <div class="webqq-test-call-timing">
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

          <div class="webqq-test-call-meta-list">
            <p class="webqq-test-call-meta">
              <IconKey :size="17" aria-hidden="true" />
              <span class="webqq-test-call-meta-label">凭证</span>
              <span class="webqq-test-call-meta-value">{{ detail.credentialName }}</span>
            </p>
            <p class="webqq-test-call-meta">
              <IconPlug :size="17" aria-hidden="true" />
              <span class="webqq-test-call-meta-label">来路</span>
              <span class="webqq-test-call-meta-value">{{ transportLabel(detail.transport) }}</span>
            </p>
            <p v-if="detail.sourceIp" class="webqq-test-call-meta">
              <IconWorld :size="17" aria-hidden="true" />
              <span class="webqq-test-call-meta-label">来源</span>
              <span class="webqq-test-call-meta-value">{{ detail.sourceIp }}</span>
            </p>
            <p v-if="detail.spaceId" class="webqq-test-call-meta">
              <IconBox :size="17" aria-hidden="true" />
              <span class="webqq-test-call-meta-label">空间</span>
              <span class="webqq-test-call-meta-value">{{ detail.spaceId }}</span>
            </p>
            <p v-if="detail.testRunId" class="webqq-test-call-meta">
              <IconTag :size="17" aria-hidden="true" />
              <span class="webqq-test-call-meta-label">测试关联</span>
              <span class="webqq-test-call-meta-value">{{ detail.testRunId }}</span>
            </p>
          </div>

          <section v-if="detail.error" class="webqq-test-call-error-diagnostic" aria-label="错误诊断">
            <header class="webqq-test-call-section-heading">
              <span>
                <IconAlertCircle :size="17" aria-hidden="true" />
                <strong>错误诊断</strong>
              </span>
            </header>
            <p class="webqq-test-call-trace">{{ detail.error.code }} · {{ detail.error.message }}</p>
          </section>

          <div class="webqq-test-call-payloads">
            <section>
              <header class="webqq-test-call-section-heading">
                <span>
                  <IconBraces :size="17" aria-hidden="true" />
                  <strong>参数</strong>
                </span>
              </header>
              <pre v-webqq-scrollbar>{{ formatPayload(detail.arguments) }}</pre>
            </section>
            <section v-if="detail.result !== undefined">
              <header class="webqq-test-call-section-heading">
                <span>
                  <IconBraces :size="17" aria-hidden="true" />
                  <strong>结果</strong>
                </span>
              </header>
              <pre v-webqq-scrollbar>{{ formatPayload(detail.result) }}</pre>
            </section>
            <section v-if="detail.error">
              <header class="webqq-test-call-section-heading">
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
  IconChevronDown,
  IconChevronUp,
  IconClock,
  IconFilter,
  IconKey,
  IconPlug,
  IconRefresh,
  IconTag,
  IconTrash,
  IconWorld,
} from '@tabler/icons-vue'
import { computed, onActivated, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Badge } from '#client/components/ui/badge'
import { Button } from '#client/components/ui/button'
import { Checkbox } from '#client/components/ui/checkbox'
import { Input } from '#client/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '#client/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#client/components/ui/select'
import { Switch } from '#client/components/ui/switch'
import { vWebqqScrollbar } from './webqq-scrollbar'
import { formatDuration } from '#client/webqq/format-duration'
import { createModelRequestEnterRefresh, createModelRequestLiveRefresh } from '#client/webqq/model-request-live-refresh'
import type { ListSandboxTestCallRecordsInput } from '../src/mcp/call-records'
import type { SandboxTestCallRecord, SandboxTestCallRecordListItem, SandboxTestCallTransport } from '../src/mcp/types'

const props = defineProps<{
  records: readonly SandboxTestCallRecordListItem[]
  detail?: SandboxTestCallRecord
  loading: boolean
  detailLoading: boolean
  error: string
  visitKey?: number
}>()
const emit = defineEmits<{
  query: [input: ListSandboxTestCallRecordsInput]
  open: [input: { recordId: string }]
  clear: []
}>()

const tool = ref('')
const credentialName = ref('')
// 'all' 是筛选面板自己的空值表述，不是领域里的第三种来路；发查询时它被折成 undefined。
const transport = ref<SandboxTestCallTransport | 'all'>('all')
const spaceId = ref('')
const testRunId = ref('')
const errorsOnly = ref(false)
const sortOrder = ref<'asc' | 'desc'>('desc')
const liveRefresh = ref(false)
const filterOpen = ref(false)
const filterSelectPortalTarget = ref<HTMLElement>()
const selectedRecordId = computed(() => props.detail?.id)
const orderedRecords = computed(() => orderRecordsByTime(props.records, sortOrder.value))
const liveRefreshController = createModelRequestLiveRefresh({
  isEnabled: () => liveRefresh.value,
  isVisible: () => typeof document === 'undefined' || document.visibilityState === 'visible',
  refresh: () => refresh(),
})
const enterRefresh = createModelRequestEnterRefresh(() => refresh())
const filtersActive = computed(() => Boolean(
  tool.value.trim()
  || credentialName.value.trim()
  || transport.value !== 'all'
  || spaceId.value.trim()
  || testRunId.value.trim()
  || errorsOnly.value,
))
const filterSummary = computed(() => {
  const parts: string[] = []
  if (tool.value.trim()) parts.push(tool.value.trim())
  if (credentialName.value.trim()) parts.push(credentialName.value.trim())
  if (transport.value !== 'all') parts.push(transportLabel(transport.value))
  if (spaceId.value.trim()) parts.push(spaceId.value.trim())
  if (testRunId.value.trim()) parts.push(testRunId.value.trim())
  if (errorsOnly.value) parts.push('仅错误')
  return parts.length ? parts.join(' · ') : '无筛选'
})

watch(liveRefresh, () => liveRefreshController.sync(), { immediate: true })
watch(() => props.visitKey, () => {
  enterRefresh.schedule()
})
watch(errorsOnly, () => {
  applyFilters()
})
watch(transport, () => {
  applyFilters()
})
watch(filterOpen, (open, wasOpen) => {
  if (wasOpen && !open) applyFilters()
})

function applyFilters() {
  emit('query', {
    tool: tool.value.trim() || undefined,
    credentialName: credentialName.value.trim() || undefined,
    transport: transport.value === 'all' ? undefined : transport.value,
    spaceId: spaceId.value.trim() || undefined,
    testRunId: testRunId.value.trim() || undefined,
    errorsOnly: errorsOnly.value || undefined,
    order: sortOrder.value,
  })
}

function refresh() {
  applyFilters()
  if (props.detail) emit('open', { recordId: props.detail.id })
}

function toggleSortOrder() {
  sortOrder.value = sortOrder.value === 'desc' ? 'asc' : 'desc'
  applyFilters()
}

function orderRecordsByTime(
  records: readonly SandboxTestCallRecordListItem[],
  order: 'asc' | 'desc',
) {
  const sign = order === 'asc' ? 1 : -1
  return [...records].sort((left, right) => (
    sign * (left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
  ))
}

function resetFilters() {
  tool.value = ''
  credentialName.value = ''
  transport.value = 'all'
  spaceId.value = ''
  testRunId.value = ''
  errorsOnly.value = false
  applyFilters()
}

function openRecord(recordId: string) {
  emit('open', { recordId })
}

function statusLabel(status: SandboxTestCallRecordListItem['status']) {
  return status === 'error' ? '错误' : '成功'
}

function transportLabel(transport: SandboxTestCallTransport) {
  return transport === 'http' ? 'HTTP 接口' : 'MCP 客户端'
}

/**
 * 列表里的来路只写协议名。
 *
 * 时间行的三项加起来正好卡在列表窄栏的宽度上（实测容器 308px，完整文案下三项加间距 305~308px），
 * 「0 ms」比「1 ms」宽 3px 就足以让那些行折成两行，列表高度随耗时数字忽高忽低。缩成协议名后留出
 * 约 34px 余量，折行不再取决于耗时。完整文案仍出现在详情面板与筛选项里，语义没有丢。
 */
function transportShortLabel(transport: SandboxTestCallTransport) {
  return transport === 'http' ? 'HTTP' : 'MCP'
}

function statusClass(status: SandboxTestCallRecordListItem['status']) {
  return status === 'error' ? 'webqq-test-call-status-error' : 'webqq-test-call-status-success'
}

function formatTime(value: string) {
  const date = new Date(value)
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function formatPayload(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function onVisibilityChange() {
  liveRefreshController.sync()
}

onMounted(() => {
  document.addEventListener('visibilitychange', onVisibilityChange)
  enterRefresh.schedule()
})

onActivated(() => {
  enterRefresh.schedule()
})

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibilityChange)
  liveRefreshController.dispose()
})
</script>
