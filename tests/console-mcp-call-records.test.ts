import { App } from '@koishijs/core'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { registerConsole, type SandboxConsoleRegistrar } from '../src/console'
import { SandboxControlService, SandboxRuntimeBotRegistry } from '../src/control-service'
import { SandboxMcpService } from '../src/mcp/service'
import { SandboxTestSpaceService } from '../src/test-spaces'
import type { SandboxAppearance } from '../src/types'
import { MCP_TOOL_CATALOGUE, toMcpToolCatalogue } from './helpers/mcp-tool-catalogue'

const appearance: SandboxAppearance = {
  enableSandboxFrostedGlass: true,
  sandboxTimBubbleTail: true,
  sandboxColorMode: 'auto',
  sandboxAccentColor: '#2563eb',
  sandboxMarkRecalledMessages: true,
}

const runningApps: App[] = []

afterEach(async () => {
  await Promise.all(runningApps.splice(0).map((app) => app.stop()))
})

describe('MCP 调用记录 Console 协议', () => {
  it('只暴露筛选查询、详情和清理，不提供记录重放入口', async () => {
    const app = new App()
    runningApps.push(app)
    const directory = mkdtempSync(join(tmpdir(), 'chatluna-sandbox-console-mcp-'))
    const control = new SandboxControlService(app, { mediaDirectory: join(directory, 'media') })
    const mcp = new SandboxMcpService(control, { dataDirectory: directory })
    const credential = mcp.createCredential('控制台凭证', ['read'])
    await mcp.callTool(credential.token, 'get_server_info', {}, { sourceIp: '127.0.0.1' })

    const listeners = new Map<string, unknown>()
    const consoleRegistrar: SandboxConsoleRegistrar = {
      addEntry() {},
      addListener(event, callback) {
        listeners.set(event, callback)
      },
      broadcast() {},
    }
    registerConsole(consoleRegistrar, control, appearance, mcp)

    const listRecords = listeners.get('chatluna-sandbox/mcp-call-records')
    const getCapabilities = listeners.get('chatluna-sandbox/mcp-capabilities')
    const getRecord = listeners.get('chatluna-sandbox/mcp-call-record')
    const clearRecords = listeners.get('chatluna-sandbox/clear-mcp-call-records')
    expect(listRecords).toBeTypeOf('function')
    expect(getCapabilities).toBeTypeOf('function')
    expect(getRecord).toBeTypeOf('function')
    expect(clearRecords).toBeTypeOf('function')
    expect(listeners.has('chatluna-sandbox/replay-mcp-call-record')).toBe(false)
    if (typeof listRecords !== 'function' || typeof getCapabilities !== 'function' || typeof getRecord !== 'function' || typeof clearRecords !== 'function') {
      throw new Error('MCP Console 监听器未注册')
    }

    const catalog = Reflect.apply(getCapabilities, undefined, []) as { tools: Array<{ name: string; scope: string }>; resources: unknown[] }
    expect(toMcpToolCatalogue(catalog.tools)).toEqual(MCP_TOOL_CATALOGUE)
    expect(catalog.resources).toHaveLength(6)

    const page = Reflect.apply(listRecords, undefined, [{ tool: 'get_server_info' }]) as {
      records: Array<{ id: string, tool: string, arguments?: unknown }>
    }
    expect(page.records).toEqual([
      expect.objectContaining({
        tool: 'get_server_info',
        credentialName: '控制台凭证',
        sourceIp: '127.0.0.1',
        status: 'success',
      }),
    ])
    expect(page.records[0]).not.toHaveProperty('arguments')

    expect(await Reflect.apply(getRecord, undefined, [{ recordId: page.records[0]!.id }])).toMatchObject({
      id: page.records[0]!.id,
      tool: 'get_server_info',
      arguments: {},
      result: expect.objectContaining({ name: 'chatluna-sandbox' }),
    })
    const cleared = Reflect.apply(clearRecords, undefined, []) as { cleared: number }
    expect(cleared.cleared).toBeGreaterThanOrEqual(1)
    expect(Reflect.apply(listRecords, undefined, [{}])).toMatchObject({ records: [] })
  })

  it('MCP 未初始化时不注册调用记录 RPC', () => {
    const listeners = new Map<string, unknown>()
    const consoleRegistrar: SandboxConsoleRegistrar = {
      addEntry() {},
      addListener(event, callback) {
        listeners.set(event, callback)
      },
      broadcast() {},
    }
    const app = new App()
    runningApps.push(app)
    const control = new SandboxControlService(app)
    registerConsole(consoleRegistrar, control, appearance)

    expect(listeners.has('chatluna-sandbox/mcp-call-records')).toBe(false)
    expect(listeners.has('chatluna-sandbox/mcp-call-record')).toBe(false)
    expect(listeners.has('chatluna-sandbox/clear-mcp-call-records')).toBe(false)
    expect(listeners.has('chatluna-sandbox/mcp-activity')).toBe(false)
    expect(listeners.has('chatluna-sandbox/mcp-capabilities')).toBe(false)
  })

  it('广播 MCP 活动状态并提供当前值查询', async () => {
    const app = new App()
    runningApps.push(app)
    const directory = mkdtempSync(join(tmpdir(), 'chatluna-sandbox-console-mcp-activity-'))
    const runtimeBots = new SandboxRuntimeBotRegistry()
    const control = new SandboxControlService(app, { mediaDirectory: join(directory, 'media'), runtimeBots })
    const testSpaces = new SandboxTestSpaceService(app, runtimeBots)
    const mcp = new SandboxMcpService(control, { dataDirectory: directory, testSpaces })
    const credential = mcp.createCredential('控制台凭证', ['read', 'manage'])
    const broadcasts: Array<{ type: string, body: unknown }> = []
    const listeners = new Map<string, unknown>()
    const consoleRegistrar: SandboxConsoleRegistrar = {
      addEntry() {},
      addListener(event, callback) {
        listeners.set(event, callback)
      },
      broadcast(type, body) {
        broadcasts.push({ type, body })
      },
    }
    registerConsole(consoleRegistrar, control, appearance, mcp, testSpaces)

    const getActivity = listeners.get('chatluna-sandbox/mcp-activity')
    expect(getActivity).toBeTypeOf('function')
    if (typeof getActivity !== 'function') throw new Error('MCP 活动监听器未注册')
    expect(Reflect.apply(getActivity, undefined, [])).toEqual({ running: false })

    const created = await mcp.callTool(credential.token, 'create_test_space', {
      idempotencyKey: 'console-activity-1',
    }) as { spaceId: string }
    expect(broadcasts).toContainEqual({ type: 'chatluna-sandbox/mcp-activity', body: { running: true } })
    expect(Reflect.apply(getActivity, undefined, [])).toEqual({ running: true })

    testSpaces.takeOver(created.spaceId)
    expect(broadcasts).toContainEqual({ type: 'chatluna-sandbox/mcp-activity', body: { running: false } })
    expect(Reflect.apply(getActivity, undefined, [])).toEqual({ running: false })
  })
})
