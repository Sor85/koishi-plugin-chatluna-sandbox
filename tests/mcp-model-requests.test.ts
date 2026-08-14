import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { App } from '@koishijs/core'
import { afterEach, describe, expect, it } from 'vitest'
import { SandboxControlService, SandboxRuntimeBotRegistry } from '../src/control-service'
import { SandboxMcpService } from '../src/mcp/service'
import { SandboxModelRequestStore } from '../src/model-request'
import { SandboxTestSpaceService } from '../src/test-spaces'

const apps: App[] = []

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.stop()))
})

describe('模型请求 MCP 工具', () => {
  it('按 scope 读取主环境、测试空间和未归属记录，且不能清理未归属库', async () => {
    const app = new App()
    apps.push(app)
    const directory = mkdtempSync(join(tmpdir(), 'onebot-sandbox-mcp-model-'))
    const runtimeBots = new SandboxRuntimeBotRegistry()
    const control = new SandboxControlService(app, { mediaDirectory: join(directory, 'media'), runtimeBots })
    const testSpaces = new SandboxTestSpaceService(app, runtimeBots)
    const unattributed = new SandboxModelRequestStore()
    const service = new SandboxMcpService(control, { dataDirectory: directory, testSpaces, unattributedModelRequests: unattributed })
    const credential = service.createCredential('调试凭证', ['read', 'manage', 'debug'])
    const created = await service.callTool(credential.token, 'create_test_space', {
      name: '模型请求空间',
      idempotencyKey: 'model-request-space-1',
    }) as { spaceId: string }
    const spaceControl = testSpaces.getControl(created.spaceId)

    control.recordModelRequest({
      status: 'success', durationMs: 1, model: 'main-model',
      attribution: 'attributed', entities: { scopeId: 'main' }, requestBodyAvailable: false,
    })
    const spaceRecord = spaceControl.recordModelRequest({
      status: 'success', durationMs: 2, model: 'space-model',
      attribution: 'attributed', entities: { scopeId: created.spaceId },
      requestBodyAvailable: true, requestBody: { model: 'space-model', messages: [{ role: 'user', content: 'hi' }] },
      responseBodyStatus: 'complete', responseBodyFormat: 'json', responseStatus: 200,
      responseBodyRaw: JSON.stringify({ content: 'hello' }),
    })
    const lost = unattributed.append({
      status: 'error', durationMs: 3, model: 'lost-model',
      attribution: 'unattributed', entities: {}, requestBodyAvailable: false,
    })

    const mainPage = await service.callTool(credential.token, 'list_model_request_records', { scope: 'space' }) as { records: Array<{ model: string }> }
    expect(mainPage.records.map(({ model }) => model)).toEqual(['main-model'])
    const spacePage = await service.callTool(credential.token, 'list_model_request_records', {
      scope: 'space',
      spaceId: created.spaceId,
    }) as { records: Array<{ id: string, model: string }> }
    expect(spacePage.records).toEqual([expect.objectContaining({ id: spaceRecord.id, model: 'space-model' })])
    expect(spacePage.records[0]).not.toHaveProperty('requestBody')
    expect(spacePage.records[0]).not.toHaveProperty('responseBodyRaw')
    expect(await service.callTool(credential.token, 'get_model_request_record', {
      scope: 'space',
      spaceId: created.spaceId,
      recordId: spaceRecord.id,
    })).toMatchObject({
      id: spaceRecord.id,
      requestBody: { model: 'space-model', messages: [{ role: 'user', content: 'hi' }] },
      responseBodyStatus: 'complete',
      responseBodyFormat: 'json',
      responseStatus: 200,
      responseBodyRaw: JSON.stringify({ content: 'hello' }),
    })
    expect(await service.callTool(credential.token, 'list_model_request_records', { scope: 'unattributed' })).toMatchObject({
      records: [expect.objectContaining({ id: lost.id, model: 'lost-model' })],
    })

    await expect(service.callTool(credential.token, 'clear_model_request_records', { scope: 'unattributed' })).rejects.toMatchObject({
      code: 'invalid_arguments',
    })
    expect(await service.callTool(credential.token, 'clear_model_request_records', { spaceId: created.spaceId })).toEqual({ cleared: 1 })
    expect(spaceControl.getModelRequestRecords().records).toEqual([])
    expect(unattributed.getRecords().records).toHaveLength(1)
  })
})
