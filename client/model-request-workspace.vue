<template>
  <main class="chatluna-sandbox-chat webqq-model-request-workspace" aria-label="模型请求工作台">
    <header class="webqq-model-request-header">
      <div>
        <h1>模型请求</h1>
        <p>查看模型调用请求日志</p>
      </div>
      <div class="webqq-model-request-actions">
        <div class="webqq-model-request-action-row">
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
        <Button
          v-if="returnLabel"
          class="webqq-model-request-return"
          size="sm"
          variant="ghost"
          :aria-label="returnLabel"
          @click="returnFromDetail"
        >
          <IconArrowLeft data-icon="inline-start" aria-hidden="true" />
          返回
        </Button>
      </div>
    </header>

    <div v-if="error || navigationStatus" class="webqq-model-request-status">
      <p v-if="error" class="webqq-model-request-error" role="alert">{{ error }}</p>
      <p v-else role="status">{{ navigationStatus }}</p>
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

        <div v-if="loading && !displayRecords.length" class="webqq-model-request-empty">正在读取模型请求记录…</div>
        <div v-else-if="!displayRecords.length" class="webqq-model-request-empty">暂无符合条件的模型请求记录</div>
        <div v-else v-webqq-scrollbar class="webqq-model-request-list">
          <button
            v-for="record in displayRecords"
            :key="record.id"
            type="button"
            class="webqq-model-request-item"
            :class="{ 'is-selected': record.id === selectedRecordId }"
            :aria-current="record.id === selectedRecordId ? 'true' : undefined"
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
        <article v-else ref="detailElement" v-webqq-scrollbar class="webqq-model-request-detail">
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
            <div class="webqq-model-request-detail-nav">
              <section class="webqq-model-request-view-switch" aria-label="详情显示方式">
                <Button
                  size="sm"
                  :variant="detailView === 'evidence' ? 'secondary' : 'ghost'"
                  @click="detailView = 'evidence'"
                >
                  <IconFileCode data-icon="inline-start" aria-hidden="true" />
                  请求
                </Button>
                <Button
                  size="sm"
                  :variant="detailView === 'trajectory' ? 'secondary' : 'ghost'"
                  @click="detailView = 'trajectory'"
                >
                  <IconTimelineEvent data-icon="inline-start" aria-hidden="true" />
                  轨迹
                </Button>
              </section>
            </div>
          </header>

          <ModelRequestTrajectory
            v-if="detailView === 'trajectory'"
            :trajectory="conversationTrajectory"
            :detail="detail"
            mode="conversation"
            :show-mode-switch="false"
            :loading="detailLoading || trajectory?.mode !== 'conversation'"
            :conversation-available="Boolean(detail.entities.conversationId)"
            :navigation="navigation"
            :restore-state="navigation.viewRestore.value"
            @open-request="openRelatedRequest"
            @inspect-request="inspectRelatedRequest"
            @open-message="emit('openMessage', $event)"
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
                <strong>{{ detail.model || '未识别' }}</strong>
              </article>
              <article>
                <IconClock :size="17" aria-hidden="true" />
                <span>耗时</span>
                <strong>{{ formatDuration(detail.durationMs) }}</strong>
              </article>
              <article>
                <IconBraces :size="17" aria-hidden="true" />
                <span>字段</span>
                <strong>{{ detail.requestBodyKeyCount ?? '—' }}</strong>
              </article>
              <article>
                <IconMessages :size="17" aria-hidden="true" />
                <span>消息</span>
                <strong>{{ detail.evidenceCounts?.requestMessageCount ?? '—' }}</strong>
              </article>
              <article>
                <IconTools :size="17" aria-hidden="true" />
                <span>工具</span>
                <strong>{{ detail.evidenceCounts?.toolDefinitionCount ?? '—' }}</strong>
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
                <strong>{{ formatUsageValue(item) }}</strong>
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
          <section v-if="detail.status === 'error'" class="webqq-model-request-error-diagnostic" aria-label="错误诊断">
            <header class="webqq-model-request-section-heading">
              <span>
                <IconAlertCircle :size="17" aria-hidden="true" />
                <strong>错误诊断</strong>
              </span>
              <a
                v-if="detail.chatlunaError"
                :href="CHATLUNA_ERROR_CODE_DOCUMENTATION_URL"
                target="_blank"
                rel="noreferrer"
              >
                ChatLuna 错误码文档
              </a>
            </header>
            <dl class="webqq-model-request-error-details">
              <template v-if="detail.chatlunaError?.code !== undefined">
                <dt class="webqq-model-request-error-code-label">错误码</dt>
                <dd>
                  <Badge class="webqq-model-request-status-error webqq-model-request-error-code">
                    {{ detail.chatlunaError.code }}
                  </Badge>
                </dd>
              </template>
              <template v-if="detail.chatlunaError?.message">
                <dt>报错</dt>
                <dd>{{ detail.chatlunaError.message }}</dd>
              </template>
              <template v-if="detail.chatlunaError?.originMessage">
                <dt>原始原因</dt>
                <dd>{{ detail.chatlunaError.originMessage }}</dd>
              </template>
              <template v-if="detail.error">
                <dt>请求采集</dt>
                <dd class="webqq-model-request-capture-error">
                  <Badge class="webqq-model-request-status-error webqq-model-request-error-code">
                    {{ detail.error.message }}
                  </Badge>
                  <span class="webqq-model-request-error-trace">trace {{ detail.error.traceId }}</span>
                </dd>
              </template>
              <template v-if="chatlunaErrorCauses.length">
                <dt>可能的原因</dt>
                <dd>
                  <ul class="webqq-model-request-error-causes">
                    <li v-for="cause in chatlunaErrorCauses" :key="cause">{{ cause }}</li>
                  </ul>
                </dd>
              </template>
            </dl>
            <p v-if="detail.chatlunaError && !chatlunaErrorCauses.length" class="webqq-model-request-error-note">
              ChatLuna 文档没有为该错误码列出更具体的原因，请结合原始原因和响应原文排查。
            </p>
          </section>
          <section class="webqq-model-request-body">
            <div class="webqq-model-request-body-header">
              <div class="webqq-model-request-body-tabs" role="tablist" aria-label="模型请求内容">
                <Button
                  size="sm"
                  :variant="bodyView === 'analysis' ? 'secondary' : 'ghost'"
                  role="tab"
                  :aria-selected="bodyView === 'analysis'"
                  @click="bodyView = 'analysis'"
                >
                  分析
                </Button>
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
              <div v-if="bodyView !== 'analysis'" class="webqq-model-request-body-actions">
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

            <ModelRequestTrajectory
              v-else-if="bodyView === 'analysis'"
              class="webqq-model-request-analysis"
              :trajectory="requestTrajectory"
              mode="request"
              :show-mode-switch="false"
              :loading="detailLoading || trajectory?.mode !== 'request'"
              :conversation-available="false"
              :analysis="true"
              :detail="detail"
              :navigation="navigation"
              :external-locate="navigation.locateRequest.value"
              @open-request="openRelatedRequest"
              @locate-result="completeNavigationLocate"
              @open-message="emit('openMessage', $event)"
            />

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
                :response="responseConversation"
              />
              <template v-else>
                <div v-if="responseConversation.raw !== undefined && typeof responseConversation.raw !== 'string'" class="webqq-model-request-json-viewer">
                  <ModelRequestJsonTree
                    :node="responseTree"
                    :open="true"
                    :root="true"
                    :strings-expanded="true"
                  />
                </div>
                <pre v-else-if="detail.responseBodyRaw" class="webqq-model-request-response-raw">{{ detail.responseBodyRaw }}</pre>
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
  IconArrowLeft,
  IconBraces,
  IconCalendarTime,
  IconChartBar,
  IconChevronDown,
  IconChevronUp,
  IconClock,
  IconCpu,
  IconCopy,
  IconDownload,
  IconFileCode,
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
import { computed, nextTick, onActivated, onBeforeUnmount, onMounted, ref, watch } from 'vue'
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
import { CHATLUNA_ERROR_CODE_DOCUMENTATION_URL, getChatLunaErrorPossibleCauses } from '../src/chatluna-error'
import { formatDuration } from './webqq/format-duration'
import { parseModelResponseConversation } from './webqq/model-request-conversation'
import { buildModelRequestJsonTree } from './webqq/model-request-json'
import type { EvidenceNavigation } from './webqq/evidence-navigation'
import { createScrollRestore } from './webqq/scroll-restore'
import { createModelRequestEnterRefresh, createModelRequestLiveRefresh } from './webqq/model-request-live-refresh'
import {
  beginModelRequestListNavigation,
  clearModelRequestListSelection,
  resolveModelRequestListRecords,
  restoreModelRequestListSelection,
  selectModelRequestListRecord,
  type ModelRequestListSelectionState,
} from './webqq/model-request-list-selection'
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
import type { WebqqMessageNavigationTarget } from './webqq/message-navigation'
import type {
  SandboxModelRequestDetail,
  SandboxModelRequestScope,
  SandboxModelRequestListItem,
  SandboxModelRequestStatus,
  SandboxModelRequestTrajectory,
  SandboxModelRequestUsage,
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
  navigation: EvidenceNavigation
}>()

const emit = defineEmits<{
  query: [input: ModelRequestRecordsQuery]
  loadMore: [input: ModelRequestRecordsQuery]
  open: [input: ModelRequestRecordQuery]
  trajectory: [input: ModelRequestTrajectoryQuery]
  clear: [input: ClearModelRequestRecordsQuery]
  navigationFailure: [message: string]
  returnToPreset: []
  openMessage: [target: WebqqMessageNavigationTarget]
}>()

const category = ref<'all' | 'space' | 'unattributed'>('all')
const spaceId = ref(props.defaultSpaceId || MAIN_MODEL_REQUEST_SPACE_ID)
const model = ref('')
const errorsOnly = ref(false)
const sortOrder = ref<'asc' | 'desc'>('desc')
const filterOpen = ref(false)
const filterSelectPortalTarget = ref<HTMLElement>()
const liveRefresh = ref(false)
const selectionState = ref<ModelRequestListSelectionState>({ selectedRecordId: '' })
const selectedRecordId = computed({
  get: () => selectionState.value.selectedRecordId,
  set: (value: string) => { selectionState.value.selectedRecordId = value },
})
const detailView = ref<'trajectory' | 'evidence'>('evidence')
const clearDialogOpen = ref(false)
const clearStep = ref<1 | 2>(1)
const bodyView = ref<'request' | 'response' | 'analysis'>('analysis')
const navigationStatus = ref('')
const conversationTrajectory = computed(() => props.trajectory?.mode === 'conversation' ? props.trajectory : undefined)
const requestTrajectory = computed(() => props.trajectory?.mode === 'request' ? props.trajectory : undefined)
const responseView = ref<'content' | 'json'>('content')
const displayRecords = computed(() => resolveModelRequestListRecords(
  selectionState.value,
  props.records,
  props.detail,
))
const headersExpanded = ref(false)
const copyState = ref<'idle' | 'success' | 'error'>('idle')
const detailElement = ref<HTMLElement>()
// 返回按钮的存在、文案与去向都由导航 module 的 returnTarget 单点派生，不再各自判断一次。
const returnLabel = computed(() => {
  const target = props.navigation.returnTarget.value
  if (target === 'view') return '返回轨迹'
  return target === 'presets' ? '返回预设' : ''
})
// 返回时正文子树会被页签切换与异步数据重建，重建会把详情面板的 scrollTop 清零；
// scroll-restore 负责在有界帧窗口内把位置按回目标，单写一次一定会被后续重建抹掉。
const detailScrollRestore = createScrollRestore({
  measure: () => {
    const element = detailElement.value
    if (!element) return undefined
    return { scrollTop: element.scrollTop, maxScrollTop: element.scrollHeight - element.clientHeight }
  },
  scrollTo: (top) => {
    if (detailElement.value) detailElement.value.scrollTop = top
  },
  nextTick,
  frame: () => new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve())
  }),
})
let inspectRecordId: string | undefined
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
// 响应预览、原文树和用量候选都来自同一份共享模型证据投影，不再各自扫描响应体。
const responseConversation = computed(() => parseModelResponseConversation({
  responseBodyStatus: props.detail?.responseBodyStatus ?? 'unavailable',
  ...(props.detail?.responseBodyRaw !== undefined ? { responseBodyRaw: props.detail.responseBodyRaw } : {}),
  ...(props.detail?.responseBodyFormat ? { responseBodyFormat: props.detail.responseBodyFormat } : {}),
  ...(props.detail?.responseBodyError ? { responseBodyError: props.detail.responseBodyError } : {}),
  ...(props.detail?.usage ? { usage: props.detail.usage } : {}),
}))
const responseTree = computed(() => buildModelRequestJsonTree(responseConversation.value.raw, 'responseBody'))
// ADR-0059 的优先级已经在响应投影 adapter 里应用过：标准化 ChatLuna 用量优先于响应体候选。
const usage = computed<SandboxModelRequestUsage | undefined>(() => responseConversation.value.usage)
const chatlunaErrorCauses = computed(() => getChatLunaErrorPossibleCauses(props.detail?.chatlunaError))
const usageItems = computed(() => [
  { label: '输入', value: usage.value?.inputTokens, format: 'token' as const },
  { label: '输出', value: usage.value?.outputTokens, format: 'token' as const },
  { label: '推理', value: usage.value?.reasoningTokens, format: 'token' as const },
  { label: '缓存', value: usage.value?.cachedTokens, format: 'token' as const },
  { label: '总 Token', value: usage.value?.totalTokens, format: 'token' as const },
  { label: 'TTFT', value: usage.value?.ttftMs, format: 'duration' as const },
  { label: 'TPS', value: usage.value?.tps, format: 'rate' as const },
  { label: '总耗时', value: usage.value?.totalMs, format: 'duration' as const },
])
const currentBodyText = computed(() => {
  const detail = props.detail
  if (!detail) return ''
  if (bodyView.value === 'request') {
    if (!detail.requestBodyAvailable || detail.requestBody === undefined) return ''
    return serializeBody(detail.requestBody)
  }
  if (bodyView.value !== 'response') return ''
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
  // 统一进入状态本身声明「这是一次导航选中」；令牌由导航 module 持有，消费一次后失效。
  if (!props.navigation.preserveSelectionOnFilterChange()) {
    clearModelRequestListSelection(selectionState.value)
  }
  refresh()
})

watch(filterOpen, (open, wasOpen) => {
  if (wasOpen && !open) refresh()
})

watch(() => props.detail?.id, () => {
  if (inspectRecordId && props.detail?.id === inspectRecordId) {
    inspectRecordId = undefined
    return
  }
  inspectRecordId = undefined
  detailView.value = 'evidence'
  bodyView.value = 'analysis'
  responseView.value = 'content'
  headersExpanded.value = false
  restoreSelectionOnEnter()
  applyViewRestore()
  if (props.detail) fetchTrajectory(currentTrajectoryMode())
  resetCopyState()
})

watch(detailView, () => {
  fetchTrajectory(currentTrajectoryMode())
})

watch(bodyView, resetCopyState)
watch([liveRefresh, hasPendingRequest], () => liveRefreshController.sync(), { immediate: true })
watch(() => props.visitKey, () => {
  enterRefresh.schedule()
})

watch(() => props.navigation.entryState.value?.seq, () => {
  applyEntryState()
}, { immediate: true })

watch([() => props.detail?.id, () => props.trajectory], () => {
  arriveAtNavigationTarget()
})

function currentScope() {
  return resolveModelRequestScope(category.value, spaceId.value)
}

/**
 * 应用导航 module 交出的进入状态。
 *
 * 两条入口路径（聊天消息、预设工作台）共用这一份，因此不可能出现一条带列表选择保护、
 * 另一条不带的不对称——那正是预设路径原先没有列表高亮也不补入跨页目标的原因。
 */
function applyEntryState() {
  const state = props.navigation.entryState.value
  if (!state) return
  props.navigation.resetLocate()
  navigationStatus.value = state.status
  // 筛选侦听器只在这四个值真的变化时触发；没变化时保护必须当场失效，
  // 否则它会留到下一次用户主动改筛选，把那一次的清空也误挡掉。
  const filtersChanged = category.value !== state.category
    || spaceId.value !== state.spaceId
    || errorsOnly.value !== state.errorsOnly
  category.value = state.category
  spaceId.value = state.spaceId
  model.value = state.model
  errorsOnly.value = state.errorsOnly
  beginModelRequestListNavigation(selectionState.value, state.recordId)
  detailView.value = state.detailView
  bodyView.value = state.bodyView
  const scope = createSpaceModelRequestScope(state.spaceId)
  emit('query', createModelRequestRecordsQuery(scope, { order: sortOrder.value }))
  emit('open', { ...scope, recordId: state.recordId })
  emit('trajectory', { ...scope, recordId: state.recordId, mode: 'request' })
  props.navigation.applyEntry(state.seq, filtersChanged)
  arriveAtNavigationTarget()
}

function arriveAtNavigationTarget() {
  if (!props.navigation.arrive(props.detail, props.trajectory)) return
  detailView.value = 'evidence'
  bodyView.value = 'analysis'
}

function completeNavigationLocate(result: { seq: number, located: boolean }) {
  const acknowledged = props.navigation.acknowledgeLocate(result.seq, result.located)
  if (!acknowledged) return
  navigationStatus.value = result.located ? '已定位到预设表达式对应的精确文本。' : ''
  if (!result.located) {
    emit('navigationFailure', '已打开匹配的模型请求，但无法定位精确文本标记。')
  }
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
    emit('trajectory', { ...scope, recordId: selectedRecordId.value, mode: currentTrajectoryMode() })
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
  selectModelRequestListRecord(selectionState.value, recordId)
  inspectRecordId = undefined
  props.navigation.selectOtherRecord()
  const record = props.records.find(({ id }) => id === recordId)
  const scope = record ? resolveRecordScope(record) : currentScope()
  emit('open', { ...scope, recordId })
  emit('trajectory', { ...scope, recordId, mode: currentTrajectoryMode() })
}

function currentTrajectoryMode() {
  return detailView.value === 'trajectory' ? 'conversation' : 'request'
}

function fetchTrajectory(mode: 'request' | 'conversation') {
  const detail = props.detail
  if (!detail) return
  emit('trajectory', {
    ...resolveRecordScope(detail),
    recordId: detail.id,
    mode,
  })
}

function inspectRelatedRequest(payload: { recordId: string }) {
  if (props.detail?.id === payload.recordId) return
  const record = props.trajectory?.records.find(({ id }) => id === payload.recordId)
    ?? props.records.find(({ id }) => id === payload.recordId)
  const scope = record ? resolveRecordScope(record) : currentScope()
  // 轨迹检查器点到同会话另一条请求时，只换详情喂分析卡片，不离开轨迹、不重拉账本。
  inspectRecordId = payload.recordId
  selectedRecordId.value = payload.recordId
  emit('open', { ...scope, recordId: payload.recordId })
}

function openRelatedRequest(payload: {
  recordId: string
  returnState: {
    rowId: string
    scrollTop: number
  }
}) {
  inspectRecordId = undefined
  props.navigation.pushViewSnapshot({
    recordId: selectedRecordId.value,
    detailView: detailView.value,
    bodyView: bodyView.value,
    trajectoryMode: currentTrajectoryMode(),
    detailScrollTop: detailElement.value?.scrollTop ?? 0,
    trajectory: payload.returnState,
  })
  detailView.value = 'evidence'
  bodyView.value = 'request'
  responseView.value = 'content'
  headersExpanded.value = false
  selectedRecordId.value = payload.recordId
  const record = props.trajectory?.records.find(({ id }) => id === payload.recordId)
  const scope = record ? resolveRecordScope(record) : currentScope()
  emit('open', { ...scope, recordId: payload.recordId })
  emit('trajectory', { ...scope, recordId: payload.recordId, mode: 'request' })
  nextTick(() => {
    if (detailElement.value) detailElement.value.scrollTop = 0
  })
}

function returnFromDetail() {
  if (props.navigation.returnTarget.value === 'view') return returnToTrajectory()
  emit('returnToPreset')
}

function returnToTrajectory() {
  const state = props.navigation.beginViewReturn()
  if (!state) return
  selectedRecordId.value = state.recordId
  detailView.value = state.detailView
  bodyView.value = state.bodyView
  const record = props.trajectory?.records.find(({ id }) => id === state.recordId)
  const scope = record ? resolveRecordScope(record) : currentScope()
  emit('open', { ...scope, recordId: state.recordId })
  emit('trajectory', { ...scope, recordId: state.recordId, mode: state.trajectoryMode })
  applyViewRestore()
}

function applyViewRestore() {
  const state = props.navigation.takeViewRestore(props.detail?.id)
  if (!state) return
  // 跨请求返回时 detail.id watcher 会先把页签重置到“分析”；目标详情真正到达后，
  // 必须连同轨迹和滚动位置再次恢复视图快照，否则同请求测试通过但跨请求仍会落回分析页。
  detailView.value = state.detailView
  bodyView.value = state.bodyView
  void detailScrollRestore.restore(state.detailScrollTop)
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

function formatUsageValue(item: { value?: number, format: 'token' | 'duration' | 'rate' }) {
  if (item.format === 'duration') return formatDuration(item.value ?? Number.NaN)
  if (item.format === 'rate') return formatTokenRate(item.value)
  return formatTokenCount(item.value)
}

function formatTokenRate(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return '—'
  return `${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value)} /s`
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

function restoreSelectionOnEnter() {
  // 页面切换会销毁工作台组件，但工作区控制器会保留详情；普通返回没有 entryState，
  // 因此需要用这份权威详情恢复左侧选中态。导航进入时已有选择则不覆盖目标。
  if (selectedRecordId.value || props.navigation.entryState.value) return
  restoreModelRequestListSelection(selectionState.value, props.detail)
}

onMounted(() => {
  restoreSelectionOnEnter()
  document.addEventListener('visibilitychange', onVisibilityChange)
  enterRefresh.schedule()
})

onActivated(() => {
  restoreSelectionOnEnter()
  enterRefresh.schedule()
})

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibilityChange)
  liveRefreshController.dispose()
  resetCopyState()
})
</script>
