import { receive, send } from '@koishijs/client'
import type { SandboxSceneMutationPayload } from '../../src/console-contract'
import { createImplicitSpaceScope } from './koishi-implicit-space-scope'
import type { SceneMutationListener, WorkspacePort } from './workspace-port'

const mutationListeners = new Set<SceneMutationListener>()
let receiverInstalled = false

function notifyMutationListeners(payload: SandboxSceneMutationPayload) {
  for (const listener of mutationListeners) listener(payload)
}

function installMutationReceiver() {
  if (receiverInstalled) return
  receiverInstalled = true
  // Koishi receive 对同名事件只保存一个回调；页面反复挂载时若每次都注册，后卸载的页面会
  // 留下失效回调并覆盖存活页面。这里只注册一次，再由适配器扇出给全部订阅者。
  receive('chatluna-sandbox/scene-mutated', notifyMutationListeners)
}

interface SceneMutationContext {
  on(event: 'chatluna-sandbox/scene-mutated', callback: SceneMutationListener): unknown
}

export function installContextSceneMutationReceiver(ctx: unknown) {
  const context = ctx as SceneMutationContext
  // Console 的预构建入口与插件源码可能各自持有一份 @koishijs/client；主 Context 事件总线
  // 才是服务端广播实际抵达的位置，不能只依赖模块级 receive 单例。
  context.on('chatluna-sandbox/scene-mutated', notifyMutationListeners)
}

export function createKoishiWorkspacePort(resolveSpaceId: () => string | undefined = () => undefined): WorkspacePort {
  const scoped = createImplicitSpaceScope(resolveSpaceId)
  return {
  // Koishi Console 会把省略的 send 参数序列化为 null；服务端工作区接口需要收到普通对象才能执行 fallback。
  getWorkspace: (input = {}) => send('chatluna-sandbox/workspace', scoped(input)),
  getMessageHistory: (input) => send('chatluna-sandbox/message-history', scoped(input)),
  createConversationInstance: (input) => send('chatluna-sandbox/create-conversation-instance', scoped(input)),
  branchConversationInstance: (input) => send('chatluna-sandbox/branch-conversation-instance', scoped(input)),
  renameConversationInstance: (input) => send('chatluna-sandbox/rename-conversation-instance', scoped(input)),
  deleteConversationInstance: (input) => send('chatluna-sandbox/delete-conversation-instance', scoped(input)),
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
  // 场景变更广播不定域：载荷自带 spaceId，订阅方按自己当前观察的空间过滤。
  subscribeSceneMutation: (listener) => {
    installMutationReceiver()
    mutationListeners.add(listener)
    return () => { mutationListeners.delete(listener) }
  },
  }
}

export const koishiWorkspacePort = createKoishiWorkspacePort()
