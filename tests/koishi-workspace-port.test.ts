import { describe, expect, it, vi } from 'vitest'

const { send } = vi.hoisted(() => ({ send: vi.fn() }))

vi.mock('@koishijs/client', () => ({ send }))

import { createKoishiWorkspacePort, koishiWorkspacePort } from '../client/webqq/koishi-workspace-port'

describe('Koishi 工作区端口', () => {
  it('无操作者加载工作区时发送空对象而不是缺省参数', async () => {
    send.mockResolvedValueOnce({})

    await koishiWorkspacePort.getWorkspace()

    expect(send).toHaveBeenCalledWith('onebot-sandbox/workspace', {})
  })

  it('为 AI 测试空间的所有工作区调用附加显式 spaceId', async () => {
    send.mockClear()
    send.mockResolvedValue({})
    const port = createKoishiWorkspacePort(() => 'space-1')

    await port.getWorkspace({ operatorId: '11001' })
    await port.manageEnvironment({ action: 'create-user', data: { id: '11002', name: '用户' } })
    await port.sendForwardMessage({ operatorId: '11001', conversationId: 'private:11001:12001', messageIds: ['message-1'] })
    await port.getForwardMessage({ operatorId: '11001', forwardId: 'forward-1' })

    expect(send).toHaveBeenNthCalledWith(1, 'onebot-sandbox/workspace', { operatorId: '11001', spaceId: 'space-1' })
    expect(send).toHaveBeenNthCalledWith(2, 'onebot-sandbox/manage-environment', { action: 'create-user', data: { id: '11002', name: '用户' }, spaceId: 'space-1' })
    expect(send).toHaveBeenNthCalledWith(3, 'onebot-sandbox/send-forward-message', {
      operatorId: '11001',
      conversationId: 'private:11001:12001',
      messageIds: ['message-1'],
      spaceId: 'space-1',
    })
    expect(send).toHaveBeenNthCalledWith(4, 'onebot-sandbox/get-forward-message', {
      operatorId: '11001',
      forwardId: 'forward-1',
      spaceId: 'space-1',
    })
  })
})
