/**
 * 重构后采集（票 02：四道记录域端口全部拆出）。输出与 baseline.ts
 * 完全同一份 JSON——四个工作台模型、发送控件模型，以及按能力分组的调用序列。
 */
import { ref } from 'vue'
import { createFakeMcpCallRecordPort } from '../../../client/webqq/fake-mcp-call-record-port'
import { createFakeModelRequestPort } from '../../../client/webqq/fake-model-request-port'
import { createFakeOneBotDebugPort } from '../../../client/webqq/fake-onebot-debug-port'
import { createFakePresetPort } from '../../../client/webqq/fake-preset-port'
import { createFakeWorkspacePort } from '../../../client/webqq/fake-workspace-port'
import { createWorkspaceController } from '../../../client/webqq/workspace-controller'
import { createWorkspaceLayout } from '../../../client/webqq/workspace-layout'
import { createWebqqWorkspaceShell } from '../../../client/webqq/workspace-shell'
import {
  canonical,
  createStorage,
  debugRecord,
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
  const workspacePort = createFakeWorkspacePort(workspace)
  const oneBotDebugPort = createFakeOneBotDebugPort()
  oneBotDebugPort.debugRecordsResult = {
    records: [debugRecord],
    hasMore: false,
    earliestCursor: 1,
    capacity: { recordCount: 1, totalBytes: 128, maxRecords: 5000, maxBytes: 50 * 1024 * 1024 },
  }
  oneBotDebugPort.debugRecordResult = debugRecord
  const modelRequestPort = createFakeModelRequestPort()
  modelRequestPort.modelRequestRecordsResult = {
    records: [modelRequestItem],
    hasMore: true,
    nextCursor: 8,
    nextCreatedAt: '2026-08-30T12:00:01.000Z',
    nextId: 'record-1',
    earliestCursor: 1,
    capacity: { recordCount: 1, totalBytes: 256, maxRecords: 5000, maxBytes: 50 * 1024 * 1024 },
  }
  modelRequestPort.modelRequestRecordResult = modelRequestDetail
  modelRequestPort.modelRequestTrajectoryResult = modelRequestTrajectory
  const presetPort = createFakePresetPort()
  presetPort.presetCatalogResult = [presetDocument]
  presetPort.presetDocumentResult = presetDocument
  const mcpCallRecordPort = createFakeMcpCallRecordPort()
  mcpCallRecordPort.mcpCallRecordsResult = { records: [mcpCallItem] }
  mcpCallRecordPort.mcpCallRecordResult = mcpCallDetail

  const controller = createWorkspaceController({
    workspace: workspacePort,
    oneBotDebug: oneBotDebugPort,
    modelRequest: modelRequestPort,
    preset: presetPort,
    mcpCallRecord: mcpCallRecordPort,
  }, createStorage())
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
    // 五道端口各有一份记录器，分组直接就是分好的；基线侧只有一份记录器，按操作名分组。
    calls: {
      workspace: workspacePort.calls,
      oneBotDebug: oneBotDebugPort.calls,
      modelRequest: modelRequestPort.calls,
      preset: presetPort.calls,
      mcpCallRecord: mcpCallRecordPort.calls,
    },
  }))
  process.stdout.write('\n')
}

void main()
