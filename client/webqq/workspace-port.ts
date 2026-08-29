import type {
  DeleteGroupAnnouncementInput,
  ClearSandboxModelRequestRecordsResult,
  ClearSandboxOneBotDebugRecordsResult,
  GetForwardMessageInput,
  GetMediaContentInput,
  GetMessageHistoryInput,
  BranchConversationInstanceInput,
  CreateConversationInstanceInput,
  DeleteConversationInstanceInput,
  RenameConversationInstanceInput,
  SandboxConversationInstanceResult,
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
import type {
  ClearModelRequestRecordsQuery,
  ModelRequestRecordQuery,
  ModelRequestRecordsQuery,
  ModelRequestTrajectoryQuery,
} from './model-request-query'
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

export interface WorkspacePort {
  getWorkspace(input?: GetSandboxWorkspaceInput): Promise<SandboxWorkspaceState>
  getMessageHistory(input: GetMessageHistoryInput): Promise<SandboxMessageHistory>
  createConversationInstance(input: CreateConversationInstanceInput): Promise<SandboxConversationInstanceResult>
  branchConversationInstance(input: BranchConversationInstanceInput): Promise<SandboxConversationInstanceResult>
  renameConversationInstance(input: RenameConversationInstanceInput): Promise<SandboxWorkspaceState>
  deleteConversationInstance(input: DeleteConversationInstanceInput): Promise<SandboxWorkspaceState>
  searchConversationMessages(input: SearchConversationMessagesInput): Promise<SandboxMessageSearchResult>
  sendMessage(input: SendMessageInput): Promise<SandboxWorkspaceState>
  sendMediaMessage(input: SendMediaMessageInput): Promise<SandboxWorkspaceState>
  sendForwardMessage(input: SendForwardMessageInput): Promise<SandboxWorkspaceState>
  getForwardMessage(input: GetForwardMessageInput): Promise<SandboxForward>
  recallMessage(input: RecallMessageInput): Promise<SandboxWorkspaceState>
  clearConversationMessages(input: ClearConversationMessagesInput): Promise<SandboxWorkspaceState>
  setMessageReaction(input: SetMessageReactionInput): Promise<SandboxWorkspaceState>
  /**
   * 显式给出 spaceId 时读该空间的媒体，省略时读端口当前定域的工作区。
   * 空间缩略图要绘制任意测试空间，因此必须能越过隐式定域。
   */
  getMediaContent(input: GetMediaContentInput & { spaceId?: string }): Promise<SandboxMediaContent>
  setGroupAnnouncement(input: SetGroupAnnouncementInput): Promise<SandboxWorkspaceState>
  deleteGroupAnnouncement(input: DeleteGroupAnnouncementInput): Promise<SandboxWorkspaceState>
  manageEnvironment(input: ManageSandboxEnvironmentInput): Promise<SandboxWorkspaceState>
  performFriendAction(input: PerformFriendActionInput): Promise<SandboxWorkspaceState>
  performGroupAction(input: PerformGroupActionInput): Promise<SandboxWorkspaceState>
  getOneBotDebugRecords(input?: GetSandboxOneBotDebugRecordsInput): Promise<SandboxOneBotDebugRecordsPage<SandboxConsoleOneBotDebugRecord>>
  getOneBotDebugRecord(input: GetSandboxOneBotDebugRecordInput & { spaceId?: string }): Promise<SandboxConsoleOneBotDebugRecord>
  clearOneBotDebugRecords(): Promise<ClearSandboxOneBotDebugRecordsResult>
  getModelRequestRecords(input: ModelRequestRecordsQuery): Promise<SandboxModelRequestRecordsPage>
  getModelRequestRecord(input: ModelRequestRecordQuery): Promise<SandboxModelRequestDetail>
  getModelRequestTrajectory(input: ModelRequestTrajectoryQuery): Promise<SandboxModelRequestTrajectory>
  clearModelRequestRecords(input: ClearModelRequestRecordsQuery): Promise<ClearSandboxModelRequestRecordsResult>
  getPresetCatalog(input?: { kind?: PresetDocumentKind }): Promise<SandboxPresetDocument[]>
  readPreset(input: ReadSandboxPresetInput): Promise<SandboxPresetDocument>
  createPreset(input: CreatePresetInput): Promise<SandboxPresetDocument>
  savePreset(input: SavePresetInput): Promise<SandboxPresetDocument>
  renamePreset(input: RenamePresetInput): Promise<SandboxPresetDocument>
  deletePreset(input: DeletePresetInput): Promise<{ deleted: true }>
  locatePresetExpression(input: LocateSandboxPresetExpressionInput): Promise<LocateSandboxPresetExpressionResult>
  getMcpCallRecords(input?: ListSandboxMcpCallRecordsInput): Promise<SandboxMcpCallRecordsPage>
  getMcpCallRecord(input: { recordId: string }): Promise<SandboxMcpCallRecord>
  clearMcpCallRecords(): Promise<{ cleared: number }>
}
