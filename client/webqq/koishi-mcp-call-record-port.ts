import { send } from '@koishijs/client'
import type { McpCallRecordPort } from './mcp-call-record-port'

export function createKoishiMcpCallRecordPort(): McpCallRecordPort {
  return {
    // 测试调用记录跨主环境和全部测试空间共享；筛选里的 spaceId 是记录字段，不能被当前观察空间覆盖。
    getMcpCallRecords: (input = {}) => send('chatluna-sandbox/mcp-call-records', input),
    getMcpCallRecord: (input) => send('chatluna-sandbox/mcp-call-record', input),
    clearMcpCallRecords: () => send('chatluna-sandbox/clear-mcp-call-records'),
  }
}
