import type { ListSandboxMcpCallRecordsInput, SandboxMcpCallRecordsPage } from '../../src/mcp/call-records'
import type { SandboxMcpCallRecord } from '../../src/mcp/types'

/**
 * MCP 调用记录的客户端 seam。与工作区端口分开：它的输入里只有记录标识与筛选条件，
 * 没有场景概念；工作区端口的输入里也没有调用记录的概念。
 *
 * 它的适配器不注入当前观察空间：调用记录跨主环境与全部测试空间共享，筛选里的空间标识
 * 是记录字段而不是定域。
 */
export interface McpCallRecordPort {
  getMcpCallRecords(input?: ListSandboxMcpCallRecordsInput): Promise<SandboxMcpCallRecordsPage>
  getMcpCallRecord(input: { recordId: string }): Promise<SandboxMcpCallRecord>
  clearMcpCallRecords(): Promise<{ cleared: number }>
}

export type McpCallRecordPortOperation = keyof McpCallRecordPort
