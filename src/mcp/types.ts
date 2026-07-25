import type { SandboxSnapshot } from '../types'

export type SandboxMcpScope = 'read' | 'interact' | 'manage' | 'debug'

export interface SandboxMcpCredential {
  id: string
  name: string
  scopes: SandboxMcpScope[]
  enabled: boolean
  tokenDigest: string
  createdAt: string
}

export interface SandboxMcpCreatedCredential extends Omit<SandboxMcpCredential, 'tokenDigest'> {
  token: string
}

export interface SandboxMcpEventCursor {
  epoch: string
  sequence: number
}

export interface SandboxMcpEvent {
  cursor: SandboxMcpEventCursor
  type: string
  createdAt: string
  data: unknown
}

export interface SandboxMcpCallRecord {
  id: string
  createdAt: string
  credentialName: string
  sourceIp?: string
  tool: string
  testRunId?: string
  durationMs: number
  status: 'success' | 'error'
  affected: string[]
  errorCode?: string
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
