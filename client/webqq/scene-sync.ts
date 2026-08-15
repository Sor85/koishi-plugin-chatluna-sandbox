import { receive } from '@koishijs/client'
import type { createWorkspaceController } from './workspace-controller'

type SceneMutationPayload = { spaceId?: string, revision: number }
type SceneMutationListener = (payload: SceneMutationPayload) => void

const mutationListeners = new Set<SceneMutationListener>()
let receiverInstalled = false

function notifyMutationListeners(payload: SceneMutationPayload) {
  for (const listener of mutationListeners) listener(payload)
}

function installMutationReceiver() {
  if (receiverInstalled) return
  receiverInstalled = true
  // Koishi receive 对同名事件只保存一个回调；页面反复挂载时若直接注册，后卸载的页面会留下失效回调并覆盖存活页面。
  receive<SceneMutationPayload>('chatluna-sandbox/scene-mutated', notifyMutationListeners)
}

interface SceneMutationContext {
  on(event: 'chatluna-sandbox/scene-mutated', callback: SceneMutationListener): unknown
}

export function installContextMutationReceiver(ctx: unknown) {
  const context = ctx as SceneMutationContext
  // Console 的预构建入口与插件源码可能各自持有一份 @koishijs/client；主 Context 事件总线
  // 才是服务端广播实际抵达的位置，不能只依赖模块级 receive 单例。
  context.on('chatluna-sandbox/scene-mutated', notifyMutationListeners)
}

// 服务端在每次场景变更时广播 revision；发送 RPC 即时返回后，机器人稍后写入的回复靠这里增量刷新。
export function createSceneMutationSync(
  controller: Pick<ReturnType<typeof createWorkspaceController>, 'notifySceneRevision'>,
  getSpaceId: () => string | undefined,
): () => void {
  installMutationReceiver()
  const listener: SceneMutationListener = (payload) => {
    if ((payload.spaceId ?? undefined) !== getSpaceId()) return
    controller.notifySceneRevision(payload.revision)
  }
  mutationListeners.add(listener)
  return () => mutationListeners.delete(listener)
}
