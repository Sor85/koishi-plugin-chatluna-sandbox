import type {
  DeleteGroupAnnouncementInput,
  ClearSandboxOneBotDebugRecordsResult,
  GetForwardMessageInput,
  GetMediaContentInput,
  GetMessageHistoryInput,
  BranchConversationInstanceInput,
  CreateConversationInstanceInput,
  DeleteConversationInstanceInput,
  RenameConversationInstanceInput,
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
  SandboxOneBotDebugRecordsPage,
  SandboxWorkspaceState,
  SendForwardMessageInput,
  SendMediaMessageInput,
  SendMessageInput,
  SetGroupAnnouncementInput,
} from '../../src/types'
import { FakePortRecorder } from './fake-port-recorder'
import type { SceneMutationListener, WorkspacePort } from './workspace-port'
import type { SandboxSceneMutationPayload } from '../../src/console-contract'

export type WorkspacePortOperation = keyof WorkspacePort

export class FakeWorkspacePort implements WorkspacePort {
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
  /** 新建或分叉会话实例后返回的会话 ID；用例可改写它来断言选中行为。 */
  createdConversationInstanceId = 'conversation-instance-1'
  private readonly recorder = new FakePortRecorder<WorkspacePortOperation>()
  private readonly sceneMutationListeners = new Set<SceneMutationListener>()

  constructor(workspace: SandboxWorkspaceState) {
    this.workspaceResult = workspace
  }

  get calls() {
    return this.recorder.calls
  }

  /** 手动触发一次场景变更广播，扇出给全部订阅者。 */
  emitSceneMutation(payload: SandboxSceneMutationPayload) {
    for (const listener of this.sceneMutationListeners) listener(payload)
  }

  rejectNext(operation: WorkspacePortOperation, error: unknown) {
    this.recorder.rejectNext(operation, error)
  }

  private invoke<T>(operation: WorkspacePortOperation, input: unknown, result: T): Promise<T> {
    return this.recorder.invoke(operation, input, result)
  }

  getWorkspace(input?: GetSandboxWorkspaceInput) {
    return this.invoke('getWorkspace', input, this.workspaceResult)
  }

  getMessageHistory(input: GetMessageHistoryInput) {
    return this.invoke('getMessageHistory', input, this.historyResult)
  }

  createConversationInstance(input: CreateConversationInstanceInput) {
    return this.invoke('createConversationInstance', input, {
      ...this.workspaceResult,
      conversationId: this.createdConversationInstanceId,
    })
  }

  branchConversationInstance(input: BranchConversationInstanceInput) {
    return this.invoke('branchConversationInstance', input, {
      ...this.workspaceResult,
      conversationId: this.createdConversationInstanceId,
    })
  }

  renameConversationInstance(input: RenameConversationInstanceInput) {
    return this.invoke('renameConversationInstance', input, this.workspaceResult)
  }

  deleteConversationInstance(input: DeleteConversationInstanceInput) {
    return this.invoke('deleteConversationInstance', input, this.workspaceResult)
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

  getMediaContent(input: GetMediaContentInput & { spaceId?: string }) {
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

  subscribeSceneMutation(listener: SceneMutationListener) {
    void this.invoke('subscribeSceneMutation', undefined, undefined)
    this.sceneMutationListeners.add(listener)
    return () => { this.sceneMutationListeners.delete(listener) }
  }
}

export function createFakeWorkspacePort(workspace: SandboxWorkspaceState) {
  return new FakeWorkspacePort(workspace)
}
