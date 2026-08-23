import type { LocateSandboxPresetExpressionResult, PresetSourceRange, SandboxPresetRequestScope } from '../../src/presets'

export interface PresetEvidenceNavigationIntent {
  seq: number
  scope: SandboxPresetRequestScope
  recordId: string
  evidenceId: string
  range: PresetSourceRange
}

export function createPresetEvidenceNavigationState() {
  let seq = 0
  let current: PresetEvidenceNavigationIntent | undefined

  function publish(result: LocateSandboxPresetExpressionResult): PresetEvidenceNavigationIntent | undefined {
    if (result.status !== 'matched') return
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

  function clear() {
    current = undefined
  }

  return { publish, peek, consume, clear }
}
