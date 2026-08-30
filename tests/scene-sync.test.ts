import { describe, expect, it, vi } from 'vitest'
import { createFakeWorkspacePort } from '../client/webqq/fake-workspace-port'
import { createSceneMutationSync } from '../client/webqq/scene-sync'
import type { SandboxWorkspaceState } from '../src/types'

const workspace: SandboxWorkspaceState = {
  snapshot: {
    revision: 1,
    participants: [],
    groups: [],
    conversations: [],
    messages: [],
    friendships: [],
    requests: [],
  },
  chatLunaStates: [],
  appearance: {
    enableSandboxFrostedGlass: true,
    sandboxTimBubbleTail: true,
    sandboxColorMode: 'auto',
    sandboxAccentColor: '#2563eb',
    sandboxMarkRecalledMessages: true,
  },
  persistence: { mode: 'memory', available: true, persisted: false },
}

describe('场景变更实时同步', () => {
  it('后挂载页面卸载后不会覆盖仍存活页面的广播监听器', () => {
    const port = createFakeWorkspacePort(workspace)
    const firstController = { notifySceneRevision: vi.fn() }
    const secondController = { notifySceneRevision: vi.fn() }
    const disposeFirst = createSceneMutationSync(port, firstController, () => undefined)
    const disposeSecond = createSceneMutationSync(port, secondController, () => undefined)

    disposeSecond()
    port.emitSceneMutation({ revision: 7 })

    expect(firstController.notifySceneRevision).toHaveBeenCalledWith(7)
    expect(secondController.notifySceneRevision).not.toHaveBeenCalled()
    disposeFirst()
  })

  it('只接受自己正在观察的那个空间的广播', () => {
    const port = createFakeWorkspacePort(workspace)
    const mainController = { notifySceneRevision: vi.fn() }
    const spaceController = { notifySceneRevision: vi.fn() }
    const disposeMain = createSceneMutationSync(port, mainController, () => undefined)
    const disposeSpace = createSceneMutationSync(port, spaceController, () => 'space-1')

    port.emitSceneMutation({ revision: 9 })
    port.emitSceneMutation({ spaceId: 'space-1', revision: 11 })
    port.emitSceneMutation({ spaceId: 'space-2', revision: 13 })

    expect(mainController.notifySceneRevision.mock.calls).toEqual([[9]])
    expect(spaceController.notifySceneRevision.mock.calls).toEqual([[11]])
    disposeMain()
    disposeSpace()
  })
})
