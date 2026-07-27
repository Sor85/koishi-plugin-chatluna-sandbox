import { receive } from '@koishijs/client'
import type { createWorkspaceController } from './workspace-controller'

// 服务端在每次场景变更时广播 revision；发送 RPC 即时返回后，机器人稍后写入的回复靠这里增量刷新。
// receive 是全局单监听器（重复注册会覆盖），页面卸载后旧闭包仍会被调用，因此用返回的 dispose 短路。
export function createSceneMutationSync(
  controller: Pick<ReturnType<typeof createWorkspaceController>, 'notifySceneRevision'>,
  getSpaceId: () => string | undefined,
): () => void {
  let disposed = false
  receive<{ spaceId?: string, revision: number }>('onebot-sandbox/scene-mutated', (payload) => {
    if (disposed) return
    if ((payload.spaceId ?? undefined) !== getSpaceId()) return
    controller.notifySceneRevision(payload.revision)
  })
  return () => {
    disposed = true
  }
}
