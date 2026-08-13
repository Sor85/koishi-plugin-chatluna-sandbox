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
  SandboxOneBotDebugRecordsPage,
  SandboxWorkspaceState,
  SendForwardMessageInput,
  SendMediaMessageInput,
  SendMessageInput,
  SetGroupAnnouncementInput,
} from '../../src/types'
import type {
  ClearModelRequestRecordsQuery,
  ModelRequestRecordQuery,
  ModelRequestRecordsQuery,
} from './model-request-query'

export interface WorkspacePort {
  getWorkspace(input?: GetSandboxWorkspaceInput): Promise<SandboxWorkspaceState>
  getMessageHistory(input: GetMessageHistoryInput): Promise<SandboxMessageHistory>
  searchConversationMessages(input: SearchConversationMessagesInput): Promise<SandboxMessageSearchResult>
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
  getModelRequestRecords(input: ModelRequestRecordsQuery): Promise<SandboxModelRequestRecordsPage>
  getModelRequestRecord(input: ModelRequestRecordQuery): Promise<SandboxModelRequestDetail>
  clearModelRequestRecords(input: ClearModelRequestRecordsQuery): Promise<ClearSandboxModelRequestRecordsResult>
}
