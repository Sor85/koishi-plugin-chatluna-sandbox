import type { SandboxSnapshot } from '../types'

export type SandboxMcpScope = 'read' | 'interact' | 'manage' | 'debug'

export interface SandboxMcpToolCapability {
  name: string
  scope: SandboxMcpScope
  description: string
  inputSchema: Record<string, unknown>
}

export interface SandboxMcpResourceCapability {
  uri: string
  name: string
  mimeType: string
  requiredScopes: SandboxMcpScope[]
}

export interface SandboxMcpCapabilityCatalog {
  serverCapabilities: {
    tools: boolean
    resources: boolean
    prompts: boolean
  }
  scopes: SandboxMcpScope[]
  tools: SandboxMcpToolCapability[]
  resources: SandboxMcpResourceCapability[]
}

export interface SandboxMcpCredential {
  id: string
  name: string
  scopes: SandboxMcpScope[]
  enabled: boolean
  token?: string
  tokenDigest: string
  createdAt: string
}

export type SandboxMcpPublicCredential = Omit<SandboxMcpCredential, 'tokenDigest'>

export interface SandboxMcpCreatedCredential extends SandboxMcpPublicCredential {
  token: string
}

export interface SandboxMcpEventCursor {
  epoch: string
  sequence: number
}

export interface SandboxMcpEvent {
  cursor: SandboxMcpEventCursor
  spaceId?: string
  type: string
  createdAt: string
  data: unknown
}

export interface SandboxMcpCallRecordError {
  code: string
  message: string
  retryable: boolean
  recovery: string
  details?: unknown
  retryAfterMs?: number
}

export interface SandboxMcpCallRecordListItem {
  id: string
  createdAt: string
  credentialName: string
  sourceIp?: string
  tool: string
  testRunId?: string
  spaceId?: string
  durationMs: number
  status: 'success' | 'error'
  affected: readonly string[]
  errorCode?: string
}

export interface SandboxMcpCallRecord extends SandboxMcpCallRecordListItem {
  arguments: unknown
  result?: unknown
  error?: SandboxMcpCallRecordError
}

export interface SandboxMcpExport {
  testApiVersion: 1
  exportedAt: string
  scene: SandboxSnapshot
}

export class SandboxMcpError extends Error {
  /**
   * 失败调用对应的测试调用记录 ID。由 `callTool` 在写入记录后回填，传输层错误信封原样携带，
   * 因此消费者可以拿信封里的 traceId 直接调 `get_mcp_call_record` 取回这次失败的记录。
   * 凭证校验阶段（尚无记录可写）抛出的错误没有该字段。
   */
  traceId?: string

  /**
   * 失败真正发生的那个场景的版本。与 traceId 同一模式：由 `callTool` 回填，传输层错误信封原样
   * 携带。传输层不能自己从 `arguments.spaceId` 解析——`resolveControl` 的空间三态判定（接管、
   * 不存在、不可用）在那里复现不了。凭证校验阶段（尚无空间可指）抛出的错误没有该字段，信封退回
   * 主场景版本。
   */
  revision?: number

  constructor(
    public code: string,
    message: string,
    public retryable = false,
    public recovery = '请检查调用参数后重试。',
    public details?: unknown,
    public retryAfterMs?: number,
  ) {
    super(message)
  }
}
