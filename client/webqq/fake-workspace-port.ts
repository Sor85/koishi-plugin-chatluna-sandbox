import type {
  DeleteGroupAnnouncementInput,
  ClearSandboxModelRequestRecordsResult,
  ClearSandboxOneBotDebugRecordsResult,
  GetForwardMessageInput,
  GetMediaContentInput,
  GetMessageHistoryInput,
  GetSandboxWorkspaceInput,
  GetSandboxOneBotDebugRecordsInput,
  ManageSandboxEnvironmentInput,
  PerformFriendActionInput,
  PerformGroupActionInput,
  RecallMessageInput,
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
  clearDebugRecordsResult: ClearSandboxOneBotDebugRecordsResult = { cleared: 0 }
  modelRequestRecordsResult: SandboxModelRequestRecordsPage = emptyModelRequestRecordsPage
  modelRequestRecordResult?: SandboxModelRequestDetail
  modelRequestTrajectoryResult?: SandboxModelRequestTrajectory
  clearModelRequestRecordsResult: ClearSandboxModelRequestRecordsResult = { cleared: 0 }
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
      complete: true,
    }
    return this.invoke('getModelRequestTrajectory', input, trajectory)
  }

  clearModelRequestRecords(input: ClearModelRequestRecordsQuery) {
    return this.invoke('clearModelRequestRecords', input, this.clearModelRequestRecordsResult)
  }
}

export function createFakeWorkspacePort(workspace: SandboxWorkspaceState) {
  return new FakeWorkspacePort(workspace)
}
