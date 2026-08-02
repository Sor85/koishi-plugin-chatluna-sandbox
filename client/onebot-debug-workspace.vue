<template>
  <main class="webqq-chat webqq-debug-workspace" aria-label="OneBot 调试工作台">
    <header class="webqq-debug-header">
      <div>
        <h1>OneBot 调试</h1>
        <p>查看最近的 action、原始事件和错误。调试记录仅保存在内存中，不能重放。</p>
      </div>
      <div class="webqq-debug-actions">
        <Button variant="outline" :disabled="loading" @click="applyFilters">
          <IconRefresh :size="16" aria-hidden="true" />
          刷新
        </Button>
        <Button variant="destructive" :disabled="loading || !records.length" @click="emit('clear')">
          <IconTrash :size="16" aria-hidden="true" />
          清理调试记录
        </Button>
      </div>
    </header>

    <section class="webqq-debug-filters" aria-label="调试记录筛选">
      <label>
        <span>机器人</span>
        <Select v-model="botId">
          <SelectTrigger class="webqq-debug-control" aria-label="按机器人筛选">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部机器人</SelectItem>
            <SelectItem v-for="bot in bots" :key="getBotKey(bot)" :value="getBotKey(bot)">
              {{ bot.name }} · {{ bot.id }} · {{ bot.source.name }}
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
          <SelectContent>
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
    </section>

    <p v-if="error" class="webqq-debug-error" role="alert">{{ error }}</p>
    <div v-if="loading" class="webqq-debug-empty">正在读取调试记录…</div>
    <div v-else-if="!records.length" class="webqq-debug-empty">暂无符合条件的 OneBot 调试记录</div>
    <div v-else v-webqq-scrollbar class="webqq-debug-records">
      <article v-for="record in records" :key="getRecordKey(record)" class="webqq-debug-record">
        <header>
          <div class="webqq-debug-record-title">
            <strong>{{ record.requestedAction }}</strong>
            <Badge variant="secondary">{{ record.direction === 'action' ? 'ACTION' : 'EVENT' }}</Badge>
            <Badge variant="secondary">{{ record.implementation === 'napcat' ? 'NapCat' : 'LLBot' }}</Badge>
            <Badge variant="secondary">{{ record.source.name }}</Badge>
            <Badge :class="record.status === 'error' ? 'webqq-debug-status-error' : 'webqq-debug-status-success'">
              {{ record.status === 'error' ? '错误' : '成功' }}
            </Badge>
          </div>
          <time>{{ formatTime(record.createdAt) }} · {{ record.durationMs }} ms</time>
        </header>
        <p v-if="record.action !== record.requestedAction" class="webqq-debug-resolved">规范 action：{{ record.action }}</p>
        <p v-if="record.matchedAlias" class="webqq-debug-resolved">别名命中：{{ record.matchedAlias }}</p>
        <p class="webqq-debug-entities">机器人 {{ getBotName(record) }} · {{ formatEntities(record) }}</p>
        <p v-if="record.error" class="webqq-debug-trace">{{ record.error.message }} · trace {{ record.error.traceId }}</p>
        <div class="webqq-debug-payloads">
          <section v-if="record.payload !== undefined">
            <h2>{{ record.direction === 'action' ? '输入' : '事件数据' }}</h2>
            <pre v-webqq-scrollbar>{{ formatPayload(record.payload) }}</pre>
            <p v-if="countLargeValueSummaries(record.payload)" class="webqq-debug-fold">
              已折叠 {{ countLargeValueSummaries(record.payload) }} 个大型值（列表仅显示摘要，完整内容请通过单条详情接口展开）
            </p>
          </section>
          <section v-if="record.result !== undefined">
            <h2>{{ record.direction === 'action' ? '输出' : '处理结果' }}</h2>
            <pre v-webqq-scrollbar>{{ formatPayload(record.result) }}</pre>
            <p v-if="countLargeValueSummaries(record.result)" class="webqq-debug-fold">
              已折叠 {{ countLargeValueSummaries(record.result) }} 个大型值（列表仅显示摘要，完整内容请通过单条详情接口展开）
            </p>
          </section>
        </div>
      </article>
    </div>
  </main>
</template>

<script setup lang="ts">
import { IconRefresh, IconTrash } from '@tabler/icons-vue'
import { ref } from 'vue'
import { Badge } from './components/ui/badge'
import { Button } from './components/ui/button'
import { Checkbox } from './components/ui/checkbox'
import { Input } from './components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select'
import { vWebqqScrollbar } from './webqq-scrollbar'
import type {
  GetSandboxOneBotDebugRecordsInput,
  SandboxConsoleOneBotDebugRecord,
  SandboxDirectoryBot,
} from '../src/types'

const props = defineProps<{
  records: readonly SandboxConsoleOneBotDebugRecord[]
  bots: readonly SandboxDirectoryBot[]
  loading: boolean
  error: string
}>()
const emit = defineEmits<{
  query: [input: GetSandboxOneBotDebugRecordsInput]
  clear: []
}>()

const botId = ref('all')
const direction = ref('all')
const action = ref('')
const requestedAction = ref('')
const errorsOnly = ref(false)

function applyFilters() {
  emit('query', {
    botId: botId.value === 'all' ? undefined : props.bots.find((bot) => getBotKey(bot) === botId.value)?.id,
    direction: direction.value === 'action' || direction.value === 'event' ? direction.value : undefined,
    action: action.value.trim() || undefined,
    requestedAction: requestedAction.value.trim() || undefined,
    errorsOnly: errorsOnly.value || undefined,
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

function formatTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value))
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
</script>
