import { send } from '@koishijs/client'
import { createSpaceScope } from './koishi-space-scope'
import type { OneBotDebugPort } from './onebot-debug-port'

export function createKoishiOneBotDebugPort(resolveSpaceId: () => string | undefined = () => undefined): OneBotDebugPort {
  // 与工作区端口的工厂收同一个实参，并共用同一份隐式定域实现，因此定域行为逐字相同。
  const scoped = createSpaceScope(resolveSpaceId)
  return {
    getOneBotDebugRecords: (input = {}) => send('chatluna-sandbox/debug-records', scoped(input)),
    getOneBotDebugRecord: (input) => send('chatluna-sandbox/debug-record', scoped(input)),
    clearOneBotDebugRecords: () => send('chatluna-sandbox/clear-debug-records', scoped({})),
  }
}
