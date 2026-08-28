import { send } from '@koishijs/client'
import type { TestSpacePort } from './test-space-port'

export function createKoishiTestSpacePort(): TestSpacePort {
  return {
    listTestSpaces: () => send('chatluna-sandbox/test-spaces'),
    // Koishi Console 会把省略的 send 参数序列化为 null；服务端需要收到普通对象才能读默认名称。
    createTestSpace: (input = {}) => send('chatluna-sandbox/create-test-space', input),
    takeOverTestSpace: (input) => send('chatluna-sandbox/take-over-test-space', input),
    returnTestSpace: (input) => send('chatluna-sandbox/return-test-space', input),
    terminateTestSpace: (input) => send('chatluna-sandbox/terminate-test-space', input),
    reactivateTestSpace: (input) => send('chatluna-sandbox/reactivate-test-space', input),
    deleteTestSpace: (input) => send('chatluna-sandbox/delete-test-space', input),
  }
}
