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
          <h3>Messages <span>({{ visibleMessages.length }})</span></h3>
        </header>

        <div class="webqq-model-analysis-conversation">
          <div v-if="conversation.parseError && !conversation.messages.length" class="webqq-model-analysis-empty">
            <p>{{ conversation.parseError }}</p>
          </div>
          <div v-else-if="!visibleMessages.length" class="webqq-model-analysis-empty">
            <p>当前过滤条件下没有请求消息</p>
          </div>

          <article
            v-for="message in visibleMessages"
            :id="modelAnalysisTargetId(message.evidenceId)"
            :key="message.evidenceId"
            class="webqq-model-analysis-card"
            :class="[
              `is-${message.role}`,
              {
                'is-collapsed': isCardCollapsed(modelAnalysisTargetId(message.evidenceId)),
                'is-muted': normalizedSearch && !messageMatches(message),
                'is-located': highlightedTarget === modelAnalysisTargetId(message.evidenceId),
              },
            ]"
          >
            <header @click="toggleCardFromHeader($event, modelAnalysisTargetId(message.evidenceId))">
              <span class="webqq-model-analysis-role"><AnalysisHighlightedText :value="roleLabel(message.role)" :query="normalizedSearch" /></span>
              <span class="webqq-model-analysis-index">#{{ message.index }}</span>
              <span class="webqq-model-analysis-path">{{ formatEvidencePath(message.path) }}</span>
              <span class="webqq-model-analysis-chars">{{ message.characters }} chars</span>
              <TooltipProvider :delay-duration="500">
                <Tooltip>
                  <TooltipTrigger as-child>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      :aria-label="rawMessages.has(message.evidenceId) ? `查看第 ${message.index} 条消息格式化内容` : `查看第 ${message.index} 条消息原始 JSON`"
                      @click="toggleRaw(message.evidenceId)"
                    >
                      <IconCode :size="16" aria-hidden="true" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{{ rawMessages.has(message.evidenceId) ? '查看格式化内容' : '查看原始 JSON' }}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider :delay-duration="500">
                <Tooltip>
                  <TooltipTrigger as-child>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      class="webqq-model-analysis-collapse"
                      :aria-expanded="!isCardCollapsed(modelAnalysisTargetId(message.evidenceId))"
                      :aria-label="isCardCollapsed(modelAnalysisTargetId(message.evidenceId)) ? `展开第 ${message.index} 条消息卡片` : `收起第 ${message.index} 条消息卡片`"
                      @click="toggleCard(modelAnalysisTargetId(message.evidenceId))"
                    >
                      <IconChevronDown :size="16" aria-hidden="true" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{{ isCardCollapsed(modelAnalysisTargetId(message.evidenceId)) ? '展开消息卡片' : '收起消息卡片' }}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </header>

            <div v-show="!isCardCollapsed(modelAnalysisTargetId(message.evidenceId)) && rawMessages.has(message.evidenceId)" class="webqq-model-analysis-json">
              <div class="webqq-model-analysis-source-path">{{ formatEvidencePath(message.path) }}</div>
              <ModelRequestJsonTree
                :node="buildModelRequestJsonTree(message.raw, `message-${message.index}`)"
                :open="true"
                :root="true"
                :strings-expanded="true"
                :images-preview="true"
              />
            </div>
            <div v-show="!isCardCollapsed(modelAnalysisTargetId(message.evidenceId)) && !rawMessages.has(message.evidenceId)" class="webqq-model-analysis-formatted">
              <AnalysisContentParts
                v-if="message.contentParts.length"
                :parts="message.contentParts"
                :search-query="normalizedSearch"
                :force-expanded="expandedTextTargets.has(modelAnalysisTargetId(message.evidenceId))"
              />
              <AnalysisTextBlock
                v-else-if="message.content"
                :value="message.content"
                :search-query="normalizedSearch"
                :force-expanded="expandedTextTargets.has(modelAnalysisTargetId(message.evidenceId))"
              />
              <AnalysisTextBlock
                v-if="message.reasoning"
                label="思考"
                :value="message.reasoning"
                :search-query="normalizedSearch"
                :force-expanded="expandedTextTargets.has(modelAnalysisTargetId(message.evidenceId))"
              />
              <section v-if="message.toolCalls.length && requestToolCallsVisible" class="webqq-model-analysis-section">
                <strong>工具调用</strong>
                <article
                  v-for="(call, callIndex) in message.toolCalls"
                  :id="modelAnalysisTargetId(call.evidenceId)"
                  :key="`${call.id || callIndex}-${call.name}`"
                  class="webqq-model-analysis-tool-call is-call"
                  :class="{ 'is-located': highlightedTarget === modelAnalysisTargetId(call.evidenceId) }"
                >
                  <div><strong><AnalysisHighlightedText :value="call.name" :query="normalizedSearch" /></strong><span><AnalysisHighlightedText :value="call.id || '无调用 ID'" :query="normalizedSearch" /></span></div>
                  <AnalysisTextBlock
                    :value="call.arguments || '{}'"
                    :search-query="normalizedSearch"
                    :force-expanded="expandedTextTargets.has(modelAnalysisTargetId(call.evidenceId))"
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

          <template v-if="responseVisible">
          <section class="webqq-model-analysis-response-heading">
            <h3>Response</h3>
          </section>
          <article
            id="model-analysis-response"
            class="webqq-model-analysis-card is-response"
            :class="{
              'is-collapsed': isCardCollapsed(MODEL_ANALYSIS_RESPONSE_TARGET),
              'is-muted': normalizedSearch && !responseMatches,
              'is-located': highlightedTarget === MODEL_ANALYSIS_RESPONSE_TARGET,
            }"
          >
            <header @click="toggleCardFromHeader($event, MODEL_ANALYSIS_RESPONSE_TARGET)">
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
                      :aria-expanded="!isCardCollapsed(MODEL_ANALYSIS_RESPONSE_TARGET)"
                      :aria-label="isCardCollapsed(MODEL_ANALYSIS_RESPONSE_TARGET) ? '展开响应卡片' : '收起响应卡片'"
                      @click="toggleCard(MODEL_ANALYSIS_RESPONSE_TARGET)"
                    >
                      <IconChevronDown :size="16" aria-hidden="true" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{{ isCardCollapsed(MODEL_ANALYSIS_RESPONSE_TARGET) ? '展开响应卡片' : '收起响应卡片' }}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </header>

            <div v-show="!isCardCollapsed(MODEL_ANALYSIS_RESPONSE_TARGET) && responseRaw && response.raw !== undefined" class="webqq-model-analysis-json">
              <pre v-if="typeof response.raw === 'string'" class="webqq-model-analysis-raw-text">{{ response.raw }}</pre>
              <ModelRequestJsonTree
                v-else
                :node="buildModelRequestJsonTree(response.raw, 'response')"
                :open="true"
                :root="true"
                :strings-expanded="true"
                :images-preview="true"
              />
            </div>
            <div v-show="!isCardCollapsed(MODEL_ANALYSIS_RESPONSE_TARGET) && !responseRaw" class="webqq-model-analysis-formatted">
              <p v-if="response.status !== 'complete'" class="webqq-model-analysis-empty">
                {{ response.statusMessage || '响应没有可展示内容' }}
              </p>
              <AnalysisTextBlock
                v-if="response.reasoning.length && responseContentVisible"
                label="思考"
                :value="response.reasoning.join('\n')"
                :search-query="normalizedSearch"
                :force-expanded="expandedTextTargets.has(MODEL_ANALYSIS_RESPONSE_TARGET)"
              />
              <AnalysisTextBlock
                v-if="response.content.length && responseContentVisible"
                :value="response.content.join('\n')"
                :search-query="normalizedSearch"
                :force-expanded="expandedTextTargets.has(MODEL_ANALYSIS_RESPONSE_TARGET)"
              />
              <section v-if="response.toolCalls.length && responseToolCallsVisible" class="webqq-model-analysis-section">
                <strong>工具调用</strong>
                <article
                  v-for="(call, callIndex) in response.toolCalls"
                  :id="modelAnalysisTargetId(call.evidenceId)"
                  :key="`${call.id || callIndex}-${call.name}`"
                  class="webqq-model-analysis-tool-call is-call"
                  :class="{ 'is-located': highlightedTarget === modelAnalysisTargetId(call.evidenceId) }"
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
              <section v-if="response.toolResults.length && responseToolResultsVisible" class="webqq-model-analysis-section">
                <strong>工具结果</strong>
                <article
                  v-for="(result, resultIndex) in response.toolResults"
                  :id="modelAnalysisTargetId(result.evidenceId)"
                  :key="`${result.id || resultIndex}-${result.name || ''}`"
                  class="webqq-model-analysis-tool-call is-result"
                  :class="{ 'is-located': highlightedTarget === modelAnalysisTargetId(result.evidenceId) }"
                >
                  <div><strong><AnalysisHighlightedText :value="result.name || '工具结果'" :query="normalizedSearch" /></strong><span><AnalysisHighlightedText :value="result.id || '无调用 ID'" :query="normalizedSearch" /></span></div>
                  <AnalysisTextBlock
                    :value="result.content"
                    :search-query="normalizedSearch"
                    :force-expanded="expandedTextTargets.has(modelAnalysisTargetId(result.evidenceId))"
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
          </template>

          <section v-if="toolDefinitionsVisible" :id="MODEL_ANALYSIS_TOOLS_TARGET" class="webqq-model-analysis-tools" :class="{ 'is-located': highlightedTarget === MODEL_ANALYSIS_TOOLS_TARGET }">
            <h3>Tools <span>({{ conversation.tools.length }})</span></h3>
            <p v-if="!conversation.tools.length" class="webqq-model-analysis-empty">请求未声明工具定义</p>
            <article
              v-for="tool in conversation.tools"
              :id="modelAnalysisTargetId(tool.evidenceId)"
              :key="tool.evidenceId"
              class="webqq-model-analysis-tool-card"
              :class="{
                'is-expanded': expandedTools.has(tool.evidenceId),
                'is-muted': normalizedSearch && !tool.searchText.toLocaleLowerCase('zh-CN').includes(normalizedSearch),
                'is-located': highlightedTarget === modelAnalysisTargetId(tool.evidenceId),
              }"
            >
              <button
                type="button"
                class="webqq-model-analysis-tool-summary"
                :aria-expanded="expandedTools.has(tool.evidenceId)"
                @pointerdown="startToolPointer"
                @pointerup="finishToolPointer"
                @click="toggleToolFromSummary(tool.evidenceId)"
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
              <div v-if="expandedTools.has(tool.evidenceId)" class="webqq-model-analysis-tool-detail">
                <p><AnalysisHighlightedText :value="tool.description || '无描述'" :query="normalizedSearch" /></p>
                <h4>Parameters (JSON Schema) <small>{{ formatEvidencePath(tool.path) }}</small></h4>
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
  formatEvidencePath,
  isPreviewableConversationImage,
  MODEL_ANALYSIS_RESPONSE_TARGET,
  MODEL_ANALYSIS_TOOLS_TARGET,
  modelAnalysisTargetId,
  normalizeAnalysisQuery,
  shouldExpandAnalysisText,
  type ModelRequestAnalysisGroupKey,
  type ModelRequestAnalysisNavigationItem,
} from './model-request-analysis'
import { createEvidenceLocator, type LocateRequest } from './evidence-locator'
import { buildModelRequestJsonTree } from './model-request-json'
import {
  EMPTY_MODEL_EVIDENCE_FILTER,
  analysisItemFilterKind,
  isEvidenceVisible,
  messageRoleFilterKind,
  type ModelEvidenceFilter,
} from './model-request-filter'
import {
  parseModelRequestConversationDetail,
  type ModelConversationContentPart,
  type ModelConversationMessage,
  type ModelConversationRole,
  type ModelRequestConversation,
} from './model-request-conversation'
import type { SandboxModelRequestDetail, SandboxModelRequestStatus, SandboxModelRequestTrajectory } from '../../src/types'

const props = defineProps<{
  detail: SandboxModelRequestDetail
  trajectory?: SandboxModelRequestTrajectory
  searchQuery?: string
  layout?: 'page' | 'inspector'
  /** 跨视图定位信号；轨迹账本与组成分段都发这个形状。 */
  locateRequest?: LocateRequest
  /** 与轨迹账本共用的显示过滤；同一条证据在两个视图里必须同时出现或同时隐藏。 */
  filter?: ModelEvidenceFilter
}>()
const emit = defineEmits<{ locate: [target: string] }>()

const normalizedSearch = computed(() => normalizeAnalysisQuery(props.searchQuery))
const conversation = computed<ModelRequestConversation>(() => parseModelRequestConversationDetail(props.detail))
const response = computed(() => conversation.value.response!)
const navigation = computed(() => buildModelRequestAnalysisNavigation(conversation.value, props.detail))
const evidenceFilter = computed(() => props.filter ?? EMPTY_MODEL_EVIDENCE_FILTER)
const visibleNavigationGroups = computed(() => navigation.value.groups.flatMap((group) => {
  const items = group.items.filter(item => isEvidenceVisible(
    evidenceFilter.value,
    analysisItemFilterKind(item.kind, group.key),
  ))
  return items.length ? [{ ...group, count: items.length, items }] : []
}))
const visibleMessages = computed(() => conversation.value.messages.filter(message => isEvidenceVisible(
  evidenceFilter.value,
  messageRoleFilterKind(message.role),
)))
const requestToolCallsVisible = computed(() => isEvidenceVisible(evidenceFilter.value, 'tool-call'))
const toolDefinitionsVisible = computed(() => isEvidenceVisible(evidenceFilter.value, 'tool-definition'))
const responseContentVisible = computed(() => isEvidenceVisible(evidenceFilter.value, 'assistant'))
const responseToolCallsVisible = computed(() => isEvidenceVisible(evidenceFilter.value, 'tool-call'))
const responseToolResultsVisible = computed(() => isEvidenceVisible(evidenceFilter.value, 'tool-result'))
const responseVisible = computed(() => (
  responseContentVisible.value || responseToolCallsVisible.value || responseToolResultsVisible.value
))
const responseRaw = ref(false)
const rawMessages = ref(new Set<string>())
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
let pointerStart: { x: number, y: number } | undefined
let suppressToolSummary = false

// 定位的全部决策与帧时序都在 evidence-locator 里；这里只交出 DOM、渲染状态与计时出口。
const locator = createEvidenceLocator({
  getConversation: () => conversation.value,
  getNavigation: () => navigation.value,
  measure: (target) => {
    const element = findTarget(target)
    const scroller = findScroller()
    if (!element || !scroller) return undefined
    return {
      elementTop: element.getBoundingClientRect().top,
      scrollerTop: scroller.getBoundingClientRect().top,
      scrollTop: scroller.scrollTop,
    }
  },
  scrollTo: (top, behavior) => {
    findScroller()?.scrollTo({ top, behavior })
  },
  expandCard,
  setToolExpanded: expandTool,
  isMessageRaw: evidenceId => rawMessages.value.has(evidenceId),
  setMessageRaw: (evidenceId, raw) => {
    const next = new Set(rawMessages.value)
    raw ? next.add(evidenceId) : next.delete(evidenceId)
    rawMessages.value = next
  },
  isResponseRaw: () => responseRaw.value,
  setResponseRaw: (raw) => {
    responseRaw.value = raw
  },
  getExpandedText: () => [...expandedTextTargets.value],
  setExpandedText: (targets) => {
    expandedTextTargets.value = new Set(targets)
  },
  setHighlight: (target) => {
    highlightedTarget.value = target ?? ''
  },
  nextTick,
  frame: () => new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve())
  }),
  observeResize: (callback) => {
    const content = contentElement.value
    const scroller = findScroller()
    if (!content || typeof ResizeObserver === 'undefined') return () => {}
    const observer = new ResizeObserver(callback)
    observer.observe(content)
    if (scroller && scroller !== content) observer.observe(scroller)
    return () => observer.disconnect()
  },
  schedule: (delayMs, callback) => {
    const timer = setTimeout(callback, delayMs)
    return () => clearTimeout(timer)
  },
})

watch(normalizedSearch, async (query) => {
  if (!query) return
  for (const message of conversation.value.messages) {
    if (message.searchText.toLocaleLowerCase('zh-CN').includes(query)) expandCard(modelAnalysisTargetId(message.evidenceId))
  }
  if (response.value.searchText.toLocaleLowerCase('zh-CN').includes(query)) expandCard(MODEL_ANALYSIS_RESPONSE_TARGET)
  for (const tool of conversation.value.tools) {
    if (tool.searchText.toLocaleLowerCase('zh-CN').includes(query)) expandTool(tool.evidenceId)
  }
  // 轨迹检查器已经选中了具体账本行，搜索只高亮匹配卡片，不再抢走当前定位。
  if (props.layout === 'inspector') return
  const first = visibleNavigationGroups.value.flatMap(group => group.items).find(itemMatches)
  if (first) await jumpTo(first.target, false)
})

watch(() => props.locateRequest?.seq, () => {
  void locateRequestedEvidence()
})

onMounted(() => {
  void locateRequestedEvidence()
})

watch(() => props.detail.id, (next, previous) => {
  if (next === previous) return
  responseRaw.value = false
  rawMessages.value = new Set()
  collapsedCards.value = new Set()
  expandedTools.value = new Set()
  expandedTextTargets.value = new Set()
  locator.reset()
  const scroller = findScroller()
  if (scroller) scroller.scrollTop = 0
})

onBeforeUnmount(() => {
  locator.dispose()
})

function itemMatches(item: ModelRequestAnalysisNavigationItem) {
  return !normalizedSearch.value || item.searchText.includes(normalizedSearch.value)
}

function messageMatches(message: ModelConversationMessage) {
  return !normalizedSearch.value || message.searchText.toLocaleLowerCase('zh-CN').includes(normalizedSearch.value)
}

async function locateRequestedEvidence() {
  const request = props.locateRequest
  if (!request) return
  const located = await locator.locateEvidence(request.evidenceId)
  if (located) emit('locate', located)
}

async function jumpTo(target?: string, emphasize = true) {
  const located = await locator.locate(target, { emphasize })
  if (located) emit('locate', located)
}

function locateTool(name: string) {
  void locator.locateTool(name).then((located) => {
    if (located) emit('locate', located)
  })
}

function findScroller(): HTMLElement | undefined {
  const content = contentElement.value
  if (!content) return undefined
  // 检查器真正滚动的是 inspector-body。analysis-content 在 inspector 下 overflow:visible，
  // 让内层滚动会带动外层工作台一起滚，首次点开位置必然偏掉。
  if (props.layout === 'inspector') {
    return content.closest<HTMLElement>('.webqq-model-trajectory-inspector-body') ?? content
  }
  return content
}

function findTarget(target: string): HTMLElement | null {
  const candidates = contentElement.value?.querySelectorAll<HTMLElement>('[id]') ?? []
  return [...candidates].find(element => element.id === target) ?? null
}

function hasTool(name: string) {
  // 工具定义整段被过滤掉时不给跳转入口，否则会定位到一个当前不存在的目标。
  if (!toolDefinitionsVisible.value) return false
  return conversation.value.tools.some(tool => tool.name === name)
}

function toggleRaw(evidenceId: string) {
  expandCard(modelAnalysisTargetId(evidenceId))
  const next = new Set(rawMessages.value)
  next.has(evidenceId) ? next.delete(evidenceId) : next.add(evidenceId)
  rawMessages.value = next
}

function toggleResponseRaw() {
  expandCard(MODEL_ANALYSIS_RESPONSE_TARGET)
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
    parts: { type: Array as () => readonly ModelConversationContentPart[], required: true },
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
