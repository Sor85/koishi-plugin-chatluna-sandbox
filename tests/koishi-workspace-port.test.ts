import { describe, expect, it, vi } from 'vitest'

const { receive, send } = vi.hoisted(() => ({ receive: vi.fn(), send: vi.fn() }))

vi.mock('@koishijs/client', () => ({ receive, send }))

import {
  createKoishiWorkspacePort,
  installContextSceneMutationReceiver,
  koishiWorkspacePort,
} from '../client/workspace/koishi-port'

type SceneMutationListener = (payload: { spaceId?: string, revision: number }) => void

describe('Koishi 工作区端口', () => {
  it('无操作者加载工作区时发送空对象而不是缺省参数', async () => {
    send.mockResolvedValueOnce({})

    await koishiWorkspacePort.getWorkspace()

    expect(send).toHaveBeenCalledWith('chatluna-sandbox/workspace', {})
  })

  it('为 AI 测试空间的所有工作区调用附加显式 spaceId', async () => {
    send.mockClear()
    send.mockResolvedValue({})
    const port = createKoishiWorkspacePort(() => 'space-1')

    await port.getWorkspace({ operatorId: '11001' })
    await port.manageEnvironment({ action: 'create-user', data: { id: '11002', name: '用户' } })
    await port.sendForwardMessage({ operatorId: '11001', conversationId: 'private:11001:12001', messageIds: ['message-1'] })
    await port.getForwardMessage({ operatorId: '11001', forwardId: 'forward-1' })
    await port.searchConversationMessages({
      operatorId: '11001',
      conversationId: 'private:11001:12001',
      query: 'hello',
      createdAtStart: '2026-08-10T00:00:00.000Z',
      createdAtEnd: '2026-08-11T00:00:00.000Z',
      limit: 10,
    })
    await port.createConversationInstance({ operatorId: '11001', rootConversationId: 'private:11001:12001' })
    await port.renameConversationInstance({ operatorId: '11001', conversationId: 'instance-1', title: '换一种问法' })
    await port.deleteConversationInstance({ operatorId: '11001', conversationId: 'instance-1' })

    expect(send).toHaveBeenNthCalledWith(1, 'chatluna-sandbox/workspace', { operatorId: '11001', spaceId: 'space-1' })
    expect(send).toHaveBeenNthCalledWith(2, 'chatluna-sandbox/manage-environment', { action: 'create-user', data: { id: '11002', name: '用户' }, spaceId: 'space-1' })
    expect(send).toHaveBeenNthCalledWith(3, 'chatluna-sandbox/send-forward-message', {
      operatorId: '11001',
      conversationId: 'private:11001:12001',
      messageIds: ['message-1'],
      spaceId: 'space-1',
    })
    expect(send).toHaveBeenNthCalledWith(4, 'chatluna-sandbox/get-forward-message', {
      operatorId: '11001',
      forwardId: 'forward-1',
      spaceId: 'space-1',
    })
    expect(send).toHaveBeenNthCalledWith(5, 'chatluna-sandbox/search-conversation-messages', {
      operatorId: '11001',
      conversationId: 'private:11001:12001',
      query: 'hello',
      createdAtStart: '2026-08-10T00:00:00.000Z',
      createdAtEnd: '2026-08-11T00:00:00.000Z',
      limit: 10,
      spaceId: 'space-1',
    })
    expect(send).toHaveBeenNthCalledWith(6, 'chatluna-sandbox/create-conversation-instance', {
      operatorId: '11001',
      rootConversationId: 'private:11001:12001',
      spaceId: 'space-1',
    })
    expect(send).toHaveBeenNthCalledWith(7, 'chatluna-sandbox/rename-conversation-instance', {
      operatorId: '11001',
      conversationId: 'instance-1',
      title: '换一种问法',
      spaceId: 'space-1',
    })
    expect(send).toHaveBeenNthCalledWith(8, 'chatluna-sandbox/delete-conversation-instance', {
      operatorId: '11001',
      conversationId: 'instance-1',
      spaceId: 'space-1',
    })
  })

  it('无论订阅多少次都只向 Koishi 注册一次场景变更回调，并扇出给全部订阅者', () => {
    const port = createKoishiWorkspacePort(() => 'space-1')
    const seen: string[] = []

    const unsubscribeFirst = port.subscribeSceneMutation(({ revision }) => seen.push(`first:${revision}`))
    port.subscribeSceneMutation(({ revision }) => seen.push(`second:${revision}`))
    // 适配器模块级只注册一次；同一进程里再建一个适配器也不得追加注册。
    createKoishiWorkspacePort().subscribeSceneMutation(({ revision }) => seen.push(`third:${revision}`))

    expect(receive.mock.calls.length).toBeLessThanOrEqual(1)
    const broadcast = receive.mock.calls[0]?.[1] as SceneMutationListener | undefined
    const emit = broadcast ?? ((payload: { revision: number }) => payload)
    emit({ revision: 5 })
    expect(seen).toEqual(['first:5', 'second:5', 'third:5'])

    seen.length = 0
    unsubscribeFirst()
    emit({ revision: 6 })
    expect(seen).toEqual(['second:6', 'third:6'])
  })

  it('订阅不跟随当前活动空间，广播载荷自带 spaceId', () => {
    const port = createKoishiWorkspacePort(() => 'space-1')
    const seen: Array<string | undefined> = []
    const unsubscribe = port.subscribeSceneMutation(({ spaceId }) => seen.push(spaceId))
    const broadcast = receive.mock.calls[0]?.[1] as SceneMutationListener | undefined

    broadcast?.({ revision: 1 })
    broadcast?.({ spaceId: 'space-2', revision: 2 })

    expect(seen).toEqual([undefined, 'space-2'])
    unsubscribe()
  })

  it('主 Context 广播抵达同一批订阅者', () => {
    const port = createKoishiWorkspacePort()
    const seen: number[] = []
    const unsubscribe = port.subscribeSceneMutation(({ revision }) => seen.push(revision))
    const contextListeners = new Map<string, SceneMutationListener>()

    installContextSceneMutationReceiver({
      on(event: string, callback: SceneMutationListener) {
        contextListeners.set(event, callback)
      },
    })
    contextListeners.get('chatluna-sandbox/scene-mutated')?.({ revision: 9 })

    expect(seen).toEqual([9])
    unsubscribe()
  })
})
