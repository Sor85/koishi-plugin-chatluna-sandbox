import { describe, expect, it, vi } from 'vitest'

const { send } = vi.hoisted(() => ({ send: vi.fn() }))

vi.mock('@koishijs/client', () => ({ send }))

import { createKoishiWorkspacePort, koishiWorkspacePort } from '../client/webqq/koishi-workspace-port'

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
  })

  it('预设文件调用保持全局，表达式定位使用调用方提供的显式 scope', async () => {
    send.mockClear()
    send.mockResolvedValue({})
    const port = createKoishiWorkspacePort(() => 'space-current')

    await port.getPresetCatalog()
    await port.readPreset({ kind: 'core', fileName: 'assistant.yml' })
    await port.locatePresetExpression({
      document: { kind: 'core', fileName: 'assistant.yml', revision: 'rev-1' },
      expression: { stableId: 'expression-1' },
      scope: { scope: 'space', spaceId: 'space-target' },
    })

    expect(send).toHaveBeenNthCalledWith(1, 'chatluna-sandbox/preset-catalog', {})
    expect(send).toHaveBeenNthCalledWith(2, 'chatluna-sandbox/preset-read', { kind: 'core', fileName: 'assistant.yml' })
    expect(send).toHaveBeenNthCalledWith(3, 'chatluna-sandbox/preset-locate-expression', expect.objectContaining({
      scope: { scope: 'space', spaceId: 'space-target' },
    }))
  })

  it('模型请求记录按显式 scope 发送，不注入当前工作区 spaceId', async () => {
    send.mockClear()
    send.mockResolvedValue({ records: [], hasMore: false, capacity: { recordCount: 0, totalBytes: 0, maxRecords: 5000, maxBytes: 1 } })
    const port = createKoishiWorkspacePort(() => 'space-1')

    await port.getModelRequestRecords({ scope: 'unattributed', limit: 50 })
    await port.getModelRequestRecord({ scope: 'space', spaceId: 'main', recordId: 'record-1' })
    await port.clearModelRequestRecords({ scope: 'unattributed' })

    expect(send).toHaveBeenNthCalledWith(1, 'chatluna-sandbox/model-request-records', { scope: 'unattributed', limit: 50 })
    expect(send).toHaveBeenNthCalledWith(2, 'chatluna-sandbox/model-request-record', { scope: 'space', spaceId: 'main', recordId: 'record-1' })
    expect(send).toHaveBeenNthCalledWith(3, 'chatluna-sandbox/clear-model-request-records', { scope: 'unattributed' })
  })

  it('MCP 调用记录按筛选参数发送，不注入当前工作区 spaceId', async () => {
    send.mockClear()
    send.mockResolvedValue({ records: [] })
    const port = createKoishiWorkspacePort(() => 'space-1')

    await port.getMcpCallRecords({ tool: 'send_message', spaceId: 'space-target' })
    await port.getMcpCallRecord({ recordId: 'call-1' })
    await port.clearMcpCallRecords()

    expect(send).toHaveBeenNthCalledWith(1, 'chatluna-sandbox/mcp-call-records', { tool: 'send_message', spaceId: 'space-target' })
    expect(send).toHaveBeenNthCalledWith(2, 'chatluna-sandbox/mcp-call-record', { recordId: 'call-1' })
    expect(send).toHaveBeenNthCalledWith(3, 'chatluna-sandbox/clear-mcp-call-records')
  })
})
