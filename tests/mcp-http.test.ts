import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { App } from '@koishijs/core'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SandboxControlService } from '../src/control-service'
import { SandboxMcpHttpServer, sourceMatches } from '../src/mcp/server'
import { SandboxMcpService } from '../src/mcp/service'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()))
})

describe('MCP Streamable HTTP', () => {
  it('按凭证权限发现 39 个工具并拒绝不受信 Origin', async () => {
    const app = new App()
    const directory = mkdtempSync(join(tmpdir(), 'chatluna-sandbox-mcp-http-'))
    const control = new SandboxControlService(app, { mediaDirectory: join(directory, 'media') })
    const service = new SandboxMcpService(control, { dataDirectory: directory })
    const credential = service.createCredential('端到端凭证', ['read', 'interact', 'manage', 'debug'])
    const server = new SandboxMcpHttpServer(app, service, {
      enabled: true,
      host: '127.0.0.1',
      port: 0,
      path: '/mcp',
      allowedSources: ['127.0.0.0/8', '::1/128'],
      allowedOrigins: ['https://allowed.example'],
      allowInsecureRemote: false,
      readPerMinute: 120,
      mutationPerMinute: 60,
      waitPerMinute: 120,
      uploadPerMinute: 30,
      maxConcurrentMutations: 4,
      maxConcurrentWaits: 8,
      maxConcurrentUploads: 2,
    })
    await server.start()
    cleanups.push(async () => { await server.stop(); await app.stop() })
    const address = server.getAddress()
    if (!address) throw new Error('MCP 监听地址不存在')
    const url = new URL(`http://127.0.0.1:${address.port}/mcp`)

    const forbidden = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${credential.token}`, origin: 'https://forbidden.example', 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } } }),
    })
    expect(forbidden.status).toBe(403)
    const unauthorized = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } } }),
    })
    expect(unauthorized.status).toBe(401)

    const client = new Client({ name: 'chatluna-sandbox-test', version: '1.0' })
    const transport = new StreamableHTTPClientTransport(url, {
      requestInit: { headers: { authorization: `Bearer ${credential.token}`, origin: 'https://allowed.example' } },
    })
    await client.connect(transport)
    expect((await client.listTools()).tools).toHaveLength(39)
    expect((await client.listResources()).resources).toHaveLength(6)
    await client.close()
  })

  it('同时匹配 IPv4 与 IPv6 CIDR', () => {
    expect(sourceMatches('127.0.0.1', '127.0.0.0/8')).toBe(true)
    expect(sourceMatches('::1', '::1/128')).toBe(true)
    expect(sourceMatches('10.0.0.1', '127.0.0.0/8')).toBe(false)
  })

  it('等待旧版 SDK 异步写完 initialize 响应后再关闭 transport', async () => {
    const original = StreamableHTTPServerTransport.prototype.handleRequest
    vi.spyOn(StreamableHTTPServerTransport.prototype, 'handleRequest').mockImplementation(function (this: StreamableHTTPServerTransport, ...args) {
      setTimeout(() => void original.apply(this, args), 0)
      return Promise.resolve()
    })

    const app = new App()
    const directory = mkdtempSync(join(tmpdir(), 'chatluna-sandbox-mcp-legacy-'))
    const control = new SandboxControlService(app, { mediaDirectory: join(directory, 'media') })
    const service = new SandboxMcpService(control, { dataDirectory: directory })
    const credential = service.createCredential('旧版 SDK 凭证', ['read'])
    const server = new SandboxMcpHttpServer(app, service, {
      enabled: true, host: '127.0.0.1', port: 0, path: '/mcp', allowedSources: ['127.0.0.1'], allowedOrigins: [], allowInsecureRemote: false,
      readPerMinute: 120, mutationPerMinute: 60, waitPerMinute: 120, uploadPerMinute: 30,
      maxConcurrentMutations: 4, maxConcurrentWaits: 8, maxConcurrentUploads: 2,
    })
    await server.start()
    cleanups.push(async () => { await server.stop(); await app.stop() })
    const address = server.getAddress()
    if (!address) throw new Error('MCP 监听地址不存在')

    const response = await fetch(`http://127.0.0.1:${address.port}/mcp`, {
      method: 'POST',
      headers: { authorization: `Bearer ${credential.token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'legacy-test', version: '1' } } }),
    })

    expect(response.headers.get('content-type')).toContain('application/json')
    expect(await response.json()).toMatchObject({ result: { serverInfo: { name: 'koishi-plugin-chatluna-sandbox' } } })
  })

  it('非回环监听缺少 TLS 时拒绝启动', async () => {
    const app = new App()
    const directory = mkdtempSync(join(tmpdir(), 'chatluna-sandbox-mcp-tls-'))
    const control = new SandboxControlService(app, { mediaDirectory: join(directory, 'media') })
    const service = new SandboxMcpService(control, { dataDirectory: directory })
    const server = new SandboxMcpHttpServer(app, service, {
      enabled: true, host: '0.0.0.0', port: 0, path: '/mcp', allowedSources: [], allowedOrigins: [], allowInsecureRemote: false,
      readPerMinute: 120, mutationPerMinute: 60, waitPerMinute: 120, uploadPerMinute: 30,
      maxConcurrentMutations: 4, maxConcurrentWaits: 8, maxConcurrentUploads: 2,
    })
    cleanups.push(() => app.stop())
    await expect(server.start()).rejects.toThrow('必须配置 TLS')
  })
})
