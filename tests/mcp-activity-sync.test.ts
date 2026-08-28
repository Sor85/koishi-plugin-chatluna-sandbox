import { describe, expect, it } from 'vitest'
import { FakeMcpAdminPort } from '../client/webqq/fake-mcp-admin-port'
import { createMcpActivitySync } from '../client/webqq/mcp-activity-sync'

describe('MCP 活动实时同步', () => {
  it('每个页面各自持有一份指示灯，一个页面退订不影响仍存活的页面', () => {
    const port = new FakeMcpAdminPort()
    const first = createMcpActivitySync(port)
    const second = createMcpActivitySync(port)

    second.dispose()
    port.emitActivity({ running: true })

    expect(first.running.value).toBe(true)
    expect(second.running.value).toBe(false)
    first.dispose()
  })

  it('广播能把指示灯来回点亮和熄灭', () => {
    const port = new FakeMcpAdminPort()
    const sync = createMcpActivitySync(port)

    port.emitActivity({ running: true })
    expect(sync.running.value).toBe(true)
    port.emitActivity({ running: false })
    expect(sync.running.value).toBe(false)
    sync.dispose()
  })

  it('初始查询返回前到达的广播不会被查询结果盖掉', async () => {
    const port = new FakeMcpAdminPort()
    let resolveActivity: ((payload: { running: boolean }) => void) | undefined
    port.pendingActivity = new Promise((resolve) => { resolveActivity = resolve })
    const sync = createMcpActivitySync(port)

    port.emitActivity({ running: true })
    expect(sync.running.value).toBe(true)
    resolveActivity?.({ running: false })
    await Promise.resolve()

    expect(sync.running.value).toBe(true)
    sync.dispose()
  })

  it('初始查询在没有广播时决定指示灯初值', async () => {
    const port = new FakeMcpAdminPort()
    port.activity = { running: true }
    const sync = createMcpActivitySync(port)

    await Promise.resolve()

    expect(sync.running.value).toBe(true)
    sync.dispose()
  })

  it('MCP 未启用导致初始查询失败时指示灯保持空闲', async () => {
    const port = new FakeMcpAdminPort()
    port.rejectNext('getMcpActivity', new Error('未注册该 RPC'))
    const sync = createMcpActivitySync(port)

    await Promise.resolve()
    await Promise.resolve()

    expect(sync.running.value).toBe(false)
    sync.dispose()
  })
})
