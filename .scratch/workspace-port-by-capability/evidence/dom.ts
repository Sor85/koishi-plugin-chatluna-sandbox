/**
 * DOM 快照：用同一份确定性场景产出的模型，服务端渲染四个工作台组件，按 page.vue 里
 * 一模一样的绑定传参。它兜住的是「模板绑定被改坏」这一类：模型对了但传错一处属性。
 */
import { defineComponent, h, ref } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { createSSRApp } from 'vue'
import McpCallWorkspace from '../../../client/mcp-call-workspace.vue'
import ModelRequestWorkspace from '../../../client/model-request-workspace.vue'
import OneBotDebugWorkspace from '../../../client/onebot-debug-workspace.vue'
import PresetWorkspace from '../../../client/preset-workspace.vue'
import { createFakeMcpCallRecordPort } from '../../../client/webqq/fake-mcp-call-record-port'
import { createFakeModelRequestPort } from '../../../client/webqq/fake-model-request-port'
import { createFakePresetPort } from '../../../client/webqq/fake-preset-port'
import { createFakeWorkspacePort } from '../../../client/webqq/fake-workspace-port'
import { createWorkspaceController } from '../../../client/webqq/workspace-controller'
import { createWorkspaceLayout } from '../../../client/webqq/workspace-layout'
import { createWebqqWorkspaceShell } from '../../../client/webqq/workspace-shell'
import { createEvidenceNavigation } from '../../../client/webqq/evidence-navigation'
import {
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

const bots = [{
  kind: 'bot' as const,
  id: '20001',
  name: 'Koishi',
  implementation: 'napcat' as const,
  enabled: true,
  avatar: '',
  source: { type: 'main' as const, name: '主环境' },
}]
const spaces = [{ id: 'main', name: '主环境' }]

async function main() {
  const workspacePort = createFakeWorkspacePort(workspace)
  workspacePort.debugRecordsResult = {
    records: [debugRecord],
    hasMore: false,
    earliestCursor: 1,
    capacity: { recordCount: 1, totalBytes: 128, maxRecords: 5000, maxBytes: 50 * 1024 * 1024 },
  }
  workspacePort.debugRecordResult = debugRecord
  const modelRequestPort = createFakeModelRequestPort()
  modelRequestPort.modelRequestRecordsResult = {
    records: [modelRequestItem],
    hasMore: true,
    nextCursor: 8,
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

  const navigation = createEvidenceNavigation()
  const root = defineComponent({
    setup: () => () => h('div', {}, [
      h(OneBotDebugWorkspace, {
        records: shell.debugWorkspaceModel.value.records,
        detail: shell.debugWorkspaceModel.value.detail,
        bots,
        loading: shell.debugWorkspaceModel.value.loading,
        detailLoading: shell.debugWorkspaceModel.value.detailLoading,
        error: shell.debugWorkspaceModel.value.error,
        visitKey: shell.debugVisitKey.value,
      }),
      h(McpCallWorkspace, {
        records: shell.mcpCallWorkspaceModel.value.records,
        detail: shell.mcpCallWorkspaceModel.value.detail,
        loading: shell.mcpCallWorkspaceModel.value.loading,
        detailLoading: shell.mcpCallWorkspaceModel.value.detailLoading,
        error: shell.mcpCallWorkspaceModel.value.error,
        visitKey: shell.mcpCallVisitKey.value,
      }),
      h(PresetWorkspace, {
        catalog: shell.presetWorkspaceModel.value.catalog,
        document: shell.presetWorkspaceModel.value.document,
        loading: shell.presetWorkspaceModel.value.loading,
        saving: shell.presetWorkspaceModel.value.saving,
        error: shell.presetWorkspaceModel.value.error,
        evidenceContext: shell.presetWorkspaceModel.value.evidenceContext,
        discardGuardOpen: Boolean(shell.presetDiscardGuard.value.pending),
        discardGuardAction: shell.presetDiscardGuard.value.pending?.action,
        originRestore: navigation.presetOriginRestore.value,
      }),
      h(ModelRequestWorkspace, {
        records: shell.modelRequestWorkspaceModel.value.records,
        detail: shell.modelRequestWorkspaceModel.value.detail,
        trajectory: shell.modelRequestWorkspaceModel.value.trajectory,
        spaces,
        bots,
        defaultSpaceId: 'main',
        hasMore: shell.modelRequestWorkspaceModel.value.hasMore,
        nextCursor: shell.modelRequestWorkspaceModel.value.nextCursor,
        nextCreatedAt: shell.modelRequestWorkspaceModel.value.nextCreatedAt,
        nextId: shell.modelRequestWorkspaceModel.value.nextId,
        loading: shell.modelRequestWorkspaceModel.value.loading,
        detailLoading: shell.modelRequestWorkspaceModel.value.detailLoading,
        error: shell.modelRequestWorkspaceModel.value.error,
        visitKey: shell.modelRequestVisitKey.value,
        navigation,
      }),
    ]),
  })

  const html = await renderToString(createSSRApp(root))
  process.stdout.write(html.replace(/></g, '>\n<'))
  process.stdout.write('\n')
}

void main()
