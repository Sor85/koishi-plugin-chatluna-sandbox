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
  SandboxConsoleOneBotDebugRecord,
  SandboxMediaContent,
  SandboxMessageHistory,
  SandboxWorkspaceState,
  SendMediaMessageInput,
  SendMessageInput,
  SetGroupAnnouncementInput,
} from '../../src/types'

export interface WorkspacePort {
  getWorkspace(input?: GetSandboxWorkspaceInput): Promise<SandboxWorkspaceState>
  getMessageHistory(input: GetMessageHistoryInput): Promise<SandboxMessageHistory>
  sendMessage(input: SendMessageInput): Promise<SandboxWorkspaceState>
  sendMediaMessage(input: SendMediaMessageInput): Promise<SandboxWorkspaceState>
  recallMessage(input: RecallMessageInput): Promise<SandboxWorkspaceState>
  getMediaContent(input: GetMediaContentInput): Promise<SandboxMediaContent>
  setGroupAnnouncement(input: SetGroupAnnouncementInput): Promise<SandboxWorkspaceState>
  deleteGroupAnnouncement(input: DeleteGroupAnnouncementInput): Promise<SandboxWorkspaceState>
  manageEnvironment(input: ManageSandboxEnvironmentInput): Promise<SandboxWorkspaceState>
  performFriendAction(input: PerformFriendActionInput): Promise<SandboxWorkspaceState>
  performGroupAction(input: PerformGroupActionInput): Promise<SandboxWorkspaceState>
  getOneBotDebugRecords(input?: GetSandboxOneBotDebugRecordsInput): Promise<SandboxConsoleOneBotDebugRecord[]>
  clearOneBotDebugRecords(): Promise<ClearSandboxOneBotDebugRecordsResult>
}
