<template>
  <main class="webqq-chat webqq-model-request-workspace" aria-label="模型请求工作台">
    <header class="webqq-model-request-header">
      <div>
        <h1>模型请求</h1>
        <p>查看实际上游对话模型交互的只读证据。列表只提供摘要，完整请求体和响应体需打开单条详情。</p>
      </div>
      <div class="webqq-model-request-actions">
        <label class="webqq-model-request-live">
          <Checkbox v-model="liveRefresh" aria-label="实时刷新" />
          <span>实时刷新</span>
        </label>
        <Button variant="outline" :disabled="loading" @click="refresh()">
          <IconRefresh :size="16" aria-hidden="true" />
          刷新
        </Button>
        <Button
          v-if="category === 'unattributed'"
          variant="destructive"
          :disabled="loading || !records.length"
          @click="openClearDialog"
        >
          <IconTrash :size="16" aria-hidden="true" />
          清理未归属记录
        </Button>
      </div>
    </header>

    <div v-if="capacityText || error" class="webqq-model-request-status">
      <p v-if="capacityText" class="webqq-model-request-capacity">{{ capacityText }}</p>
      <p v-if="error" class="webqq-model-request-error" role="alert">{{ error }}</p>
    </div>

    <div class="webqq-model-request-split">
      <section class="webqq-model-request-list-pane" aria-label="模型请求列表">
        <section class="webqq-model-request-filters" aria-label="模型请求分类">
          <label>
            <span>分类</span>
            <Select v-model="category">
              <SelectTrigger class="webqq-model-request-control" aria-label="按分类筛选">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="space">空间</SelectItem>
                <SelectItem value="unattributed">未归属</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label v-if="category === 'space'">
            <span>空间</span>
            <Select v-model="spaceId">
              <SelectTrigger class="webqq-model-request-control" aria-label="按空间筛选">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="space in spaces" :key="space.id" :value="space.id">
                  {{ space.name }}
                </SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label>
            <span>模型</span>
            <Input
              v-model="model"
              class="webqq-model-request-control"
              placeholder="例如 gpt-4.1"
              @keyup.enter="refresh()"
            />
          </label>
          <label class="webqq-model-request-error-filter">
            <Checkbox v-model="errorsOnly" />
            <span>仅显示错误</span>
          </label>
        </section>

        <div v-if="loading && !records.length" class="webqq-model-request-empty">正在读取模型请求记录…</div>
        <div v-else-if="!records.length" class="webqq-model-request-empty">暂无符合条件的模型请求记录</div>
        <div v-else v-webqq-scrollbar class="webqq-model-request-list">
          <button
            v-for="record in records"
            :key="record.id"
            type="button"
            class="webqq-model-request-item"
            :class="{ 'is-active': record.id === selectedRecordId }"
            @click="openRecord(record.id)"
          >
            <header>
              <div class="webqq-model-request-item-title">
                <span class="webqq-model-request-bot">
                  <WebqqAvatar
                    kind="bot"
                    :name="resolveRequestBot(record).name"
                    :avatar="resolveRequestBot(record).avatar"
                  />
                  <span class="webqq-model-request-bot-copy">
                    <span class="webqq-model-request-bot-name">
                      <strong>{{ resolveRequestBot(record).name }}</strong>
                      <Badge :class="statusClass(record.status)">{{ statusLabel(record.status) }}</Badge>
                      <Badge v-if="record.provider" variant="outline" class="webqq-model-request-provider">{{ record.provider }}</Badge>
                    </span>
                    <span class="webqq-model-request-timing">
                      <time>
                        <IconCalendarTime :size="14" aria-hidden="true" />
                        {{ formatTime(record.createdAt) }}
                      </time>
                      <span>
                        <IconClock :size="14" aria-hidden="true" />
                        {{ formatDuration(record.durationMs) }}
                      </span>
                    </span>
                  </span>
                </span>
              </div>
            </header>
            <p v-if="record.error" class="webqq-model-request-trace">{{ record.error.message }}</p>
          </button>
          <Button
            v-if="hasMore"
            variant="outline"
            class="webqq-model-request-more"
            :disabled="loading || nextCursor === undefined"
            @click="loadMore"
          >
            加载更多
          </Button>
        </div>
      </section>

      <section class="webqq-model-request-detail-pane" aria-label="模型请求详情">
        <div v-if="detailLoading && !detail" class="webqq-model-request-empty">正在读取请求详情…</div>
        <div v-else-if="!detail" class="webqq-model-request-empty">选择一条记录查看请求体和响应体</div>
        <article v-else v-webqq-scrollbar class="webqq-model-request-detail">
          <header>
            <div class="webqq-model-request-item-title">
              <span class="webqq-model-request-bot">
                <WebqqAvatar
                  kind="bot"
                  :name="resolveRequestBot(detail).name"
                  :avatar="resolveRequestBot(detail).avatar"
                />
                <span class="webqq-model-request-bot-copy">
                  <span class="webqq-model-request-bot-name">
                    <strong>{{ resolveRequestBot(detail).name }}</strong>
                  </span>
                  <span class="webqq-model-request-timing">
                    <time>
                      <IconCalendarTime :size="14" aria-hidden="true" />
                      {{ formatTime(detail.createdAt) }}
                    </time>
                  </span>
                </span>
              </span>
            </div>
          </header>
          <section class="webqq-model-request-overview" aria-label="请求概览">
            <header class="webqq-model-request-section-heading">
              <span>
                <IconLayoutGrid :size="17" aria-hidden="true" />
                <strong>概览</strong>
              </span>
              <Badge :class="statusClass(detail.status)">
                {{ statusLabel(detail.status) }}
              </Badge>
            </header>
            <div class="webqq-model-request-overview-grid">
              <article>
                <IconRoute :size="17" aria-hidden="true" />
                <span>渠道</span>
                <strong>{{ detail.provider || '未识别' }}</strong>
              </article>
              <article>
                <IconCpu :size="17" aria-hidden="true" />
                <span>模型 ID</span>
                <strong>{{ detailModel }}</strong>
              </article>
              <article>
                <IconClock :size="17" aria-hidden="true" />
                <span>耗时</span>
                <strong>{{ formatDuration(detail.durationMs) }}</strong>
              </article>
              <article>
                <IconBraces :size="17" aria-hidden="true" />
                <span>字段</span>
                <strong>{{ detail.summary.keys }}</strong>
              </article>
              <article>
                <IconMessages :size="17" aria-hidden="true" />
                <span>消息</span>
                <strong>{{ detail.summary.messageCount }}</strong>
              </article>
              <article>
                <IconTools :size="17" aria-hidden="true" />
                <span>工具</span>
                <strong>{{ detail.summary.toolCount }}</strong>
              </article>
            </div>
          </section>
          <section class="webqq-model-request-usage" aria-label="Token 用量">
            <header class="webqq-model-request-section-heading">
              <span>
                <IconChartBar :size="17" aria-hidden="true" />
                <strong>用量</strong>
              </span>
            </header>
            <div class="webqq-model-request-usage-grid">
              <article v-for="item in usageItems" :key="item.label">
                <span>{{ item.label }}</span>
                <strong>{{ formatTokenCount(item.value) }}</strong>
              </article>
            </div>
          </section>
          <div class="webqq-model-request-meta-list">
            <p v-if="detail.method || detail.url" class="webqq-model-request-meta">
              <IconWorld :size="17" aria-hidden="true" />
              <span class="webqq-model-request-meta-label">请求地址</span>
              <span class="webqq-model-request-meta-value webqq-model-request-endpoint">
                <strong v-if="detail.method">{{ detail.method }}</strong>
                <span v-if="detail.url">{{ detail.url }}</span>
              </span>
            </p>
            <p class="webqq-model-request-meta">
              <IconTopologyStar3 :size="17" aria-hidden="true" />
              <span class="webqq-model-request-meta-label">关联实体</span>
              <span class="webqq-model-request-meta-value">{{ formatEntities(detail) }}</span>
            </p>
            <p v-if="detail.interactionId" class="webqq-model-request-meta">
              <IconFingerprint :size="17" aria-hidden="true" />
              <span class="webqq-model-request-meta-label">交互标识</span>
              <span class="webqq-model-request-meta-value">{{ detail.interactionId }}</span>
            </p>
          </div>
          <p v-if="detail.error" class="webqq-model-request-trace">
            <IconAlertCircle :size="17" aria-hidden="true" />
            <span>{{ detail.error.message }} · trace {{ detail.error.traceId }}</span>
          </p>
          <section class="webqq-model-request-body">
            <div class="webqq-model-request-body-header">
              <div class="webqq-model-request-body-tabs" role="tablist" aria-label="模型请求内容">
                <Button
                  size="sm"
                  :variant="bodyView === 'request' ? 'secondary' : 'ghost'"
                  role="tab"
                  :aria-selected="bodyView === 'request'"
                  @click="bodyView = 'request'"
                >
                  请求
                </Button>
                <Button
                  size="sm"
                  :variant="bodyView === 'response' ? 'secondary' : 'ghost'"
                  role="tab"
                  :aria-selected="bodyView === 'response'"
                  @click="bodyView = 'response'"
                >
                  响应
                </Button>
              </div>
              <div class="webqq-model-request-body-actions">
                <div
                  v-if="bodyView === 'response' && detail.responseBodyStatus === 'complete'"
                  class="webqq-model-request-response-tabs"
                  role="tablist"
                  aria-label="响应体显示方式"
                >
                  <Button
                    size="xs"
                    :variant="responseView === 'content' ? 'secondary' : 'ghost'"
                    role="tab"
                    :aria-selected="responseView === 'content'"
                    @click="responseView = 'content'"
                  >
                    内容预览
                  </Button>
                  <Button
                    size="xs"
                    :variant="responseView === 'json' ? 'secondary' : 'ghost'"
                    role="tab"
                    :aria-selected="responseView === 'json'"
                    @click="responseView = 'json'"
                  >
                    {{ detail.responseBodyFormat === 'sse' ? '事件原文' : 'JSON 原文' }}
                  </Button>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  :disabled="!currentBodyText"
                  @click="copyCurrentBody"
                >
                  <IconCopy :size="16" aria-hidden="true" />
                  {{ copyState === 'success' ? '已复制' : copyState === 'error' ? '复制失败' : '复制' }}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  :disabled="!currentBodyText"
                  @click="downloadCurrentBody"
                >
                  <IconDownload :size="16" aria-hidden="true" />
                  下载
                </Button>
              </div>
            </div>

            <template v-if="bodyView === 'request'">
              <p v-if="!detail.requestBodyAvailable || detail.requestBody === undefined" class="webqq-model-request-empty">
                请求体不可用
              </p>
              <div v-else class="webqq-model-request-json-viewer">
                <ModelRequestJsonTree
                  :node="requestTree"
                  :open="true"
                  :root="true"
                  :strings-expanded="true"
                />
              </div>
            </template>

            <template v-else>
              <p class="webqq-model-request-response-meta">{{ responseBodyLabel }}</p>
              <p v-if="detail.responseBodyStatus === 'pending'" class="webqq-model-request-empty">
                正在采集响应体…
              </p>
              <p v-else-if="detail.responseBodyStatus === 'error'" class="webqq-model-request-error">
                响应体采集失败{{ detail.responseBodyError ? `：${detail.responseBodyError}` : '' }}
              </p>
              <p v-else-if="detail.responseBodyStatus !== 'complete'" class="webqq-model-request-empty">
                响应体不可用
              </p>
              <ModelResponseContentPreview
                v-else-if="responseView === 'content'"
                :preview="responseContent"
              />
              <template v-else>
                <div v-if="responsePreview.kind === 'json' || responsePreview.kind === 'sse'" class="webqq-model-request-json-viewer">
                  <ModelRequestJsonTree
                    :node="responseTree"
                    :open="true"
                    :root="true"
                    :strings-expanded="true"
                  />
                </div>
                <pre v-else-if="responsePreview.kind === 'text'" class="webqq-model-request-response-raw">{{ detail.responseBodyRaw }}</pre>
                <p v-else class="webqq-model-request-empty">响应体为空</p>
              </template>
            </template>
          </section>
        </article>
      </section>
    </div>

    <Dialog v-model:open="clearDialogOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ clearStep === 1 ? '清理未归属记录' : '再次确认清理' }}</DialogTitle>
          <DialogDescription>
            {{ clearStep === 1
              ? '将清理全部未归属模型请求记录，此操作不可恢复。'
              : '再次确认后才会清空未归属分类中的模型请求记录。' }}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="cancelClear">取消</Button>
          <Button v-if="clearStep === 1" variant="destructive" @click="clearStep = 2">继续</Button>
          <Button v-else variant="destructive" :disabled="loading" @click="confirmClear">确认清理</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </main>
</template>

<script setup lang="ts">
import {
  IconAlertCircle,
  IconBraces,
  IconCalendarTime,
  IconChartBar,
  IconClock,
  IconCpu,
  IconCopy,
  IconDownload,
  IconFingerprint,
  IconLayoutGrid,
  IconMessages,
  IconRefresh,
  IconRoute,
  IconTools,
  IconTopologyStar3,
  IconTrash,
  IconWorld,
} from '@tabler/icons-vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Badge } from './components/ui/badge'
import { Button } from './components/ui/button'
import { Checkbox } from './components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './components/ui/dialog'
import { Input } from './components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select'
import ModelRequestJsonTree from './model-request-json-tree.vue'
import ModelResponseContentPreview from './model-response-content-preview.vue'
import WebqqAvatar from './webqq-avatar.vue'
import { formatDuration } from './webqq/format-duration'
import { extractModelResponseContent, normalizeModelResponseUsage } from './webqq/model-response-content'
import { buildModelRequestJsonTree, parseModelResponseBody } from './webqq/model-request-json'
import { createModelRequestLiveRefresh } from './webqq/model-request-live-refresh'
import {
  createModelRequestRecordsQuery,
  MAIN_MODEL_REQUEST_SPACE_ID,
  MODEL_REQUEST_PAGE_SIZE,
  resolveModelRequestScope,
  type ClearModelRequestRecordsQuery,
  type ModelRequestRecordQuery,
  type ModelRequestRecordsQuery,
} from './webqq/model-request-query'
import { vWebqqScrollbar } from './webqq-scrollbar'
import type {
  SandboxModelRequestCapacity,
  SandboxModelRequestDetail,
  SandboxModelRequestListItem,
  SandboxModelRequestStatus,
  SandboxDirectoryBot,
} from '../src/types'

const props = defineProps<{
  records: readonly SandboxModelRequestListItem[]
  detail?: SandboxModelRequestDetail
  spaces: readonly { id: string, name: string }[]
  bots: readonly SandboxDirectoryBot[]
  defaultSpaceId?: string
  hasMore: boolean
  nextCursor?: number
  capacity?: SandboxModelRequestCapacity
  loading: boolean
  detailLoading: boolean
  error: string
}>()

const emit = defineEmits<{
  query: [input: ModelRequestRecordsQuery]
  loadMore: [input: ModelRequestRecordsQuery]
  open: [input: ModelRequestRecordQuery]
  clear: [input: ClearModelRequestRecordsQuery]
}>()

const category = ref<'space' | 'unattributed'>('space')
const spaceId = ref(props.defaultSpaceId || MAIN_MODEL_REQUEST_SPACE_ID)
const model = ref('')
const errorsOnly = ref(false)
const liveRefresh = ref(false)
const selectedRecordId = ref('')
const clearDialogOpen = ref(false)
const clearStep = ref<1 | 2>(1)
const bodyView = ref<'request' | 'response'>('request')
const responseView = ref<'content' | 'json'>('content')
const copyState = ref<'idle' | 'success' | 'error'>('idle')
let copyStateTimer: number | undefined

const liveRefreshController = createModelRequestLiveRefresh({
  isEnabled: () => liveRefresh.value,
  isVisible: () => typeof document === 'undefined' || document.visibilityState === 'visible',
  refresh: () => refresh(Math.min(Math.max(props.records.length, MODEL_REQUEST_PAGE_SIZE), 200)),
})

const requestTree = computed(() => buildModelRequestJsonTree(props.detail?.requestBody, 'requestBody'))
const responsePreview = computed(() => parseModelResponseBody(
  props.detail?.responseBodyRaw,
  props.detail?.responseBodyFormat,
))
const responseTree = computed(() => buildModelRequestJsonTree(responsePreview.value.value, 'responseBody'))
const responseContent = computed(() => extractModelResponseContent(responsePreview.value.value))
const responseUsage = computed(() => normalizeModelResponseUsage(responseContent.value.usage))
const detailModel = computed(() => {
  const detail = props.detail
  if (!detail) return '未识别'
  if (detail.model) return detail.model
  if (detail.requestBody && typeof detail.requestBody === 'object' && !Array.isArray(detail.requestBody)) {
    const model = (detail.requestBody as Record<string, unknown>).model
    if (typeof model === 'string' && model) return model
  }
  return '未识别'
})
const usageItems = computed(() => [
  { label: '输入', value: responseUsage.value?.inputTokens },
  { label: '输出', value: responseUsage.value?.outputTokens },
  { label: '推理', value: responseUsage.value?.reasoningTokens },
  { label: '缓存', value: responseUsage.value?.cachedTokens },
  { label: '总 Token', value: responseUsage.value?.totalTokens },
])
const currentBodyText = computed(() => {
  const detail = props.detail
  if (!detail) return ''
  if (bodyView.value === 'request') {
    if (!detail.requestBodyAvailable || detail.requestBody === undefined) return ''
    return serializeBody(detail.requestBody)
  }
  return detail.responseBodyStatus === 'complete' ? detail.responseBodyRaw ?? '' : ''
})
const responseBodyLabel = computed(() => {
  const detail = props.detail
  if (!detail) return ''
  const parts = [
    detail.responseStatus !== undefined ? `HTTP ${detail.responseStatus}` : undefined,
    detail.responseBodyFormat?.toUpperCase(),
  ].filter(Boolean)
  return parts.join(' · ') || '响应体'
})
const capacityText = computed(() => {
  const capacity = props.capacity
  if (!capacity) return ''
  return `${capacity.recordCount} / ${capacity.maxRecords} 条`
})

watch(() => props.defaultSpaceId, (value) => {
  if (value && category.value === 'space' && !props.spaces.some(({ id }) => id === spaceId.value)) {
    spaceId.value = value
  }
})

watch([category, spaceId], () => {
  selectedRecordId.value = ''
  refresh()
})

watch(() => props.detail?.id, () => {
  bodyView.value = 'request'
  responseView.value = 'content'
  resetCopyState()
})

watch(bodyView, resetCopyState)
watch(liveRefresh, () => liveRefreshController.sync())

function currentScope() {
  return resolveModelRequestScope(category.value, spaceId.value)
}

function emitQuery(limit = MODEL_REQUEST_PAGE_SIZE) {
  emit('query', createModelRequestRecordsQuery(currentScope(), {
    model: model.value.trim() || undefined,
    errorsOnly: errorsOnly.value || undefined,
    limit,
  }))
}

function refresh(limit = MODEL_REQUEST_PAGE_SIZE) {
  emitQuery(limit)
  if (selectedRecordId.value) {
    emit('open', { ...currentScope(), recordId: selectedRecordId.value })
  }
}

function loadMore() {
  if (props.nextCursor === undefined) return
  emit('loadMore', createModelRequestRecordsQuery(currentScope(), {
    model: model.value.trim() || undefined,
    errorsOnly: errorsOnly.value || undefined,
    beforeSequence: props.nextCursor,
  }))
}

function openRecord(recordId: string) {
  selectedRecordId.value = recordId
  emit('open', { ...currentScope(), recordId })
}

function openClearDialog() {
  clearStep.value = 1
  clearDialogOpen.value = true
}

function cancelClear() {
  clearDialogOpen.value = false
  clearStep.value = 1
}

function confirmClear() {
  emit('clear', { scope: 'unattributed' })
  selectedRecordId.value = ''
  cancelClear()
}

function resolveRequestBot(record: SandboxModelRequestListItem | SandboxModelRequestDetail): Pick<SandboxDirectoryBot, 'name' | 'avatar'> {
  const scopeId = record.entities.scopeId
  const botId = record.entities.botId
  const bot = props.bots.find((candidate) => candidate.id === botId && (
    candidate.source.type === 'main'
      ? scopeId === MAIN_MODEL_REQUEST_SPACE_ID
      : candidate.source.spaceId === scopeId
  ))
  if (bot) return bot
  return { name: botId ? `机器人 ${botId}` : '未归属机器人' }
}

function statusLabel(status: SandboxModelRequestStatus) {
  if (status === 'error') return '错误'
  if (status === 'pending') return '进行中'
  return '已完成'
}

function statusClass(status: SandboxModelRequestStatus) {
  if (status === 'error') return 'webqq-model-request-status-error'
  if (status === 'pending') return 'webqq-model-request-status-pending'
  return 'webqq-model-request-complete'
}

async function copyCurrentBody() {
  const text = currentBodyText.value
  if (!text) return
  try {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text)
        setCopyState('success')
        return
      } catch {
        // 局域网 HTTP 不属于安全上下文，Clipboard API 会被禁用，因此继续使用同步复制后备。
      }
    }
    copyTextForHttp(text)
    setCopyState('success')
  } catch {
    setCopyState('error')
  }
}

function copyTextForHttp(text: string) {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  Object.assign(textarea.style, {
    position: 'fixed',
    top: '0',
    left: '-9999px',
    opacity: '0',
  })
  document.body.append(textarea)
  textarea.select()
  textarea.setSelectionRange(0, textarea.value.length)
  const copied = document.execCommand('copy')
  textarea.remove()
  if (!copied) throw new Error('浏览器拒绝复制')
}

function downloadCurrentBody() {
  const detail = props.detail
  const text = currentBodyText.value
  if (!detail || !text) return
  const isRequest = bodyView.value === 'request'
  const isJson = isRequest || detail.responseBodyFormat === 'json'
  const extension = isJson ? 'json' : 'txt'
  const section = isRequest ? 'request' : 'response'
  const safeId = detail.id.replace(/[^a-zA-Z0-9_-]+/g, '-')
  const blob = new Blob([text], { type: isJson ? 'application/json;charset=utf-8' : 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `model-request-${safeId}-${section}.${extension}`
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

function setCopyState(state: 'success' | 'error') {
  if (copyStateTimer) clearTimeout(copyStateTimer)
  copyState.value = state
  copyStateTimer = window.setTimeout(() => {
    copyState.value = 'idle'
    copyStateTimer = undefined
  }, 1600)
}

function resetCopyState() {
  if (copyStateTimer) clearTimeout(copyStateTimer)
  copyStateTimer = undefined
  copyState.value = 'idle'
}

function serializeBody(value: unknown) {
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2) ?? String(value)
}

function formatTokenCount(value: number | undefined) {
  return value === undefined ? '—' : new Intl.NumberFormat('zh-CN').format(value)
}

function formatTime(value: string) {
  const date = new Date(value)
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function formatEntities(record: SandboxModelRequestDetail) {
  const entries = Object.entries(record.entities).filter((entry) => entry[1])
  return entries.length ? entries.map(([key, value]) => `${key}=${value}`).join(' · ') : '无关联实体'
}

function onVisibilityChange() {
  liveRefreshController.sync()
}

onMounted(() => {
  document.addEventListener('visibilitychange', onVisibilityChange)
  refresh()
})

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibilityChange)
  liveRefreshController.dispose()
  resetCopyState()
})
</script>
