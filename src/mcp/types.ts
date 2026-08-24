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
