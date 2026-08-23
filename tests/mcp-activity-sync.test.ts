import { beforeEach, describe, expect, it, vi } from 'vitest'

const clientMocks = vi.hoisted(() => ({
  receive: vi.fn(),
  send: vi.fn(async () => ({ running: false })),
}))

vi.mock('@koishijs/client', () => clientMocks)

import { createMcpActivitySync, installContextMcpActivityReceiver } from '../client/webqq/mcp-activity-sync'

describe('MCP 活动实时同步', () => {
  beforeEach(() => {
    clientMocks.receive.mockClear()
    clientMocks.send.mockClear()
    clientMocks.send.mockResolvedValue({ running: false })
  })

  it('后挂载页面卸载后不会覆盖仍存活页面的广播监听器', async () => {
    const first = createMcpActivitySync()
    const second = createMcpActivitySync()

    expect(clientMocks.receive).toHaveBeenCalledTimes(1)
    const receiveActivity = clientMocks.receive.mock.calls[0]?.[1] as ((payload: { running: boolean }) => void) | undefined
    expect(receiveActivity).toBeTypeOf('function')

    second.dispose()
    receiveActivity?.({ running: true })

    expect(first.running.value).toBe(true)
    expect(second.running.value).toBe(false)
    first.dispose()
  })

  it('主 Context 广播会通知现有页面监听器', () => {
    const sync = createMcpActivitySync()
    const contextListeners = new Map<string, (payload: { running: boolean }) => void>()

    installContextMcpActivityReceiver({
      on(event: string, callback: (payload: { running: boolean }) => void) {
        contextListeners.set(event, callback)
      },
    })

    contextListeners.get('chatluna-sandbox/mcp-activity')?.({ running: true })
    expect(sync.running.value).toBe(true)
    sync.dispose()
  })

  it('初始查询返回前到达的广播不会被查询结果盖掉', async () => {
    let resolveSend: ((payload: { running: boolean }) => void) | undefined
    clientMocks.send.mockReturnValue(new Promise<{ running: boolean }>((resolve) => {
      resolveSend = resolve
    }))
    const sync = createMcpActivitySync()
    const contextListeners = new Map<string, (payload: { running: boolean }) => void>()
    installContextMcpActivityReceiver({
      on(event: string, callback: (payload: { running: boolean }) => void) {
        contextListeners.set(event, callback)
      },
    })

    contextListeners.get('chatluna-sandbox/mcp-activity')?.({ running: true })
    expect(sync.running.value).toBe(true)
    resolveSend?.({ running: false })
    await Promise.resolve()
    expect(sync.running.value).toBe(true)
    sync.dispose()
  })
})
