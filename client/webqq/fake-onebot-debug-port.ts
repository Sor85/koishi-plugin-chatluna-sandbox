import type {
  ClearSandboxOneBotDebugRecordsResult,
  GetSandboxOneBotDebugRecordInput,
  GetSandboxOneBotDebugRecordsInput,
  SandboxConsoleOneBotDebugRecord,
  SandboxOneBotDebugRecordsPage,
} from '../../src/types'
import { FakePortRecorder } from './fake-port-recorder'
import type { OneBotDebugPort, OneBotDebugPortOperation } from './onebot-debug-port'

/** 内存 OneBot 调试记录端口。详情可以直接改写，也可以由列表结果按记录标识兜出来。 */
export class FakeOneBotDebugPort implements OneBotDebugPort {
  debugRecordsResult: SandboxOneBotDebugRecordsPage<SandboxConsoleOneBotDebugRecord> = {
    records: [],
    hasMore: false,
    capacity: { recordCount: 0, totalBytes: 0, maxRecords: 500, maxBytes: 50 * 1024 * 1024 },
  }
  debugRecordResult?: SandboxConsoleOneBotDebugRecord
  clearDebugRecordsResult: ClearSandboxOneBotDebugRecordsResult = { cleared: 0 }
  private readonly recorder = new FakePortRecorder<OneBotDebugPortOperation>()

  get calls() {
    return this.recorder.calls
  }

  rejectNext(operation: OneBotDebugPortOperation, error: unknown) {
    this.recorder.rejectNext(operation, error)
  }

  private invoke<T>(operation: OneBotDebugPortOperation, input: unknown, result: T): Promise<T> {
    return this.recorder.invoke(operation, input, result)
  }

  getOneBotDebugRecords(input?: GetSandboxOneBotDebugRecordsInput) {
    return this.invoke('getOneBotDebugRecords', input, this.debugRecordsResult)
  }

  getOneBotDebugRecord(input: GetSandboxOneBotDebugRecordInput & { spaceId?: string }) {
    const record = this.debugRecordResult
      ?? this.debugRecordsResult.records.find(({ id }) => id === input.recordId)
    if (!record) this.rejectNext('getOneBotDebugRecord', new Error('调试记录不存在'))
    return this.invoke('getOneBotDebugRecord', input, record as SandboxConsoleOneBotDebugRecord)
  }

  clearOneBotDebugRecords() {
    return this.invoke('clearOneBotDebugRecords', undefined, this.clearDebugRecordsResult)
  }
}

export function createFakeOneBotDebugPort() {
  return new FakeOneBotDebugPort()
}
