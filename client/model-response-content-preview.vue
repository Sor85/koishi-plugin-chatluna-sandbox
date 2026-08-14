<template>
  <div class="webqq-model-response-preview">
    <section v-for="(content, index) in preview.content" :key="`content:${index}`" class="webqq-model-response-section is-content">
      <header>
        <IconMessage :size="16" aria-hidden="true" />
        <strong>模型输出</strong>
      </header>
      <pre>{{ content }}</pre>
    </section>

    <section v-for="(reasoning, index) in preview.reasoning" :key="`reasoning:${index}`" class="webqq-model-response-section is-reasoning">
      <header>
        <IconBrain :size="16" aria-hidden="true" />
        <strong>思考内容</strong>
      </header>
      <pre>{{ reasoning }}</pre>
    </section>

    <section v-if="preview.toolCalls.length" class="webqq-model-response-section is-tools">
      <header>
        <IconTool :size="16" aria-hidden="true" />
        <strong>工具调用</strong>
        <Badge variant="outline">{{ preview.toolCalls.length }}</Badge>
      </header>
      <div class="webqq-model-response-tool-list">
        <article v-for="(tool, index) in preview.toolCalls" :key="tool.id || `${tool.name}:${index}`" class="webqq-model-response-tool">
          <div>
            <strong>{{ tool.name }}</strong>
            <small v-if="tool.id">{{ tool.id }}</small>
          </div>
          <pre v-if="tool.arguments">{{ tool.arguments }}</pre>
        </article>
      </div>
    </section>

    <footer v-if="preview.finishReasons.length || preview.usage" class="webqq-model-response-footer">
      <span v-if="preview.finishReasons.length">结束原因：{{ preview.finishReasons.join('、') }}</span>
      <span v-for="entry in usageEntries" :key="entry[0]">{{ entry[0] }}：{{ formatUsageValue(entry[1]) }}</span>
    </footer>

    <p v-if="!hasContent" class="webqq-model-request-empty">
      未识别到可预览内容，请查看 JSON 原文
    </p>
  </div>
</template>

<script setup lang="ts">
import { IconBrain, IconMessage, IconTool } from '@tabler/icons-vue'
import { computed } from 'vue'
import { Badge } from './components/ui/badge'
import type { ModelResponseContentPreview } from './webqq/model-response-content'
import { hasModelResponseContent } from './webqq/model-response-content'

const props = defineProps<{
  preview: ModelResponseContentPreview
}>()

const hasContent = computed(() => hasModelResponseContent(props.preview))
const usageEntries = computed(() => Object.entries(props.preview.usage ?? {}))

function formatUsageValue(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}
</script>
