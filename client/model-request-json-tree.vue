<template>
  <div
    class="webqq-model-request-json-node"
    :class="{ 'is-root': root, 'is-nested': !root }"
    :data-kind="node.kind"
    :data-value-kind="node.valueKind"
  >
    <template v-if="node.kind === 'value'">
      <div
        class="webqq-model-request-json-row webqq-model-request-json-leaf"
        @pointerdown="startRowPointer"
        @pointerup="finishRowPointer"
        @click.stop="toggleStringFromRow"
      >
        <span v-if="showKey" class="webqq-model-request-json-key">{{ node.key }}</span>
        <span v-if="showKey" class="webqq-model-request-json-sep">:</span>
        <span
          v-if="node.valueKind === 'string'"
          class="webqq-model-request-json-string"
          :class="{ 'is-expanded': stringExpanded }"
        >
          <span v-if="stringExpanded" class="webqq-model-request-json-string-expanded">{{ expandedString }}</span>
          <span v-else>{{ node.preview }}</span>
        </span>
        <span v-else class="webqq-model-request-json-value">{{ node.preview }}</span>
        <button
          v-if="node.valueKind === 'string'"
          type="button"
          class="webqq-model-request-json-toggle webqq-model-request-json-string-toggle"
          :aria-label="stringExpanded ? '收起字符串' : '展开字符串'"
          :aria-expanded="stringExpanded"
          @click.stop="toggleString"
        >
          <IconChevronDown v-if="stringExpanded" :size="14" aria-hidden="true" />
          <IconChevronRight v-else :size="14" aria-hidden="true" />
        </button>
      </div>
    </template>

    <template v-else>
      <div
        class="webqq-model-request-json-row webqq-model-request-json-branch"
        @pointerdown="startRowPointer"
        @pointerup="finishRowPointer"
        @click.stop="toggleBranchFromRow"
      >
        <button
          type="button"
          class="webqq-model-request-json-toggle"
          :aria-label="expanded ? '收起结构' : '展开结构'"
          :aria-expanded="expanded"
          @click.stop="expanded = !expanded"
        >
          <IconChevronDown v-if="expanded" :size="14" aria-hidden="true" />
          <IconChevronRight v-else :size="14" aria-hidden="true" />
        </button>
        <span v-if="showKey" class="webqq-model-request-json-key">{{ node.key }}</span>
        <span v-if="showKey" class="webqq-model-request-json-sep">:</span>
        <span class="webqq-model-request-json-bracket">{{ openingBracket }}</span>
        <span v-if="!expanded" class="webqq-model-request-json-preview">{{ node.preview }}</span>
        <span v-if="!expanded" class="webqq-model-request-json-bracket">{{ closingBracket }}</span>
      </div>

      <div v-if="expanded" class="webqq-model-request-json-content">
        <div v-if="node.children.length" class="webqq-model-request-json-children">
          <ModelRequestJsonTree
            v-for="child in node.children"
            :key="`${node.key}:${child.key}`"
            :node="child"
            :open="open"
            :parent-kind="node.kind"
            :strings-expanded="stringsExpanded"
          />
        </div>
        <span class="webqq-model-request-json-closing">{{ closingBracket }}</span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { IconChevronDown, IconChevronRight } from '@tabler/icons-vue'
import { computed, ref, watch } from 'vue'
import type { ModelRequestJsonKind, ModelRequestJsonNode } from './webqq/model-request-json'
import { normalizeModelRequestJsonString } from './webqq/model-request-json'

defineOptions({ name: 'ModelRequestJsonTree' })

const props = withDefaults(defineProps<{
  node: ModelRequestJsonNode
  open?: boolean
  parentKind?: ModelRequestJsonKind
  root?: boolean
  stringsExpanded?: boolean
}>(), {
  open: true,
  root: false,
  stringsExpanded: false,
})

const expanded = ref(props.open)
const localStringExpanded = ref<boolean>()
let rowPointerOrigin: { x: number, y: number } | undefined
let suppressRowClick = false

const showKey = computed(() => !props.root && props.parentKind !== 'array')
const openingBracket = computed(() => props.node.kind === 'array' ? '[' : '{')
const closingBracket = computed(() => props.node.kind === 'array' ? ']' : '}')
const stringExpanded = computed(() => localStringExpanded.value ?? props.stringsExpanded)
const expandedString = computed(() => {
  const value = normalizeModelRequestJsonString(String(props.node.value ?? ''))
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
})

watch(() => props.stringsExpanded, () => {
  localStringExpanded.value = undefined
})

function toggleString() {
  localStringExpanded.value = !stringExpanded.value
}

function startRowPointer(event: PointerEvent) {
  rowPointerOrigin = { x: event.clientX, y: event.clientY }
  suppressRowClick = false
}

function finishRowPointer(event: PointerEvent) {
  if (!rowPointerOrigin) return
  const distance = Math.hypot(
    event.clientX - rowPointerOrigin.x,
    event.clientY - rowPointerOrigin.y,
  )
  // 浏览器在拖选文字结束后仍可能派发 click，只屏蔽本次发生明显移动的手势；
  // 不能根据全局 Selection 判断，否则复制后残留的旧选区会让所有字段行永久失效。
  suppressRowClick = distance > 3
  rowPointerOrigin = undefined
}

function consumeSuppressedRowClick(): boolean {
  if (!suppressRowClick) return false
  suppressRowClick = false
  return true
}

function toggleStringFromRow() {
  if (props.node.valueKind !== 'string' || consumeSuppressedRowClick()) return
  toggleString()
}

function toggleBranchFromRow() {
  if (consumeSuppressedRowClick()) return
  expanded.value = !expanded.value
}
</script>
