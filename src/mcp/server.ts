import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { CallToolRequestSchema, ListResourcesRequestSchema, ListToolsRequestSchema, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from 'node:http'
import { createServer as createHttpsServer } from 'node:https'
import { BlockList, isIP } from 'node:net'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { Context } from 'koishi'
import { SandboxMcpError } from './types'
import { SandboxMcpService, TOOL_DEFINITIONS } from './service'

// 只描述传输：监听地址、端口、路径、TLS、来源与 Origin 白名单、启用开关。
// 测试凭证的频率与并发配额由测试控制服务（SandboxMcpQuotaConfig）执行，不在此声明。
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
  // MCP 协议要求 structuredContent 必须是 object；数组或原始值会被 SDK 以
  // -32602 拒绝（表现为 list_* 等返回数组的工具无法调用），因此仅对普通对象附带。
  const structured = value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
  return { content: [{ type: 'text' as const, text: JSON.stringify(value) }], ...(structured ? { structuredContent: structured } : {}) }
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
      this.ctx.logger('chatluna-sandbox').warn('MCP 正在非回环地址上使用明文 HTTP；Bearer Token 可能被窃取。')
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

  // 整个请求处理都在 try 内：listener 用 `void this.handleRequest(...)` 调用，任何逃出这里的异常
  // 都会变成 unhandled rejection，同时那个 HTTP 请求永远收不到响应，一直挂到客户端超时——一个
  // 坏凭证条目就能让端点对所有客户端表现为挂起。因此路径判定、来源校验、凭证校验、MCP 服务器与
  // transport 的构造全部纳入 try，transport 与 mcp 在 finally 里按需关闭。
  private async handleRequest(request: import('node:http').IncomingMessage, response: import('node:http').ServerResponse) {
    let transport: StreamableHTTPServerTransport | undefined
    let mcp: Server | undefined
    try {
      if (new URL(request.url ?? '/', 'http://localhost').pathname !== this.config.path) return this.writeJson(response, 404, { error: 'not_found' })
      if (request.method !== 'POST') return this.writeJson(response, 405, { error: 'method_not_allowed' })
      const sourceIp = normalizeAddress(request.socket.remoteAddress)
      if (this.config.allowedSources.length && !this.config.allowedSources.some((rule) => sourceMatches(sourceIp, rule))) return this.writeJson(response, 403, { error: 'source_forbidden' })
      const origin = request.headers.origin
      if (origin && !this.config.allowedOrigins.includes(origin)) return this.writeJson(response, 403, { error: 'origin_forbidden' })
      const authorization = request.headers.authorization ?? ''
      const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
      if (!this.service.authenticate(token)) return this.writeJson(response, 401, { error: 'unauthorized' })

      mcp = this.createMcpServer(token, sourceIp)
      transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
      await mcp.connect(transport)
      // 不再等待响应写入完成：SDK 1.29.0 的 handleRequest 把请求整体委托给
      // @hono/node-server 的 getRequestListener 并 await 它，返回时响应已经写完。
      // 旧版会提前返回，那时必须额外等待 finish/close，否则客户端只能收到无正文的 200。
      await transport.handleRequest(request, response)
    } catch (error) {
      this.ctx.logger('chatluna-sandbox').error('MCP 请求处理失败', error)
      if (!response.headersSent) this.writeJson(response, 500, { jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null })
      // 响应头已经发出时无法再改状态码，但必须收尾：不结束响应等于让请求挂到客户端超时。
      else if (!response.writableEnded) response.end()
    } finally {
      if (transport) await transport.close().catch(() => undefined)
      if (mcp) await mcp.close().catch(() => undefined)
    }
  }

  // 使用低层 Server 而非 McpServer.registerTool：后者要求 zod schema 才能生成
  // tools/list 的 inputSchema（通配 record 会序列化为空 properties，客户端将无从
  // 得知参数契约）。参数校验本就在 service.executeTool 内完成，这里只需把
  // TOOL_DEFINITIONS 携带的 JSON Schema 原样暴露。
  private createMcpServer(token: string, sourceIp: string): Server {
    const server = new Server({ name: 'koishi-plugin-chatluna-sandbox', version: '0.0.1' }, { capabilities: { tools: {}, resources: {} } })
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.service.listTools(token).map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
    }))
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        return jsonContent(await this.service.callTool(token, request.params.name, request.params.arguments ?? {}, { sourceIp }))
      } catch (error) {
        // 工具错误的归一化发生在 service.callTool 里：它把领域拒绝与未预期异常都收敛成
        // SandboxMcpError 再抛出，因此这里几乎总是走 instanceof 分支。else 分支留着不是冗余——
        // jsonContent 的 JSON.stringify 也在本 try 内，序列化失败会抛非 SandboxMcpError 的异常。
        const normalized = error instanceof SandboxMcpError ? error : new SandboxMcpError('internal_error', '工具结果序列化失败')
        if (!(error instanceof SandboxMcpError)) this.ctx.logger('chatluna-sandbox').error(`MCP 工具 ${request.params.name} 的结果无法序列化。`, error)
        // traceId 用失败调用写下的测试调用记录 ID，消费者可据此调 get_mcp_call_record 取回该次失败；
        // revision 同样由 callTool 回填成失败真正发生的那个空间的版本。凭证校验阶段抛出的错误既没有
        // 记录可指，也没有空间可指，只能退回随机标识与主场景版本。
        return { ...jsonContent({ code: normalized.code, message: normalized.message, retryable: normalized.retryable, recovery: normalized.recovery, details: normalized.details, retryAfterMs: normalized.retryAfterMs, revision: normalized.revision ?? this.service.getRevision(), traceId: normalized.traceId ?? randomUUID() }), isError: true }
      }
    })
    server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: this.service.listResources(token).map(({ uri, name, mimeType }) => ({ uri, name, mimeType })),
    }))
    server.setRequestHandler(ReadResourceRequestSchema, async (request) => ({
      contents: [{ uri: request.params.uri, mimeType: 'application/json', text: JSON.stringify(this.service.readResource(token, request.params.uri)) }],
    }))
    return server
  }

  private writeJson(response: import('node:http').ServerResponse, status: number, body: unknown) {
    response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
    response.end(JSON.stringify(body))
  }
}

export { isLoopback, sourceMatches }
