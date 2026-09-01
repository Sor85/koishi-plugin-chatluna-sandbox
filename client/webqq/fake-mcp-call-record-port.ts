import type { ListSandboxMcpCallRecordsInput, SandboxMcpCallRecordsPage } from '../../src/mcp/call-records'
import type { SandboxMcpCallRecord } from '../../src/mcp/types'
import { FakePortRecorder } from './fake-port-recorder'
import type { McpCallRecordPort, McpCallRecordPortOperation } from './mcp-call-record-port'

/** 内存测试调用记录端口。详情可以直接改写，也可以由列表结果按记录标识兜出来。 */
export class FakeMcpCallRecordPort implements McpCallRecordPort {
  mcpCallRecordsResult: SandboxMcpCallRecordsPage = { records: [] }
  mcpCallRecordResult?: SandboxMcpCallRecord
  clearMcpCallRecordsResult = { cleared: 0 }
  private readonly recorder = new FakePortRecorder<McpCallRecordPortOperation>()

  get calls() {
    return this.recorder.calls
  }

  rejectNext(operation: McpCallRecordPortOperation, error: unknown) {
    this.recorder.rejectNext(operation, error)
  }

  private invoke<T>(operation: McpCallRecordPortOperation, input: unknown, result: T): Promise<T> {
    return this.recorder.invoke(operation, input, result)
  }

  getMcpCallRecords(input?: ListSandboxMcpCallRecordsInput) {
    return this.invoke('getMcpCallRecords', input, this.mcpCallRecordsResult)
  }

  getMcpCallRecord(input: { recordId: string }) {
    const record = this.mcpCallRecordResult
      ?? this.mcpCallRecordsResult.records.find(({ id }) => id === input.recordId)
    if (!record) this.rejectNext('getMcpCallRecord', new Error('MCP 调用记录不存在'))
    return this.invoke('getMcpCallRecord', input, {
      ...record,
      arguments: record && 'arguments' in record ? record.arguments : {},
      result: record && 'result' in record ? record.result : undefined,
    } as SandboxMcpCallRecord)
  }

  clearMcpCallRecords() {
    return this.invoke('clearMcpCallRecords', undefined, this.clearMcpCallRecordsResult)
  }
}

export function createFakeMcpCallRecordPort() {
  return new FakeMcpCallRecordPort()
}
