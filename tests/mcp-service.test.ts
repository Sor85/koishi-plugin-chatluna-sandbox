import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { App } from '@koishijs/core'
import { afterEach, describe, expect, it } from 'vitest'
import { SandboxControlService } from '../src/control-service'
import { SandboxMcpService } from '../src/mcp/service'

const apps: App[] = []

function createService(scopes: Array<'read' | 'interact' | 'manage' | 'debug'> = ['read']) {
  const app = new App()
  apps.push(app)
  const directory = mkdtempSync(join(tmpdir(), 'onebot-sandbox-mcp-'))
  const control = new SandboxControlService(app, { mediaDirectory: join(directory, 'media') })
  const service = new SandboxMcpService(control, { dataDirectory: directory })
  const credential = service.createCredential('测试凭证', scopes)
  return { control, service, credential, directory }
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.stop()))
})

describe('SandboxMcpService', () => {
  it('只持久化凭证摘要并按权限发现工具', () => {
    const { service, credential, directory } = createService()

    expect(credential.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(service.authenticate(credential.token)?.name).toBe('测试凭证')
    expect(service.listTools(credential.token).map(({ name }) => name)).toEqual([
      'get_server_info',
      'get_scene_snapshot',
      'list_conversations',
      'get_conversation',
      'list_pending_requests',
      'get_capability_matrix',
      'export_scene',
    ])
    expect(readFileSync(join(directory, 'mcp-credentials.json'), 'utf8')).not.toContain(credential.token)
  })

  it('只读工具返回共享场景且拒绝越权调用', async () => {
    const { service, credential } = createService()

    const snapshot = await service.callTool(credential.token, 'get_scene_snapshot', {})
    expect(snapshot).toMatchObject({ revision: 0, participants: expect.any(Array) })
    await expect(service.callTool(credential.token, 'send_message', {})).rejects.toMatchObject({ code: 'permission_denied' })
  })

  it('上传媒体、发送消息和等待事实共享同一事件游标', async () => {
    const { control, service, credential } = createService(['read', 'interact'])
    control.updateBot({ id: '20001', name: 'Koishi', implementation: 'napcat', enabled: false })
    const cursor = service.currentCursor()
    const upload = await service.callTool(credential.token, 'upload_media', {
      fileName: '测试.txt',
      mimeType: 'text/plain',
      dataBase64: Buffer.from('hello').toString('base64'),
    }) as { mediaId: string }
    const input = {
      operatorId: '10001',
      conversationId: 'private:10001:20001',
      content: 'MCP 消息',
      mediaIds: [upload.mediaId],
      idempotencyKey: 'message-1',
      testRunId: 'run-1',
    }
    const first = await service.callTool(credential.token, 'send_message', input)
    const replay = await service.callTool(credential.token, 'send_message', input)
    expect(replay).toEqual(first)
    await expect(service.callTool(credential.token, 'send_message', { ...input, content: '不同消息' })).rejects.toMatchObject({ code: 'idempotency_conflict' })
    await expect(service.callTool(credential.token, 'wait_for_message', { cursor, timeoutSeconds: 1 })).resolves.toMatchObject({ matched: true })
  })

  it('领域交互复用真实权限并禁止代机器人审批', async () => {
    const { service, credential } = createService(['read', 'interact'])
    const request = await service.callTool(credential.token, 'perform_friend_action', {
      operatorId: '10001',
      action: 'request',
      targetId: '10002',
      idempotencyKey: 'friend-request-1',
    }) as { requestId: string }
    await expect(service.callTool(credential.token, 'handle_request', {
      operatorId: '10002',
      requestId: request.requestId,
      approve: true,
      idempotencyKey: 'friend-handle-1',
    })).resolves.toMatchObject({ revision: expect.any(Number) })

    await service.callTool(credential.token, 'perform_friend_action', {
      operatorId: '10002',
      action: 'delete',
      targetId: '20001',
      idempotencyKey: 'robot-delete-1',
    })
    const robotRequest = await service.callTool(credential.token, 'perform_friend_action', {
      operatorId: '10002',
      action: 'request',
      targetId: '20001',
      idempotencyKey: 'robot-request-1',
    }) as { requestId: string }
    await expect(service.callTool(credential.token, 'handle_request', {
      operatorId: '20001',
      requestId: robotRequest.requestId,
      approve: true,
      idempotencyKey: 'robot-handle-1',
    })).rejects.toMatchObject({ code: 'robot_request_forbidden' })
  })

  it('环境变更原子提交且破坏性操作要求版本绑定的一次性令牌', async () => {
    const { control, service, credential } = createService(['read', 'manage'])
    const revision = control.getSnapshot().revision
    await service.callTool(credential.token, 'apply_environment_changes', {
      expectedRevision: revision,
      changes: [{ action: 'create-user', data: { id: '10009', name: '临时用户' } }],
    })
    expect(control.getSnapshot().participants).toContainEqual({ kind: 'user', id: '10009', name: '临时用户' })
    await expect(service.callTool(credential.token, 'apply_environment_changes', {
      expectedRevision: revision,
      changes: [{ action: 'create-user', data: { id: '10010', name: '过期变更' } }],
    })).rejects.toMatchObject({ code: 'revision_conflict' })

    const prepared = await service.callTool(credential.token, 'prepare_destructive_action', {
      expectedRevision: control.getSnapshot().revision,
      tool: 'delete_environment_entity',
      arguments: { kind: 'user', id: '10009' },
    }) as { confirmationToken: string }
    await service.callTool(credential.token, 'delete_environment_entity', {
      kind: 'user',
      id: '10009',
      confirmationToken: prepared.confirmationToken,
    })
    expect(control.getSnapshot().participants.some(({ id }) => id === '10009')).toBe(false)
    await expect(service.callTool(credential.token, 'delete_environment_entity', {
      kind: 'user', id: '10001', confirmationToken: prepared.confirmationToken,
    })).rejects.toMatchObject({ code: 'confirmation_required' })
  })

  it('按凭证限制调用频率并记录脱敏 MCP 调用', async () => {
    const app = new App()
    apps.push(app)
    const directory = mkdtempSync(join(tmpdir(), 'onebot-sandbox-mcp-limit-'))
    const control = new SandboxControlService(app, { mediaDirectory: join(directory, 'media') })
    const service = new SandboxMcpService(control, { dataDirectory: directory, readPerMinute: 1 })
    const credential = service.createCredential('限流凭证', ['read', 'debug'])
    const debugCredential = service.createCredential('调试凭证', ['debug'])
    await service.callTool(credential.token, 'get_server_info', {}, { sourceIp: '127.0.0.1' })
    await expect(service.callTool(credential.token, 'get_scene_snapshot', {})).rejects.toMatchObject({ code: 'rate_limited', retryable: true, retryAfterMs: expect.any(Number) })
    const records = await service.callTool(debugCredential.token, 'list_mcp_call_records', {}) as Array<Record<string, unknown>>
    expect(records[0]).toMatchObject({ credentialName: '限流凭证', sourceIp: '127.0.0.1', tool: 'get_server_info', status: 'success' })
    expect(JSON.stringify(records)).not.toContain(credential.token)
  })
})
