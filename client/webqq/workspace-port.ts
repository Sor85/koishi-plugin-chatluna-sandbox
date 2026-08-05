import type {
  DeleteGroupAnnouncementInput,
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
  SetMessageReactionInput,
  SandboxConsoleOneBotDebugRecord,
  SandboxForward,
  SandboxMediaContent,
  SandboxMessageHistory,
  SandboxOneBotDebugRecordsPage,
  SandboxWorkspaceState,
  SendForwardMessageInput,
  SendMediaMessageInput,
  SendMessageInput,
  SetGroupAnnouncementInput,
} from '../../src/types'

export interface WorkspacePort {
  getWorkspace(input?: GetSandboxWorkspaceInput): Promise<SandboxWorkspaceState>
  getMessageHistory(input: GetMessageHistoryInput): Promise<SandboxMessageHistory>
  sendMessage(input: SendMessageInput): Promise<SandboxWorkspaceState>
  sendMediaMessage(input: SendMediaMessageInput): Promise<SandboxWorkspaceState>
  sendForwardMessage(input: SendForwardMessageInput): Promise<SandboxWorkspaceState>
  getForwardMessage(input: GetForwardMessageInput): Promise<SandboxForward>
  recallMessage(input: RecallMessageInput): Promise<SandboxWorkspaceState>
  setMessageReaction(input: SetMessageReactionInput): Promise<SandboxWorkspaceState>
  getMediaContent(input: GetMediaContentInput): Promise<SandboxMediaContent>
  setGroupAnnouncement(input: SetGroupAnnouncementInput): Promise<SandboxWorkspaceState>
  deleteGroupAnnouncement(input: DeleteGroupAnnouncementInput): Promise<SandboxWorkspaceState>
  manageEnvironment(input: ManageSandboxEnvironmentInput): Promise<SandboxWorkspaceState>
  performFriendAction(input: PerformFriendActionInput): Promise<SandboxWorkspaceState>
  performGroupAction(input: PerformGroupActionInput): Promise<SandboxWorkspaceState>
  getOneBotDebugRecords(input?: GetSandboxOneBotDebugRecordsInput): Promise<SandboxOneBotDebugRecordsPage<SandboxConsoleOneBotDebugRecord>>
  clearOneBotDebugRecords(): Promise<ClearSandboxOneBotDebugRecordsResult>
}
