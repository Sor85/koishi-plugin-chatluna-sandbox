import type { LocateSandboxPresetExpressionResult, PresetSourceRange, SandboxPresetRequestScope } from '../../src/presets'

export interface PresetEvidenceNavigationIntent {
  seq: number
  scope: SandboxPresetRequestScope
  recordId: string
  evidenceId: string
  range: PresetSourceRange
}

export interface PresetOriginSnapshot {
  listScrollTop: number
  searchQuery: string
  editorScroll?: unknown
}

export type PresetOriginRestore = PresetOriginSnapshot & { seq: number }

const emptyOriginSnapshot = (): PresetOriginSnapshot => ({ listScrollTop: 0, searchQuery: '' })

export function createPresetEvidenceNavigationState() {
  let seq = 0
  let current: PresetEvidenceNavigationIntent | undefined
  let origin: 'presets' | undefined
  let originSnapshot: PresetOriginSnapshot | undefined

  function publish(
    result: LocateSandboxPresetExpressionResult,
    snapshot?: PresetOriginSnapshot,
  ): PresetEvidenceNavigationIntent | undefined {
    if (result.status !== 'matched') return
    origin = 'presets'
    originSnapshot = snapshot ?? emptyOriginSnapshot()
    current = {
      seq: ++seq,
      scope: result.scope,
      recordId: result.recordId,
      evidenceId: result.evidenceId,
      range: { ...result.range },
    }
    return current
  }

  function peek() {
    return current
  }

  function consume(expectedSeq?: number) {
    if (!current || expectedSeq !== undefined && current.seq !== expectedSeq) return
    const intent = current
    current = undefined
    return intent
  }

  function returnToOrigin() {
    if (!origin) return
    const view = origin
    const snapshot = originSnapshot ?? emptyOriginSnapshot()
    origin = undefined
    originSnapshot = undefined
    current = undefined
    return { view, snapshot }
  }

  function clear() {
    current = undefined
    origin = undefined
    originSnapshot = undefined
  }

  return {
    publish,
    peek,
    consume,
    clear,
    returnToOrigin,
    get canReturn() {
      return origin !== undefined
    },
  }
}
