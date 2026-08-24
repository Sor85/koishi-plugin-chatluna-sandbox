import type { SandboxMessageModelRequestReference, SandboxModelRequestScope } from '../../src/types'

export interface ModelRequestNavigationIntent {
  seq: number
  scope: Exclude<SandboxModelRequestScope, { scope: 'all' } | { scope: 'unattributed' }>
  recordId: string
}

export function createMessageModelRequestNavigationIntent(
  seq: number,
  reference: SandboxMessageModelRequestReference,
): ModelRequestNavigationIntent {
  return {
    seq,
    scope: reference.scopeId === 'main'
      ? { scope: 'main' }
      : { scope: 'space', spaceId: reference.scopeId },
    recordId: reference.recordId,
  }
}
