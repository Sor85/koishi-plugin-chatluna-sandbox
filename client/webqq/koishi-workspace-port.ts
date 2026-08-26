import { send } from '@koishijs/client'
import type { WorkspacePort } from './workspace-port'

export function createKoishiWorkspacePort(resolveSpaceId: () => string | undefined = () => undefined): WorkspacePort {
  const scoped = <Input extends object>(input: Input): Input & { spaceId?: string } => {
    const spaceId = resolveSpaceId()
    return spaceId ? { ...input, spaceId } : input
  }
  return {
  // Koishi Console 会把省略的 send 参数序列化为 null；服务端工作区接口需要收到普通对象才能执行 fallback。
  getWorkspace: (input = {}) => send('chatluna-sandbox/workspace', scoped(input)),
  getMessageHistory: (input) => send('chatluna-sandbox/message-history', scoped(input)),
  resolveMessageId: (input) => send('chatluna-sandbox/resolve-message-id', scoped(input)),
  searchConversationMessages: (input) => send('chatluna-sandbox/search-conversation-messages', scoped(input)),
  sendMessage: (input) => send('chatluna-sandbox/send-message', scoped(input)),
  sendMediaMessage: (input) => send('chatluna-sandbox/send-media-message', scoped(input)),
  sendForwardMessage: (input) => send('chatluna-sandbox/send-forward-message', scoped(input)),
  getForwardMessage: (input) => send('chatluna-sandbox/get-forward-message', scoped(input)),
  recallMessage: (input) => send('chatluna-sandbox/recall-message', scoped(input)),
  clearConversationMessages: (input) => send('chatluna-sandbox/clear-conversation-messages', scoped(input)),
  setMessageReaction: (input) => send('chatluna-sandbox/set-message-reaction', scoped(input)),
  getMediaContent: (input) => send('chatluna-sandbox/media-content', scoped(input)),
  setGroupAnnouncement: (input) => send('chatluna-sandbox/set-group-announcement', scoped(input)),
  deleteGroupAnnouncement: (input) => send('chatluna-sandbox/delete-group-announcement', scoped(input)),
  manageEnvironment: (input) => send('chatluna-sandbox/manage-environment', scoped(input)),
  performFriendAction: (input) => send('chatluna-sandbox/friend-action', scoped(input)),
  performGroupAction: (input) => send('chatluna-sandbox/group-action', scoped(input)),
  getOneBotDebugRecords: (input = {}) => send('chatluna-sandbox/debug-records', scoped(input)),
  getOneBotDebugRecord: (input) => send('chatluna-sandbox/debug-record', scoped(input)),
  clearOneBotDebugRecords: () => send('chatluna-sandbox/clear-debug-records', scoped({})),
  // 模型请求记录按分类显式传 scope/spaceId，不能复用当前工作区的 spaceId 注入：
  // 未归属分类没有 spaceId，切到其他空间时也不应被当前观察的测试空间覆盖。
  getModelRequestRecords: (input) => send('chatluna-sandbox/model-request-records', input),
  getModelRequestRecord: (input) => send('chatluna-sandbox/model-request-record', input),
  getModelRequestTrajectory: (input) => send('chatluna-sandbox/model-request-trajectory', input),
  clearModelRequestRecords: (input) => send('chatluna-sandbox/clear-model-request-records', input),
  // 预设文件是全局 ChatLuna 资源；仅定位表达式的 input 自身携带明确 scope，均不注入当前工作区 spaceId。
  getPresetCatalog: (input = {}) => send('chatluna-sandbox/preset-catalog', input),
  readPreset: (input) => send('chatluna-sandbox/preset-read', input),
  createPreset: (input) => send('chatluna-sandbox/preset-create', input),
  savePreset: (input) => send('chatluna-sandbox/preset-save', input),
  renamePreset: (input) => send('chatluna-sandbox/preset-rename', input),
  deletePreset: (input) => send('chatluna-sandbox/preset-delete', input),
  locatePresetExpression: (input) => send('chatluna-sandbox/preset-locate-expression', input),
  // 测试调用记录跨主环境和全部测试空间共享；筛选里的 spaceId 是记录字段，不能被当前观察空间覆盖。
  getMcpCallRecords: (input = {}) => send('chatluna-sandbox/mcp-call-records', input),
  getMcpCallRecord: (input) => send('chatluna-sandbox/mcp-call-record', input),
  clearMcpCallRecords: () => send('chatluna-sandbox/clear-mcp-call-records'),
  }
}

export const koishiWorkspacePort = createKoishiWorkspacePort()
