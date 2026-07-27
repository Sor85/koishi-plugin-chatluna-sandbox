import type {
  DeleteGroupAnnouncementInput,
  ClearSandboxOneBotDebugRecordsResult,
  GetMediaContentInput,
  GetMessageHistoryInput,
  GetSandboxWorkspaceInput,
  GetSandboxOneBotDebugRecordsInput,
  ManageSandboxEnvironmentInput,
  PerformFriendActionInput,
  PerformGroupActionInput,
  RecallMessageInput,
  SandboxMediaContent,
  SandboxMessageHistory,
  SandboxOneBotDebugRecord,
  SandboxWorkspaceState,
  SendMediaMessageInput,
  SendMessageInput,
  SetGroupAnnouncementInput,
} from '../../src/types'
import type { WorkspacePort } from './workspace-port'

export type WorkspacePortOperation = keyof WorkspacePort

export interface WorkspacePortCall {
  operation: WorkspacePortOperation
  input: unknown
}

export class FakeWorkspacePort implements WorkspacePort {
  readonly calls: WorkspacePortCall[] = []
  workspaceResult: SandboxWorkspaceState
  historyResult: SandboxMessageHistory = { messages: [] }
  mediaContentResult: SandboxMediaContent = {
    id: 'media-1',
    type: 'file',
    name: 'fixture.txt',
    mimeType: 'text/plain',
    size: 0,
    reference: 'sandbox-media://media-1',
    dataBase64: '',
  }
  debugRecordsResult: SandboxOneBotDebugRecord[] = []
  clearDebugRecordsResult: ClearSandboxOneBotDebugRecordsResult = { cleared: 0 }
  private readonly failures = new Map<WorkspacePortOperation, Error[]>()

  constructor(workspace: SandboxWorkspaceState) {
    this.workspaceResult = workspace
  }

  rejectNext(operation: WorkspacePortOperation, error: Error) {
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

  sendMessage(input: SendMessageInput) {
    return this.invoke('sendMessage', input, this.workspaceResult)
  }

  sendMediaMessage(input: SendMediaMessageInput) {
    return this.invoke('sendMediaMessage', input, this.workspaceResult)
  }

  recallMessage(input: RecallMessageInput) {
    return this.invoke('recallMessage', input, this.workspaceResult)
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
}

export function createFakeWorkspacePort(workspace: SandboxWorkspaceState) {
  return new FakeWorkspacePort(workspace)
}
