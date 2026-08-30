import type { SandboxSceneMutationPayload } from '../../src/console-contract'
import type { createWorkspaceController } from './workspace-controller'
import type { WorkspacePort } from './workspace-port'

/**
 * 服务端在每次场景变更时广播 revision；发送 RPC 即时返回后，机器人稍后写入的回复靠这里增量刷新。
 *
 * 一份广播扇出给多少个页面、以及只向 Koishi 注册一次回调，都由端口适配器负责，
 * 这里只做「这条广播是不是我正在观察的那个空间」的过滤。
 */
export function createSceneMutationSync(
  port: Pick<WorkspacePort, 'subscribeSceneMutation'>,
  controller: Pick<ReturnType<typeof createWorkspaceController>, 'notifySceneRevision'>,
  getSpaceId: () => string | undefined,
): () => void {
  return port.subscribeSceneMutation((payload: SandboxSceneMutationPayload) => {
    if ((payload.spaceId ?? undefined) !== getSpaceId()) return
    controller.notifySceneRevision(payload.revision)
  })
}
