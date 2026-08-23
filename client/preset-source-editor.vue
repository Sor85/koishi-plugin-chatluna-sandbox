<template>
  <div ref="editorElement" class="webqq-preset-source-editor" aria-label="预设 YAML 源码编辑器" />
</template>

<script setup lang="ts">
import { basicSetup } from 'codemirror'
import { yaml } from '@codemirror/lang-yaml'
import { EditorState, StateEffect, StateField, type Extension } from '@codemirror/state'
import { Decoration, EditorView, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { onBeforeUnmount, onMounted, ref, watch, type DeepReadonly } from 'vue'
import {
  codeMirrorOffset,
  resolvePresetSourceExpressions,
  type PresetSourceEditorExpression,
} from './webqq/preset-source-expressions'
import type { PresetDocumentKind, SandboxPresetExpression } from '../src/presets'

const props = defineProps<{
  modelValue: string
  kind: PresetDocumentKind
  expressions: readonly DeepReadonly<SandboxPresetExpression>[]
  loadedSource: string
  readOnly?: boolean
}>()
const emit = defineEmits<{
  'update:modelValue': [value: string]
  expressionClick: [expression: SandboxPresetExpression]
}>()

const editorElement = ref<HTMLElement>()
let view: EditorView | undefined
let activeExpressions: readonly PresetSourceEditorExpression[] = []

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

onMounted(() => {
  if (!editorElement.value) return
  view = new EditorView({
    parent: editorElement.value,
    state: EditorState.create({
      doc: props.modelValue,
      extensions: [
        basicSetup,
        yaml(),
        decorationField,
        expressionInteraction(),
        EditorView.lineWrapping,
        EditorView.editable.of(!props.readOnly),
        EditorState.readOnly.of(Boolean(props.readOnly)),
        EditorView.updateListener.of(handleDocumentUpdate),
      ],
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
    effects: StateEffect.reconfigure.of([
      basicSetup,
      yaml(),
      decorationField,
      expressionInteraction(),
      EditorView.lineWrapping,
      EditorView.editable.of(!readOnly),
      EditorState.readOnly.of(Boolean(readOnly)),
      EditorView.updateListener.of(handleDocumentUpdate),
    ]),
  })
  dispatchDecorations()
})

onBeforeUnmount(() => view?.destroy())
</script>
