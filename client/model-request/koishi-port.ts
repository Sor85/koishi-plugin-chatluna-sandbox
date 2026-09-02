import { send } from '@koishijs/client'
import type { ModelRequestPort } from './port'

export function createKoishiModelRequestPort(): ModelRequestPort {
  return {
    // 模型请求记录按分类显式传 scope/spaceId，不注入当前工作区的 spaceId：
    // 未归属分类没有 spaceId，切到其他空间时也不应被当前观察的测试空间覆盖。
    getModelRequestRecords: (input) => send('chatluna-sandbox/model-request-records', input),
    getModelRequestRecord: (input) => send('chatluna-sandbox/model-request-record', input),
    getModelRequestTrajectory: (input) => send('chatluna-sandbox/model-request-trajectory', input),
    clearModelRequestRecords: (input) => send('chatluna-sandbox/clear-model-request-records', input),
  }
}
