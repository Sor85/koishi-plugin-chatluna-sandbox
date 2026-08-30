<template>
  <main class="chatluna-sandbox-chat webqq-debug-workspace" aria-label="OneBot 调试工作台">
    <header class="webqq-debug-header">
      <div>
        <h1>OneBot 调试</h1>
        <p>查看最近的 action、原始事件和错误</p>
      </div>
      <div class="webqq-debug-actions">
        <label class="webqq-debug-live">
          <Switch v-model="liveRefresh" aria-label="自动刷新" />
          <span>自动刷新</span>
        </label>
        <Button variant="outline" :disabled="loading" @click="refresh">
          <IconRefresh :size="16" aria-hidden="true" />
          刷新
        </Button>
        <Button variant="destructive" :disabled="loading || !records.length" @click="emit('clear')">
          <IconTrash :size="16" aria-hidden="true" />
          清理调试记录
        </Button>
      </div>
    </header>

    <p v-if="error" class="webqq-debug-error" role="alert">{{ error }}</p>
    <div class="webqq-debug-split">
      <section class="webqq-debug-list-pane" aria-label="调试记录列表">
        <header class="webqq-debug-list-toolbar webqq-overlay-header">
          <h2>调用列表</h2>
          <div class="webqq-debug-list-tools">
            <button
              type="button"
              class="webqq-debug-sort"
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
                  class="webqq-debug-filter-trigger"
                  :class="{ 'is-filtered': filtersActive }"
                  :aria-label="`筛选调试记录，当前：${filterSummary}`"
                >
                  <IconFilter :size="16" aria-hidden="true" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                class="webqq-debug-filter-popover relative"
                aria-label="调试记录筛选"
              >
                <label>
                  <span>机器人</span>
                  <Select v-model="botId">
                    <SelectTrigger class="webqq-debug-control" aria-label="按机器人筛选">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent :portal-to="filterSelectPortalTarget" class="z-[120]">
                      <SelectItem value="all">全部机器人</SelectItem>
                      <SelectItem v-for="bot in bots" :key="getBotKey(bot)" :value="getBotKey(bot)">
                        <span class="webqq-debug-bot-option">
                          <WebqqAvatar
                            class="webqq-debug-bot-avatar"
                            kind="bot"
                            :name="bot.name"
                            :avatar="bot.avatar"
                          />
                          <span class="webqq-debug-bot-copy">{{ bot.name }} · {{ bot.id }} · {{ bot.source.name }}</span>
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </label>
                <label>
                  <span>方向</span>
                  <Select v-model="direction">
                    <SelectTrigger class="webqq-debug-control" aria-label="按方向筛选">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent :portal-to="filterSelectPortalTarget" class="z-[120]">
                      <SelectItem value="all">全部方向</SelectItem>
                      <SelectItem value="action">Action 调用</SelectItem>
                      <SelectItem value="event">原始事件</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
                <label>
                  <span>规范 action</span>
                  <Input v-model="action" class="webqq-debug-control" placeholder="例如 get_group_info" @keyup.enter="applyFilters" />
                </label>
                <label>
                  <span>请求名</span>
                  <Input v-model="requestedAction" class="webqq-debug-control" placeholder="例如 getGroupInfo" @keyup.enter="applyFilters" />
                </label>
                <label class="webqq-debug-error-filter">
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

        <div v-if="loading && !records.length" class="webqq-debug-empty">正在读取调试记录…</div>
        <div v-else-if="!records.length" class="webqq-debug-empty">暂无符合条件的 OneBot 调试记录</div>
        <div v-else v-webqq-scrollbar class="webqq-debug-list">
          <button
            v-for="record in orderedRecords"
            :key="getRecordKey(record)"
            type="button"
            class="webqq-debug-item"
            :class="{ 'is-active': getRecordKey(record) === selectedRecordKey }"
            @click="openRecord(record)"
          >
            <header>
              <div class="webqq-debug-item-copy">
                <div class="webqq-debug-item-name">
                  <strong>{{ record.requestedAction }}</strong>
                  <Badge :class="statusClass(record.status)">{{ statusLabel(record.status) }}</Badge>
                  <Badge variant="outline" class="webqq-debug-direction">{{ directionLabel(record.direction) }}</Badge>
                  <Badge variant="outline" class="webqq-debug-source">{{ record.source.name }}</Badge>
                </div>
                <div class="webqq-debug-timing">
                  <time>
                    <IconCalendarTime :size="14" aria-hidden="true" />
                    {{ formatTime(record.createdAt) }}
                  </time>
                  <span>
                    <IconClock :size="14" aria-hidden="true" />
                    {{ formatDuration(record.durationMs) }}
                  </span>
                </div>
              </div>
            </header>
          </button>
        </div>
      </section>

      <section class="webqq-debug-detail-pane" aria-label="调试记录详情">
        <div v-if="detailLoading && !detail" class="webqq-debug-empty">正在读取调用详情…</div>
        <div v-else-if="!detail" class="webqq-debug-empty">选择一条记录查看输入和输出</div>
        <article v-else v-webqq-scrollbar class="webqq-debug-detail">
          <header>
            <div class="webqq-debug-item-copy">
              <div class="webqq-debug-item-name">
                <strong>{{ detail.requestedAction }}</strong>
                <Badge :class="statusClass(detail.status)">{{ statusLabel(detail.status) }}</Badge>
                <Badge variant="outline" class="webqq-debug-direction">{{ directionLabel(detail.direction) }}</Badge>
              </div>
              <div class="webqq-debug-timing">
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

          <div class="webqq-debug-meta-list">
            <p class="webqq-debug-meta">
              <IconRobot :size="17" aria-hidden="true" />
              <span class="webqq-debug-meta-label">机器人</span>
              <span class="webqq-debug-meta-value">{{ getBotName(detail) }} · {{ detail.botId }}</span>
            </p>
            <p class="webqq-debug-meta">
              <IconBox :size="17" aria-hidden="true" />
              <span class="webqq-debug-meta-label">来源</span>
              <span class="webqq-debug-meta-value">{{ detail.source.name }}</span>
            </p>
            <p class="webqq-debug-meta">
              <IconCpu :size="17" aria-hidden="true" />
              <span class="webqq-debug-meta-label">实现</span>
              <span class="webqq-debug-meta-value">{{ implementationLabel(detail.implementation) }}</span>
            </p>
            <p class="webqq-debug-meta">
              <IconLink :size="17" aria-hidden="true" />
              <span class="webqq-debug-meta-label">关联实体</span>
              <span class="webqq-debug-meta-value">{{ formatEntities(detail) }}</span>
            </p>
            <p v-if="detail.action !== detail.requestedAction" class="webqq-debug-meta">
              <IconArrowRight :size="17" aria-hidden="true" />
              <span class="webqq-debug-meta-label">规范 action</span>
              <span class="webqq-debug-meta-value">{{ detail.action }}</span>
            </p>
            <p v-if="detail.matchedAlias" class="webqq-debug-meta">
              <IconTag :size="17" aria-hidden="true" />
              <span class="webqq-debug-meta-label">别名命中</span>
              <span class="webqq-debug-meta-value">{{ detail.matchedAlias }}</span>
            </p>
          </div>

          <section
            v-if="detail.conversationObservation && conversationObservationCopy"
            class="webqq-debug-observation"
            aria-label="会话观察"
          >
            <header class="webqq-debug-section-heading">
              <span>
                <IconGitBranch :size="17" aria-hidden="true" />
                <strong>{{ conversationObservationCopy.title }}</strong>
              </span>
            </header>
            <p class="webqq-debug-observation-detail">
              {{ conversationObservationCopy.detail }}；事件来源 {{ detail.conversationObservation.eventConversationId }} · 实际会话 {{ detail.conversationObservation.conversationId }}
            </p>
          </section>

          <section v-if="detail.error" class="webqq-debug-error-diagnostic" aria-label="错误诊断">
            <header class="webqq-debug-section-heading">
              <span>
                <IconAlertCircle :size="17" aria-hidden="true" />
                <strong>错误诊断</strong>
              </span>
            </header>
            <p class="webqq-debug-trace">{{ detail.error.code }} · {{ detail.error.message }} · trace {{ detail.error.traceId }}</p>
          </section>

          <div class="webqq-debug-payloads">
            <section v-if="detail.payload !== undefined">
              <header class="webqq-debug-section-heading">
                <span>
                  <IconBraces :size="17" aria-hidden="true" />
                  <strong>{{ detail.direction === 'action' ? '输入' : '事件数据' }}</strong>
                </span>
              </header>
              <pre v-webqq-scrollbar>{{ formatPayload(detail.payload) }}</pre>
              <p v-if="countLargeValueSummaries(detail.payload)" class="webqq-debug-fold">
                已折叠 {{ countLargeValueSummaries(detail.payload) }} 个大型值（列表仅显示摘要，完整内容请通过单条详情接口展开）
              </p>
            </section>
            <section v-if="detail.result !== undefined">
              <header class="webqq-debug-section-heading">
                <span>
                  <IconBraces :size="17" aria-hidden="true" />
                  <strong>{{ detail.direction === 'action' ? '输出' : '处理结果' }}</strong>
                </span>
              </header>
              <pre v-webqq-scrollbar>{{ formatPayload(detail.result) }}</pre>
              <p v-if="countLargeValueSummaries(detail.result)" class="webqq-debug-fold">
                已折叠 {{ countLargeValueSummaries(detail.result) }} 个大型值（列表仅显示摘要，完整内容请通过单条详情接口展开）
              </p>
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
  IconArrowRight,
  IconBox,
  IconBraces,
  IconCalendarTime,
  IconChevronDown,
  IconChevronUp,
  IconClock,
  IconCpu,
  IconFilter,
  IconGitBranch,
  IconLink,
  IconRefresh,
  IconRobot,
  IconTag,
  IconTrash,
} from '@tabler/icons-vue'
import { computed, onActivated, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Badge } from './components/ui/badge'
import { Button } from './components/ui/button'
import { Checkbox } from './components/ui/checkbox'
import { Input } from './components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from './components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select'
import { Switch } from './components/ui/switch'
import WebqqAvatar from './webqq-avatar.vue'
import { vWebqqScrollbar } from './webqq-scrollbar'
import { formatDuration } from './webqq/format-duration'
import { createModelRequestEnterRefresh, createModelRequestLiveRefresh } from './webqq/model-request-live-refresh'
import type {
  GetSandboxOneBotDebugRecordInput,
  GetSandboxOneBotDebugRecordsInput,
  SandboxConsoleOneBotDebugRecord,
  SandboxDirectoryBot,
} from '../src/types'

const props = defineProps<{
  records: readonly SandboxConsoleOneBotDebugRecord[]
  detail?: SandboxConsoleOneBotDebugRecord
  bots: readonly SandboxDirectoryBot[]
  loading: boolean
  detailLoading: boolean
  error: string
  visitKey?: number
}>()
const emit = defineEmits<{
  query: [input: GetSandboxOneBotDebugRecordsInput]
  open: [input: GetSandboxOneBotDebugRecordInput & { spaceId?: string }]
  clear: []
}>()

/**
 * 会话观察的两种文案。它们不是错误提示，而是「沙盒对这次 action 做了什么」的事实说明：
 * 写入落点不归位，读取跟随来源会话。两条各自成句，用户不必自己推断方向。
 */
const CONVERSATION_OBSERVATION_COPY = {
  'reply-left-event-conversation': {
    title: '回复偏离了事件来源会话',
    detail: '原始 OneBot action 只能按账号或群号寻址，沙盒不替插件把回复归位到会话实例',
  },
  'history-followed-event-conversation': {
    title: '历史查询跟随了事件来源会话',
    detail: '沙盒按事件来源的会话实例作答，避免另一条对话线的历史静默变成模型输入',
  },
} as const

const botId = ref('all')
const direction = ref('all')
const action = ref('')
const requestedAction = ref('')
const errorsOnly = ref(false)
const sortOrder = ref<'asc' | 'desc'>('desc')
const liveRefresh = ref(false)
const filterOpen = ref(false)
const filterSelectPortalTarget = ref<HTMLElement>()
const selectedRecordKey = computed(() => props.detail ? getRecordKey(props.detail) : undefined)
const conversationObservationCopy = computed(() => {
  const kind = props.detail?.conversationObservation?.kind
  return kind ? CONVERSATION_OBSERVATION_COPY[kind] : undefined
})
const orderedRecords = computed(() => orderRecordsByTime(props.records, sortOrder.value))
const liveRefreshController = createModelRequestLiveRefresh({
  isEnabled: () => liveRefresh.value,
  isVisible: () => typeof document === 'undefined' || document.visibilityState === 'visible',
  refresh: () => refresh(),
})
const enterRefresh = createModelRequestEnterRefresh(() => refresh())
const filtersActive = computed(() => Boolean(
  botId.value !== 'all'
  || direction.value !== 'all'
  || action.value.trim()
  || requestedAction.value.trim()
  || errorsOnly.value,
))
const filterSummary = computed(() => {
  const parts: string[] = []
  if (botId.value !== 'all') {
    const bot = props.bots.find((item) => getBotKey(item) === botId.value)
    parts.push(bot?.name ?? botId.value)
  }
  if (direction.value === 'action') parts.push('Action 调用')
  if (direction.value === 'event') parts.push('原始事件')
  if (action.value.trim()) parts.push(action.value.trim())
  if (requestedAction.value.trim()) parts.push(requestedAction.value.trim())
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
watch(filterOpen, (open, wasOpen) => {
  if (wasOpen && !open) applyFilters()
})

function applyFilters() {
  emit('query', {
    botId: botId.value === 'all' ? undefined : props.bots.find((bot) => getBotKey(bot) === botId.value)?.id,
    direction: direction.value === 'action' || direction.value === 'event' ? direction.value : undefined,
    action: action.value.trim() || undefined,
    requestedAction: requestedAction.value.trim() || undefined,
    errorsOnly: errorsOnly.value || undefined,
    order: sortOrder.value,
  })
}

function refresh() {
  applyFilters()
  if (props.detail) openRecord(props.detail)
}

function toggleSortOrder() {
  sortOrder.value = sortOrder.value === 'desc' ? 'asc' : 'desc'
  applyFilters()
}

function orderRecordsByTime(
  records: readonly SandboxConsoleOneBotDebugRecord[],
  order: 'asc' | 'desc',
) {
  const sign = order === 'asc' ? 1 : -1
  return [...records].sort((left, right) => (
    sign * (left.createdAt.localeCompare(right.createdAt) || left.sequence - right.sequence)
  ))
}

function resetFilters() {
  botId.value = 'all'
  direction.value = 'all'
  action.value = ''
  requestedAction.value = ''
  errorsOnly.value = false
  applyFilters()
}

function openRecord(record: SandboxConsoleOneBotDebugRecord) {
  emit('open', {
    recordId: record.id,
    includeLargeValues: true,
    ...(record.source.type === 'test-space' ? { spaceId: record.source.spaceId } : {}),
  })
}

function getSourceKey(source: SandboxConsoleOneBotDebugRecord['source']) {
  return source.type === 'main' ? 'main' : `space:${source.spaceId}`
}

function getBotKey(bot: SandboxDirectoryBot) {
  return `${getSourceKey(bot.source)}:${bot.id}`
}

function getRecordKey(record: SandboxConsoleOneBotDebugRecord) {
  return `${getSourceKey(record.source)}:${record.id}`
}

function getBotName(record: SandboxConsoleOneBotDebugRecord) {
  const sourceKey = getSourceKey(record.source)
  return props.bots.find((bot) => bot.id === record.botId && getSourceKey(bot.source) === sourceKey)?.name ?? record.botId
}

function statusLabel(status: SandboxConsoleOneBotDebugRecord['status']) {
  return status === 'error' ? '错误' : '成功'
}

function statusClass(status: SandboxConsoleOneBotDebugRecord['status']) {
  return status === 'error' ? 'webqq-debug-status-error' : 'webqq-debug-status-success'
}

function directionLabel(value: SandboxConsoleOneBotDebugRecord['direction']) {
  return value === 'action' ? 'ACTION' : 'EVENT'
}

function implementationLabel(value: SandboxConsoleOneBotDebugRecord['implementation']) {
  return value === 'napcat' ? 'NapCat' : 'LLBot'
}

function formatTime(value: string) {
  const date = new Date(value)
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function formatEntities(record: SandboxConsoleOneBotDebugRecord) {
  const entries = Object.entries(record.entities).filter((entry) => entry[1])
  return entries.length ? entries.map(([key, value]) => `${key}=${value}`).join(' · ') : '无关联实体'
}

function formatPayload(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function isLargeValueSummary(value: unknown): boolean {
  return !!value && typeof value === 'object' && Reflect.get(value, 'kind') === 'large-value'
}

function countLargeValueSummaries(value: unknown): number {
  if (isLargeValueSummary(value)) return 1
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + countLargeValueSummaries(item), 0)
  if (!value || typeof value !== 'object') return 0
  return Object.values(value).reduce((sum, item) => sum + countLargeValueSummaries(item), 0)
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
