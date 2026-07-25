import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from 'node:http'
import { createServer as createHttpsServer } from 'node:https'
import { BlockList, isIP } from 'node:net'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import * as z from 'zod'
import type { Context } from 'koishi'
import { SandboxMcpError } from './types'
import { SandboxMcpService, TOOL_DEFINITIONS } from './service'

export interface SandboxMcpServerConfig {
  enabled: boolean
  host: string
  port: number
  path: string
  allowedSources: string[]
  allowedOrigins: string[]
  allowInsecureRemote: boolean
  tlsCertPath?: string
  tlsKeyPath?: string
  readPerMinute: number
  mutationPerMinute: number
  waitPerMinute: number
  uploadPerMinute: number
  maxConcurrentMutations: number
  maxConcurrentWaits: number
  maxConcurrentUploads: number
}

function isLoopback(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1'
}

function normalizeAddress(address?: string): string {
  if (!address) return ''
  return address.startsWith('::ffff:') ? address.slice(7) : address
}

function ipv4ToNumber(address: string): number {
  return address.split('.').reduce((value, part) => (value << 8) + Number(part), 0) >>> 0
}

function sourceMatches(address: string, rule: string): boolean {
  const [network, prefixText] = rule.split('/')
  if (!prefixText) return address === network
  const family = isIP(network)
  if (!family || isIP(address) !== family) return false
  const prefix = Number(prefixText)
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > (family === 4 ? 32 : 128)) return false
  if (family === 6) {
    const blockList = new BlockList()
    blockList.addSubnet(network, prefix, 'ipv6')
    return blockList.check(address, 'ipv6')
  }
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
  return (ipv4ToNumber(address) & mask) === (ipv4ToNumber(network) & mask)
}

function jsonContent(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value) }], structuredContent: value as Record<string, unknown> }
}

export class SandboxMcpHttpServer {
  private server?: HttpServer

  constructor(private ctx: Context, private service: SandboxMcpService, private config: SandboxMcpServerConfig) {}

  async start(): Promise<void> {
    if (!this.config.enabled || this.server) return
    if (!isLoopback(this.config.host) && !this.config.allowInsecureRemote && (!this.config.tlsCertPath || !this.config.tlsKeyPath)) {
      throw new Error('非回环 MCP 监听必须配置 TLS，或显式启用不安全远程监听')
    }
    if (!isLoopback(this.config.host) && this.config.allowInsecureRemote) {
      this.ctx.logger('onebot-sandbox').warn('MCP 正在非回环地址上使用明文 HTTP；Bearer Token 可能被窃取。')
    }
    const listener = (request: IncomingMessage, response: ServerResponse) => void this.handleRequest(request, response)
    this.server = this.config.tlsCertPath && this.config.tlsKeyPath
      ? createHttpsServer({ cert: readFileSync(this.config.tlsCertPath), key: readFileSync(this.config.tlsKeyPath) }, listener)
      : createServer(listener)
    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject)
      this.server!.listen(this.config.port, this.config.host, () => {
        this.server!.off('error', reject)
        resolve()
      })
    })
  }

  async stop(): Promise<void> {
    if (!this.server) return
    const server = this.server
    this.server = undefined
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }

  getAddress(): { address: string; port: number } | undefined {
    const address = this.server?.address()
    return address && typeof address !== 'string' ? { address: address.address, port: address.port } : undefined
  }

  private async handleRequest(request: import('node:http').IncomingMessage, response: import('node:http').ServerResponse) {
    if (new URL(request.url ?? '/', 'http://localhost').pathname !== this.config.path) return this.writeJson(response, 404, { error: 'not_found' })
    if (request.method !== 'POST') return this.writeJson(response, 405, { error: 'method_not_allowed' })
    const sourceIp = normalizeAddress(request.socket.remoteAddress)
    if (this.config.allowedSources.length && !this.config.allowedSources.some((rule) => sourceMatches(sourceIp, rule))) return this.writeJson(response, 403, { error: 'source_forbidden' })
    const origin = request.headers.origin
    if (origin && !this.config.allowedOrigins.includes(origin)) return this.writeJson(response, 403, { error: 'origin_forbidden' })
    const authorization = request.headers.authorization ?? ''
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
    if (!this.service.authenticate(token)) return this.writeJson(response, 401, { error: 'unauthorized' })

    const mcp = this.createMcpServer(token, sourceIp)
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
    try {
      await mcp.connect(transport)
      await transport.handleRequest(request, response)
    } catch (error) {
      this.ctx.logger('onebot-sandbox').error('MCP 请求处理失败', error)
      if (!response.headersSent) this.writeJson(response, 500, { jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null })
    } finally {
      await transport.close().catch(() => undefined)
      await mcp.close().catch(() => undefined)
    }
  }

  private createMcpServer(token: string, sourceIp: string): McpServer {
    const server = new McpServer({ name: 'koishi-plugin-onebot-sandbox', version: '0.0.1' })
    for (const tool of this.service.listTools(token)) {
      server.registerTool(tool.name, {
        description: tool.description,
        inputSchema: z.record(z.string(), z.unknown()).default({}),
      }, async (args) => {
        try {
          return jsonContent(await this.service.callTool(token, tool.name, args, { sourceIp }))
        } catch (error) {
          const normalized = error instanceof SandboxMcpError ? error : new SandboxMcpError('internal_error', '工具调用失败')
          return { ...jsonContent({ code: normalized.code, message: normalized.message, retryable: normalized.retryable, recovery: normalized.recovery, details: normalized.details, retryAfterMs: normalized.retryAfterMs, revision: this.service.getRevision(), traceId: randomUUID() }), isError: true }
        }
      })
    }
    for (const resource of this.service.listResources(token)) {
      server.registerResource(resource.name, resource.uri, { mimeType: 'application/json' }, async () => ({ contents: [{ uri: resource.uri, mimeType: 'application/json', text: JSON.stringify(this.service.readResource(token, resource.uri)) }] }))
    }
    return server
  }

  private writeJson(response: import('node:http').ServerResponse, status: number, body: unknown) {
    response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
    response.end(JSON.stringify(body))
  }
}

export { isLoopback, sourceMatches }
