import type { SandboxMcpActivityPayload } from '../../src/console-contract'
import type {
  SandboxMcpCapabilityCatalog,
  SandboxMcpCreatedCredential,
  SandboxMcpPublicCredential,
  SandboxMcpScope,
} from '../../src/mcp/types'

/** 活动广播的载荷只在 Console 契约里定义一次，这里只是本端口的别名。 */
export type McpActivityPayload = SandboxMcpActivityPayload

export type McpActivityListener = (payload: McpActivityPayload) => void

/**
 * MCP 管理面的客户端 seam：凭证、能力目录与服务器活动。这三者都不经过模拟 QQ 环境的
 * 场景状态，因此不进工作区端口。
 */
export interface McpAdminPort {
  listMcpCredentials(): Promise<SandboxMcpPublicCredential[]>
  createMcpCredential(input: { name: string; scopes: SandboxMcpScope[] }): Promise<SandboxMcpCreatedCredential>
  updateMcpCredential(input: { id: string; name?: string; scopes?: SandboxMcpScope[] }): Promise<SandboxMcpPublicCredential>
  rotateMcpCredentialToken(input: { id: string }): Promise<SandboxMcpCreatedCredential>
  setMcpCredentialEnabled(input: { id: string; enabled: boolean }): Promise<void>
  revokeMcpCredential(input: { id: string }): Promise<void>
  getMcpCapabilities(): Promise<SandboxMcpCapabilityCatalog>
  getMcpActivity(): Promise<McpActivityPayload>
  /**
   * 订阅服务端活动广播，返回退订函数。适配器负责把一份底层广播扇出给全部订阅者，
   * 因此一个页面退订不会让仍存活的页面失聪。
   */
  subscribeMcpActivity(listener: McpActivityListener): () => void
}

export type McpAdminPortOperation = keyof McpAdminPort
