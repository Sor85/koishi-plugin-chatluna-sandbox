<template>
  <section class="webqq-model-analysis" aria-label="模型请求分析">
    <div class="webqq-model-analysis-main">
      <aside class="webqq-model-analysis-nav" aria-label="分析导航">
        <button
          v-for="group in groups"
          :key="group.key"
          type="button"
          class="webqq-model-analysis-nav-group"
          :class="{ 'is-muted': searchQuery && !group.items.some((item) => item.matches) }"
          @click="jumpTo(group.items[0]?.target)">
          <span class="webqq-model-analysis-nav-heading"><strong>{{ group.label }}</strong><small>{{ group.items.length }}</small></span>
          <span v-for="item in group.items" :key="item.id" class="webqq-model-analysis-nav-item" :class="{ 'is-muted': searchQuery && !item.matches }" @click.stop="jumpTo(item.target)">
            <span class="webqq-model-analysis-nav-kind">{{ item.label }}</span>
            <span>#{{ item.index }} {{ item.preview }}</span>
          </span>
        </button>
      </aside>

      <div ref="contentElement" class="webqq-model-analysis-content">
        <header class="webqq-model-analysis-heading">
          <h3>Messages <span>({{ conversation.messages.length }})</span></h3>
          <Button size="sm" variant="outline" @click="rawRequest = !rawRequest">
            <IconCode data-icon="inline-start" aria-hidden="true" />
            {{ rawRequest ? '返回对话' : '完整请求 JSON' }}
          </Button>
        </header>
        <div v-if="conversation.parseError && !conversation.messages.length" class="webqq-model-analysis-empty">
          <p>{{ conversation.parseError }}</p>
          <Button size="sm" variant="outline" @click="rawRequest = true">查看完整请求 JSON</Button>
        </div>
          <div v-else-if="rawRequest" class="webqq-model-analysis-raw">
          <ModelRequestJsonTree :node="requestTree" :open="true" :root="true" :strings-expanded="true" :images-preview="true" />
        </div>
        <template v-else>
          <article v-for="message in visibleMessages" :id="messageId(message.index)" :key="message.index" class="webqq-model-analysis-card" :class="[`is-${message.role}`, { 'is-muted': searchQuery && !messageMatches(message) }]">
            <header>
              <span class="webqq-model-analysis-role">{{ message.role }}</span>
              <span class="webqq-model-analysis-index">#{{ message.index }}</span>
              <span class="webqq-model-analysis-path">{{ formatPath(message.path) }}</span>
              <span class="webqq-model-analysis-chars">{{ messageCharacters(message) }} chars</span>
              <Button size="icon-sm" variant="ghost" :aria-label="`切换第 ${message.index} 条消息 JSON`" @click="toggleRaw(message.index)"><IconCode :size="16" aria-hidden="true" /></Button>
            </header>
            <div v-if="rawMessages.has(message.index)" class="webqq-model-analysis-json"><ModelRequestJsonTree :node="buildModelRequestJsonTree(message.raw, `message-${message.index}`)" :open="true" :root="true" :strings-expanded="true" :images-preview="true" /></div>
            <template v-else>
              <AnalysisTextBlock label="内容" :value="message.content" :search-query="searchQuery" />
              <AnalysisTextBlock v-if="message.reasoning" label="思考" :value="message.reasoning" :search-query="searchQuery" />
              <div v-if="message.toolCalls.length" class="webqq-model-analysis-section">
                <strong>工具调用</strong>
                <div v-for="call in message.toolCalls" :key="`${call.id}-${call.name}`" class="webqq-model-analysis-tool-call">
                  <div><strong>{{ call.name }}</strong><span>{{ call.id || '无调用 ID' }}</span></div>
                  <pre>{{ call.arguments || '{}' }}</pre>
                  <button v-if="findTool(call.name)" type="button" class="webqq-model-analysis-link" @click="jumpTo(`tool-${findTool(call.name)?.path.join('-')}`)">查看工具定义</button>
                </div>
              </div>
            </template>
          </article>

          <article id="model-analysis-response" class="webqq-model-analysis-card is-response" :class="{ 'is-muted': searchQuery && !responseMatches }">
            <header><span class="webqq-model-analysis-role">响应</span><span class="webqq-model-analysis-path">{{ response?.format?.toUpperCase() || '未完成' }}</span><span v-if="response" class="webqq-model-analysis-chars">{{ responseCharacters }} chars</span><Button size="icon-sm" variant="ghost" aria-label="切换响应原始 JSON" @click="responseRaw = !responseRaw"><IconCode :size="16" aria-hidden="true" /></Button></header>
            <div v-if="responseRaw && response" class="webqq-model-analysis-json"><ModelRequestJsonTree :node="buildModelRequestJsonTree(response.raw, 'response')" :open="true" :root="true" :strings-expanded="true" :images-preview="true" /></div>
            <template v-else-if="response">
              <AnalysisTextBlock label="内容" :value="response.content.join('\n')" :search-query="searchQuery" />
              <AnalysisTextBlock v-if="response.reasoning.length" label="思考" :value="response.reasoning.join('\n')" :search-query="searchQuery" />
              <AnalysisTextBlock v-if="response.toolCalls.length" label="工具调用" :value="response.toolCalls.map((call) => `${call.name}\n${call.arguments || '{}'}`).join('\n\n')" :search-query="searchQuery" />
              <div v-if="response.finishReasons.length || response.usage" class="webqq-model-analysis-response-meta"><span v-if="response.finishReasons.length">结束原因：{{ response.finishReasons.join('、') }}</span><span v-if="response.usage">Token：{{ response.usage.totalTokens ?? '未知' }}</span></div>
            </template>
            <p v-else class="webqq-model-analysis-empty">响应尚未采集或不可用</p>
          </article>

          <section id="model-analysis-tools" class="webqq-model-analysis-tools"><h3>Tools <span>({{ conversation.tools.length }})</span></h3>
            <article v-for="tool in conversation.tools" :id="`tool-${tool.path.join('-')}`" :key="tool.path.join('.')" class="webqq-model-analysis-tool-card" :class="{ 'is-expanded': expandedTools.has(tool.path.join('.')) }">
              <button type="button" class="webqq-model-analysis-tool-summary" @click="toggleTool(tool.path.join('.'))"><IconTool :size="18" aria-hidden="true" /><strong>{{ tool.name }}</strong><span>{{ compact(tool.description) }}</span><small>{{ propertyCount(tool.parameters) }} props<span v-if="requiredCount(tool.parameters)"> · required: {{ requiredFields(tool.parameters) }}</span></small><IconChevronDown :size="18" aria-hidden="true" /></button>
              <div v-if="expandedTools.has(tool.path.join('.'))" class="webqq-model-analysis-tool-detail"><p>{{ tool.description || '无描述' }}</p><h4>Parameters (JSON Schema) <small>{{ formatPath(tool.path) }}</small></h4><AnalysisTextBlock :value="formatJson(tool.parameters || {})" :search-query="searchQuery" /></div>
            </article>
          </section>
        </template>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { IconChevronDown, IconCode, IconTool } from '@tabler/icons-vue'
import { computed, defineComponent, h, ref } from 'vue'
import { Button } from '../components/ui/button'
import ModelRequestJsonTree from '../model-request-json-tree.vue'
import { buildModelRequestJsonTree } from './model-request-json'
import { parseModelRequestConversationDetail, type ModelConversationMessage, type ModelRequestConversation } from './model-request-conversation'
import type { SandboxModelRequestDetail, SandboxModelRequestTrajectory } from '../../src/types'

const props = defineProps<{ detail: SandboxModelRequestDetail; trajectory?: SandboxModelRequestTrajectory; searchQuery?: string }>()
const emit = defineEmits<{ locate: [target: string] }>()
const searchQuery = computed(() => props.searchQuery?.trim().toLowerCase() || '')
const conversation = computed<ModelRequestConversation>(() => parseModelRequestConversationDetail(props.detail))
const response = computed(() => conversation.value.response)
const rawRequest = ref(false)
const responseRaw = ref(false)
const rawMessages = ref(new Set<number>())
const expandedTools = ref(new Set<string>())
const contentElement = ref<HTMLElement>()
const requestTree = computed(() => buildModelRequestJsonTree(props.detail.requestBody, 'requestBody'))
const visibleMessages = computed(() => conversation.value.messages)
const responseMatches = computed(() => !searchQuery.value || response.value?.searchText.toLowerCase().includes(searchQuery.value))
const responseCharacters = computed(() => response.value ? [...response.value.content, ...response.value.reasoning, ...response.value.toolCalls.map((call) => call.arguments || '')].join('').length : 0)
const groups = computed(() => {
  const items = conversation.value.messages.map((message) => ({ id: messageId(message.index), index: message.index, label: message.role.toUpperCase(), preview: compact(message.content || message.reasoning || message.toolCalls[0]?.name || '工具结果'), target: messageId(message.index), matches: messageMatches(message) }))
  const result = ['system', 'user', 'assistant', 'tool'].map((role) => ({ key: role, label: role.toUpperCase(), items: items.filter((item) => item.label.toLowerCase() === role) })).filter((group) => group.items.length)
  if (conversation.value.response) result.push({ key: 'response', label: '响应', items: [{ id: 'response', index: -1, label: '响应', preview: compact(response.value?.content.join('') || '本次响应'), target: 'model-analysis-response', matches: Boolean(responseMatches.value) }] })
  if (conversation.value.tools.length) result.push({ key: 'tools', label: 'TOOL DEFS', items: [{ id: 'tools', index: -1, label: 'TOOL DEFS', preview: `${conversation.value.tools.length} 个工具`, target: 'model-analysis-tools', matches: true }] })
  return result
})

function messageId(index: number) { return `model-analysis-message-${index}` }
function jumpTo(target?: string) { if (!target) return; emit('locate', target); contentElement.value?.querySelector(`#${CSS.escape(target)}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
function toggleRaw(index: number) { const next = new Set(rawMessages.value); next.has(index) ? next.delete(index) : next.add(index); rawMessages.value = next }
function toggleTool(path: string) { const next = new Set(expandedTools.value); next.has(path) ? next.delete(path) : next.add(path) }
function messageMatches(message: ModelConversationMessage) { return !searchQuery.value || message.searchText.toLowerCase().includes(searchQuery.value) }
function findTool(name: string) { return conversation.value.tools.find((tool) => tool.name === name) }
function compact(value: string) { const text = value.replace(/\s+/g, ' ').trim(); return text.length > 80 ? `${text.slice(0, 77)}…` : text }
function formatJson(value: unknown) { try { return JSON.stringify(value, null, 2) ?? '{}' } catch { return String(value) } }
function formatPath(path: string[]) { return path.reduce((result, part) => /^\d+$/.test(part) ? `${result}[${part}]` : result ? `${result}.${part}` : part, '') }
function propertySchema(value: unknown): Record<string, unknown> | undefined { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined }
function propertyCount(value: unknown) { const schema = propertySchema(value); return schema?.properties && typeof schema.properties === 'object' ? Object.keys(schema.properties).length : 0 }
function requiredFields(value: unknown) { const schema = propertySchema(value); return Array.isArray(schema?.required) ? schema.required.join(', ') : '' }
function requiredCount(value: unknown) { return requiredFields(value).length > 0 }
function messageCharacters(message: ModelConversationMessage) { return [message.content, message.reasoning || '', ...message.toolCalls.map((call) => call.arguments || '')].join('').length }

const AnalysisTextBlock = defineComponent({
  props: {
    label: String,
    value: { type: String, default: '' },
    searchQuery: { type: String, default: '' },
  },
  setup(props) {
    const expanded = ref(false)
    const limit = computed(() => props.label === 'Parameters (JSON Schema)' ? 600 : 1200)
    const collapsible = computed(() => props.value.length > limit.value)
    const visible = computed(() => expanded.value || !collapsible.value ? props.value : props.value.slice(0, limit.value))
    return () => h('section', { class: ['webqq-model-analysis-section', { 'is-collapsed': collapsible.value && !expanded.value }] }, [
      props.label && h('strong', props.label),
      h('div', { class: 'webqq-model-analysis-text-wrap' }, [
        h('pre', visible.value),
        collapsible.value && h('button', { type: 'button', class: 'webqq-model-analysis-expand', onClick: () => { expanded.value = !expanded.value } }, expanded.value ? '收起' : `展开全部（${props.value.length} 字符）`),
      ]),
    ])
  },
})
</script>
