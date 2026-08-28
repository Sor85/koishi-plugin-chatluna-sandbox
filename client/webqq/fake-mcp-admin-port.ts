import type {
  SandboxMcpCapabilityCatalog,
  SandboxMcpCreatedCredential,
  SandboxMcpPublicCredential,
  SandboxMcpScope,
} from '../../src/mcp/types'
import { FakePortRecorder } from './fake-port-recorder'
import type { McpActivityListener, McpActivityPayload, McpAdminPort, McpAdminPortOperation } from './mcp-admin-port'

const emptyCapabilityCatalog: SandboxMcpCapabilityCatalog = {
  serverCapabilities: { tools: false, resources: false, prompts: false },
  scopes: [],
  tools: [],
  resources: [],
}

/**
 * 内存 MCP 管理端口。凭证集合真的会被增删改，因此「改完必须重新列举」这类接线
 * 可以被断言；活动广播可由 emitActivity 手动触发。
 */
export class FakeMcpAdminPort implements McpAdminPort {
  credentials: SandboxMcpPublicCredential[] = []
  capabilities: SandboxMcpCapabilityCatalog = emptyCapabilityCatalog
  activity: McpActivityPayload = { running: false }
  /** 未决的初始查询：留空表示立即兑现，赋值后由测试自行 resolve。 */
  pendingActivity?: Promise<McpActivityPayload>
  private readonly recorder = new FakePortRecorder<McpAdminPortOperation>()
  private readonly listeners = new Set<McpActivityListener>()
  private createdCount = 0

  get calls() {
    return this.recorder.calls
  }

  rejectNext(operation: McpAdminPortOperation, error: unknown) {
    this.recorder.rejectNext(operation, error)
  }

  emitActivity(payload: McpActivityPayload) {
    for (const listener of this.listeners) listener(payload)
  }

  private invoke<T>(operation: McpAdminPortOperation, input: unknown, result: () => T | Promise<T>): Promise<T> {
    return this.recorder.invokeDeferred(operation, input, result)
  }

  private find(id: string): SandboxMcpPublicCredential {
    const credential = this.credentials.find((item) => item.id === id)
    if (!credential) throw new Error(`凭证不存在：${id}`)
    return credential
  }

  private replace(next: SandboxMcpPublicCredential) {
    this.credentials = this.credentials.map((item) => item.id === next.id ? next : item)
  }

  listMcpCredentials() {
    return this.invoke('listMcpCredentials', undefined, () => this.credentials)
  }

  createMcpCredential(input: { name: string; scopes: SandboxMcpScope[] }) {
    return this.invoke('createMcpCredential', input, () => {
      this.createdCount += 1
      const created: SandboxMcpCreatedCredential = {
        id: `credential-${this.createdCount}`,
        name: input.name,
        scopes: [...input.scopes],
        enabled: true,
        createdAt: '2026-08-28T00:00:00.000Z',
        token: `token-${this.createdCount}`,
      }
      this.credentials = [...this.credentials, { ...created }]
      return created
    })
  }

  updateMcpCredential(input: { id: string; name?: string; scopes?: SandboxMcpScope[] }) {
    return this.invoke('updateMcpCredential', input, () => {
      const next: SandboxMcpPublicCredential = {
        ...this.find(input.id),
        ...input.name === undefined ? {} : { name: input.name },
        ...input.scopes === undefined ? {} : { scopes: [...input.scopes] },
      }
      this.replace(next)
      return next
    })
  }

  rotateMcpCredentialToken(input: { id: string }) {
    return this.invoke('rotateMcpCredentialToken', input, () => {
      this.createdCount += 1
      const rotated: SandboxMcpCreatedCredential = { ...this.find(input.id), token: `token-${this.createdCount}` }
      this.replace({ ...rotated })
      return rotated
    })
  }

  setMcpCredentialEnabled(input: { id: string; enabled: boolean }) {
    return this.invoke('setMcpCredentialEnabled', input, () => {
      this.replace({ ...this.find(input.id), enabled: input.enabled })
    })
  }

  revokeMcpCredential(input: { id: string }) {
    return this.invoke('revokeMcpCredential', input, () => {
      this.credentials = this.credentials.filter((item) => item.id !== input.id)
    })
  }

  getMcpCapabilities() {
    return this.invoke('getMcpCapabilities', undefined, () => this.capabilities)
  }

  getMcpActivity() {
    return this.invoke('getMcpActivity', undefined, () => this.pendingActivity ?? this.activity)
  }

  subscribeMcpActivity(listener: McpActivityListener) {
    void this.invoke('subscribeMcpActivity', undefined, () => undefined)
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
}
