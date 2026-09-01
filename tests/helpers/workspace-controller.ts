import { createFakeMcpCallRecordPort } from '../../client/webqq/fake-mcp-call-record-port'
import { createFakeModelRequestPort } from '../../client/webqq/fake-model-request-port'
import { createFakeOneBotDebugPort } from '../../client/webqq/fake-onebot-debug-port'
import { createFakePresetPort } from '../../client/webqq/fake-preset-port'
import { createFakeWorkspacePort } from '../../client/webqq/fake-workspace-port'
import {
  createWorkspaceController,
  type WorkspaceControllerPorts,
} from '../../client/webqq/workspace-controller'
import type { SandboxWorkspaceState } from '../../src/types'

const emptyWorkspace: SandboxWorkspaceState = {
  snapshot: {
    revision: 0,
    participants: [],
    groups: [],
    conversations: [],
    messages: [],
    forwards: [],
    friendships: [],
    requests: [],
  },
  chatLunaStates: [],
  appearance: {
    enableSandboxFrostedGlass: true,
    sandboxTimBubbleTail: true,
    sandboxColorMode: 'auto',
    sandboxAccentColor: '#2563eb',
    sandboxMarkRecalledMessages: true,
  },
  persistence: { mode: 'memory', available: true, persisted: false },
}

interface Storage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value) },
  }
}

/**
 * 控制器构造时收若干道按能力拆开的端口。用例只传自己驱动的那几道，其余由这里补一份空假端口——
 * 「只准备自己用到的那几个方法」因此在用例里看得见，而生产代码仍然要求端口齐全。
 */
export function createTestWorkspaceController(
  ports: Partial<WorkspaceControllerPorts> = {},
  storage: Storage = memoryStorage(),
) {
  return createWorkspaceController({
    workspace: ports.workspace ?? createFakeWorkspacePort(emptyWorkspace),
    oneBotDebug: ports.oneBotDebug ?? createFakeOneBotDebugPort(),
    modelRequest: ports.modelRequest ?? createFakeModelRequestPort(),
    preset: ports.preset ?? createFakePresetPort(),
    mcpCallRecord: ports.mcpCallRecord ?? createFakeMcpCallRecordPort(),
  }, storage)
}
