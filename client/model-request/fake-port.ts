import type {
  ClearSandboxModelRequestRecordsResult,
  SandboxModelRequestDetail,
  SandboxModelRequestRecordsPage,
  SandboxModelRequestTrajectory,
} from '../../src/types'
import { FakePortRecorder } from '#client/shared/fake-port-recorder'
import type {
  ClearModelRequestRecordsQuery,
  ModelRequestRecordQuery,
  ModelRequestRecordsQuery,
  ModelRequestTrajectoryQuery,
} from './query'
import { emptyModelRequestRecordsPage } from './query'
import type { ModelRequestPort, ModelRequestPortOperation } from './port'

/** 内存模型请求记录端口。详情与轨迹可以直接改写，也可以由列表结果按记录标识兜出来。 */
export class FakeModelRequestPort implements ModelRequestPort {
  modelRequestRecordsResult: SandboxModelRequestRecordsPage = emptyModelRequestRecordsPage
  modelRequestRecordResult?: SandboxModelRequestDetail
  modelRequestTrajectoryResult?: SandboxModelRequestTrajectory
  clearModelRequestRecordsResult: ClearSandboxModelRequestRecordsResult = { cleared: 0 }
  private readonly recorder = new FakePortRecorder<ModelRequestPortOperation>()

  get calls() {
    return this.recorder.calls
  }

  rejectNext(operation: ModelRequestPortOperation, error: unknown) {
    this.recorder.rejectNext(operation, error)
  }

  private invoke<T>(operation: ModelRequestPortOperation, input: unknown, result: T): Promise<T> {
    return this.recorder.invoke(operation, input, result)
  }

  getModelRequestRecords(input: ModelRequestRecordsQuery) {
    return this.invoke('getModelRequestRecords', input, this.modelRequestRecordsResult)
  }

  getModelRequestRecord(input: ModelRequestRecordQuery) {
    const record = this.modelRequestRecordResult
      ?? this.modelRequestRecordsResult.records.find(({ id }) => id === input.recordId)
    if (!record) this.rejectNext('getModelRequestRecord', new Error('模型请求记录不存在'))
    return this.invoke('getModelRequestRecord', input, {
      ...record,
      requestBody: record && 'requestBody' in record ? record.requestBody : undefined,
    } as SandboxModelRequestDetail)
  }

  getModelRequestTrajectory(input: ModelRequestTrajectoryQuery) {
    const trajectory = this.modelRequestTrajectoryResult ?? {
      mode: input.mode,
      records: [],
      rows: [],
      promptComposition: [],
      complete: true,
    }
    return this.invoke('getModelRequestTrajectory', input, trajectory)
  }

  clearModelRequestRecords(input: ClearModelRequestRecordsQuery) {
    return this.invoke('clearModelRequestRecords', input, this.clearModelRequestRecordsResult)
  }
}

export function createFakeModelRequestPort() {
  return new FakeModelRequestPort()
}
