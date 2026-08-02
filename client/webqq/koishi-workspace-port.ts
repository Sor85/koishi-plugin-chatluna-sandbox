import { send } from '@koishijs/client'
import type { WorkspacePort } from './workspace-port'

export function createKoishiWorkspacePort(resolveSpaceId: () => string | undefined = () => undefined): WorkspacePort {
  const scoped = <Input extends object>(input: Input): Input & { spaceId?: string } => {
    const spaceId = resolveSpaceId()
    return spaceId ? { ...input, spaceId } : input
  }
  return {
  // Koishi Console 会把省略的 send 参数序列化为 null；服务端工作区接口需要收到普通对象才能执行 fallback。
  getWorkspace: (input = {}) => send('onebot-sandbox/workspace', scoped(input)),
  getMessageHistory: (input) => send('onebot-sandbox/message-history', scoped(input)),
  sendMessage: (input) => send('onebot-sandbox/send-message', scoped(input)),
  sendMediaMessage: (input) => send('onebot-sandbox/send-media-message', scoped(input)),
  recallMessage: (input) => send('onebot-sandbox/recall-message', scoped(input)),
  setMessageReaction: (input) => send('onebot-sandbox/set-message-reaction', scoped(input)),
  getMediaContent: (input) => send('onebot-sandbox/media-content', scoped(input)),
  setGroupAnnouncement: (input) => send('onebot-sandbox/set-group-announcement', scoped(input)),
  deleteGroupAnnouncement: (input) => send('onebot-sandbox/delete-group-announcement', scoped(input)),
  manageEnvironment: (input) => send('onebot-sandbox/manage-environment', scoped(input)),
  performFriendAction: (input) => send('onebot-sandbox/friend-action', scoped(input)),
  performGroupAction: (input) => send('onebot-sandbox/group-action', scoped(input)),
  getOneBotDebugRecords: (input = {}) => send('onebot-sandbox/debug-records', scoped(input)),
  clearOneBotDebugRecords: () => send('onebot-sandbox/clear-debug-records', scoped({})),
  }
}

export const koishiWorkspacePort = createKoishiWorkspacePort()
