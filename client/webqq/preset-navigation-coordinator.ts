import type { SandboxModelRequestDetail, SandboxModelRequestTrajectory } from '../../src/types'
import type { PresetEvidenceNavigationIntent } from './preset-evidence-navigation'

export type PresetNavigationLocateRequest = Pick<PresetEvidenceNavigationIntent, 'seq' | 'evidenceId' | 'range'>

export function createPresetNavigationCoordinator() {
  let pending: PresetEvidenceNavigationIntent | undefined
  let locateRequested = false

  function begin(intent: PresetEvidenceNavigationIntent) {
    pending = intent
    locateRequested = false
  }

  function prepare(
    detail: Pick<SandboxModelRequestDetail, 'id'> | undefined,
    trajectory: Pick<SandboxModelRequestTrajectory, 'mode' | 'records'> | undefined,
  ): PresetNavigationLocateRequest | undefined {
    const intent = pending
    if (!intent || locateRequested) return
    if (detail?.id !== intent.recordId || trajectory?.mode !== 'request') return
    if (!trajectory.records.some(({ id }) => id === intent.recordId)) return
    locateRequested = true
    return {
      seq: intent.seq,
      evidenceId: intent.evidenceId,
      range: { ...intent.range },
    }
  }

  function acknowledge(seq: number, located: boolean) {
    if (!pending || pending.seq !== seq || !locateRequested) return
    const intent = pending
    pending = undefined
    locateRequested = false
    return { intent, located }
  }

  function peek() {
    return pending
  }

  return { begin, prepare, acknowledge, peek }
}
