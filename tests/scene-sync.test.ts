import { beforeEach, describe, expect, it, vi } from 'vitest'

const clientMocks = vi.hoisted(() => ({
  receive: vi.fn(),
}))

vi.mock('@koishijs/client', () => clientMocks)

import { createSceneMutationSync, installContextMutationReceiver } from '../client/webqq/scene-sync'

describe('场景变更实时同步', () => {
  beforeEach(() => {
    clientMocks.receive.mockClear()
  })

  it('后挂载页面卸载后不会覆盖仍存活页面的广播监听器', () => {
    const firstController = { notifySceneRevision: vi.fn() }
    const secondController = { notifySceneRevision: vi.fn() }
    const disposeFirst = createSceneMutationSync(firstController, () => undefined)
    const disposeSecond = createSceneMutationSync(secondController, () => undefined)

    expect(clientMocks.receive).toHaveBeenCalledTimes(1)
    const receiveMutation = clientMocks.receive.mock.calls[0]?.[1] as ((payload: { revision: number }) => void) | undefined
    expect(receiveMutation).toBeTypeOf('function')

    disposeSecond()
    receiveMutation?.({ revision: 7 })

    expect(firstController.notifySceneRevision).toHaveBeenCalledWith(7)
    expect(secondController.notifySceneRevision).not.toHaveBeenCalled()
    disposeFirst()
  })

  it('主 Context 广播会通知现有页面监听器', () => {
    const controller = { notifySceneRevision: vi.fn() }
    const dispose = createSceneMutationSync(controller, () => undefined)
    const contextListeners = new Map<string, (payload: { revision: number }) => void>()

    installContextMutationReceiver({
      on(event: string, callback: (payload: { revision: number }) => void) {
        contextListeners.set(event, callback as (payload: { revision: number }) => void)
        return () => true
      },
    })
    contextListeners.get('onebot-sandbox/scene-mutated')?.({ revision: 9 })

    expect(controller.notifySceneRevision).toHaveBeenCalledWith(9)
    dispose()
  })
})
