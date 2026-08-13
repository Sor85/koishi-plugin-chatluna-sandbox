<template>
  <div class="webqq-model-request-json-node" :data-kind="node.kind">
    <template v-if="node.kind === 'value'">
      <span class="webqq-model-request-json-key">{{ node.key }}</span>
      <span class="webqq-model-request-json-sep">:</span>
      <span class="webqq-model-request-json-value">{{ node.preview }}</span>
    </template>
    <details v-else :open="open">
      <summary>
        <span class="webqq-model-request-json-key">{{ node.key }}</span>
        <span class="webqq-model-request-json-preview">{{ node.preview }}</span>
      </summary>
      <div v-if="node.children.length" class="webqq-model-request-json-children">
        <ModelRequestJsonTree
          v-for="child in node.children"
          :key="`${node.key}:${child.key}`"
          :node="child"
        />
      </div>
    </details>
  </div>
</template>

<script setup lang="ts">
import type { ModelRequestJsonNode } from './webqq/model-request-json'

defineOptions({ name: 'ModelRequestJsonTree' })

const { node, open = true } = defineProps<{
  node: ModelRequestJsonNode
  open?: boolean
}>()
</script>
