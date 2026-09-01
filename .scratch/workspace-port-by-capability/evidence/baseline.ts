/**
 * 基线采集（HEAD 版 API：控制器只收一个工作区端口）。输出四个工作台模型、发送控件模型
 * 与假端口的完整调用序列，重构后由 after.ts 产出同一份 JSON 逐字节比对。
 */
import { ref } from 'vue'
import { createFakeWorkspacePort } from '../../../client/webqq/fake-workspace-port'
import { createWorkspaceController } from '../../../client/webqq/workspace-controller'
import { createWorkspaceLayout } from '../../../client/webqq/workspace-layout'
import { createWebqqWorkspaceShell } from '../../../client/webqq/workspace-shell'
import {
  canonical,
  createStorage,
  debugRecord,
  groupCalls,
  mcpCallDetail,
  mcpCallItem,
  modelRequestDetail,
  modelRequestItem,
  modelRequestTrajectory,
  presetDocument,
  silenceMountWarning,
  workspace,
} from './fixture'

async function main() {
  const port = createFakeWorkspacePort(workspace)
  port.debugRecordsResult = {
    records: [debugRecord],
    hasMore: false,
    earliestCursor: 1,
    capacity: { recordCount: 1, totalBytes: 128, maxRecords: 5000, maxBytes: 50 * 1024 * 1024 },
  }
  port.debugRecordResult = debugRecord
  port.modelRequestRecordsResult = {
    records: [modelRequestItem],
    hasMore: true,
    nextCursor: 8,
    nextCreatedAt: '2026-08-30T12:00:01.000Z',
    nextId: 'record-1',
    earliestCursor: 1,
    capacity: { recordCount: 1, totalBytes: 256, maxRecords: 5000, maxBytes: 50 * 1024 * 1024 },
  }
  port.modelRequestRecordResult = modelRequestDetail
  port.modelRequestTrajectoryResult = modelRequestTrajectory
  port.presetCatalogResult = [presetDocument]
  port.presetDocumentResult = presetDocument
  port.mcpCallRecordsResult = { records: [mcpCallItem] }
  port.mcpCallRecordResult = mcpCallDetail

  const controller = createWorkspaceController(port, createStorage())
  await controller.load()
  const shell = silenceMountWarning(() => createWebqqWorkspaceShell(
    controller,
    createWorkspaceLayout(ref(true)),
    () => undefined,
    () => 'space-1',
  ))

  await shell.loadOneBotDebugRecords({ botId: '20001', direction: 'action' })
  await shell.loadOneBotDebugRecord({ recordId: 'debug-1', includeLargeValues: true })
  await shell.loadModelRequestRecords({ scope: 'space', spaceId: 'main', limit: 50 })
  await shell.loadModelRequestRecord({ scope: 'space', spaceId: 'main', recordId: 'record-1' })
  await shell.loadModelRequestTrajectory({ scope: 'space', spaceId: 'main', recordId: 'record-1', mode: 'request' })
  await shell.loadPresetCatalog()
  await shell.readPreset({ kind: 'core', fileName: 'assistant.yml' })
  await shell.loadMcpCallRecords({ tool: 'get_server_info' })
  await shell.loadMcpCallRecord({ recordId: 'call-1' })

  const loaded = {
    debugWorkspaceModel: shell.debugWorkspaceModel.value,
    mcpCallWorkspaceModel: shell.mcpCallWorkspaceModel.value,
    modelRequestWorkspaceModel: shell.modelRequestWorkspaceModel.value,
    presetWorkspaceModel: shell.presetWorkspaceModel.value,
    composerModel: shell.chatPaneModel.value.composer,
  }

  // 第二阶段：预设写操作、定位与三处清理。清理会清空缓冲区，因此模型再采一次。
  await shell.createPreset({ kind: 'core', fileName: 'created.yml', source: 'a: 1\n' })
  await shell.savePreset({ kind: 'core', fileName: 'assistant.yml', source: 'a: 2\n', expectedRevision: 'rev-1' })
  await shell.renamePreset({
    kind: 'core', fileName: 'assistant.yml', newFileName: 'renamed.yml', expectedRevision: 'rev-1', confirmed: true,
  })
  await shell.locatePresetExpression({
    document: { kind: 'core', fileName: 'renamed.yml', revision: 'rev-1' },
    expression: { stableId: 'expression-1' },
    scope: { scope: 'main' },
  }).catch(() => undefined)
  await shell.deletePreset({ kind: 'core', fileName: 'renamed.yml', expectedRevision: 'rev-1', confirmed: true })
  await shell.clearOneBotDebugRecords()
  await shell.clearModelRequestRecords({ scope: 'unattributed' })
  await shell.clearMcpCallRecords()

  process.stdout.write(canonical({
    loaded,
    cleared: {
      debugWorkspaceModel: shell.debugWorkspaceModel.value,
      mcpCallWorkspaceModel: shell.mcpCallWorkspaceModel.value,
      modelRequestWorkspaceModel: shell.modelRequestWorkspaceModel.value,
      presetWorkspaceModel: shell.presetWorkspaceModel.value,
      composerModel: shell.chatPaneModel.value.composer,
    },
    calls: groupCalls(port.calls),
  }))
  process.stdout.write('\n')
}

void main()
