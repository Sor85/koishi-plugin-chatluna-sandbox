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
import type { SandboxMcpScope } from '../src/mcp/types'
import { MCP_TOOL_NAMES } from './helpers/mcp-tool-catalogue'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()))
})

/** 起一个真实监听的 MCP 传输层，并返回访问它所需的地址与凭证。 */
async function startHttpServer(
  name: string,
  scopes: SandboxMcpScope[],
  options: { allowedOrigins?: string[] } = {},
) {
  const app = new App()
  const directory = mkdtempSync(join(tmpdir(), 'chatluna-sandbox-mcp-http-'))
  const control = new SandboxControlService(app, { mediaDirectory: join(directory, 'media') })
  const service = new SandboxMcpService(control, { dataDirectory: directory })
  const credential = service.createCredential(name, scopes)
  const server = new SandboxMcpHttpServer(app, service, {
    enabled: true,
    host: '127.0.0.1',
    port: 0,
    path: '/mcp',
    allowedSources: ['127.0.0.0/8', '::1/128'],
    allowedOrigins: options.allowedOrigins ?? [],
    allowInsecureRemote: false,
  })
  await server.start()
  cleanups.push(async () => { await server.stop(); await app.stop() })
  const address = server.getAddress()
  if (!address) throw new Error('MCP 监听地址不存在')
  return { app, control, service, credential, url: new URL(`http://127.0.0.1:${address.port}/mcp`) }
}

/** 用真实 MCP 客户端连上传输层；返回的客户端由调用方负责关闭。 */
async function connectClient(url: URL, token: string, origin?: string) {
  const client = new Client({ name: 'chatluna-sandbox-test', version: '1.0' })
  await client.connect(new StreamableHTTPClientTransport(url, {
    requestInit: { headers: { authorization: `Bearer ${token}`, ...(origin ? { origin } : {}) } },
  }))
  return client
}

describe('MCP Streamable HTTP', () => {
  it('按凭证权限发现完整工具清单并拒绝不受信 Origin', async () => {
    const { credential, url } = await startHttpServer('端到端凭证', ['read', 'interact', 'manage', 'debug'], {
      allowedOrigins: ['https://allowed.example'],
    })

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

    const client = await connectClient(url, credential.token, 'https://allowed.example')
    // tools/list 不携带能力范围，因此在传输层按名字与顺序整体比对完整清单；能力范围由服务层断言覆盖。
    expect((await client.listTools()).tools.map(({ name }) => name)).toEqual(MCP_TOOL_NAMES)
    expect((await client.listResources()).resources).toHaveLength(6)
    await client.close()
  })

  it('超出能力范围的工具调用在传输层返回结构化错误信封', async () => {
    // read 让客户端能自己读场景版本与调用记录；manage 缺失使 create_test_space 在
    // callTool 的能力范围检查处被拒，从而走到传输层的错误信封分支。
    const { credential, url } = await startHttpServer('只读凭证', ['read', 'debug'])
    const client = await connectClient(url, credential.token)

    const callTool = async (name: string, args: Record<string, unknown>) => await client.callTool({ name, arguments: args }) as {
      isError?: boolean
      structuredContent?: Record<string, unknown>
      content: Array<{ type: string; text: string }>
    }
    const payload = (result: { content: Array<{ text: string }> }) => JSON.parse(result.content[0]!.text) as Record<string, unknown>

    const snapshot = payload(await callTool('get_scene_snapshot', {})) as { revision: number }
    const result = await callTool('create_test_space', { idempotencyKey: 'envelope-1' })
    expect(result.isError).toBe(true)
    const envelope = payload(result)
    expect(envelope).toMatchObject({
      code: 'permission_denied',
      message: '凭证缺少 manage 权限',
      retryable: false,
      recovery: expect.any(String),
      // revision 由 service.getRevision() 读取当前场景版本；信封无条件携带它。
      revision: snapshot.revision,
      traceId: expect.any(String),
    })
    // 重试等待时间属于凭证配额那条工作的判据，本用例只验证信封结构，不构造限流场景。
    expect(envelope).not.toHaveProperty('retryAfterMs')
    expect(result.structuredContent).toMatchObject({ code: 'permission_denied', traceId: envelope.traceId })

    // 追踪标识必须真的能把这次失败对应到沙盒侧记录，而不只是一个形状正确的字符串。
    expect(payload(await callTool('get_mcp_call_record', { recordId: envelope.traceId }))).toMatchObject({
      id: envelope.traceId,
      tool: 'create_test_space',
      status: 'error',
      errorCode: 'permission_denied',
    })
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
    })
    cleanups.push(() => app.stop())
    await expect(server.start()).rejects.toThrow('必须配置 TLS')
  })
})
