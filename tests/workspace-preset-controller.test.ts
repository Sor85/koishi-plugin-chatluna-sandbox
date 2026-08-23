import { describe, expect, it } from 'vitest'
import { createFakeWorkspacePort } from '../client/webqq/fake-workspace-port'
import { createWorkspaceController } from '../client/webqq/workspace-controller'
import type { SandboxPresetDocument } from '../src/presets'
import type { SandboxWorkspaceState } from '../src/types'

const workspace: SandboxWorkspaceState = {
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

const document: SandboxPresetDocument = {
  kind: 'core',
  fileName: 'assistant.yml',
  displayName: 'assistant',
  source: 'keywords:\n  - assistant\n',
  revision: 'rev-1',
  size: 24,
  modifiedAt: '2026-08-22T00:00:00.000Z',
  templateFields: [],
  expressions: [],
  diagnostics: [],
}

describe('预设工作区控制器和端口', () => {
  it('公开目录、读取、CRUD 与定位调用，并同步公开状态', async () => {
    const port = createFakeWorkspacePort(workspace)
    port.presetCatalogResult = [document]
    port.presetDocumentResult = document
    port.locatePresetExpressionResult = {
      status: 'matched',
      recordId: 'record-1',
      evidenceId: 'message-1',
      range: { start: 0, end: 4 },
      scope: { scope: 'main' },
    }
    const controller = createWorkspaceController(port, { getItem: () => null, setItem: () => undefined })

    await controller.loadPresetCatalog()
    expect(controller.presetCatalog.value).toEqual([document])

    await controller.readPreset({ kind: 'core', fileName: 'assistant.yml' })
    expect(controller.presetDocument.value).toEqual(document)

    await controller.savePreset({ ...document, expectedRevision: document.revision })
    expect(port.calls.at(-1)?.operation).toBe('savePreset')

    await controller.renamePreset({
      kind: 'core', fileName: 'assistant.yml', newFileName: 'renamed.yml', expectedRevision: 'rev-1', confirmed: true,
    })
    expect(controller.presetDocument.value?.fileName).toBe('renamed.yml')

    const located = await controller.locatePresetExpression({
      document: { kind: 'core', fileName: 'renamed.yml', revision: 'rev-1' },
      expression: { stableId: '["messages",0]#0' },
      scope: { scope: 'main' },
    })
    expect(located.status).toBe('matched')
    expect(controller.presetLocateResult.value).toEqual(located)

    await controller.deletePreset({ kind: 'core', fileName: 'renamed.yml', expectedRevision: 'rev-1', confirmed: true })
    expect(controller.presetDocument.value).toBeUndefined()
  })
})
