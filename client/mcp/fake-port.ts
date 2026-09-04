import type { SandboxHttpApiCapabilityCatalog } from '../../src/mcp/http-api'
import type {
  SandboxMcpCapabilityCatalog,
  SandboxTestCreatedCredential,
  SandboxTestPublicCredential,
  SandboxMcpScope,
} from '../../src/mcp/types'
import { FakePortRecorder } from '#client/shared/fake-port-recorder'
import type { McpActivityListener, McpActivityPayload, McpAdminPort, McpAdminPortOperation } from './port'

const emptyCapabilityCatalog: SandboxMcpCapabilityCatalog = {
  serverCapabilities: { tools: false, resources: false, prompts: false },
  scopes: [],
  tools: [],
  resources: [],
}

const emptyHttpApiCatalog: SandboxHttpApiCapabilityCatalog = {
  enabled: false,
  basePath: '/api',
  version: 'v1',
  baseUrl: 'http://127.0.0.1:61901',
  maxBodyBytes: 0,
  routes: [],
  errorStatuses: [],
}

/**
 * 内存测试端点管理端口。凭证集合真的会被增删改，因此「改完必须重新列举」这类接线
 * 可以被断言；活动广播可由 emitActivity 手动触发。
 */
export class FakeMcpAdminPort implements McpAdminPort {
  credentials: SandboxTestPublicCredential[] = []
  capabilities: SandboxMcpCapabilityCatalog = emptyCapabilityCatalog
  httpApiCapabilities: SandboxHttpApiCapabilityCatalog = emptyHttpApiCatalog
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

  private find(id: string): SandboxTestPublicCredential {
    const credential = this.credentials.find((item) => item.id === id)
    if (!credential) throw new Error(`凭证不存在：${id}`)
    return credential
  }

  private replace(next: SandboxTestPublicCredential) {
    this.credentials = this.credentials.map((item) => item.id === next.id ? next : item)
  }

  listTestCredentials() {
    return this.invoke('listTestCredentials', undefined, () => this.credentials)
  }

  createTestCredential(input: { name: string; scopes: SandboxMcpScope[] }) {
    return this.invoke('createTestCredential', input, () => {
      this.createdCount += 1
      const created: SandboxTestCreatedCredential = {
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

  updateTestCredential(input: { id: string; name?: string; scopes?: SandboxMcpScope[] }) {
    return this.invoke('updateTestCredential', input, () => {
      const next: SandboxTestPublicCredential = {
        ...this.find(input.id),
        ...input.name === undefined ? {} : { name: input.name },
        ...input.scopes === undefined ? {} : { scopes: [...input.scopes] },
      }
      this.replace(next)
      return next
    })
  }

  rotateTestCredentialToken(input: { id: string }) {
    return this.invoke('rotateTestCredentialToken', input, () => {
      this.createdCount += 1
      const rotated: SandboxTestCreatedCredential = { ...this.find(input.id), token: `token-${this.createdCount}` }
      this.replace({ ...rotated })
      return rotated
    })
  }

  setTestCredentialEnabled(input: { id: string; enabled: boolean }) {
    return this.invoke('setTestCredentialEnabled', input, () => {
      this.replace({ ...this.find(input.id), enabled: input.enabled })
    })
  }

  revokeTestCredential(input: { id: string }) {
    return this.invoke('revokeTestCredential', input, () => {
      this.credentials = this.credentials.filter((item) => item.id !== input.id)
    })
  }

  getMcpCapabilities() {
    return this.invoke('getMcpCapabilities', undefined, () => this.capabilities)
  }

  getHttpApiCapabilities() {
    return this.invoke('getHttpApiCapabilities', undefined, () => this.httpApiCapabilities)
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
