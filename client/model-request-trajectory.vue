<template>
  <section class="webqq-model-trajectory" :class="{ 'is-analysis': analysis }" aria-label="模型请求轨迹">
    <header v-if="showModeSwitch || mode === 'conversation'" class="webqq-model-trajectory-scope">
      <div v-if="showModeSwitch" class="webqq-model-trajectory-mode" role="tablist" aria-label="轨迹范围">
        <Button
          size="sm"
          :variant="mode === 'request' ? 'secondary' : 'ghost'"
          role="tab"
          :aria-selected="mode === 'request'"
          @click="$emit('update:mode', 'request')"
        >
          单请求
        </Button>
        <Button
          size="sm"
          :variant="mode === 'conversation' ? 'secondary' : 'ghost'"
          role="tab"
          :aria-selected="mode === 'conversation'"
          :disabled="!conversationAvailable"
          @click="$emit('update:mode', 'conversation')"
        >
          完整会话
        </Button>
      </div>
      <div class="webqq-model-trajectory-summary">
        <span>{{ trajectory?.records.length ?? 0 }} 次请求</span>
        <span>{{ trajectory?.rows.length ?? 0 }} 条事件</span>
      </div>
    </header>

    <div v-if="loading && !trajectory" class="webqq-model-request-empty">正在组装轨迹…</div>
    <div v-else-if="!trajectory?.rows.length" class="webqq-model-request-empty">当前记录没有可投影的轨迹</div>
    <template v-else>
      <div class="webqq-model-trajectory-controls" role="toolbar" aria-label="轨迹显示控制">
        <div class="webqq-model-trajectory-control-actions">
          <Button
            v-if="mode === 'conversation'"
            size="sm"
            :variant="actualDuration ? 'secondary' : 'ghost'"
            :aria-pressed="actualDuration"
            aria-label="按实际耗时显示请求跨度"
            @click="actualDuration = !actualDuration"
          >
            <IconClockHour4 data-icon="inline-start" aria-hidden="true" />
            耗时
          </Button>
          <Button
            v-if="!analysis"
            size="sm"
            variant="ghost"
            :aria-pressed="requestsCollapsed"
            :aria-label="requestsCollapsed ? '展开请求内事件' : '折叠请求内事件'"
            @click="requestsCollapsed = !requestsCollapsed"
          >
            <IconSquarePlus v-if="requestsCollapsed" data-icon="inline-start" aria-hidden="true" />
            <IconSquareMinus v-else data-icon="inline-start" aria-hidden="true" />
            请求
          </Button>
          <Button
            v-for="option in pinnedKindOptions"
            :key="option.kind"
            size="sm"
            variant="ghost"
            :aria-pressed="hiddenKinds.has(option.kind)"
            :aria-label="`${hiddenKinds.has(option.kind) ? '显示' : '隐藏'} ${option.label} 证据`"
            @click="hiddenKinds = toggleFilterMember(hiddenKinds, option.kind)"
          >
            <IconSquarePlus v-if="hiddenKinds.has(option.kind)" data-icon="inline-start" aria-hidden="true" />
            <IconSquareMinus v-else data-icon="inline-start" aria-hidden="true" />
            {{ option.label }}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            :aria-expanded="filtersExpanded"
            :aria-controls="moreFiltersId"
            :aria-label="filtersExpanded ? '收起更多过滤选项' : '展开更多过滤选项'"
            @click="filtersExpanded = !filtersExpanded"
          >
            <IconChevronLeft v-if="filtersExpanded" data-icon="inline-start" aria-hidden="true" />
            <IconChevronRight v-else data-icon="inline-start" aria-hidden="true" />
            {{ filtersExpanded ? '收起' : '更多' }}
          </Button>
        </div>
        <div
          :id="moreFiltersId"
          class="webqq-model-trajectory-control-filters"
          :class="{ 'is-collapsed': !filtersExpanded }"
          role="group"
          aria-label="更多证据过滤"
        >
          <div class="webqq-model-trajectory-control-filters-inner">
            <Button
              v-for="option in collapsedKindOptions"
              :key="option.kind"
              size="sm"
              variant="ghost"
              :aria-pressed="hiddenKinds.has(option.kind)"
              :aria-label="`${hiddenKinds.has(option.kind) ? '显示' : '隐藏'} ${option.label} 证据`"
              @click="hiddenKinds = toggleFilterMember(hiddenKinds, option.kind)"
            >
              <IconSquarePlus v-if="hiddenKinds.has(option.kind)" data-icon="inline-start" aria-hidden="true" />
              <IconSquareMinus v-else data-icon="inline-start" aria-hidden="true" />
              {{ option.label }}
            </Button>
          </div>
        </div>
        <label class="webqq-model-trajectory-search">
          <IconSearch aria-hidden="true" />
          <Input v-model="searchQuery" type="search" aria-label="搜索轨迹事件" placeholder="搜索" />
        </label>
      </div>

      <TooltipProvider :delay-duration="500">
        <section
          v-if="compositionTracks.length"
          class="webqq-model-trajectory-composition"
          :style="{ minHeight: `${Math.max(50, compositionTracks.length * 14 + 8)}px` }"
          aria-label="请求体提示词内容占比"
        >
          <div class="webqq-model-trajectory-composition-labels" aria-hidden="true">
            <span v-for="track in compositionTracks" :key="track.kind">{{ promptKindLabel(track.kind) }}</span>
          </div>
          <div class="webqq-model-trajectory-composition-tracks">
            <span
              v-for="boundary in compositionBoundaries"
              :key="boundary.id"
              class="webqq-model-trajectory-boundary"
              :style="{ left: `${boundary.left}%` }"
              aria-hidden="true"
            />
            <div v-for="track in compositionTracks" :key="track.kind" class="webqq-model-trajectory-composition-track">
              <Tooltip v-for="segment in track.segments" :key="segment.id">
                <TooltipTrigger as-child>
                  <button
                    type="button"
                    class="webqq-model-trajectory-composition-bar"
                    :class="[
                      promptBarClass(segment.kind),
                      { 'is-selected': isCompositionSegmentSelected(segment) },
                    ]"
                    :style="{ left: `${segment.left}%`, width: `${segment.width}%` }"
                    :aria-label="`${promptKindLabel(segment.kind)} 占请求体提示内容的 ${formatPercentage(segment.percentage)}`"
                    @click="selectPromptSegment(segment)"
                  />
                </TooltipTrigger>
                <TooltipContent side="top">
                  <strong>{{ promptKindLabel(segment.kind) }} · {{ formatPercentage(segment.percentage) }}</strong>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </section>
        <div v-else class="webqq-model-trajectory-composition-empty">
          {{ mode === 'conversation' ? '当前会话没有可投影的请求组成' : '当前请求体没有可统计的提示词内容' }}
        </div>
      </TooltipProvider>

      <p v-if="mode === 'conversation' && hasUnknownTiming" class="webqq-model-trajectory-timing-note">
        进行中的请求仅标记开始位置；TTFT 与解码阶段尚无独立时间证据
      </p>

      <ModelRequestConversationAnalysis
        v-if="analysis && detail"
        :detail="detail"
        :trajectory="trajectory"
        :search-query="searchQuery"
        :locate-request="analysisLocateRequest"
        :filter="evidenceFilter"
        @locate-result="emit('locate-result', $event)"
      />
      <div v-else class="webqq-model-trajectory-ledger" :class="{ 'has-inspector': selectedRow }">
        <div ref="ledgerElement" v-webqq-scrollbar class="webqq-model-trajectory-table" role="table" aria-label="轨迹事件账本">
          <div v-if="!ledgerRows.length" class="webqq-model-trajectory-filter-empty">当前过滤条件下没有事件</div>
          <template v-for="row in ledgerRows" :key="row.id">
            <div v-if="row.kind === 'request'" class="webqq-model-trajectory-request-boundary" role="row">
              <button type="button" :aria-label="`选择${requestLabel(row.requestId)}`" @click="selectedRowId = row.id">
                <span class="webqq-model-trajectory-request-dot" :class="statusClass(row.status)" aria-hidden="true" />
                <span>{{ requestOrdinal(row.requestId) }}</span>
              </button>
              <span>{{ requestLabel(row.requestId) }}</span>
              <time>{{ row.durationMs === undefined ? '—' : formatDuration(row.durationMs) }}</time>
            </div>
            <button
              v-else
              type="button"
              class="webqq-model-trajectory-row"
              :class="[
                `is-${row.kind}`,
                row.toolEvent === 'definition' ? 'is-tool-definition' : '',
                {
                  'is-selected': row.id === selectedRowId,
                  'is-search-muted': isRowSearchMuted(row),
                },
              ]"
              role="row"
              @click="selectedRowId = row.id"
            >
              <span role="cell" class="webqq-model-trajectory-kind">{{ kindLabel(row.kind, row.toolEvent) }}</span>
              <span role="cell" class="webqq-model-trajectory-preview">{{ row.preview }}</span>
            </button>
          </template>
        </div>

        <aside v-if="selectedRow" class="webqq-model-trajectory-inspector" aria-label="轨迹请求分析">
          <header>
            <div>
              <Badge variant="outline">{{ kindLabel(selectedRow.kind, selectedRow.toolEvent) }}</Badge>
              <span v-if="selectedRequest" class="webqq-model-trajectory-inspector-title">{{ requestLabel(selectedRow.requestId) }}</span>
            </div>
            <div class="webqq-model-trajectory-inspector-actions">
              <Button v-if="selectedRequest" variant="outline" size="sm" @click="openSelectedRequest">
                <IconExternalLink data-icon="inline-start" aria-hidden="true" />
                打开原始请求
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label="关闭检查器" @click="selectedRowId = ''">
                <IconX aria-hidden="true" />
              </Button>
            </div>
          </header>
          <div v-webqq-scrollbar="{ showOverlay: false }" class="webqq-model-trajectory-inspector-body">
            <ModelRequestConversationAnalysis
              v-if="inspectorDetail"
              layout="inspector"
              :detail="inspectorDetail"
              :search-query="searchQuery"
              :locate-request="inspectorLocateRequest"
              :filter="evidenceFilter"
            />
            <div v-else class="webqq-model-request-empty">正在加载分析…</div>
          </div>
        </aside>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import {
  IconChevronLeft,
  IconChevronRight,
  IconClockHour4,
  IconExternalLink,
  IconSearch,
  IconSquareMinus,
  IconSquarePlus,
  IconX,
} from '@tabler/icons-vue'
import { computed, nextTick, ref, useId, watch } from 'vue'
import { Badge } from './components/ui/badge'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './components/ui/tooltip'
import ModelRequestConversationAnalysis from './webqq/analysis-view.vue'
import type { LocateRequest } from './webqq/evidence-locator'
import { createScrollRestore } from './webqq/scroll-restore'
import { formatDuration } from './webqq/format-duration'
import {
  MODEL_EVIDENCE_FILTER_KINDS,
  isEvidenceVisible,
  toggleFilterMember,
  trajectoryRowFilterKind,
  type ModelEvidenceFilterKind,
} from './webqq/model-request-filter'
import { vWebqqScrollbar } from './webqq-scrollbar'
import type {
  SandboxModelRequestDetail,
  SandboxModelRequestPromptKind,
  SandboxModelRequestStatus,
  SandboxModelRequestTrajectory,
  SandboxModelRequestTrajectoryKind,
  SandboxModelRequestTrajectoryRow,
} from '../src/types'

const props = withDefaults(defineProps<{
  trajectory?: SandboxModelRequestTrajectory
  detail?: SandboxModelRequestDetail
  mode: 'request' | 'conversation'
  loading: boolean
  conversationAvailable: boolean
  showModeSwitch?: boolean
  analysis?: boolean
  externalLocate?: LocateRequest
  restoreState?: {
    rowId: string
    scrollTop: number
    /** 触发一次位置恢复的序号，与定位信号使用同一种词汇。 */
    seq: number
  }
}>(), {
  showModeSwitch: true,
  analysis: false,
})

const emit = defineEmits<{
  'update:mode': [mode: 'request' | 'conversation']
  'open-request': [payload: {
    recordId: string
    returnState: {
      rowId: string
      scrollTop: number
    }
  }]
  'inspect-request': [payload: { recordId: string }]
  'locate-result': [result: { seq: number, located: boolean }]
}>()

const ledgerElement = ref<HTMLElement>()
const ledgerScrollRestore = createScrollRestore({
  measure: () => {
    const element = ledgerElement.value
    if (!element) return undefined
    return { scrollTop: element.scrollTop, maxScrollTop: element.scrollHeight - element.clientHeight }
  },
  scrollTo: (top) => {
    if (ledgerElement.value) ledgerElement.value.scrollTop = top
  },
  nextTick,
  frame: () => new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve())
  }),
})

const selectedRowId = ref('')
const actualDuration = ref(true)
const requestsCollapsed = ref(false)
const hiddenKinds = ref<ReadonlySet<ModelEvidenceFilterKind>>(new Set())
const filtersExpanded = ref(false)
// SYSTEM / USER / TOOL DEFS 是两个视图里最常开关的种类，和「耗时」「请求」一起留在工具栏外层。
const PINNED_FILTER_KINDS: readonly ModelEvidenceFilterKind[] = ['system', 'user', 'tool-definition']
const pinnedKindOptions = MODEL_EVIDENCE_FILTER_KINDS.filter(({ kind }) => PINNED_FILTER_KINDS.includes(kind))
const collapsedKindOptions = MODEL_EVIDENCE_FILTER_KINDS.filter(({ kind }) => !PINNED_FILTER_KINDS.includes(kind))
const moreFiltersId = useId()
const searchQuery = ref('')
// 组成分段点击与账本选中行共用同一个定位序号：两种模式互斥渲染，一个计数器即可。
const locateSeq = ref(0)
const internalAnalysisLocateRequest = ref<LocateRequest>()
const analysisLocateRequest = computed(() => props.externalLocate ?? internalAnalysisLocateRequest.value)
const selectedRow = computed(() => props.trajectory?.rows.find(({ id }) => id === selectedRowId.value))
const selectedRequest = computed(() => props.trajectory?.records.find(({ id }) => id === selectedRow.value?.requestId))
const inspectorDetail = computed(() => {
  const requestId = selectedRow.value?.requestId
  if (!requestId || props.detail?.id !== requestId) return undefined
  return props.detail
})
const inspectorLocateRequest = computed<LocateRequest | undefined>(() => {
  const row = selectedRow.value
  if (!row) return undefined
  // 请求边界行没有模型证据；用空身份让分析视图回落到第一条卡片。
  return { evidenceId: row.evidenceId ?? '', seq: locateSeq.value }
})
const normalizedSearch = computed(() => searchQuery.value.trim().toLocaleLowerCase('zh-CN'))
const promptComposition = computed(() => {
  const items = props.trajectory?.promptComposition ?? []
  const total = items.reduce((sum, item) => sum + item.characters, 0)
  if (!total) return []
  return items.map((item) => ({
    ...item,
    percentage: (item.characters / total) * 100,
  }))
})
const REQUEST_COMPOSITION_KINDS = ['system', 'user', 'assistant', 'tool-definition', 'tool-interaction'] as const
const CONVERSATION_COMPOSITION_KINDS = ['system', 'user', 'tool-definition'] as const

interface CompositionSegment {
  id: string
  evidenceId: string
  kind: SandboxModelRequestPromptKind
  characters: number
  percentage: number
  left: number
  width: number
  requestId?: string
}

function isConversationCompositionKind(kind: SandboxModelRequestPromptKind): kind is typeof CONVERSATION_COMPOSITION_KINDS[number] {
  return (CONVERSATION_COMPOSITION_KINDS as readonly SandboxModelRequestPromptKind[]).includes(kind)
}

const compositionTracks = computed(() => (
  props.mode === 'conversation' ? conversationCompositionTracks.value : requestCompositionTracks.value
))
const requestCompositionTracks = computed(() => {
  let offset = 0
  const segments = promptComposition.value.map((item, index): CompositionSegment => {
    const left = offset
    offset += item.percentage
    const gap = index < promptComposition.value.length - 1 ? 0.35 : 0
    return {
      id: item.evidenceId,
      evidenceId: item.evidenceId,
      kind: item.kind,
      characters: item.characters,
      percentage: item.percentage,
      left,
      width: Math.min(Math.max(item.percentage - gap, 0.35), Math.max(100 - left, 0.35)),
    }
  })
  return groupCompositionTracks(REQUEST_COMPOSITION_KINDS, segments)
})

const conversationCompositionTracks = computed(() => {
  const itemsByRequest = new Map<string, typeof promptComposition.value>()
  for (const item of promptComposition.value) {
    if (!item.requestId || !isConversationCompositionKind(item.kind)) continue
    const items = itemsByRequest.get(item.requestId) ?? []
    items.push(item)
    itemsByRequest.set(item.requestId, items)
  }
  const segments: CompositionSegment[] = []
  for (const slot of timingSegments.value) {
    const items = itemsByRequest.get(slot.id) ?? []
    const total = items.reduce((sum, item) => sum + item.characters, 0)
    if (!total) continue
    let used = 0
    items.forEach((item, index) => {
      const percentage = (item.characters / total) * 100
      const left = slot.left + (used / 100) * slot.width
      const rawWidth = (percentage / 100) * slot.width
      const gap = index < items.length - 1 ? Math.min(0.25, rawWidth / 4) : 0
      used += percentage
      segments.push({
        id: `${slot.id}:${item.evidenceId}`,
        evidenceId: item.evidenceId,
        kind: item.kind,
        characters: item.characters,
        percentage,
        left,
        width: Math.min(Math.max(rawWidth - gap, 0.35), Math.max(slot.left + slot.width - left, 0.35)),
        requestId: slot.id,
      })
    })
  }
  return groupCompositionTracks(CONVERSATION_COMPOSITION_KINDS, segments)
})

function groupCompositionTracks(
  kinds: readonly SandboxModelRequestPromptKind[],
  segments: readonly CompositionSegment[],
) {
  return kinds.flatMap((kind) => {
    const kindSegments = segments.filter(segment => segment.kind === kind)
    return kindSegments.length ? [{ kind, segments: kindSegments }] : []
  })
}
const evidenceFilter = computed(() => ({
  hiddenKinds: hiddenKinds.value,
}))
const ledgerRows = computed(() => props.trajectory?.rows.filter((row) => {
  if (requestsCollapsed.value && row.kind !== 'request') return false
  return isEvidenceVisible(evidenceFilter.value, trajectoryRowFilterKind(row))
}) ?? [])
watch(() => props.trajectory, (trajectory) => {
  // 轨迹行 id 由 evidenceId 派生，刷新后同一条证据仍是同一个 id，因此仍然存在的选中行要保留；
  // 只有证据真的消失才清空。否则 pending 请求自动刷新每轮都会把用户正在看的行和检查器一起丢掉。
  if (!trajectory?.rows.some(({ id }) => id === selectedRowId.value)) selectedRowId.value = ''
  restoreTrajectoryPosition()
})

watch(selectedRowId, () => {
  locateSeq.value += 1
})

watch(() => selectedRow.value?.requestId, (requestId) => {
  // 会话轨迹可能点到另一条请求；检查器要完整详情才能渲染分析卡片。
  if (!requestId || props.detail?.id === requestId) return
  emit('inspect-request', { recordId: requestId })
})

watch(() => props.restoreState?.seq, restoreTrajectoryPosition, { immediate: true })

function restoreTrajectoryPosition() {
  const state = props.restoreState
  if (!state) return
  selectedRowId.value = state.rowId
  // 轨迹组件在打开原始字段时会被卸载；恢复必须同时还原账本滚动量和选中行。
  // 帧时序与「内容长高后继续逼近」由 scroll-restore 负责；这里只给目标偏移量。
  void ledgerScrollRestore.restore(state.scrollTop)
}

const requestRows = computed(() => props.trajectory?.rows.filter((row) => row.kind === 'request') ?? [])
const timingBounds = computed(() => {
  const starts = requestRows.value.flatMap(({ startedAt }) => startedAt ? [Date.parse(startedAt)] : [])
  if (!starts.length) return { start: 0, end: 1 }
  const start = Math.min(...starts)
  const end = Math.max(...requestRows.value.map((row) => {
    const rowStart = row.startedAt ? Date.parse(row.startedAt) : start
    return rowStart + Math.max(row.durationMs ?? 0, 1)
  }))
  return { start, end: Math.max(end, start + 1) }
})
const totalDuration = computed(() => timingBounds.value.end - timingBounds.value.start)
const timingSegments = computed(() => requestRows.value.map((row) => {
  const start = row.startedAt ? Date.parse(row.startedAt) : timingBounds.value.start
  const durationMs = Math.max(row.durationMs ?? 0, row.status === 'pending' ? 0 : 1)
  const left = ((start - timingBounds.value.start) / totalDuration.value) * 100
  const width = durationMs > 0
    ? actualDuration.value
      ? Math.max((durationMs / totalDuration.value) * 100, 0.75)
      : Math.max(100 / Math.max(requestRows.value.length, 1), 2)
    : 0
  const normalizedLeft = actualDuration.value
    ? Math.min(left, 99.25)
    : (requestRows.value.indexOf(row) / Math.max(requestRows.value.length, 1)) * 100
  return {
    id: row.requestId ?? row.id,
    label: `${requestOrdinal(row.requestId)} · ${requestLabel(row.requestId)}`,
    durationMs: row.durationMs ?? 0,
    startedAt: row.startedAt,
    status: row.status,
    left: normalizedLeft,
    width: Math.min(width, 100 - normalizedLeft),
  }
}))
const requestBoundaries = computed(() => timingSegments.value.slice(1).map(({ id, left }) => ({ id, left })))
const compositionBoundaries = computed(() => props.mode === 'conversation' ? requestBoundaries.value : [])
const hasUnknownTiming = computed(() => requestRows.value.some(({ status, durationMs }) => status === 'pending' || durationMs === undefined))

function rowMatchesSearch(row: SandboxModelRequestTrajectoryRow) {
  const query = normalizedSearch.value
  if (!query) return true
  return [row.preview, kindLabel(row.kind, row.toolEvent), row.toolName, row.callId, requestLabel(row.requestId)]
    .some((value) => value?.toLocaleLowerCase('zh-CN').includes(query))
}

function isRowSearchMuted(row: SandboxModelRequestTrajectoryRow) {
  return normalizedSearch.value.length > 0 && !rowMatchesSearch(row)
}

function selectPromptSegment(segment: CompositionSegment) {
  if (props.analysis) {
    internalAnalysisLocateRequest.value = { evidenceId: segment.evidenceId, seq: ++locateSeq.value }
    return
  }
  // 组成分段与账本行共享模型证据身份；同一条证据在两个入口一定选中同一行。
  const row = (props.trajectory?.rows ?? []).find(candidate => (
    candidate.evidenceId === segment.evidenceId
    && (!segment.requestId || candidate.requestId === segment.requestId)
  ))
  if (row) selectedRowId.value = row.id
}

function isCompositionSegmentSelected(segment: CompositionSegment) {
  if (props.analysis) return analysisLocateRequest.value?.evidenceId === segment.evidenceId
  const selected = selectedRow.value
  if (!selected) return false
  return selected.evidenceId === segment.evidenceId
    && (!segment.requestId || selected.requestId === segment.requestId)
}

function openSelectedRequest() {
  const request = selectedRequest.value
  const row = selectedRow.value
  if (!request || !row) return
  emit('open-request', {
    recordId: request.id,
    returnState: {
      rowId: row.id,
      scrollTop: ledgerElement.value?.scrollTop ?? 0,
    },
  })
}

function promptKindLabel(kind: SandboxModelRequestPromptKind) {
  if (kind === 'system') return 'System'
  if (kind === 'user') return 'User'
  if (kind === 'assistant') return 'Assistant'
  if (kind === 'tool-definition') return 'Tool Defs'
  return 'Tool I/O'
}

function promptBarClass(kind: SandboxModelRequestPromptKind) {
  if (kind === 'tool-definition') return 'is-tool-definition'
  if (kind === 'tool-interaction') return 'is-tool-interaction'
  return `is-${kind}`
}

function formatPercentage(value: number) {
  return `${value >= 10 ? value.toFixed(1) : value.toFixed(2)}%`
}

function requestOrdinal(requestId: string | undefined) {
  const index = props.trajectory?.records.findIndex(({ id }) => id === requestId) ?? -1
  return index >= 0 ? `请求 ${index + 1}` : '请求'
}

function requestLabel(requestId: string | undefined) {
  const request = props.trajectory?.records.find(({ id }) => id === requestId)
  return [request?.provider, request?.model].filter(Boolean).join(' / ') || '模型请求'
}

function kindLabel(kind: SandboxModelRequestTrajectoryKind, toolEvent?: SandboxModelRequestTrajectoryRow['toolEvent']) {
  if (kind === 'system') return 'SYSTEM'
  if (kind === 'user') return 'USER'
  if (kind === 'assistant') return 'ASSISTANT'
  if (kind === 'tool') {
    if (toolEvent === 'definition') return 'TOOL DEFS'
    if (toolEvent === 'result') return 'TOOL RESULT'
    return 'TOOL CALL'
  }
  return 'REQUEST'
}

function statusClass(status: SandboxModelRequestStatus | undefined) {
  if (status === 'pending') return 'is-pending'
  if (status === 'error') return 'is-error'
  return 'is-success'
}

</script>
