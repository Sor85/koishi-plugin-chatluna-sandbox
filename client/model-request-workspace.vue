<template>
  <main class="chatluna-sandbox-chat webqq-model-request-workspace" aria-label="模型请求工作台">
    <header class="webqq-model-request-header">
      <div>
        <h1>模型请求</h1>
        <p>查看模型调用请求日志</p>
      </div>
      <div class="webqq-model-request-actions">
        <label class="webqq-model-request-live">
          <Switch v-model="liveRefresh" aria-label="自动刷新" />
          <span>自动刷新</span>
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

    <div v-if="error" class="webqq-model-request-status">
      <p class="webqq-model-request-error" role="alert">{{ error }}</p>
    </div>

    <div class="webqq-model-request-split">
      <section class="webqq-model-request-list-pane" aria-label="模型请求列表">
        <header class="webqq-model-request-list-toolbar">
          <h2>请求列表</h2>
          <div class="webqq-model-request-list-tools">
            <button
              type="button"
              class="webqq-model-request-sort"
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
                  class="webqq-model-request-filter-trigger"
                  :class="{ 'is-filtered': filtersActive }"
                  :aria-label="`筛选模型请求，当前：${filterSummary}`"
                >
                  <IconFilter :size="16" aria-hidden="true" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                class="webqq-model-request-filter-popover relative"
                aria-label="模型请求筛选"
              >
              <label>
                <span>范围</span>
                <Select v-model="category">
                  <SelectTrigger class="webqq-model-request-control" aria-label="按范围筛选">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent :portal-to="filterSelectPortalTarget" class="z-[120]">
                    <SelectItem value="all">全部空间</SelectItem>
                    <SelectItem value="space">指定空间</SelectItem>
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
                  <SelectContent :portal-to="filterSelectPortalTarget" class="z-[120]">
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
              <Button variant="outline" size="sm" @click="resetFilters">重置</Button>
              <div
                ref="filterSelectPortalTarget"
                class="pointer-events-none absolute inset-0 z-[120] [&_[data-reka-popper-content-wrapper]]:pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
          </div>
        </header>

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
                      <Badge v-if="category === 'all'" variant="outline" class="webqq-model-request-source">{{ resolveRecordSpaceName(record) }}</Badge>
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
          <section class="webqq-model-request-view-switch" aria-label="详情显示方式">
            <Button
              size="sm"
              :variant="detailView === 'trajectory' ? 'secondary' : 'ghost'"
              @click="detailView = 'trajectory'"
            >
              <IconTimelineEvent data-icon="inline-start" aria-hidden="true" />
              轨迹
            </Button>
            <Button
              size="sm"
              :variant="detailView === 'evidence' ? 'secondary' : 'ghost'"
              @click="detailView = 'evidence'"
            >
              <IconBraces data-icon="inline-start" aria-hidden="true" />
              原始证据
            </Button>
          </section>

          <ModelRequestTrajectory
            v-if="detailView === 'trajectory'"
            :trajectory="trajectory"
            :mode="trajectoryMode"
            :loading="detailLoading"
            :conversation-available="Boolean(detail.entities.conversationId)"
            @update:mode="setTrajectoryMode"
            @open-request="openRelatedRequest"
          />
          <template v-else>
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
            <div v-if="detail.headers && Object.keys(detail.headers).length" class="webqq-model-request-meta webqq-model-request-headers">
              <IconBraces :size="17" aria-hidden="true" />
              <span class="webqq-model-request-meta-label">请求头</span>
              <div class="webqq-model-request-header-value">
                <Button
                  size="xs"
                  variant="ghost"
                  class="webqq-model-request-header-toggle"
                  :aria-expanded="headersExpanded"
                  @click="headersExpanded = !headersExpanded"
                >
                  {{ headersExpanded ? '收起 JSON' : `展开 JSON（${Object.keys(detail.headers).length} 项）` }}
                  <IconChevronDown :size="14" :class="{ 'is-expanded': headersExpanded }" aria-hidden="true" />
                </Button>
                <div v-if="headersExpanded" class="webqq-model-request-header-json">
                  <div class="webqq-model-request-json-viewer">
                    <ModelRequestJsonTree
                      :node="headersTree"
                      :open="true"
                      :root="true"
                      :strings-expanded="true"
                    />
                  </div>
                </div>
              </div>
            </div>

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
                  :images-preview="true"
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
          </template>
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
  IconChevronDown,
  IconChevronUp,
  IconClock,
  IconCpu,
  IconCopy,
  IconDownload,
  IconFilter,
  IconFingerprint,
  IconLayoutGrid,
  IconMessages,
  IconRefresh,
  IconRoute,
  IconTools,
  IconTimelineEvent,
  IconTopologyStar3,
  IconTrash,
  IconWorld,
} from '@tabler/icons-vue'
import { computed, onActivated, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Badge } from './components/ui/badge'
import { Button } from './components/ui/button'
import { Checkbox } from './components/ui/checkbox'
import { Switch } from './components/ui/switch'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './components/ui/dialog'
import { Input } from './components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from './components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select'
import ModelRequestJsonTree from './model-request-json-tree.vue'
import ModelRequestTrajectory from './model-request-trajectory.vue'
import ModelResponseContentPreview from './model-response-content-preview.vue'
import WebqqAvatar from './webqq-avatar.vue'
import { formatDuration } from './webqq/format-duration'
import { extractModelResponseContent, normalizeModelResponseUsage } from './webqq/model-response-content'
import { buildModelRequestJsonTree, parseModelResponseBody } from './webqq/model-request-json'
import { createModelRequestEnterRefresh, createModelRequestLiveRefresh } from './webqq/model-request-live-refresh'
import {
  createModelRequestRecordsQuery,
  createSpaceModelRequestScope,
  createUnattributedModelRequestScope,
  MAIN_MODEL_REQUEST_SPACE_ID,
  MODEL_REQUEST_PAGE_SIZE,
  resolveModelRequestScope,
  type ClearModelRequestRecordsQuery,
  type ModelRequestRecordQuery,
  type ModelRequestRecordsQuery,
  type ModelRequestTrajectoryQuery,
} from './webqq/model-request-query'
import { vWebqqScrollbar } from './webqq-scrollbar'
import type {
  SandboxModelRequestDetail,
  SandboxModelRequestScope,
  SandboxModelRequestListItem,
  SandboxModelRequestStatus,
  SandboxModelRequestTrajectory,
  SandboxDirectoryBot,
} from '../src/types'

const props = defineProps<{
  records: readonly SandboxModelRequestListItem[]
  detail?: SandboxModelRequestDetail
  trajectory?: SandboxModelRequestTrajectory
  spaces: readonly { id: string, name: string }[]
  bots: readonly SandboxDirectoryBot[]
  defaultSpaceId?: string
  hasMore: boolean
  nextCursor?: number
  nextCreatedAt?: string
  nextId?: string
  loading: boolean
  detailLoading: boolean
  error: string
  visitKey?: number
}>()

const emit = defineEmits<{
  query: [input: ModelRequestRecordsQuery]
  loadMore: [input: ModelRequestRecordsQuery]
  open: [input: ModelRequestRecordQuery]
  trajectory: [input: ModelRequestTrajectoryQuery]
  clear: [input: ClearModelRequestRecordsQuery]
}>()

const category = ref<'all' | 'space' | 'unattributed'>('all')
const spaceId = ref(props.defaultSpaceId || MAIN_MODEL_REQUEST_SPACE_ID)
const model = ref('')
const errorsOnly = ref(false)
const sortOrder = ref<'asc' | 'desc'>('desc')
const filterOpen = ref(false)
const filterSelectPortalTarget = ref<HTMLElement>()
const liveRefresh = ref(false)
const selectedRecordId = ref('')
const detailView = ref<'trajectory' | 'evidence'>('trajectory')
const trajectoryMode = ref<'request' | 'conversation'>('request')
const clearDialogOpen = ref(false)
const clearStep = ref<1 | 2>(1)
const bodyView = ref<'request' | 'response'>('request')
const responseView = ref<'content' | 'json'>('content')
const headersExpanded = ref(false)
const copyState = ref<'idle' | 'success' | 'error'>('idle')
let copyStateTimer: number | undefined

const hasPendingRequest = computed(() => (
  props.records.some(({ status }) => status === 'pending')
  || props.detail?.status === 'pending'
))
const liveRefreshController = createModelRequestLiveRefresh({
  isEnabled: () => liveRefresh.value || hasPendingRequest.value,
  isVisible: () => typeof document === 'undefined' || document.visibilityState === 'visible',
  refresh: () => refresh(Math.min(Math.max(props.records.length, MODEL_REQUEST_PAGE_SIZE), 200)),
})
const enterRefresh = createModelRequestEnterRefresh(() => refresh())

const requestTree = computed(() => buildModelRequestJsonTree(props.detail?.requestBody, 'requestBody'))
const headersTree = computed(() => buildModelRequestJsonTree(props.detail?.headers ?? {}, 'requestHeaders'))
const responsePreview = computed(() => parseModelResponseBody(
  props.detail?.responseBodyRaw,
  props.detail?.responseBodyFormat,
))
const responseTree = computed(() => buildModelRequestJsonTree(responsePreview.value, 'responseBody'))
const responseContent = computed(() => extractModelResponseContent(responsePreview.value.value))
const responseUsage = computed(() => normalizeModelResponseUsage(responseContent.value.usage))
const detailModel = computed(() => {
  const detail = props.detail
  if (!detail) return '未识别'
  if (detail.model) return detail.model
  if (detail.requestBody && typeof detail.requestBody === 'object' && !Array.isArray(detail.requestBody)) {
    const body = detail.requestBody as Record<string, unknown>
    const model = body.model ?? body.modelVersion
    if (typeof model === 'string' && model) return model
  }
  if (detail.url) {
    try {
      const match = new URL(detail.url).pathname.match(/\/models\/([^/:]+)(?::|$)/i)
      if (match?.[1]) return decodeURIComponent(match[1])
    } catch {
      // 历史记录中的地址可能不是标准 URL，无法回退提取模型名时继续显示未识别。
    }
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
const filtersActive = computed(() => Boolean(
  category.value !== 'all'
  || model.value.trim()
  || errorsOnly.value,
))
const filterSummary = computed(() => {
  const parts = [categoryLabel(category.value)]
  if (category.value === 'space') parts[0] = resolveSpaceName(spaceId.value)
  if (model.value.trim()) parts.push(model.value.trim())
  if (errorsOnly.value) parts.push('仅错误')
  return parts.join(' · ')
})

watch(() => props.defaultSpaceId, (value) => {
  if (value && category.value === 'space' && !props.spaces.some(({ id }) => id === spaceId.value)) {
    spaceId.value = value
  }
})

watch([category, spaceId, errorsOnly, sortOrder], () => {
  selectedRecordId.value = ''
  refresh()
})

watch(filterOpen, (open, wasOpen) => {
  if (wasOpen && !open) refresh()
})

watch(() => props.detail?.id, () => {
  bodyView.value = 'request'
  responseView.value = 'content'
  headersExpanded.value = false
  if (props.detail) requestTrajectory(trajectoryMode.value)
  resetCopyState()
})

watch(bodyView, resetCopyState)
watch([liveRefresh, hasPendingRequest], () => liveRefreshController.sync(), { immediate: true })
watch(() => props.visitKey, () => {
  enterRefresh.schedule()
})

function currentScope() {
  return resolveModelRequestScope(category.value, spaceId.value)
}

function emitQuery(limit = MODEL_REQUEST_PAGE_SIZE) {
  emit('query', createModelRequestRecordsQuery(currentScope(), {
    model: model.value.trim() || undefined,
    errorsOnly: errorsOnly.value || undefined,
    order: sortOrder.value,
    limit,
  }))
}

function refresh(limit = MODEL_REQUEST_PAGE_SIZE) {
  emitQuery(limit)
  if (selectedRecordId.value) {
    const record = props.records.find(({ id }) => id === selectedRecordId.value) ?? props.detail
    const scope = record ? resolveRecordScope(record) : currentScope()
    emit('open', { ...scope, recordId: selectedRecordId.value })
    // 同一条记录从进行中变为已完成时 id 不变，不能只靠详情 id watcher 重拉轨迹。
    emit('trajectory', { ...scope, recordId: selectedRecordId.value, mode: trajectoryMode.value })
  }
}

function loadMore() {
  const canPageByTime = Boolean(props.nextCreatedAt && props.nextId)
  if (props.nextCursor === undefined && !canPageByTime) return
  emit('loadMore', createModelRequestRecordsQuery(currentScope(), {
    model: model.value.trim() || undefined,
    errorsOnly: errorsOnly.value || undefined,
    order: sortOrder.value,
    ...(category.value === 'all'
      ? { beforeCreatedAt: props.nextCreatedAt, beforeId: props.nextId }
      : { beforeSequence: props.nextCursor }),
  }))
}

function toggleSortOrder() {
  sortOrder.value = sortOrder.value === 'desc' ? 'asc' : 'desc'
}

function openRecord(recordId: string) {
  selectedRecordId.value = recordId
  const record = props.records.find(({ id }) => id === recordId)
  const scope = record ? resolveRecordScope(record) : currentScope()
  emit('open', { ...scope, recordId })
  emit('trajectory', { ...scope, recordId, mode: trajectoryMode.value })
}

function requestTrajectory(mode: 'request' | 'conversation') {
  const detail = props.detail
  if (!detail) return
  emit('trajectory', {
    ...resolveRecordScope(detail),
    recordId: detail.id,
    mode,
  })
}

function setTrajectoryMode(mode: 'request' | 'conversation') {
  trajectoryMode.value = mode
  requestTrajectory(mode)
}

function openRelatedRequest(recordId: string) {
  selectedRecordId.value = recordId
  const record = props.trajectory?.records.find(({ id }) => id === recordId)
  const scope = record ? resolveRecordScope(record) : currentScope()
  emit('open', { ...scope, recordId })
  emit('trajectory', { ...scope, recordId, mode: trajectoryMode.value })
}

function resetFilters() {
  category.value = 'all'
  spaceId.value = props.defaultSpaceId || MAIN_MODEL_REQUEST_SPACE_ID
  model.value = ''
  errorsOnly.value = false
}

function categoryLabel(value: 'all' | 'space' | 'unattributed') {
  if (value === 'unattributed') return '未归属'
  if (value === 'space') return '指定空间'
  return '全部空间'
}

function resolveSpaceName(id: string) {
  return props.spaces.find((space) => space.id === id)?.name || (id === MAIN_MODEL_REQUEST_SPACE_ID ? '主环境' : id)
}

function resolveRecordSpaceName(record: SandboxModelRequestListItem | SandboxModelRequestDetail) {
  if (record.attribution === 'unattributed' || !record.entities.scopeId) return '未归属'
  return resolveSpaceName(record.entities.scopeId)
}

function resolveRecordScope(record: SandboxModelRequestListItem | SandboxModelRequestDetail): SandboxModelRequestScope {
  if (category.value === 'unattributed' || record.attribution === 'unattributed') {
    return createUnattributedModelRequestScope()
  }
  const scopeId = record.entities.scopeId
  if (scopeId && scopeId !== MAIN_MODEL_REQUEST_SPACE_ID) return createSpaceModelRequestScope(scopeId)
  return createSpaceModelRequestScope(MAIN_MODEL_REQUEST_SPACE_ID)
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
  enterRefresh.schedule()
})

onActivated(() => {
  enterRefresh.schedule()
})

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibilityChange)
  liveRefreshController.dispose()
  resetCopyState()
})
</script>
