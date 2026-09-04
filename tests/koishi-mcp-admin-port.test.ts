import { beforeEach, describe, expect, it, vi } from 'vitest'

const clientMocks = vi.hoisted(() => ({
  receive: vi.fn(),
  send: vi.fn(async () => ({ running: false })),
}))

vi.mock('@koishijs/client', () => clientMocks)

import { createKoishiMcpAdminPort, installContextMcpActivityReceiver } from '../client/mcp/koishi-port'

type ActivityListener = (payload: { running: boolean }) => void

describe('Koishi MCP 管理端口适配器', () => {
  beforeEach(() => {
    clientMocks.receive.mockClear()
    clientMocks.send.mockClear()
  })

  it('无论订阅多少次都只向 Koishi 注册一次广播回调，并扇出给全部订阅者', () => {
    const port = createKoishiMcpAdminPort()
    const seen: string[] = []

    const unsubscribeFirst = port.subscribeMcpActivity(({ running }) => seen.push(`first:${running}`))
    port.subscribeMcpActivity(({ running }) => seen.push(`second:${running}`))
    // 适配器模块级只注册一次；同一进程里再建一个适配器也不得追加注册。
    createKoishiMcpAdminPort().subscribeMcpActivity(({ running }) => seen.push(`third:${running}`))

    expect(clientMocks.receive.mock.calls.length).toBeLessThanOrEqual(1)
    const broadcast = clientMocks.receive.mock.calls[0]?.[1] as ActivityListener | undefined
    const emit = broadcast ?? ((payload: { running: boolean }) => payload)
    emit({ running: true })
    expect(seen).toEqual(['first:true', 'second:true', 'third:true'])

    seen.length = 0
    unsubscribeFirst()
    emit({ running: false })
    expect(seen).toEqual(['second:false', 'third:false'])
  })

  it('主 Context 广播抵达同一批订阅者', () => {
    const port = createKoishiMcpAdminPort()
    const seen: boolean[] = []
    const unsubscribe = port.subscribeMcpActivity(({ running }) => seen.push(running))
    const contextListeners = new Map<string, ActivityListener>()

    installContextMcpActivityReceiver({
      on(event: string, callback: ActivityListener) {
        contextListeners.set(event, callback)
      },
    })
    contextListeners.get('chatluna-sandbox/mcp-activity')?.({ running: true })

    expect(seen).toEqual([true])
    unsubscribe()
  })

  it('把每个凭证与能力目录操作映射到对应的 Console 端点', async () => {
    const port = createKoishiMcpAdminPort()

    await port.listTestCredentials()
    await port.createTestCredential({ name: '控制器', scopes: ['read'] })
    await port.updateTestCredential({ id: 'c1', name: '改名' })
    await port.rotateTestCredentialToken({ id: 'c1' })
    await port.setTestCredentialEnabled({ id: 'c1', enabled: false })
    await port.revokeTestCredential({ id: 'c1' })
    await port.getMcpCapabilities()
    await port.getHttpApiCapabilities()
    await port.getMcpActivity()

    expect(clientMocks.send.mock.calls).toEqual([
      ['chatluna-sandbox/test-credentials'],
      ['chatluna-sandbox/create-test-credential', { name: '控制器', scopes: ['read'] }],
      ['chatluna-sandbox/update-test-credential', { id: 'c1', name: '改名' }],
      ['chatluna-sandbox/rotate-test-credential-token', { id: 'c1' }],
      ['chatluna-sandbox/set-test-credential-enabled', { id: 'c1', enabled: false }],
      ['chatluna-sandbox/revoke-test-credential', { id: 'c1' }],
      ['chatluna-sandbox/mcp-capabilities'],
      ['chatluna-sandbox/http-capabilities'],
      ['chatluna-sandbox/mcp-activity'],
    ])
  })
})
