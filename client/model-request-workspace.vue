<template>
  <main class="webqq-chat webqq-model-request-workspace" aria-label="模型请求工作台">
    <header class="webqq-model-request-header">
      <div>
        <h1>模型请求</h1>
        <p>查看实际上游对话模型请求的只读证据。列表只提供摘要，完整请求体需打开单条详情。</p>
      </div>
      <div class="webqq-model-request-actions">
        <label class="webqq-model-request-live">
          <Checkbox v-model="liveRefresh" aria-label="实时刷新" />
          <span>实时刷新</span>
        </label>
        <Button variant="outline" :disabled="loading" @click="refresh">
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
              @keyup.enter="refresh"
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
                    <time>{{ formatTime(record.createdAt) }} · {{ record.durationMs }} ms</time>
                  </span>
                </span>
              </div>
            </header>
            <p class="webqq-model-request-summary">
              字段 {{ record.summary.keys }} · 消息 {{ record.summary.messageCount }} · 工具 {{ record.summary.toolCount }}
              <template v-if="!record.summary.bodyAvailable"> · 请求体不可用</template>
            </p>
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
        <div v-else-if="!detail" class="webqq-model-request-empty">选择一条记录查看结构化请求体</div>
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
                    <Badge :class="statusClass(detail.status)">{{ statusLabel(detail.status) }}</Badge>
                    <Badge v-if="detail.provider" variant="outline" class="webqq-model-request-provider">{{ detail.provider }}</Badge>
                  </span>
                  <time>{{ formatTime(detail.createdAt) }} · {{ detail.durationMs }} ms</time>
                </span>
              </span>
            </div>
          </header>
          <p v-if="detail.method || detail.url" class="webqq-model-request-meta">
            {{ [detail.method, detail.url].filter(Boolean).join(' ') }}
          </p>
          <p class="webqq-model-request-meta">{{ formatEntities(detail) }}</p>
          <p v-if="detail.interactionId" class="webqq-model-request-meta">interaction {{ detail.interactionId }}</p>
          <p v-if="detail.error" class="webqq-model-request-trace">
            {{ detail.error.message }} · trace {{ detail.error.traceId }}
          </p>
          <section class="webqq-model-request-body">
            <div class="webqq-model-request-body-header">
              <div>
                <h2>请求体</h2>
                <p>JSON 原文</p>
              </div>
              <Button
                v-if="detail.requestBodyAvailable && detail.requestBody !== undefined"
                variant="outline"
                size="sm"
                :aria-pressed="stringsExpanded"
                @click="stringsExpanded = !stringsExpanded"
              >
                <IconArrowsDiagonalMinimize2 v-if="stringsExpanded" :size="16" aria-hidden="true" />
                <IconArrowsDiagonal v-else :size="16" aria-hidden="true" />
                {{ stringsExpanded ? '收起长字符串' : '展开长字符串' }}
              </Button>
            </div>
            <p v-if="!detail.requestBodyAvailable || detail.requestBody === undefined" class="webqq-model-request-empty">
              请求体不可用
            </p>
            <div v-else class="webqq-model-request-json-viewer">
              <ModelRequestJsonTree
                :node="detailTree"
                :open="true"
                :root="true"
                :strings-expanded="stringsExpanded"
              />
            </div>
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
import { IconArrowsDiagonal, IconArrowsDiagonalMinimize2, IconRefresh, IconTrash } from '@tabler/icons-vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Badge } from './components/ui/badge'
import { Button } from './components/ui/button'
import { Checkbox } from './components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './components/ui/dialog'
import { Input } from './components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select'
import ModelRequestJsonTree from './model-request-json-tree.vue'
import WebqqAvatar from './webqq-avatar.vue'
import { buildModelRequestJsonTree } from './webqq/model-request-json'
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
const stringsExpanded = ref(false)

const liveRefreshController = createModelRequestLiveRefresh({
  isEnabled: () => liveRefresh.value,
  isVisible: () => typeof document === 'undefined' || document.visibilityState === 'visible',
  refresh: () => emitQuery(Math.min(Math.max(props.records.length, MODEL_REQUEST_PAGE_SIZE), 200)),
})

const detailTree = computed(() => buildModelRequestJsonTree(props.detail?.requestBody, 'requestBody'))
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
  stringsExpanded.value = false
})

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

function refresh() {
  emitQuery()
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
  return '成功'
}

function statusClass(status: SandboxModelRequestStatus) {
  if (status === 'error') return 'webqq-model-request-status-error'
  if (status === 'pending') return 'webqq-model-request-status-pending'
  return 'webqq-model-request-status-success'
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
})
</script>
