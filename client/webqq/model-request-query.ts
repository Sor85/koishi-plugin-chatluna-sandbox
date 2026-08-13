import type {
  ClearSandboxModelRequestRecordsResult,
  GetSandboxModelRequestRecordInput,
  GetSandboxModelRequestRecordsInput,
  SandboxModelRequestCapacity,
  SandboxModelRequestDetail,
  SandboxModelRequestListItem,
  SandboxModelRequestRecordsPage,
  SandboxModelRequestScope,
} from '../../src/types'

export const MODEL_REQUEST_PAGE_SIZE = 50
export const MAIN_MODEL_REQUEST_SPACE_ID = 'main'

export type ModelRequestRecordsQuery = GetSandboxModelRequestRecordsInput & SandboxModelRequestScope
export type ModelRequestRecordQuery = GetSandboxModelRequestRecordInput & SandboxModelRequestScope
export type ClearModelRequestRecordsQuery = SandboxModelRequestScope

export interface ModelRequestRecordsPageState {
  hasMore: boolean
  nextCursor?: number
  earliestCursor?: number
  capacity: SandboxModelRequestCapacity
}

export const emptyModelRequestCapacity: SandboxModelRequestCapacity = {
  recordCount: 0,
  totalBytes: 0,
  maxRecords: 5000,
  maxBytes: 50 * 1024 * 1024,
}

export const emptyModelRequestRecordsPage: SandboxModelRequestRecordsPage = {
  records: [],
  hasMore: false,
  capacity: emptyModelRequestCapacity,
}

export function createSpaceModelRequestScope(spaceId: string): Extract<SandboxModelRequestScope, { scope: 'space' }> {
  return { scope: 'space', spaceId }
}

export function createUnattributedModelRequestScope(): Extract<SandboxModelRequestScope, { scope: 'unattributed' }> {
  return { scope: 'unattributed' }
}

export function resolveModelRequestScope(
  category: 'space' | 'unattributed',
  spaceId = MAIN_MODEL_REQUEST_SPACE_ID,
): SandboxModelRequestScope {
  return category === 'unattributed'
    ? createUnattributedModelRequestScope()
    : createSpaceModelRequestScope(spaceId || MAIN_MODEL_REQUEST_SPACE_ID)
}

export function createModelRequestRecordsQuery(
  scope: SandboxModelRequestScope,
  input: GetSandboxModelRequestRecordsInput = {},
): ModelRequestRecordsQuery {
  return { ...scope, ...input, limit: input.limit ?? MODEL_REQUEST_PAGE_SIZE }
}

export type {
  ClearSandboxModelRequestRecordsResult,
  SandboxModelRequestDetail,
  SandboxModelRequestListItem,
  SandboxModelRequestRecordsPage,
  SandboxModelRequestScope,
}
