import type { ListSandboxTestCallRecordsInput, SandboxTestCallRecordsPage } from '../../src/mcp/call-records'
import type { SandboxTestCallRecord } from '../../src/mcp/types'
import { FakePortRecorder } from '#client/shared/fake-port-recorder'
import type { TestCallRecordPort, TestCallRecordPortOperation } from './port'

/** 内存测试调用记录端口。详情可以直接改写，也可以由列表结果按记录标识兜出来。 */
export class FakeTestCallRecordPort implements TestCallRecordPort {
  testCallRecordsResult: SandboxTestCallRecordsPage = { records: [] }
  testCallRecordResult?: SandboxTestCallRecord
  clearTestCallRecordsResult = { cleared: 0 }
  private readonly recorder = new FakePortRecorder<TestCallRecordPortOperation>()

  get calls() {
    return this.recorder.calls
  }

  rejectNext(operation: TestCallRecordPortOperation, error: unknown) {
    this.recorder.rejectNext(operation, error)
  }

  private invoke<T>(operation: TestCallRecordPortOperation, input: unknown, result: T): Promise<T> {
    return this.recorder.invoke(operation, input, result)
  }

  getTestCallRecords(input?: ListSandboxTestCallRecordsInput) {
    return this.invoke('getTestCallRecords', input, this.testCallRecordsResult)
  }

  getTestCallRecord(input: { recordId: string }) {
    const record = this.testCallRecordResult
      ?? this.testCallRecordsResult.records.find(({ id }) => id === input.recordId)
    if (!record) this.rejectNext('getTestCallRecord', new Error('测试调用记录不存在'))
    return this.invoke('getTestCallRecord', input, {
      ...record,
      arguments: record && 'arguments' in record ? record.arguments : {},
      result: record && 'result' in record ? record.result : undefined,
    } as SandboxTestCallRecord)
  }

  clearTestCallRecords() {
    return this.invoke('clearTestCallRecords', undefined, this.clearTestCallRecordsResult)
  }
}

export function createFakeTestCallRecordPort() {
  return new FakeTestCallRecordPort()
}
