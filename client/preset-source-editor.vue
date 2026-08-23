<template>
  <div ref="editorElement" class="webqq-preset-source-editor" aria-label="预设 YAML 源码编辑器" />
</template>

<script setup lang="ts">
import { basicSetup } from 'codemirror'
import { yaml } from '@codemirror/lang-yaml'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorState, StateEffect, StateField, type Extension } from '@codemirror/state'
import { Decoration, EditorView, hoverTooltip, type DecorationSet, type Tooltip, type ViewUpdate } from '@codemirror/view'
import { tags } from '@lezer/highlight'
import { onBeforeUnmount, onMounted, ref, watch, type DeepReadonly } from 'vue'
import {
  codeMirrorOffset,
  resolvePresetSourceExpressions,
  type PresetSourceEditorExpression,
} from './webqq/preset-source-expressions'
import type { PresetExpressionObservedValueResult } from './webqq/preset-expression-value'
import type { PresetDocumentKind, SandboxPresetExpression } from '../src/presets'

const props = defineProps<{
  modelValue: string
  kind: PresetDocumentKind
  expressions: readonly DeepReadonly<SandboxPresetExpression>[]
  loadedSource: string
  readOnly?: boolean
  resolveExpressionValue?: (expression: SandboxPresetExpression) => Promise<PresetExpressionObservedValueResult>
}>()
const emit = defineEmits<{
  'update:modelValue': [value: string]
  expressionClick: [expression: SandboxPresetExpression]
}>()

const editorElement = ref<HTMLElement>()
let view: EditorView | undefined
let activeExpressions: readonly PresetSourceEditorExpression[] = []

const presetEditorTheme = EditorView.theme({
  '&': {
    fontSize: '13px',
  },
  '.cm-content': {
    padding: '18px 0 28px',
    caretColor: 'var(--webqq-accent)',
  },
  '.cm-line': {
    padding: '0 20px 0 14px',
    lineHeight: '1.72',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--webqq-accent)',
    borderLeftWidth: '2px',
  },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
    backgroundColor: 'color-mix(in srgb, var(--webqq-accent) 20%, transparent)',
  },
  '.cm-activeLine': {
    backgroundColor: 'color-mix(in srgb, var(--webqq-accent) 6%, transparent)',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    minWidth: '32px',
    padding: '0 6px 0 4px',
    lineHeight: '1.72',
  },
  '.cm-activeLineGutter': {
    color: 'var(--webqq-text)',
    fontWeight: '600',
  },
  '.cm-foldGutter .cm-gutterElement': {
    padding: '0 3px 0 0',
    lineHeight: '1.72',
  },
  '.cm-foldPlaceholder': {
    margin: '0 4px',
    padding: '0 6px',
    border: '1px solid var(--webqq-border)',
    borderRadius: '5px',
    color: 'var(--webqq-muted)',
    backgroundColor: 'var(--webqq-surface-muted)',
  },
  '.cm-panels': {
    color: 'var(--webqq-text)',
    backgroundColor: 'var(--webqq-panel)',
  },
  '.cm-panels.cm-panels-top': {
    borderBottom: '1px solid var(--webqq-border)',
  },
  '.cm-searchMatch': {
    borderRadius: '3px',
    backgroundColor: 'color-mix(in srgb, #f59e0b 28%, transparent)',
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: 'color-mix(in srgb, var(--webqq-accent) 28%, transparent)',
  },
})

const presetHighlightStyle = HighlightStyle.define([
  { tag: tags.comment, class: 'webqq-preset-token-comment' },
  { tag: [tags.propertyName, tags.attributeName, tags.labelName], class: 'webqq-preset-token-key' },
  { tag: [tags.string, tags.special(tags.string)], class: 'webqq-preset-token-string' },
  { tag: [tags.number, tags.bool, tags.null], class: 'webqq-preset-token-literal' },
  { tag: [tags.punctuation, tags.separator], class: 'webqq-preset-token-punctuation' },
  { tag: [tags.keyword, tags.atom], class: 'webqq-preset-token-keyword' },
])

const editorBaseExtensions: Extension[] = [
  basicSetup,
  yaml(),
  presetEditorTheme,
  syntaxHighlighting(presetHighlightStyle),
]

const setDecorations = StateEffect.define<DecorationSet>()
const syncDocument = StateEffect.define<boolean>()
const decorationField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update: (decorations, transaction) => {
    let next = decorations.map(transaction.changes)
    for (const effect of transaction.effects) if (effect.is(setDecorations)) next = effect.value
    return next
  },
  provide: field => EditorView.decorations.from(field),
})

function expressionDecorations(
  source: string,
  expressions: readonly PresetSourceEditorExpression[],
) {
  return Decoration.set(expressions.flatMap((expression) => {
    const sourceFrom = Math.max(0, Math.min(source.length, expression.range.start))
    const sourceTo = Math.max(sourceFrom, Math.min(source.length, expression.range.end))
    if (sourceTo <= sourceFrom || source[sourceFrom] !== '{' || source[sourceTo - 1] !== '}') return []
    const from = codeMirrorOffset(source, sourceFrom)
    const to = codeMirrorOffset(source, sourceTo)
    return [Decoration.mark({
      class: expression.kind === 'control'
        ? 'webqq-preset-expression is-control'
        : 'webqq-preset-expression is-value',
      attributes: expression.clickable && expression.stableId
        ? { 'data-preset-expression-id': expression.stableId, role: 'button', tabindex: '0' }
        : { 'data-preset-expression': expression.kind },
    }).range(from, to)]
  }), true)
}

function expressionValueTooltip(): Extension {
  return hoverTooltip(async (_view, pos) => {
    const expression = activeExpressions.find((candidate) => (
      candidate.kind === 'value'
      && candidate.clickable
      && candidate.stableId
      && pos >= codeMirrorOffset(props.modelValue, candidate.range.start)
      && pos <= codeMirrorOffset(props.modelValue, candidate.range.end)
    ))
    if (!expression || !props.resolveExpressionValue) return null

    const result = await props.resolveExpressionValue(expression as SandboxPresetExpression)
    return expressionTooltip(result, expression)
  }, { hoverTime: 180, hideOnChange: true })
}

function expressionTooltip(
  result: PresetExpressionObservedValueResult,
  expression: PresetSourceEditorExpression,
): Tooltip {
  const from = codeMirrorOffset(props.modelValue, expression.range.start)
  const to = codeMirrorOffset(props.modelValue, expression.range.end)
  return {
    pos: from,
    end: to,
    above: true,
    create() {
      const dom = document.createElement('div')
      dom.className = 'webqq-preset-expression-tooltip'
      if (result.status === 'failed') {
        dom.classList.add('is-error')
        dom.textContent = result.message
        return { dom }
      }
      const label = document.createElement('span')
      label.className = 'webqq-preset-expression-tooltip-label'
      label.textContent = '最新请求中的值'
      const value = document.createElement('pre')
      value.className = 'webqq-preset-expression-tooltip-value'
      value.textContent = result.value || '（空字符串）'
      const time = document.createElement('time')
      time.dateTime = result.requestCreatedAt
      time.textContent = new Intl.DateTimeFormat('zh-CN', {
        month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
      }).format(new Date(result.requestCreatedAt))
      dom.append(label, value, time)
      return { dom }
    },
  }
}

function expressionInteraction(): Extension {
  function resolveExpression(event: Event) {
    const element = event.target instanceof Element
      ? event.target.closest<HTMLElement>('[data-preset-expression-id]')
      : undefined
    return activeExpressions.find(({ stableId }) => stableId === element?.dataset.presetExpressionId)
  }
  return EditorView.domEventHandlers({
    mousedown(event) {
      const expression = resolveExpression(event)
      if (!expression?.clickable) return false
      event.preventDefault()
      emit('expressionClick', expression as SandboxPresetExpression)
      return true
    },
    keydown(event) {
      if (event.key !== 'Enter' && event.key !== ' ') return false
      const expression = resolveExpression(event)
      if (!expression?.clickable) return false
      event.preventDefault()
      emit('expressionClick', expression as SandboxPresetExpression)
      return true
    },
  })
}

function dispatchDecorations(source = props.modelValue) {
  if (!view) return
  activeExpressions = resolvePresetSourceExpressions({
    kind: props.kind,
    source,
    loadedSource: props.loadedSource,
    serverExpressions: props.expressions,
  })
  view.dispatch({ effects: setDecorations.of(expressionDecorations(source, activeExpressions)) })
}

function handleDocumentUpdate(update: ViewUpdate) {
  if (!update.docChanged) return
  const value = update.state.doc.toString()
  if (!update.transactions.some(transaction => transaction.effects.some(effect => effect.is(syncDocument)))) {
    dispatchDecorations(value)
  }
  if (update.transactions.some(transaction => transaction.isUserEvent('input'))) {
    emit('update:modelValue', value)
  }
}

function editorExtensions(readOnly = Boolean(props.readOnly)): Extension[] {
  return [
    ...editorBaseExtensions,
    decorationField,
    expressionInteraction(),
    expressionValueTooltip(),
    EditorView.lineWrapping,
    EditorView.editable.of(!readOnly),
    EditorState.readOnly.of(readOnly),
    EditorView.updateListener.of(handleDocumentUpdate),
  ]
}

onMounted(() => {
  if (!editorElement.value) return
  view = new EditorView({
    parent: editorElement.value,
    state: EditorState.create({
      doc: props.modelValue,
      extensions: editorExtensions(),
    }),
  })
  dispatchDecorations()
})

watch(() => props.modelValue, (value) => {
  if (!view) return
  if (value === view.state.doc.toString()) {
    dispatchDecorations(value)
    return
  }
  activeExpressions = resolvePresetSourceExpressions({
    kind: props.kind,
    source: value,
    loadedSource: props.loadedSource,
    serverExpressions: props.expressions,
  })
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: value },
    effects: [
      syncDocument.of(true),
      setDecorations.of(expressionDecorations(value, activeExpressions)),
    ],
  })
})

watch([() => props.kind, () => props.loadedSource, () => props.expressions], () => dispatchDecorations(), { deep: true })

watch(() => props.readOnly, (readOnly) => {
  if (!view) return
  view.dispatch({
    effects: StateEffect.reconfigure.of(editorExtensions(Boolean(readOnly))),
  })
  dispatchDecorations()
})

onBeforeUnmount(() => view?.destroy())
</script>
