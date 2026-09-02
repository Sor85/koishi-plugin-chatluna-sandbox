import { send } from '@koishijs/client'
import type { TestCallRecordPort } from './port'

export function createKoishiTestCallRecordPort(): TestCallRecordPort {
  return {
    // 测试调用记录跨主环境和全部测试空间共享；筛选里的 spaceId 是记录字段，不能被当前观察空间覆盖。
    getTestCallRecords: (input = {}) => send('chatluna-sandbox/test-call-records', input),
    getTestCallRecord: (input) => send('chatluna-sandbox/test-call-record', input),
    clearTestCallRecords: () => send('chatluna-sandbox/clear-test-call-records'),
  }
}
