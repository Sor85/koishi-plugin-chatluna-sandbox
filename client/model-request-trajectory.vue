<template>
  <section class="webqq-model-trajectory" aria-label="模型请求轨迹">
    <header class="webqq-model-trajectory-scope">
      <div class="webqq-model-trajectory-mode" role="tablist" aria-label="轨迹范围">
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
            size="sm"
            variant="ghost"
            :aria-pressed="toolsCollapsed"
            :aria-label="toolsCollapsed ? '显示工具事件' : '隐藏工具事件'"
            @click="toolsCollapsed = !toolsCollapsed"
          >
            <IconSquarePlus v-if="toolsCollapsed" data-icon="inline-start" aria-hidden="true" />
            <IconSquareMinus v-else data-icon="inline-start" aria-hidden="true" />
            工具
          </Button>
        </div>
        <label class="webqq-model-trajectory-search">
          <IconSearch aria-hidden="true" />
          <Input v-model="searchQuery" type="search" aria-label="搜索轨迹事件" placeholder="搜索" />
        </label>
      </div>

      <TooltipProvider :delay-duration="500">
        <section
          v-if="mode === 'request' && compositionTracks.length"
          class="webqq-model-trajectory-composition"
          :style="{ minHeight: `${Math.max(50, compositionTracks.length * 14 + 8)}px` }"
          aria-label="请求体提示词内容占比"
        >
          <div class="webqq-model-trajectory-composition-labels" aria-hidden="true">
            <span v-for="track in compositionTracks" :key="track.kind">{{ promptKindLabel(track.kind) }}</span>
          </div>
          <div class="webqq-model-trajectory-composition-tracks">
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
                  <span>{{ segment.characters.toLocaleString('zh-CN') }} 个序列化字符</span>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </section>
        <div v-else-if="mode === 'request'" class="webqq-model-trajectory-composition-empty">
          当前请求体没有可统计的提示词内容
        </div>

        <section v-else class="webqq-model-trajectory-timeline" aria-label="请求时间线">
          <div class="webqq-model-trajectory-lane-labels" aria-hidden="true">
            <span>上下文</span>
            <span>请求</span>
            <span>工具</span>
          </div>
          <div class="webqq-model-trajectory-lanes">
            <span
              v-for="boundary in requestBoundaries"
              :key="boundary.id"
              class="webqq-model-trajectory-boundary"
              :style="{ left: `${boundary.left}%` }"
              aria-hidden="true"
            />
            <Tooltip v-for="segment in timingSegments" :key="segment.id">
              <TooltipTrigger as-child>
                <button
                  type="button"
                  class="webqq-model-trajectory-span is-request"
                  :class="[
                    statusClass(segment.status),
                    {
                      'is-selected': selectedRow?.requestId === segment.id,
                      'is-search-muted': isRequestSearchMuted(segment.id),
                    },
                  ]"
                  :style="{ left: `${segment.left}%`, width: `${segment.width}%` }"
                  :aria-label="`${segment.label}，${formatDuration(segment.durationMs)}`"
                  @click="selectRequest(segment.id)"
                />
              </TooltipTrigger>
              <TooltipContent side="top">
                <strong>{{ segment.label }}</strong>
                <span>{{ formatClock(segment.startedAt) }} · {{ formatDuration(segment.durationMs) }}</span>
              </TooltipContent>
            </Tooltip>
            <Tooltip v-for="marker in contextMarkers" :key="marker.id">
              <TooltipTrigger as-child>
                <button
                  type="button"
                  class="webqq-model-trajectory-span is-context is-marker"
                  :class="{ 'is-search-muted': isRowSearchMuted(marker.row) }"
                  :style="{ left: `${marker.left}%` }"
                  :aria-label="`${marker.label}，未记录独立耗时`"
                  @click="selectRow(marker.row.id)"
                />
              </TooltipTrigger>
              <TooltipContent side="top">
                <strong>{{ kindLabel(marker.row.kind, marker.row.toolEvent) }}</strong>
                <span>{{ marker.label }} · 无独立耗时</span>
              </TooltipContent>
            </Tooltip>
            <Tooltip v-for="marker in toolMarkers" :key="marker.id">
              <TooltipTrigger as-child>
                <button
                  type="button"
                  class="webqq-model-trajectory-span is-tools is-marker"
                  :class="{ 'is-search-muted': isRowSearchMuted(marker.row) }"
                  :style="{ left: `${marker.left}%` }"
                  :aria-label="`${marker.label}，未记录独立耗时`"
                  @click="selectRow(marker.row.id)"
                />
              </TooltipTrigger>
              <TooltipContent side="top">
                <strong>TOOL</strong>
                <span>{{ marker.label }} · 无独立耗时</span>
              </TooltipContent>
            </Tooltip>
          </div>
        </section>
      </TooltipProvider>

      <p v-if="mode === 'conversation' && hasUnknownTiming" class="webqq-model-trajectory-timing-note">
        进行中的请求仅标记开始位置；TTFT 与解码阶段尚无独立时间证据
      </p>

      <div class="webqq-model-trajectory-ledger" :class="{ 'has-inspector': selectedRow }">
        <div v-webqq-scrollbar class="webqq-model-trajectory-table" role="table" aria-label="轨迹事件账本">
          <div v-if="!ledgerRows.length" class="webqq-model-trajectory-filter-empty">当前折叠条件下没有事件</div>
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

        <aside v-if="selectedRow" v-webqq-scrollbar class="webqq-model-trajectory-inspector" aria-label="轨迹事件检查器">
          <header>
            <div>
              <Badge variant="outline">{{ kindLabel(selectedRow.kind, selectedRow.toolEvent) }}</Badge>
            </div>
            <Button variant="ghost" size="icon-sm" aria-label="关闭检查器" @click="selectedRowId = ''">
              <IconX aria-hidden="true" />
            </Button>
          </header>
          <dl v-if="selectedRow.kind === 'request'" class="webqq-model-trajectory-facts">
            <div><dt>状态</dt><dd>{{ statusLabel(selectedRow.status) }}</dd></div>
            <div><dt>开始</dt><dd>{{ formatTime(selectedRow.startedAt) }}</dd></div>
            <div><dt>耗时</dt><dd>{{ selectedRow.durationMs === undefined ? '—' : formatDuration(selectedRow.durationMs) }}</dd></div>
          </dl>
          <div v-if="selectedRow.detail !== undefined" class="webqq-model-request-json-viewer webqq-model-trajectory-detail-json">
            <ModelRequestJsonTree
              :node="selectedTree"
              :open="true"
              :root="true"
              :strings-expanded="true"
              :images-preview="true"
            />
          </div>
          <div v-if="selectedRequest" class="webqq-model-trajectory-inspector-actions">
            <Button variant="outline" size="sm" @click="$emit('open-request', selectedRequest.id)">
              <IconExternalLink data-icon="inline-start" aria-hidden="true" />
              打开原始请求
            </Button>
          </div>
        </aside>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import {
  IconClockHour4,
  IconExternalLink,
  IconSearch,
  IconSquareMinus,
  IconSquarePlus,
  IconX,
} from '@tabler/icons-vue'
import { computed, ref, watch } from 'vue'
import { Badge } from './components/ui/badge'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './components/ui/tooltip'
import ModelRequestJsonTree from './model-request-json-tree.vue'
import { buildModelRequestJsonTree } from './webqq/model-request-json'
import { formatDuration } from './webqq/format-duration'
import { vWebqqScrollbar } from './webqq-scrollbar'
import type {
  SandboxModelRequestPromptKind,
  SandboxModelRequestStatus,
  SandboxModelRequestTrajectory,
  SandboxModelRequestTrajectoryKind,
  SandboxModelRequestTrajectoryRow,
} from '../src/types'

const props = defineProps<{
  trajectory?: SandboxModelRequestTrajectory
  mode: 'request' | 'conversation'
  loading: boolean
  conversationAvailable: boolean
}>()

defineEmits<{
  'update:mode': [mode: 'request' | 'conversation']
  'open-request': [recordId: string]
}>()

const selectedRowId = ref('')
const actualDuration = ref(true)
const requestsCollapsed = ref(false)
const toolsCollapsed = ref(false)
const searchQuery = ref('')
const selectedRow = computed(() => props.trajectory?.rows.find(({ id }) => id === selectedRowId.value))
const selectedTree = computed(() => buildModelRequestJsonTree(selectedRow.value?.detail, `trajectory.${selectedRow.value?.id ?? 'detail'}`))
const selectedRequest = computed(() => props.trajectory?.records.find(({ id }) => id === selectedRow.value?.requestId))
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
const compositionTracks = computed(() => {
  let offset = 0
  const seen: Partial<Record<SandboxModelRequestPromptKind, number>> = {}
  const segments = promptComposition.value.map((item, index) => {
    const left = offset
    offset += item.percentage
    const indexInKind = seen[item.kind] ?? 0
    seen[item.kind] = indexInKind + 1
    const gap = index < promptComposition.value.length - 1 ? 0.35 : 0
    return {
      id: `${item.kind}:${index}`,
      kind: item.kind,
      characters: item.characters,
      percentage: item.percentage,
      left,
      width: Math.min(Math.max(item.percentage - gap, 0.35), Math.max(100 - left, 0.35)),
      indexInKind,
    }
  })
  return (['system', 'user', 'assistant', 'tool-definition', 'tool-interaction'] as const).flatMap((kind) => {
    const kindSegments = segments.filter((segment) => segment.kind === kind)
    return kindSegments.length ? [{ kind, segments: kindSegments }] : []
  })
})
const ledgerRows = computed(() => props.trajectory?.rows.filter((row) => {
  if (requestsCollapsed.value && row.kind !== 'request') return false
  if (toolsCollapsed.value && row.kind === 'tool') return false
  return true
}) ?? [])
watch(() => props.trajectory, () => {
  selectedRowId.value = ''
})

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
const timelinePosition = (row: SandboxModelRequestTrajectoryRow) => {
  const start = row.startedAt ? Date.parse(row.startedAt) : timingBounds.value.start
  return Math.min(Math.max(((start - timingBounds.value.start) / totalDuration.value) * 100, 0), 100)
}
const contextMarkers = computed(() => (props.trajectory?.rows ?? [])
  .filter((row) => row.kind === 'system' || row.kind === 'user')
  .map((row) => ({ id: row.id, label: row.preview, left: timelinePosition(row), row })))
const toolMarkers = computed(() => (props.trajectory?.rows ?? [])
  .filter((row) => row.kind === 'tool')
  .map((row) => ({ id: row.id, label: row.preview, left: timelinePosition(row), row })))
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

function isRequestSearchMuted(requestId: string) {
  if (!normalizedSearch.value) return false
  return !(props.trajectory?.rows ?? []).some((row) => row.requestId === requestId && rowMatchesSearch(row))
}

function selectRequest(requestId: string) {
  const row = requestRows.value.find((candidate) => candidate.requestId === requestId)
  if (row) selectedRowId.value = row.id
}

function selectRow(rowId: string) {
  selectedRowId.value = rowId
}

function promptRowsForKind(kind: SandboxModelRequestPromptKind) {
  return (props.trajectory?.rows ?? []).filter((candidate) => {
    if (kind === 'tool-definition') return candidate.kind === 'tool' && candidate.toolEvent === 'definition'
    if (kind === 'tool-interaction') return candidate.kind === 'tool' && candidate.toolEvent !== 'definition'
    return candidate.kind === kind
  })
}

function selectPromptSegment(segment: { kind: SandboxModelRequestPromptKind, indexInKind: number }) {
  const row = promptRowsForKind(segment.kind)[segment.indexInKind] ?? promptRowsForKind(segment.kind)[0]
  if (row) selectedRowId.value = row.id
}

function isCompositionSegmentSelected(segment: { kind: SandboxModelRequestPromptKind, indexInKind: number }) {
  const selected = selectedRow.value
  if (!selected) return false
  const rows = promptRowsForKind(segment.kind)
  return rows[segment.indexInKind]?.id === selected.id
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

function statusLabel(status: SandboxModelRequestStatus | undefined) {
  if (status === 'pending') return '进行中'
  if (status === 'error') return '错误'
  return status === 'success' ? '已完成' : '—'
}

function statusClass(status: SandboxModelRequestStatus | undefined) {
  if (status === 'pending') return 'is-pending'
  if (status === 'error') return 'is-error'
  return 'is-success'
}

function formatTime(value: string | undefined) {
  if (!value) return '—'
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

function formatClock(value: string | undefined) {
  if (!value) return '时间未知'
  return new Date(value).toLocaleTimeString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  })
}
</script>
