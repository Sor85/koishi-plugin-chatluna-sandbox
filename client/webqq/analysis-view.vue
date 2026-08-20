<template>
  <section class="webqq-model-analysis" :class="{ 'is-inspector': layout === 'inspector' }" aria-label="模型请求分析">
    <div class="webqq-model-analysis-main">
      <aside v-if="layout !== 'inspector'" class="webqq-model-analysis-nav" aria-label="分析导航">
        <button
          type="button"
          class="webqq-model-analysis-boundary"
          :class="`is-${navigation.boundary.status}`"
          @click="jumpTo(navigation.boundary.target)"
        >
          <span class="webqq-model-analysis-boundary-title">
            <span class="webqq-model-analysis-boundary-dot" aria-hidden="true" />
            <strong>{{ navigation.boundary.label }}</strong>
            <small>{{ statusLabel(navigation.boundary.status) }}</small>
          </span>
          <span class="webqq-model-analysis-boundary-meta">
            {{ [navigation.boundary.provider, navigation.boundary.model].filter(Boolean).join(' / ') || '模型请求' }}
            · {{ formatDuration(navigation.boundary.durationMs) }}
          </span>
        </button>

        <section
          v-for="group in visibleNavigationGroups"
          :key="group.key"
          class="webqq-model-analysis-nav-group"
          :class="[`is-${group.key}`, { 'is-muted': normalizedSearch && !group.items.some(itemMatches) }]"
        >
          <header class="webqq-model-analysis-nav-heading">
            <component :is="groupIcon(group.key)" :size="15" aria-hidden="true" />
            <strong><AnalysisHighlightedText :value="group.label" :query="normalizedSearch" /></strong>
            <small>{{ group.count }}</small>
          </header>
          <button
            v-for="item in group.items"
            :key="item.id"
            type="button"
            class="webqq-model-analysis-nav-item"
            :class="{ 'is-muted': normalizedSearch && !itemMatches(item) }"
            @click="jumpTo(item.target)"
          >
            <span class="webqq-model-analysis-nav-kind" :class="`is-${item.kind}`"><AnalysisHighlightedText :value="item.label" :query="normalizedSearch" /></span>
            <span v-if="item.index !== undefined" class="webqq-model-analysis-nav-index">#{{ item.index }}</span>
            <span class="webqq-model-analysis-nav-preview"><AnalysisHighlightedText :value="item.preview" :query="normalizedSearch" /></span>
          </button>
        </section>
      </aside>

      <div ref="contentElement" class="webqq-model-analysis-content">
        <header class="webqq-model-analysis-heading">
          <h3>Messages <span>({{ conversation.messages.length }})</span></h3>
        </header>

        <div class="webqq-model-analysis-conversation">
          <div v-if="conversation.parseError && !conversation.messages.length" class="webqq-model-analysis-empty">
            <p>{{ conversation.parseError }}</p>
          </div>

          <article
            v-for="message in conversation.messages"
            :id="modelAnalysisMessageId(message.index)"
            :key="message.index"
            class="webqq-model-analysis-card"
            :class="[
              `is-${message.role}`,
              {
                'is-collapsed': isCardCollapsed(modelAnalysisMessageId(message.index)),
                'is-muted': normalizedSearch && !messageMatches(message),
                'is-located': highlightedTarget === modelAnalysisMessageId(message.index),
              },
            ]"
          >
            <header @click="toggleCardFromHeader($event, modelAnalysisMessageId(message.index))">
              <span class="webqq-model-analysis-role"><AnalysisHighlightedText :value="roleLabel(message.role)" :query="normalizedSearch" /></span>
              <span class="webqq-model-analysis-index">#{{ message.index }}</span>
              <span class="webqq-model-analysis-path">{{ formatPath(message.path) }}</span>
              <span class="webqq-model-analysis-chars">{{ messageCharacters(message) }} chars</span>
              <TooltipProvider :delay-duration="500">
                <Tooltip>
                  <TooltipTrigger as-child>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      :aria-label="rawMessages.has(message.index) ? `查看第 ${message.index} 条消息格式化内容` : `查看第 ${message.index} 条消息原始 JSON`"
                      @click="toggleRaw(message.index)"
                    >
                      <IconCode :size="16" aria-hidden="true" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{{ rawMessages.has(message.index) ? '查看格式化内容' : '查看原始 JSON' }}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider :delay-duration="500">
                <Tooltip>
                  <TooltipTrigger as-child>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      class="webqq-model-analysis-collapse"
                      :aria-expanded="!isCardCollapsed(modelAnalysisMessageId(message.index))"
                      :aria-label="isCardCollapsed(modelAnalysisMessageId(message.index)) ? `展开第 ${message.index} 条消息卡片` : `收起第 ${message.index} 条消息卡片`"
                      @click="toggleCard(modelAnalysisMessageId(message.index))"
                    >
                      <IconChevronDown :size="16" aria-hidden="true" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{{ isCardCollapsed(modelAnalysisMessageId(message.index)) ? '展开消息卡片' : '收起消息卡片' }}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </header>

            <div v-show="!isCardCollapsed(modelAnalysisMessageId(message.index)) && rawMessages.has(message.index)" class="webqq-model-analysis-json">
              <div class="webqq-model-analysis-source-path">{{ formatPath(message.path) }}</div>
              <ModelRequestJsonTree
                :node="buildModelRequestJsonTree(message.raw, `message-${message.index}`)"
                :open="true"
                :root="true"
                :strings-expanded="true"
                :images-preview="true"
              />
            </div>
            <div v-show="!isCardCollapsed(modelAnalysisMessageId(message.index)) && !rawMessages.has(message.index)" class="webqq-model-analysis-formatted">
              <AnalysisContentParts
                v-if="message.contentParts.length"
                :parts="message.contentParts"
                :search-query="normalizedSearch"
                :force-expanded="expandedTextTargets.has(modelAnalysisMessageId(message.index))"
              />
              <AnalysisTextBlock
                v-else-if="message.content"
                :value="message.content"
                :search-query="normalizedSearch"
                :force-expanded="expandedTextTargets.has(modelAnalysisMessageId(message.index))"
              />
              <AnalysisTextBlock
                v-if="message.reasoning"
                label="思考"
                :value="message.reasoning"
                :search-query="normalizedSearch"
                :force-expanded="expandedTextTargets.has(modelAnalysisMessageId(message.index))"
              />
              <section v-if="message.toolCalls.length" class="webqq-model-analysis-section">
                <strong>工具调用</strong>
                <article
                  v-for="(call, callIndex) in message.toolCalls"
                  :id="modelAnalysisToolCallId(message.index, callIndex)"
                  :key="`${call.id || callIndex}-${call.name}`"
                  class="webqq-model-analysis-tool-call is-call"
                  :class="{ 'is-located': highlightedTarget === modelAnalysisToolCallId(message.index, callIndex) }"
                >
                  <div><strong><AnalysisHighlightedText :value="call.name" :query="normalizedSearch" /></strong><span><AnalysisHighlightedText :value="call.id || '无调用 ID'" :query="normalizedSearch" /></span></div>
                  <AnalysisTextBlock
                    :value="call.arguments || '{}'"
                    :search-query="normalizedSearch"
                    :force-expanded="expandedTextTargets.has(modelAnalysisToolCallId(message.index, callIndex))"
                    compact
                  />
                  <button
                    v-if="hasTool(call.name)"
                    type="button"
                    class="webqq-model-analysis-link"
                    @click="locateTool(call.name)"
                  >
                    查看工具定义
                  </button>
                </article>
              </section>
            </div>
          </article>

          <section class="webqq-model-analysis-response-heading">
            <h3>Response</h3>
          </section>
          <article
            id="model-analysis-response"
            class="webqq-model-analysis-card is-response"
            :class="{
              'is-collapsed': isCardCollapsed('model-analysis-response'),
              'is-muted': normalizedSearch && !responseMatches,
              'is-located': highlightedTarget === 'model-analysis-response',
            }"
          >
            <header @click="toggleCardFromHeader($event, 'model-analysis-response')">
              <span class="webqq-model-analysis-role">响应</span>
              <span class="webqq-model-analysis-path">{{ responseFormatLabel }}</span>
              <span class="webqq-model-analysis-chars">{{ responseCharacters }} chars</span>
              <TooltipProvider :delay-duration="500">
                <Tooltip>
                  <TooltipTrigger as-child>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      :disabled="response.raw === undefined"
                      :aria-label="responseRaw ? '查看响应格式化内容' : `查看响应原始 ${responseFormatLabel}`"
                      @click="toggleResponseRaw"
                    >
                      <IconCode :size="16" aria-hidden="true" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{{ responseRaw ? '查看格式化内容' : `查看原始 ${responseFormatLabel}` }}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider :delay-duration="500">
                <Tooltip>
                  <TooltipTrigger as-child>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      class="webqq-model-analysis-collapse"
                      :aria-expanded="!isCardCollapsed('model-analysis-response')"
                      :aria-label="isCardCollapsed('model-analysis-response') ? '展开响应卡片' : '收起响应卡片'"
                      @click="toggleCard('model-analysis-response')"
                    >
                      <IconChevronDown :size="16" aria-hidden="true" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{{ isCardCollapsed('model-analysis-response') ? '展开响应卡片' : '收起响应卡片' }}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </header>

            <div v-show="!isCardCollapsed('model-analysis-response') && responseRaw && response.raw !== undefined" class="webqq-model-analysis-json">
              <pre v-if="response.format === 'text'" class="webqq-model-analysis-raw-text">{{ String(response.raw) }}</pre>
              <ModelRequestJsonTree
                v-else
                :node="buildModelRequestJsonTree(response.raw, 'response')"
                :open="true"
                :root="true"
                :strings-expanded="true"
                :images-preview="true"
              />
            </div>
            <div v-show="!isCardCollapsed('model-analysis-response') && !responseRaw" class="webqq-model-analysis-formatted">
              <p v-if="response.status !== 'complete'" class="webqq-model-analysis-empty">
                {{ response.statusMessage || '响应没有可展示内容' }}
              </p>
              <AnalysisTextBlock
                v-if="response.reasoning.length"
                label="思考"
                :value="response.reasoning.join('\n')"
                :search-query="normalizedSearch"
                :force-expanded="expandedTextTargets.has('model-analysis-response')"
              />
              <AnalysisTextBlock
                v-if="response.content.length"
                :value="response.content.join('\n')"
                :search-query="normalizedSearch"
                :force-expanded="expandedTextTargets.has('model-analysis-response')"
              />
              <section v-if="response.toolCalls.length" class="webqq-model-analysis-section">
                <strong>工具调用</strong>
                <article
                  v-for="(call, callIndex) in response.toolCalls"
                  :id="modelAnalysisResponseToolCallId(callIndex)"
                  :key="`${call.id || callIndex}-${call.name}`"
                  class="webqq-model-analysis-tool-call is-call"
                  :class="{ 'is-located': highlightedTarget === modelAnalysisResponseToolCallId(callIndex) }"
                >
                  <div><strong><AnalysisHighlightedText :value="call.name" :query="normalizedSearch" /></strong><span><AnalysisHighlightedText :value="call.id || '无调用 ID'" :query="normalizedSearch" /></span></div>
                  <div class="webqq-model-analysis-tool-schema webqq-model-request-json-viewer">
                    <ModelRequestJsonTree
                      :node="buildModelRequestJsonTree(parseAnalysisJson(call.arguments), 'arguments')"
                      :open="true"
                      :root="true"
                      :strings-expanded="true"
                    />
                  </div>
                  <button v-if="hasTool(call.name)" type="button" class="webqq-model-analysis-link" @click="locateTool(call.name)">
                    查看工具定义
                  </button>
                </article>
              </section>
              <section v-if="response.toolResults.length" class="webqq-model-analysis-section">
                <strong>工具结果</strong>
                <article
                  v-for="(result, resultIndex) in response.toolResults"
                  :id="modelAnalysisResponseToolResultId(resultIndex)"
                  :key="`${result.id || resultIndex}-${result.name || ''}`"
                  class="webqq-model-analysis-tool-call is-result"
                  :class="{ 'is-located': highlightedTarget === modelAnalysisResponseToolResultId(resultIndex) }"
                >
                  <div><strong><AnalysisHighlightedText :value="result.name || '工具结果'" :query="normalizedSearch" /></strong><span><AnalysisHighlightedText :value="result.id || '无调用 ID'" :query="normalizedSearch" /></span></div>
                  <AnalysisTextBlock
                    :value="result.content"
                    :search-query="normalizedSearch"
                    :force-expanded="expandedTextTargets.has(modelAnalysisResponseToolResultId(resultIndex))"
                    compact
                  />
                </article>
              </section>
              <div v-if="response.finishReasons.length || response.usage" class="webqq-model-analysis-response-meta">
                <span v-if="response.finishReasons.length">结束原因：{{ response.finishReasons.join('、') }}</span>
                <span v-if="response.usage?.inputTokens !== undefined">输入：{{ response.usage.inputTokens }}</span>
                <span v-if="response.usage?.outputTokens !== undefined">输出：{{ response.usage.outputTokens }}</span>
                <span v-if="response.usage?.reasoningTokens !== undefined">推理：{{ response.usage.reasoningTokens }}</span>
                <span v-if="response.usage?.totalTokens !== undefined">总 Token：{{ response.usage.totalTokens }}</span>
              </div>
            </div>
          </article>

          <section id="model-analysis-tools" class="webqq-model-analysis-tools" :class="{ 'is-located': highlightedTarget === 'model-analysis-tools' }">
            <h3>Tools <span>({{ conversation.tools.length }})</span></h3>
            <p v-if="!conversation.tools.length" class="webqq-model-analysis-empty">请求未声明工具定义</p>
            <article
              v-for="tool in conversation.tools"
              :id="modelAnalysisToolId(tool.path)"
              :key="tool.path.join('.')"
              class="webqq-model-analysis-tool-card"
              :class="{
                'is-expanded': expandedTools.has(tool.path.join('.')),
                'is-muted': normalizedSearch && !tool.searchText.toLocaleLowerCase('zh-CN').includes(normalizedSearch),
                'is-located': highlightedTarget === modelAnalysisToolId(tool.path),
              }"
            >
              <button
                type="button"
                class="webqq-model-analysis-tool-summary"
                :aria-expanded="expandedTools.has(tool.path.join('.'))"
                @pointerdown="startToolPointer"
                @pointerup="finishToolPointer"
                @click="toggleToolFromSummary(tool.path.join('.'))"
              >
                <IconTool :size="18" aria-hidden="true" />
                <span class="webqq-model-analysis-tool-copy">
                  <strong><AnalysisHighlightedText :value="tool.name" :query="normalizedSearch" /></strong>
                  <span class="webqq-model-analysis-tool-desc">
                    <AnalysisHighlightedText :value="compactAnalysisText(tool.description || '无描述')" :query="normalizedSearch" />
                  </span>
                  <small>
                    {{ tool.propertyCount }} props
                    <span v-if="tool.requiredFields.length"> · required: {{ tool.requiredFields.join(', ') }}</span>
                  </small>
                </span>
                <IconChevronDown class="webqq-model-analysis-tool-chevron" :size="18" aria-hidden="true" />
              </button>
              <div v-if="expandedTools.has(tool.path.join('.'))" class="webqq-model-analysis-tool-detail">
                <p><AnalysisHighlightedText :value="tool.description || '无描述'" :query="normalizedSearch" /></p>
                <h4>Parameters (JSON Schema) <small>{{ formatPath(tool.path) }}</small></h4>
                <div class="webqq-model-analysis-tool-schema webqq-model-request-json-viewer">
                  <ModelRequestJsonTree
                    :node="buildModelRequestJsonTree(tool.parameters || {}, 'parameters')"
                    :open="true"
                    :root="true"
                    :strings-expanded="true"
                  />
                </div>
              </div>
            </article>
          </section>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import {
  IconChevronDown,
  IconCode,
  IconMessage,
  IconRobot,
  IconSettings,
  IconTool,
  IconUser,
} from '@tabler/icons-vue'
import { computed, defineComponent, h, nextTick, onBeforeUnmount, onMounted, ref, watch, type Component } from 'vue'
import { Button } from '../components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip'
import ModelRequestJsonTree from '../model-request-json-tree.vue'
import { formatDuration } from './format-duration'
import {
  buildModelRequestAnalysisNavigation,
  compactAnalysisText,
  exceedsAnalysisLineLimit,
  isPreviewableConversationImage,
  modelAnalysisMessageId,
  modelAnalysisResponseToolCallId,
  modelAnalysisResponseToolResultId,
  modelAnalysisToolCallId,
  modelAnalysisToolId,
  normalizeAnalysisQuery,
  analysisTargetScrollTop,
  prepareModelAnalysisTarget,
  resolveAnalysisPromptTarget,
  resolveAnalysisTrajectoryTarget,
  resolveToolDefinitionLocation,
  type ModelRequestAnalysisFocusRow,
  shouldExpandAnalysisText,
  type ModelRequestAnalysisGroupKey,
  type ModelRequestAnalysisNavigationItem,
} from './model-request-analysis'
import { buildModelRequestJsonTree } from './model-request-json'
import {
  parseModelRequestConversationDetail,
  type ModelConversationContentPart,
  type ModelConversationMessage,
  type ModelConversationRole,
  type ModelRequestConversation,
} from './model-request-conversation'
import type { SandboxModelRequestDetail, SandboxModelRequestPromptKind, SandboxModelRequestStatus, SandboxModelRequestTrajectory } from '../../src/types'

const props = defineProps<{
  detail: SandboxModelRequestDetail
  trajectory?: SandboxModelRequestTrajectory
  searchQuery?: string
  layout?: 'page' | 'inspector'
  focusRequest?: {
    kind: SandboxModelRequestPromptKind
    indexInKind: number
    token: number
  }
  focusRow?: ModelRequestAnalysisFocusRow
  requestsCollapsed?: boolean
  toolsCollapsed?: boolean
}>()
const emit = defineEmits<{ locate: [target: string] }>()

const normalizedSearch = computed(() => normalizeAnalysisQuery(props.searchQuery))
const conversation = computed<ModelRequestConversation>(() => parseModelRequestConversationDetail(props.detail))
const response = computed(() => conversation.value.response!)
const navigation = computed(() => buildModelRequestAnalysisNavigation(conversation.value, props.detail))
const visibleNavigationGroups = computed(() => navigation.value.groups.flatMap((group) => {
  if (props.requestsCollapsed && group.key !== 'response') return []
  const items = props.toolsCollapsed
    ? group.items.filter(item => item.kind !== 'tool-call' && item.kind !== 'tool-result' && item.kind !== 'tool-definition')
    : group.items
  return items.length ? [{ ...group, count: items.length, items }] : []
}))
const responseRaw = ref(false)
const rawMessages = ref(new Set<number>())
const collapsedCards = ref(new Set<string>())
const expandedTools = ref(new Set<string>())
const expandedTextTargets = ref(new Set<string>())
const contentElement = ref<HTMLElement>()
const highlightedTarget = ref('')
const responseMatches = computed(() => !normalizedSearch.value || response.value.searchText.toLocaleLowerCase('zh-CN').includes(normalizedSearch.value))
const responseCharacters = computed(() => [
  ...response.value.content,
  ...response.value.reasoning,
  ...response.value.toolCalls.map(call => call.arguments || ''),
  ...response.value.toolResults.map(result => result.content),
].join('').length)
let highlightTimer: ReturnType<typeof setTimeout> | undefined
let relocateObserver: ResizeObserver | undefined
let relocateTimer: ReturnType<typeof setTimeout> | undefined
let locateGeneration = 0
let pendingScrollTop: number | undefined
let pointerStart: { x: number, y: number } | undefined
let suppressToolSummary = false

watch(normalizedSearch, async (query) => {
  if (!query) return
  for (const message of conversation.value.messages) {
    if (message.searchText.toLocaleLowerCase('zh-CN').includes(query)) expandCard(modelAnalysisMessageId(message.index))
  }
  if (response.value.searchText.toLocaleLowerCase('zh-CN').includes(query)) expandCard('model-analysis-response')
  for (const tool of conversation.value.tools) {
    if (tool.searchText.toLocaleLowerCase('zh-CN').includes(query)) expandTool(tool.path.join('.'))
  }
  // 轨迹检查器已经选中了具体账本行，搜索只高亮匹配卡片，不再抢走当前定位。
  if (props.layout === 'inspector') return
  const first = visibleNavigationGroups.value.flatMap(group => group.items).find(itemMatches)
  if (first) await jumpTo(first.target, false)
})

watch(() => props.focusRequest?.token, () => {
  const focus = props.focusRequest
  if (!focus) return
  const target = resolveAnalysisPromptTarget(navigation.value, focus.kind, focus.indexInKind)
  if (target) void jumpTo(target)
})

watch(() => props.focusRow?.id, () => {
  void locateFocusRow()
})

onMounted(() => {
  void locateFocusRow()
})

watch(() => props.detail.id, (next, previous) => {
  if (next === previous) return
  responseRaw.value = false
  rawMessages.value = new Set()
  collapsedCards.value = new Set()
  expandedTools.value = new Set()
  expandedTextTargets.value = new Set()
  highlightedTarget.value = ''
  const scroller = findScroller()
  if (scroller) scroller.scrollTop = 0
})

onBeforeUnmount(() => {
  if (highlightTimer) clearTimeout(highlightTimer)
  stopRelocate()
})

function itemMatches(item: ModelRequestAnalysisNavigationItem) {
  return !normalizedSearch.value || item.searchText.includes(normalizedSearch.value)
}

function messageMatches(message: ModelConversationMessage) {
  return !normalizedSearch.value || message.searchText.toLocaleLowerCase('zh-CN').includes(normalizedSearch.value)
}

async function locateFocusRow() {
  const row = props.focusRow
  if (!row) return
  const target = resolveAnalysisTrajectoryTarget(navigation.value, row, row.indexInKind)
  if (target) await jumpTo(target)
}

async function jumpTo(target?: string, emphasize = true) {
  if (!target) return
  const generation = ++locateGeneration
  const forcedTargets = prepareTarget(target)
  await nextTick()
  expandedTextTargets.value = new Set([...expandedTextTargets.value].filter(candidate => !forcedTargets.includes(candidate)))
  // 长文本折叠发生在下一帧。此时 scrollIntoView 会按未折叠高度把目标算到最底端。
  await nextTick()
  await waitForAnimationFrame()
  await waitForAnimationFrame()
  if (generation !== locateGeneration) return
  scrollTarget(target, 'smooth')
  watchRelocate(target, generation)
  if (emphasize) emphasizeTarget(target)
  emit('locate', target)
}

function findScroller(): HTMLElement | undefined {
  const content = contentElement.value
  if (!content) return undefined
  // 检查器真正滚动的是 inspector-body。analysis-content 在 inspector 下 overflow:visible，
  // scrollIntoView 会带动外层工作台一起滚，首次点开位置必然偏掉。
  if (props.layout === 'inspector') {
    return content.closest<HTMLElement>('.webqq-model-trajectory-inspector-body') ?? content
  }
  return content
}

function measureTargetTop(target: string) {
  const element = findTarget(target)
  const scroller = findScroller()
  if (!element || !scroller) return undefined
  return {
    scroller,
    top: analysisTargetScrollTop(
      element.getBoundingClientRect().top,
      scroller.getBoundingClientRect().top,
      scroller.scrollTop,
    ),
  }
}

function scrollTarget(target: string, behavior: ScrollBehavior) {
  const measured = measureTargetTop(target)
  if (!measured) return
  pendingScrollTop = measured.top
  if (Math.abs(measured.scroller.scrollTop - measured.top) < 2) return
  measured.scroller.scrollTo({ top: measured.top, behavior })
}

function watchRelocate(target: string, generation: number) {
  stopRelocate()
  const content = contentElement.value
  const scroller = findScroller()
  if (!content || typeof ResizeObserver === 'undefined') return
  relocateObserver = new ResizeObserver(() => {
    if (generation !== locateGeneration) return
    const measured = measureTargetTop(target)
    if (!measured) return
    // 锚点没变就是平滑滚动的中间帧。只有折叠把目标挤走时才瞬时校正。
    if (pendingScrollTop !== undefined && Math.abs(pendingScrollTop - measured.top) < 8) return
    pendingScrollTop = measured.top
    if (Math.abs(measured.scroller.scrollTop - measured.top) < 2) return
    measured.scroller.scrollTo({ top: measured.top, behavior: 'auto' })
  })
  relocateObserver.observe(content)
  if (scroller && scroller !== content) relocateObserver.observe(scroller)
  relocateTimer = setTimeout(stopRelocate, 480)
}

function stopRelocate() {
  relocateObserver?.disconnect()
  relocateObserver = undefined
  if (!relocateTimer) return
  clearTimeout(relocateTimer)
  relocateTimer = undefined
}

function waitForAnimationFrame() {
  return new Promise<void>(resolve => {
    requestAnimationFrame(() => resolve())
  })
}

function prepareTarget(target: string) {
  const preparation = prepareModelAnalysisTarget(conversation.value, target)
  for (const card of preparation.expandCards) expandCard(card)
  for (const path of preparation.toolPaths) expandTool(path.join('.'))
  if (preparation.messageIndex !== undefined && rawMessages.value.has(preparation.messageIndex)) {
    toggleRaw(preparation.messageIndex)
  }
  if (preparation.response && responseRaw.value) responseRaw.value = false
  expandedTextTargets.value = new Set([...expandedTextTargets.value, ...preparation.expandTargets])
  return preparation.expandTargets
}

function findTarget(target: string): HTMLElement | null {
  const candidates = contentElement.value?.querySelectorAll<HTMLElement>('[id]') ?? []
  return [...candidates].find(element => element.id === target) ?? null
}

function emphasizeTarget(target: string) {
  highlightedTarget.value = target
  if (highlightTimer) clearTimeout(highlightTimer)
  highlightTimer = setTimeout(() => {
    if (highlightedTarget.value === target) highlightedTarget.value = ''
  }, 1500)
}

function locateTool(name: string) {
  const location = resolveToolDefinitionLocation(conversation.value.tools, name)
  if (!location) return
  for (const path of location.toolPaths) expandTool(path.join('.'))
  void jumpTo(location.target)
}

function hasTool(name: string) {
  return conversation.value.tools.some(tool => tool.name === name)
}

function toggleRaw(index: number) {
  expandCard(modelAnalysisMessageId(index))
  const next = new Set(rawMessages.value)
  next.has(index) ? next.delete(index) : next.add(index)
  rawMessages.value = next
}

function toggleResponseRaw() {
  expandCard('model-analysis-response')
  responseRaw.value = !responseRaw.value
}

function isCardCollapsed(target: string) {
  return collapsedCards.value.has(target)
}

// 折叠仅隐藏正文而不卸载内容，避免原始模式和长文本展开状态在再次展开时丢失。
function toggleCard(target: string) {
  const next = new Set(collapsedCards.value)
  next.has(target) ? next.delete(target) : next.add(target)
  collapsedCards.value = next
}

// 头部空白也折叠。JSON / 箭头是独立按钮，closest('button') 避免点它们时再切一次。
function toggleCardFromHeader(event: MouseEvent, target: string) {
  const selection = window.getSelection()
  if (selection && !selection.isCollapsed) return
  if (event.target instanceof Element && event.target.closest('button')) return
  toggleCard(target)
}

function expandCard(target: string) {
  if (!collapsedCards.value.has(target)) return
  const next = new Set(collapsedCards.value)
  next.delete(target)
  collapsedCards.value = next
}

function expandTool(path: string) {
  if (expandedTools.value.has(path)) return
  expandedTools.value = new Set([...expandedTools.value, path])
}

function toggleTool(path: string) {
  const next = new Set(expandedTools.value)
  next.has(path) ? next.delete(path) : next.add(path)
  expandedTools.value = next
}

// 工具摘要同时允许复制文本；拖选结束会触发 click，必须区分位移和折叠操作，避免选中文字时意外收起卡片。
function startToolPointer(event: PointerEvent) {
  pointerStart = { x: event.clientX, y: event.clientY }
  suppressToolSummary = false
}

function finishToolPointer(event: PointerEvent) {
  if (!pointerStart) return
  suppressToolSummary = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 3
  pointerStart = undefined
}

function toggleToolFromSummary(path: string) {
  const selection = window.getSelection()
  if (suppressToolSummary || selection && !selection.isCollapsed) {
    suppressToolSummary = false
    return
  }
  toggleTool(path)
}

function roleLabel(role: ModelConversationRole) {
  if (role === 'system') return 'system'
  if (role === 'user') return 'user'
  if (role === 'assistant') return 'assistant'
  return 'tool'
}

function groupIcon(group: ModelRequestAnalysisGroupKey): Component {
  if (group === 'system') return IconSettings
  if (group === 'user') return IconUser
  if (group === 'assistant') return IconRobot
  if (group === 'tool') return IconTool
  return IconMessage
}

function statusLabel(status: SandboxModelRequestStatus) {
  if (status === 'pending') return '进行中'
  if (status === 'error') return '错误'
  return '已完成'
}

function parseAnalysisJson(value: string | undefined) {
  if (!value) return {}
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function formatPath(path: string[]) {
  return path.reduce((result, part) => /^\d+$/.test(part) ? `${result}[${part}]` : result ? `${result}.${part}` : part, '')
}

function messageCharacters(message: ModelConversationMessage) {
  return [message.content, message.reasoning || '', ...message.toolCalls.map(call => call.arguments || '')].join('').length
}

const responseFormatLabel = computed(() => response.value.format?.toUpperCase() || response.value.status.toUpperCase())

const AnalysisHighlightedText = defineComponent({
  props: {
    value: { type: String, default: '' },
    query: { type: String, default: '' },
  },
  setup(highlightProps) {
    return () => h('span', highlightText(highlightProps.value, highlightProps.query))
  },
})

const AnalysisTextBlock = defineComponent({
  props: {
    label: String,
    value: { type: String, default: '' },
    searchQuery: { type: String, default: '' },
    maxLines: { type: Number, default: 12 },
    forceExpanded: Boolean,
    compact: Boolean,
  },
  setup(blockProps) {
    const expanded = ref(false)
    const collapsible = ref(false)
    const collapsedHeight = ref('')
    const textElement = ref<HTMLElement>()
    let resizeObserver: ResizeObserver | undefined

    function measureLines() {
      const element = textElement.value
      if (!element) return
      const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight)
      if (!Number.isFinite(lineHeight) || lineHeight <= 0) {
        collapsible.value = false
        return
      }
      collapsedHeight.value = `${lineHeight * blockProps.maxLines}px`
      collapsible.value = exceedsAnalysisLineLimit(element.scrollHeight, lineHeight, blockProps.maxLines)
    }

    watch(
      [() => blockProps.value, () => blockProps.maxLines],
      async () => {
        await nextTick()
        measureLines()
      },
    )
    watch(
      [() => blockProps.searchQuery, () => blockProps.forceExpanded],
      ([query, forceExpanded]) => {
        if (shouldExpandAnalysisText(expanded.value, forceExpanded, query, blockProps.value)) expanded.value = true
      },
      { immediate: true },
    )
    onMounted(async () => {
      await nextTick()
      measureLines()
      if (typeof ResizeObserver === 'undefined' || !textElement.value) return
      resizeObserver = new ResizeObserver(measureLines)
      resizeObserver.observe(textElement.value)
    })
    onBeforeUnmount(() => resizeObserver?.disconnect())

    return () => h('section', {
      class: ['webqq-model-analysis-section', { 'is-collapsed': collapsible.value && !expanded.value, 'is-compact': blockProps.compact }],
    }, [
      blockProps.label && h('strong', blockProps.label),
      h('div', { class: 'webqq-model-analysis-text-wrap' }, [
        h('pre', {
          ref: textElement,
          style: { '--webqq-model-analysis-collapse-height': collapsedHeight.value },
        }, highlightText(blockProps.value, blockProps.searchQuery)),
        collapsible.value && h('button', {
          type: 'button',
          class: 'webqq-model-analysis-expand',
          onClick: () => { expanded.value = !expanded.value },
        }, [
          expanded.value ? '收起' : `展开全部（${blockProps.value.length} 字符）`,
          h(IconChevronDown, { size: 12, 'aria-hidden': 'true' }),
        ]),
      ]),
    ])
  },
})

const AnalysisContentParts = defineComponent({
  props: {
    parts: { type: Array as () => ModelConversationContentPart[], required: true },
    searchQuery: { type: String, default: '' },
    forceExpanded: Boolean,
  },
  setup(contentProps) {
    const failedImages = ref(new Set<number>())
    const failImage = (index: number) => {
      failedImages.value = new Set([...failedImages.value, index])
    }
    return () => h('div', { class: 'webqq-model-analysis-parts' }, contentProps.parts.map((part, index) => {
      if (part.kind === 'image' && isPreviewableConversationImage(part.value) && !failedImages.value.has(index)) {
        return h('figure', { key: index, class: 'webqq-model-analysis-image' }, [
          h('img', {
            src: part.value,
            alt: `请求图片 ${index + 1}`,
            onError: () => failImage(index),
          }),
          h('figcaption', part.mimeType || 'image'),
        ])
      }
      const label = part.kind === 'text' ? undefined : part.kind === 'image' ? '图片加载失败' : part.kind
      return h(AnalysisTextBlock, {
        key: index,
        label,
        value: part.value,
        searchQuery: contentProps.searchQuery,
        forceExpanded: contentProps.forceExpanded,
      })
    }))
  },
})

function highlightText(value: string, query: string) {
  if (!query) return value
  const lower = value.toLocaleLowerCase('zh-CN')
  const nodes: Array<string | ReturnType<typeof h>> = []
  let offset = 0
  while (offset < value.length) {
    const index = lower.indexOf(query, offset)
    if (index < 0) {
      nodes.push(value.slice(offset))
      break
    }
    if (index > offset) nodes.push(value.slice(offset, index))
    nodes.push(h('mark', value.slice(index, index + query.length)))
    offset = index + query.length
  }
  return nodes
}
</script>
