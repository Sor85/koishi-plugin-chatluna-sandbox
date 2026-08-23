import type {
  DeleteGroupAnnouncementInput,
  ClearSandboxModelRequestRecordsResult,
  ClearSandboxOneBotDebugRecordsResult,
  GetForwardMessageInput,
  GetMediaContentInput,
  GetMessageHistoryInput,
  GetSandboxWorkspaceInput,
  GetSandboxOneBotDebugRecordInput,
  GetSandboxOneBotDebugRecordsInput,
  ManageSandboxEnvironmentInput,
  PerformFriendActionInput,
  PerformGroupActionInput,
  RecallMessageInput,
  ClearConversationMessagesInput,
  SearchConversationMessagesInput,
  SetMessageReactionInput,
  SandboxConsoleOneBotDebugRecord,
  SandboxForward,
  SandboxMediaContent,
  SandboxMessageHistory,
  SandboxMessageSearchResult,
  SandboxModelRequestDetail,
  SandboxModelRequestRecordsPage,
  SandboxModelRequestTrajectory,
  SandboxOneBotDebugRecordsPage,
  SandboxWorkspaceState,
  SendForwardMessageInput,
  SendMediaMessageInput,
  SendMessageInput,
  SetGroupAnnouncementInput,
} from '../../src/types'
import type { WorkspacePort } from './workspace-port'
import type {
  ClearModelRequestRecordsQuery,
  ModelRequestRecordQuery,
  ModelRequestRecordsQuery,
  ModelRequestTrajectoryQuery,
} from './model-request-query'
import { emptyModelRequestRecordsPage } from './model-request-query'
import type { ListSandboxMcpCallRecordsInput, SandboxMcpCallRecordsPage } from '../../src/mcp/call-records'
import type { SandboxMcpCallRecord } from '../../src/mcp/types'
import type {
  LocateSandboxPresetExpressionInput,
  LocateSandboxPresetExpressionResult,
  ReadSandboxPresetInput,
  SandboxPresetDocument,
} from '../../src/presets'
import type {
  CreatePresetInput,
  DeletePresetInput,
  PresetDocumentKind,
  RenamePresetInput,
  SavePresetInput,
} from '../../src/presets'

export type WorkspacePortOperation = keyof WorkspacePort

export interface WorkspacePortCall {
  operation: WorkspacePortOperation
  input: unknown
}

export class FakeWorkspacePort implements WorkspacePort {
  readonly calls: WorkspacePortCall[] = []
  workspaceResult: SandboxWorkspaceState
  historyResult: SandboxMessageHistory = { messages: [], forwards: [] }
  searchResult: SandboxMessageSearchResult = { hits: [] }
  forwardResult: SandboxForward = {
    id: 'forward-1',
    authorId: '10001',
    createdAt: '2026-07-23T00:00:00.000Z',
    nodes: [{
      userId: '10001',
      nickname: '测试用户1',
      content: '基准消息',
      createdAt: '2026-07-23T00:00:00.000Z',
      sourceMessageId: 'message-1',
    }],
  }
  mediaContentResult: SandboxMediaContent = {
    id: 'media-1',
    type: 'file',
    name: 'fixture.txt',
    mimeType: 'text/plain',
    size: 0,
    reference: 'sandbox-media://media-1',
    dataBase64: '',
  }
  debugRecordsResult: SandboxOneBotDebugRecordsPage<SandboxConsoleOneBotDebugRecord> = {
    records: [],
    hasMore: false,
    capacity: { recordCount: 0, totalBytes: 0, maxRecords: 500, maxBytes: 50 * 1024 * 1024 },
  }
  debugRecordResult?: SandboxConsoleOneBotDebugRecord
  clearDebugRecordsResult: ClearSandboxOneBotDebugRecordsResult = { cleared: 0 }
  modelRequestRecordsResult: SandboxModelRequestRecordsPage = emptyModelRequestRecordsPage
  modelRequestRecordResult?: SandboxModelRequestDetail
  modelRequestTrajectoryResult?: SandboxModelRequestTrajectory
  clearModelRequestRecordsResult: ClearSandboxModelRequestRecordsResult = { cleared: 0 }
  presetCatalogResult: SandboxPresetDocument[] = []
  presetDocumentResult?: SandboxPresetDocument
  locatePresetExpressionResult: LocateSandboxPresetExpressionResult = {
    status: 'failed',
    code: 'request-not-observed',
    message: '没有匹配的模型请求',
  }
  mcpCallRecordsResult: SandboxMcpCallRecordsPage = { records: [] }
  mcpCallRecordResult?: SandboxMcpCallRecord
  clearMcpCallRecordsResult = { cleared: 0 }
  private readonly failures = new Map<WorkspacePortOperation, unknown[]>()

  constructor(workspace: SandboxWorkspaceState) {
    this.workspaceResult = workspace
  }

  rejectNext(operation: WorkspacePortOperation, error: unknown) {
    this.failures.set(operation, [...this.failures.get(operation) ?? [], error])
  }

  private invoke<T>(operation: WorkspacePortOperation, input: unknown, result: T): Promise<T> {
    this.calls.push({ operation, input })
    const [failure, ...remaining] = this.failures.get(operation) ?? []
    if (remaining.length) this.failures.set(operation, remaining)
    else this.failures.delete(operation)
    return failure ? Promise.reject(failure) : Promise.resolve(result)
  }

  getWorkspace(input?: GetSandboxWorkspaceInput) {
    return this.invoke('getWorkspace', input, this.workspaceResult)
  }

  getMessageHistory(input: GetMessageHistoryInput) {
    return this.invoke('getMessageHistory', input, this.historyResult)
  }

  searchConversationMessages(input: SearchConversationMessagesInput) {
    return this.invoke('searchConversationMessages', input, this.searchResult)
  }

  sendMessage(input: SendMessageInput) {
    return this.invoke('sendMessage', input, this.workspaceResult)
  }

  sendMediaMessage(input: SendMediaMessageInput) {
    return this.invoke('sendMediaMessage', input, this.workspaceResult)
  }

  sendForwardMessage(input: SendForwardMessageInput) {
    return this.invoke('sendForwardMessage', input, this.workspaceResult)
  }

  getForwardMessage(input: GetForwardMessageInput) {
    return this.invoke('getForwardMessage', input, this.forwardResult)
  }

  recallMessage(input: RecallMessageInput) {
    return this.invoke('recallMessage', input, this.workspaceResult)
  }

  clearConversationMessages(input: ClearConversationMessagesInput) {
    return this.invoke('clearConversationMessages', input, this.workspaceResult)
  }

  setMessageReaction(input: SetMessageReactionInput) {
    return this.invoke('setMessageReaction', input, this.workspaceResult)
  }

  getMediaContent(input: GetMediaContentInput) {
    return this.invoke('getMediaContent', input, this.mediaContentResult)
  }

  setGroupAnnouncement(input: SetGroupAnnouncementInput) {
    return this.invoke('setGroupAnnouncement', input, this.workspaceResult)
  }

  deleteGroupAnnouncement(input: DeleteGroupAnnouncementInput) {
    return this.invoke('deleteGroupAnnouncement', input, this.workspaceResult)
  }

  manageEnvironment(input: ManageSandboxEnvironmentInput) {
    return this.invoke('manageEnvironment', input, this.workspaceResult)
  }

  performFriendAction(input: PerformFriendActionInput) {
    return this.invoke('performFriendAction', input, this.workspaceResult)
  }

  performGroupAction(input: PerformGroupActionInput) {
    return this.invoke('performGroupAction', input, this.workspaceResult)
  }

  getOneBotDebugRecords(input?: GetSandboxOneBotDebugRecordsInput) {
    return this.invoke('getOneBotDebugRecords', input, this.debugRecordsResult)
  }

  getOneBotDebugRecord(input: GetSandboxOneBotDebugRecordInput & { spaceId?: string }) {
    const record = this.debugRecordResult
      ?? this.debugRecordsResult.records.find(({ id }) => id === input.recordId)
    if (!record) this.rejectNext('getOneBotDebugRecord', new Error('调试记录不存在'))
    return this.invoke('getOneBotDebugRecord', input, record as SandboxConsoleOneBotDebugRecord)
  }

  clearOneBotDebugRecords() {
    return this.invoke('clearOneBotDebugRecords', undefined, this.clearDebugRecordsResult)
  }

  getModelRequestRecords(input: ModelRequestRecordsQuery) {
    return this.invoke('getModelRequestRecords', input, this.modelRequestRecordsResult)
  }

  getModelRequestRecord(input: ModelRequestRecordQuery) {
    const record = this.modelRequestRecordResult
      ?? this.modelRequestRecordsResult.records.find(({ id }) => id === input.recordId)
    if (!record) this.rejectNext('getModelRequestRecord', new Error('模型请求记录不存在'))
    return this.invoke('getModelRequestRecord', input, {
      ...record,
      requestBody: record && 'requestBody' in record ? record.requestBody : undefined,
      summary: record?.summary ?? { keys: 0, messageCount: 0, toolCount: 0, bodyAvailable: false },
    } as SandboxModelRequestDetail)
  }

  getModelRequestTrajectory(input: ModelRequestTrajectoryQuery) {
    const trajectory = this.modelRequestTrajectoryResult ?? {
      mode: input.mode,
      records: [],
      rows: [],
      promptComposition: [],
      complete: true,
    }
    return this.invoke('getModelRequestTrajectory', input, trajectory)
  }

  clearModelRequestRecords(input: ClearModelRequestRecordsQuery) {
    return this.invoke('clearModelRequestRecords', input, this.clearModelRequestRecordsResult)
  }

  getPresetCatalog(input: { kind?: PresetDocumentKind } = {}) {
    const result = input.kind
      ? this.presetCatalogResult.filter(({ kind }) => kind === input.kind)
      : this.presetCatalogResult
    return this.invoke('getPresetCatalog', input, result)
  }

  readPreset(input: ReadSandboxPresetInput) {
    const document = this.presetCatalogResult.find(({ kind, fileName }) => kind === input.kind && fileName === input.fileName)
      ?? this.presetDocumentResult
    if (!document) this.rejectNext('readPreset', new Error('预设不存在'))
    return this.invoke('readPreset', input, document as SandboxPresetDocument)
  }

  createPreset(input: CreatePresetInput) {
    const result = this.presetDocumentResult ?? fakePresetDocument(input)
    return this.invoke('createPreset', input, result)
  }

  savePreset(input: SavePresetInput) {
    const result = this.presetDocumentResult ?? fakePresetDocument(input)
    return this.invoke('savePreset', input, result)
  }

  renamePreset(input: RenamePresetInput) {
    const current = this.presetDocumentResult
      ?? this.presetCatalogResult.find(({ kind, fileName }) => kind === input.kind && fileName === input.fileName)
    const result = current ? { ...current, fileName: input.newFileName } : fakePresetDocument({
      kind: input.kind,
      fileName: input.newFileName,
      source: '',
    })
    return this.invoke('renamePreset', input, result)
  }

  deletePreset(input: DeletePresetInput) {
    return this.invoke('deletePreset', input, { deleted: true } as const)
  }

  locatePresetExpression(input: LocateSandboxPresetExpressionInput) {
    return this.invoke('locatePresetExpression', input, this.locatePresetExpressionResult)
  }

  getMcpCallRecords(input?: ListSandboxMcpCallRecordsInput) {
    return this.invoke('getMcpCallRecords', input, this.mcpCallRecordsResult)
  }

  getMcpCallRecord(input: { recordId: string }) {
    const record = this.mcpCallRecordResult
      ?? this.mcpCallRecordsResult.records.find(({ id }) => id === input.recordId)
    if (!record) this.rejectNext('getMcpCallRecord', new Error('MCP 调用记录不存在'))
    return this.invoke('getMcpCallRecord', input, {
      ...record,
      arguments: record && 'arguments' in record ? record.arguments : {},
      result: record && 'result' in record ? record.result : undefined,
    } as SandboxMcpCallRecord)
  }

  clearMcpCallRecords() {
    return this.invoke('clearMcpCallRecords', undefined, this.clearMcpCallRecordsResult)
  }
}

function fakePresetDocument(input: CreatePresetInput): SandboxPresetDocument {
  return {
    ...input,
    revision: `revision:${input.source}`,
    size: input.source.length,
    modifiedAt: '2026-08-22T00:00:00.000Z',
    templateFields: [],
    expressions: [],
    diagnostics: [],
  }
}

export function createFakeWorkspacePort(workspace: SandboxWorkspaceState) {
  return new FakeWorkspacePort(workspace)
}
