import { send } from '@koishijs/client'
import type { WorkspacePort } from './workspace-port'

export const koishiWorkspacePort: WorkspacePort = {
  // Koishi Console 会把省略的 send 参数序列化为 null；服务端工作区接口需要收到普通对象才能执行 fallback。
  getWorkspace: (input = {}) => send('onebot-sandbox/workspace', input),
  getMessageHistory: (input) => send('onebot-sandbox/message-history', input),
  sendMessage: (input) => send('onebot-sandbox/send-message', input),
  sendMediaMessage: (input) => send('onebot-sandbox/send-media-message', input),
  getMediaContent: (input) => send('onebot-sandbox/media-content', input),
  setGroupAnnouncement: (input) => send('onebot-sandbox/set-group-announcement', input),
  deleteGroupAnnouncement: (input) => send('onebot-sandbox/delete-group-announcement', input),
  manageEnvironment: (input) => send('onebot-sandbox/manage-environment', input),
  performFriendAction: (input) => send('onebot-sandbox/friend-action', input),
  performGroupAction: (input) => send('onebot-sandbox/group-action', input),
  getOneBotDebugRecords: (input = {}) => send('onebot-sandbox/debug-records', input),
  clearOneBotDebugRecords: () => send('onebot-sandbox/clear-debug-records'),
}
