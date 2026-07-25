import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SandboxControlService } from '../control-service'
import type { SandboxTestSpaceService } from '../test-spaces'
import type { SandboxMedia, SandboxSnapshot } from '../types'
import { createDirectConversationId } from '../types'
import { getOneBotCapabilityMatrix } from '../onebot-profiles'
import { SandboxMcpError, type SandboxMcpCallRecord, type SandboxMcpCreatedCredential, type SandboxMcpCredential, type SandboxMcpEvent, type SandboxMcpEventCursor, type SandboxMcpExport, type SandboxMcpScope } from './types'

export interface SandboxMcpServiceOptions {
  dataDirectory: string
  eventLimit?: number
  callRecordLimit?: number
  readPerMinute?: number
  mutationPerMinute?: number
  waitPerMinute?: number
  uploadPerMinute?: number
  maxConcurrentMutations?: number
  maxConcurrentWaits?: number
  maxConcurrentUploads?: number
  testSpaces?: SandboxTestSpaceService
}

interface ToolDefinition {
  name: string
  scope: SandboxMcpScope
  description: string
}

const TOOL_DEFINITIONS: ToolDefinition[] = [
  ['get_server_info', 'read', '获取沙盒服务、测试 API 和 MCP 状态'],
  ['list_test_spaces', 'read', '列出当前凭证创建的 AI 测试空间'],
  ['get_test_space', 'read', '读取单个 AI 测试空间状态'],
  ['get_scene_snapshot', 'read', '读取当前模拟 QQ 场景快照'],
  ['list_conversations', 'read', '分页列出当前操作者可见会话'],
  ['get_conversation', 'read', '读取单个会话及其消息'],
  ['list_pending_requests', 'read', '列出当前待处理好友和群申请'],
  ['get_capability_matrix', 'read', '读取 NapCat 或 LLBot 能力覆盖'],
  ['export_scene', 'read', '导出版本化 JSON 场景'],
  ['upload_media', 'interact', '上传供消息引用的媒体'],
  ['send_message', 'interact', '以明确操作者身份发送消息'],
  ['perform_friend_action', 'interact', '执行好友申请、审批、删除、备注或戳一戳'],
  ['perform_group_action', 'interact', '执行入群、邀请、退群、管理或戳一戳'],
  ['handle_request', 'interact', '处理普通用户有权审批的申请'],
  ['wait_for_event', 'interact', '从事件游标等待匹配事件'],
  ['wait_for_message', 'interact', '从事件游标等待消息'],
  ['wait_for_chatluna_state', 'interact', '从事件游标等待 ChatLuna 状态'],
  ['apply_environment_changes', 'manage', '原子应用测试环境变更'],
  ['create_test_space', 'manage', '创建空白且隔离的 AI 测试空间'],
  ['complete_test_space', 'manage', '将 AI 测试空间标记为已完成并停止机器人'],
  ['fail_test_space', 'manage', '将 AI 测试空间标记为失败并停止机器人'],
  ['reactivate_test_space', 'manage', '重新激活已完成或失败的 AI 测试空间'],
  ['delete_test_space', 'manage', '删除当前凭证创建的 AI 测试空间；除非用户明确要求，否则测试完成后应默认保留'],
  ['prepare_destructive_action', 'manage', '准备一次性破坏性操作确认令牌'],
  ['delete_environment_entity', 'manage', '删除现有环境实体'],
  ['reset_scene', 'manage', '恢复默认场景'],
  ['clear_scene', 'manage', '清空当前场景'],
  ['import_scene', 'manage', '导入版本化 JSON 场景'],
  ['list_onebot_debug_records', 'debug', '读取 OneBot 调试记录'],
  ['clear_onebot_debug_records', 'debug', '清理 OneBot 调试记录'],
  ['list_mcp_call_records', 'debug', '读取 MCP 调用记录'],
  ['clear_mcp_call_records', 'debug', '清理 MCP 调用记录'],
].map(([name, scope, description]) => ({ name, scope, description }) as ToolDefinition)

const READ_RESOURCES = [
  { uri: 'onebot-sandbox://guide', name: 'MCP 测试指南' },
  { uri: 'onebot-sandbox://scene-schema', name: '场景 JSON Schema' },
  { uri: 'onebot-sandbox://capabilities/napcat', name: 'NapCat 能力基线' },
  { uri: 'onebot-sandbox://capabilities/llbot', name: 'LLBot 能力基线' },
  { uri: 'onebot-sandbox://errors', name: '稳定错误码' },
  { uri: 'onebot-sandbox://examples', name: '工具调用示例' },
]

function digestToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function stableValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableValue(item)}`).join(',')}}`
  return JSON.stringify(value)
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new SandboxMcpError('invalid_arguments', `${name} 不能为空`)
  return value.trim()
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SandboxMcpError('invalid_arguments', '工具参数必须是对象')
  return value as Record<string, unknown>
}

export class SandboxMcpService {
  private credentials: SandboxMcpCredential[] = []
  private events: SandboxMcpEvent[] = []
  private callRecords: SandboxMcpCallRecord[] = []
  private epoch = randomUUID()
  private sequence = 0
  private uploadedMedia = new Map<string, SandboxMedia & { dataBase64: string }>()
  private idempotency = new Map<string, { argumentsHash: string; result: unknown }>()
  private confirmations = new Map<string, { credentialId: string; tool: string; argumentsHash: string; revision: number; expiresAt: number }>()
  private credentialFile: string
  private eventLimit: number
  private callRecordLimit: number
  private readPerMinute: number
  private mutationPerMinute: number
  private waitPerMinute: number
  private uploadPerMinute: number
  private rateWindows = new Map<string, number[]>()
  private activeCalls = new Map<string, number>()
  private concurrentLimits: Record<'mutation' | 'wait' | 'upload', number>
  private testSpaces?: SandboxTestSpaceService

  constructor(private control: SandboxControlService, options: SandboxMcpServiceOptions) {
    this.testSpaces = options.testSpaces
    mkdirSync(options.dataDirectory, { recursive: true })
    this.credentialFile = join(options.dataDirectory, 'mcp-credentials.json')
    this.eventLimit = options.eventLimit ?? 1000
    this.callRecordLimit = options.callRecordLimit ?? 500
    this.readPerMinute = options.readPerMinute ?? 120
    this.mutationPerMinute = options.mutationPerMinute ?? 60
    this.waitPerMinute = options.waitPerMinute ?? 120
    this.uploadPerMinute = options.uploadPerMinute ?? 30
    this.concurrentLimits = {
      mutation: options.maxConcurrentMutations ?? 4,
      wait: options.maxConcurrentWaits ?? 8,
      upload: options.maxConcurrentUploads ?? 2,
    }
    this.loadCredentials()
    this.observeControl(this.control)
    this.testSpaces?.onSpaceCreated((spaceId, control) => this.observeControl(control, spaceId))
  }

  private observeControl(control: SandboxControlService, spaceId?: string): void {
    control.onSceneMutation((snapshot) => {
      this.appendEvent('scene.changed', { revision: snapshot.revision }, spaceId)
    })
  }

  createCredential(name: string, scopes: SandboxMcpScope[] = ['read']): SandboxMcpCreatedCredential {
    const normalizedName = requireString(name, '凭证名称')
    const token = randomBytes(32).toString('base64url')
    const credential: SandboxMcpCredential = {
      id: randomUUID(),
      name: normalizedName,
      scopes: [...new Set<SandboxMcpScope>(scopes.length ? scopes : ['read'])],
      enabled: true,
      tokenDigest: digestToken(token),
      createdAt: new Date().toISOString(),
    }
    this.credentials.push(credential)
    this.saveCredentials()
    return { id: credential.id, name: credential.name, scopes: credential.scopes, enabled: true, createdAt: credential.createdAt, token }
  }

  listCredentials(): Array<Omit<SandboxMcpCredential, 'tokenDigest'>> {
    return structuredClone(this.credentials.map(({ tokenDigest: _tokenDigest, ...credential }) => credential))
  }

  setCredentialEnabled(id: string, enabled: boolean): void {
    const credential = this.credentials.find((item) => item.id === id)
    if (!credential) throw new SandboxMcpError('credential_not_found', `凭证不存在：${id}`)
    credential.enabled = enabled
    this.saveCredentials()
  }

  revokeCredential(id: string): void {
    const index = this.credentials.findIndex((item) => item.id === id)
    if (index < 0) throw new SandboxMcpError('credential_not_found', `凭证不存在：${id}`)
    this.credentials.splice(index, 1)
    this.saveCredentials()
  }

  authenticate(token: string): SandboxMcpCredential | undefined {
    const digest = Buffer.from(digestToken(token), 'hex')
    return this.credentials.find((credential) => credential.enabled
      && timingSafeEqual(digest, Buffer.from(credential.tokenDigest, 'hex')))
  }

  listTools(token: string): ToolDefinition[] {
    const credential = this.requireCredential(token)
    return TOOL_DEFINITIONS.filter(({ scope }) => credential.scopes.includes(scope)).map((item) => ({ ...item }))
  }

  listResources(token: string) {
    const credential = this.requireCredential(token)
    return credential.scopes.includes('read') ? structuredClone(READ_RESOURCES) : []
  }

  readResource(token: string, uri: string): unknown {
    this.requireScope(this.requireCredential(token), 'read')
    if (uri === 'onebot-sandbox://guide') return { testApiVersion: 1, tools: TOOL_DEFINITIONS }
    if (uri === 'onebot-sandbox://scene-schema') return { testApiVersion: { const: 1 }, scene: { type: 'object' } }
    if (uri === 'onebot-sandbox://capabilities/napcat') return this.getCapabilityMatrix(this.control, 'napcat')
    if (uri === 'onebot-sandbox://capabilities/llbot') return this.getCapabilityMatrix(this.control, 'llbot')
    if (uri === 'onebot-sandbox://errors') return ['unauthorized', 'permission_denied', 'invalid_arguments', 'idempotency_conflict', 'cursor_expired', 'confirmation_required', 'revision_conflict', 'rate_limited', 'space_id_required', 'space_taken_over', 'space_forbidden', 'space_not_found', 'space_unavailable', 'test_spaces_unavailable', 'internal_error']
    if (uri === 'onebot-sandbox://examples') return {
      create_test_space: {
        name: '退群公告测试',
        idempotencyKey: 'example-space-1',
      },
      send_message: {
        spaceId: '<create_test_space.spaceId>',
        operatorId: '10001',
        conversationId: 'private:10001:20001',
        content: '你好',
        idempotencyKey: 'example-message-1',
      },
    }
    throw new SandboxMcpError('resource_not_found', `资源不存在：${uri}`)
  }

  currentCursor(): SandboxMcpEventCursor {
    return { epoch: this.epoch, sequence: this.sequence }
  }

  getRevision(): number {
    return this.control.getSnapshot().revision
  }

  async callTool(token: string, tool: string, argumentsValue: unknown, context: { sourceIp?: string } = {}): Promise<unknown> {
    const credential = this.requireCredential(token)
    const definition = TOOL_DEFINITIONS.find(({ name }) => name === tool)
    if (!definition) throw new SandboxMcpError('tool_not_found', `工具不存在：${tool}`)
    this.requireScope(credential, definition.scope)
    const rateCategory = tool.startsWith('wait_for_') ? 'wait' : tool === 'upload_media' ? 'upload' : definition.scope === 'read' || definition.scope === 'debug' ? 'read' : 'mutation'
    const rateLimit = rateCategory === 'read' ? this.readPerMinute : rateCategory === 'mutation' ? this.mutationPerMinute : rateCategory === 'wait' ? this.waitPerMinute : this.uploadPerMinute
    this.consumeRateLimit(credential.id, rateCategory, rateLimit)
    const args = asRecord(argumentsValue)
    const startedAt = Date.now()
    const concurrencyCategory = tool.startsWith('wait_for_') ? 'wait' : tool === 'upload_media' ? 'upload' : definition.scope === 'read' || definition.scope === 'debug' ? undefined : 'mutation'
    try {
      const result = concurrencyCategory
        ? await this.withConcurrency(credential.id, concurrencyCategory, () => this.executeTool(credential, tool, args))
        : await this.executeTool(credential, tool, args)
      this.appendCallRecord(credential, tool, args, context.sourceIp, 'success', result, undefined, Date.now() - startedAt)
      return result
    } catch (error) {
      const normalized = error instanceof SandboxMcpError
        ? error
        : new SandboxMcpError('domain_error', error instanceof Error ? error.message : '工具调用失败')
      this.appendCallRecord(credential, tool, args, context.sourceIp, 'error', undefined, normalized.code, Date.now() - startedAt)
      throw normalized
    }
  }

  private async executeTool(credential: SandboxMcpCredential, tool: string, args: Record<string, unknown>): Promise<unknown> {
    if (tool === 'get_server_info') return { name: 'onebot-sandbox', testApiVersion: 1, transport: 'streamable-http', stateless: true, cursor: this.currentCursor() }
    if (tool === 'list_test_spaces') return this.requireTestSpaces().listSpaces().filter(({ controllerId }) => controllerId === credential.id)
    if (tool === 'get_test_space') return this.getOwnedTestSpace(credential, args)
    if (tool === 'create_test_space') return this.withIdempotency(credential, tool, args, async () => {
      const space = this.requireTestSpaces().createSpace({ controllerId: credential.id, name: typeof args.name === 'string' ? args.name : undefined })
      return { spaceId: space.id, status: space.status, revision: space.snapshot.revision, cursor: this.appendEvent('test-space.created', { spaceId: space.id }, space.id) }
    })
    if (tool === 'complete_test_space') return this.withIdempotency(credential, tool, args, async () => this.completeTestSpace(credential, args, false))
    if (tool === 'fail_test_space') return this.withIdempotency(credential, tool, args, async () => this.completeTestSpace(credential, args, true))
    if (tool === 'reactivate_test_space') return this.withIdempotency(credential, tool, args, async () => this.reactivateTestSpace(credential, args))
    if (tool === 'delete_test_space') return this.withIdempotency(credential, tool, args, async () => this.deleteTestSpace(credential, args))
    const activeControl = this.resolveControl(credential, args, tool !== 'get_scene_snapshot' && tool !== 'list_conversations' && tool !== 'get_conversation' && tool !== 'list_pending_requests' && tool !== 'get_capability_matrix' && tool !== 'export_scene' && tool !== 'list_onebot_debug_records')
    if (tool === 'get_scene_snapshot') return activeControl.getSnapshot()
    if (tool === 'list_conversations') return this.listConversations(activeControl, args)
    if (tool === 'get_conversation') return this.getConversation(activeControl, args)
    if (tool === 'list_pending_requests') return activeControl.getSnapshot().requests
    if (tool === 'get_capability_matrix') return this.getCapabilityMatrix(activeControl, args.implementation)
    if (tool === 'export_scene') return this.exportScene(activeControl)
    if (tool === 'upload_media') return this.uploadMedia(activeControl, args)
    if (tool === 'send_message') return this.withIdempotency(credential, tool, args, async () => this.sendMessage(activeControl, args))
    if (tool === 'perform_friend_action') return this.withIdempotency(credential, tool, args, async () => this.performFriendAction(activeControl, args))
    if (tool === 'perform_group_action') return this.withIdempotency(credential, tool, args, async () => this.performGroupAction(activeControl, args))
    if (tool === 'handle_request') return this.withIdempotency(credential, tool, args, async () => this.handleRequest(activeControl, args))
    if (tool === 'wait_for_event') return this.waitFor(args, (event) => !args.type || event.type === args.type)
    if (tool === 'wait_for_message') return this.waitFor(args, (event) => event.type === 'message.created'
      && (!args.conversationId || Reflect.get(event.data as object, 'conversationId') === args.conversationId)
      && (!args.recipientBotId || Reflect.get(event.data as object, 'recipientBotId') === args.recipientBotId))
    if (tool === 'wait_for_chatluna_state') return this.waitForChatLuna(activeControl, args)
    if (tool === 'apply_environment_changes') return this.applyEnvironmentChanges(activeControl, args)
    if (tool === 'prepare_destructive_action') return this.prepareDestructiveAction(activeControl, credential, args)
    if (tool === 'delete_environment_entity') return this.runDestructive(activeControl, credential, tool, args, () => this.deleteEnvironmentEntity(activeControl, args))
    if (tool === 'reset_scene') return this.runDestructive(activeControl, credential, tool, args, () => activeControl.resetScene())
    if (tool === 'clear_scene') return this.runDestructive(activeControl, credential, tool, args, () => activeControl.replaceScene({ revision: activeControl.getSnapshot().revision, participants: [], groups: [], conversations: [], messages: [], friendships: [], requests: [] }))
    if (tool === 'import_scene') return this.runDestructive(activeControl, credential, tool, args, () => this.importScene(activeControl, args))
    if (tool === 'list_onebot_debug_records') return activeControl.getOneBotDebugRecords(args)
    if (tool === 'clear_onebot_debug_records') return { cleared: activeControl.clearOneBotDebugRecords() }
    if (tool === 'list_mcp_call_records') return structuredClone(this.callRecords).reverse()
    if (tool === 'clear_mcp_call_records') { const cleared = this.callRecords.length; this.callRecords = []; return { cleared } }
    throw new SandboxMcpError('tool_not_found', `工具不存在：${tool}`)
  }

  private listConversations(control: SandboxControlService, args: Record<string, unknown>) {
    const operatorId = requireString(args.operatorId, 'operatorId')
    const snapshot = control.getVisibleSnapshot(operatorId, 200)
    const limit = Math.min(Math.max(Number(args.limit ?? 50), 1), 200)
    const offset = Math.max(Number(args.offset ?? 0), 0)
    return { items: snapshot.conversations.slice(offset, offset + limit), nextOffset: offset + limit < snapshot.conversations.length ? offset + limit : undefined }
  }

  private getConversation(control: SandboxControlService, args: Record<string, unknown>) {
    const operatorId = requireString(args.operatorId, 'operatorId')
    const conversationId = requireString(args.conversationId, 'conversationId')
    const snapshot = control.getVisibleSnapshot(operatorId, Math.min(Math.max(Number(args.messageLimit ?? 50), 1), 200))
    const conversation = snapshot.conversations.find(({ id }) => id === conversationId)
    if (!conversation) throw new SandboxMcpError('conversation_not_found', `会话不存在或不可见：${conversationId}`)
    const messageIds = new Set(conversation.messageIds)
    return { conversation, messages: snapshot.messages.filter(({ id }) => messageIds.has(id)) }
  }

  private getCapabilityMatrix(control: SandboxControlService, implementation: unknown) {
    const profile = implementation === 'llbot' ? 'llbot' : 'napcat'
    const snapshot = control.getSnapshot()
    const existing = snapshot.participants.find((participant) => participant.kind === 'bot' && participant.implementation === profile)
    if (existing?.kind === 'bot') return control.getBotCapabilities(existing.id)
    return getOneBotCapabilityMatrix(profile)
  }

  private exportScene(control: SandboxControlService): SandboxMcpExport {
    return { testApiVersion: 1, exportedAt: new Date().toISOString(), scene: control.getSnapshot() }
  }

  private uploadMedia(control: SandboxControlService, args: Record<string, unknown>) {
    const dataBase64 = requireString(args.dataBase64, 'dataBase64')
    const digest = createHash('sha256').update(Buffer.from(dataBase64, 'base64')).digest('hex')
    if (args.sha256 !== undefined && args.sha256 !== digest) throw new SandboxMcpError('digest_mismatch', '媒体摘要不匹配')
    const media = control.storeMedia({ fileName: requireString(args.fileName, 'fileName'), mimeType: requireString(args.mimeType, 'mimeType'), dataBase64 })
    this.uploadedMedia.set(this.mediaCacheKey(args, media.id), { ...media, dataBase64 })
    return { mediaId: media.id, sha256: digest, media }
  }

  private async sendMessage(control: SandboxControlService, args: Record<string, unknown>) {
    const operatorId = requireString(args.operatorId, 'operatorId')
    const conversationId = requireString(args.conversationId, 'conversationId')
    const mediaIds = Array.isArray(args.mediaIds) ? args.mediaIds.map(String) : []
    const media = mediaIds.map((id) => this.uploadedMedia.get(this.mediaCacheKey(args, id)) ?? (() => { throw new SandboxMcpError('media_not_found', `媒体不存在：${id}`) })())
    const externalMediaUrls = Array.isArray(args.externalMediaUrls) ? args.externalMediaUrls.map(String) : []
    if (externalMediaUrls.some((value) => { try { return new URL(value).protocol !== 'https:' } catch { return true } })) throw new SandboxMcpError('invalid_media_url', '外部媒体只允许 HTTPS URL')
    const baseContent = typeof args.content === 'string' ? args.content.trim() : ''
    const content = [baseContent, ...externalMediaUrls].filter(Boolean).join('\n')
    const previousMessageIds = new Set(control.getSnapshot().messages.map(({ id }) => id))
    const result = media.length
      ? await control.sendStoredMediaMessage({ operatorId, conversationId, content, replyToMessageId: typeof args.replyToMessageId === 'string' ? args.replyToMessageId : undefined, media })
      : await control.sendMessage({ operatorId, conversationId, content: requireString(content, 'content'), replyToMessageId: typeof args.replyToMessageId === 'string' ? args.replyToMessageId : undefined })
    const spaceId = typeof args.spaceId === 'string' ? args.spaceId : undefined
    for (const message of control.getSnapshot().messages.filter(({ id }) => !previousMessageIds.has(id))) {
      const deliveries = control.getBotDeliveries({ messageId: message.id })
      if (!deliveries.length) this.appendEvent('message.created', message, spaceId)
      for (const delivery of deliveries) this.appendEvent('message.created', { ...message, recipientBotId: delivery.recipientBotId }, spaceId)
    }
    return { ...result, cursor: this.currentCursor() }
  }

  private mediaCacheKey(args: Record<string, unknown>, mediaId: string): string {
    return `${typeof args.spaceId === 'string' ? args.spaceId : 'main'}:${mediaId}`
  }

  private async performFriendAction(control: SandboxControlService, args: Record<string, unknown>) {
    const { idempotencyKey: _key, testRunId: _run, spaceId: _spaceId, ...input } = args
    const result = await control.performFriendAction(input as never)
    return { ...result, cursor: this.appendEvent('friend.action', input, typeof args.spaceId === 'string' ? args.spaceId : undefined), affected: [String(input.operatorId), String(input.targetId ?? input.requestId)] }
  }

  private async performGroupAction(control: SandboxControlService, args: Record<string, unknown>) {
    const { idempotencyKey: _key, testRunId: _run, spaceId: _spaceId, ...input } = args
    const result = await control.performGroupAction(input as never)
    return { ...result, cursor: this.appendEvent('group.action', input, typeof args.spaceId === 'string' ? args.spaceId : undefined), affected: [String(input.groupId ?? input.requestId), String(input.targetId ?? input.operatorId)] }
  }

  private async handleRequest(control: SandboxControlService, args: Record<string, unknown>) {
    const requestId = requireString(args.requestId, 'requestId')
    const request = control.getSnapshot().requests.find(({ id }) => id === requestId)
    if (!request) throw new SandboxMcpError('request_not_found', `申请不存在：${requestId}`)
    const operatorId = requireString(args.operatorId, 'operatorId')
    const target = request.targetId ? control.getSnapshot().participants.find(({ id }) => id === request.targetId) : undefined
    if (target?.kind === 'bot') throw new SandboxMcpError('robot_request_forbidden', '发给机器人的申请必须由被测机器人处理')
    if (request.type === 'friend') return this.performFriendAction(control, { operatorId, action: 'handle-request', requestId, approve: args.approve, idempotencyKey: args.idempotencyKey })
    return this.performGroupAction(control, { operatorId, action: 'handle-request', requestId, approve: args.approve, idempotencyKey: args.idempotencyKey })
  }

  private async waitFor(args: Record<string, unknown>, predicate: (event: SandboxMcpEvent) => boolean) {
    const cursor = asRecord(args.cursor)
    if (cursor.epoch !== this.epoch) throw new SandboxMcpError('cursor_expired', '事件游标已过期', false, '请重新读取当前游标。')
    const sequence = Number(cursor.sequence)
    if (this.events.length && sequence < this.events[0].cursor.sequence - 1) throw new SandboxMcpError('cursor_expired', '事件游标已离开缓冲区')
    const timeoutMs = Math.min(Math.max(Number(args.timeoutSeconds ?? 30), 1), 120) * 1000
    const spaceId = typeof args.spaceId === 'string' ? args.spaceId : undefined
    const matches = () => this.events.find((event) => event.cursor.sequence > sequence && event.spaceId === spaceId && predicate(event))
    const existing = matches()
    if (existing) return { matched: true, event: existing, cursor: existing.cursor }
    return new Promise((resolve) => {
      const timer = setInterval(() => {
        const event = matches()
        if (!event) return
        clearInterval(timer)
        clearTimeout(timeout)
        resolve({ matched: true, event, cursor: event.cursor })
      }, 20)
      const timeout = setTimeout(() => {
        clearInterval(timer)
        resolve({ matched: false, reason: 'timeout', cursor: this.currentCursor() })
      }, timeoutMs)
    })
  }

  private async waitForChatLuna(control: SandboxControlService, args: Record<string, unknown>) {
    const cursor = asRecord(args.cursor)
    if (cursor.epoch !== this.epoch) throw new SandboxMcpError('cursor_expired', '事件游标已过期')
    const timeoutMs = Math.min(Math.max(Number(args.timeoutSeconds ?? 30), 1), 120) * 1000
    const matches = () => control.getChatLunaStates().find((state) => (!args.botParticipantId || state.botParticipantId === args.botParticipantId)
      && (!args.conversationId || state.conversationId === args.conversationId)
      && (args.thinking === undefined || state.thinking === args.thinking))
    const existing = matches()
    if (existing) return { matched: true, state: existing, cursor: this.currentCursor() }
    return new Promise((resolve) => {
      const timer = setInterval(() => {
        const state = matches()
        if (!state) return
        clearInterval(timer)
        clearTimeout(timeout)
        resolve({ matched: true, state, cursor: this.appendEvent('chatluna.state', state, typeof args.spaceId === 'string' ? args.spaceId : undefined) })
      }, 20)
      const timeout = setTimeout(() => {
        clearInterval(timer)
        resolve({ matched: false, reason: 'timeout', cursor: this.currentCursor() })
      }, timeoutMs)
    })
  }

  private async withIdempotency(credential: SandboxMcpCredential, tool: string, args: Record<string, unknown>, action: () => Promise<unknown>) {
    const key = requireString(args.idempotencyKey, 'idempotencyKey')
    const cacheKey = `${credential.id}:${this.epoch}:${tool}:${key}`
    const argumentsHash = createHash('sha256').update(stableValue(args)).digest('hex')
    const cached = this.idempotency.get(cacheKey)
    if (cached) {
      if (cached.argumentsHash !== argumentsHash) throw new SandboxMcpError('idempotency_conflict', '幂等 Key 已被不同参数使用')
      return structuredClone(cached.result)
    }
    const result = await action()
    this.idempotency.set(cacheKey, { argumentsHash, result: structuredClone(result) })
    return result
  }

  private applyEnvironmentChanges(control: SandboxControlService, args: Record<string, unknown>) {
    this.assertRevision(control, args.expectedRevision)
    const snapshot = structuredClone(control.getSnapshot())
    const changes = Array.isArray(args.changes) ? args.changes : []
    for (const raw of changes) {
      const change = asRecord(raw)
      const action = requireString(change.action, 'change.action')
      const data = asRecord(change.data)
      if (action === 'create-user') snapshot.participants.push({ kind: 'user', id: requireString(data.id, 'id'), name: requireString(data.name, 'name') })
      else if (action === 'create-bot') snapshot.participants.push({ kind: 'bot', id: requireString(data.id, 'id'), name: requireString(data.name, 'name'), implementation: data.implementation === 'llbot' ? 'llbot' : 'napcat', enabled: data.enabled !== false })
      else if (action === 'create-group') snapshot.groups.push({ id: requireString(data.id, 'id'), name: requireString(data.name, 'name'), members: Array.isArray(data.members) ? data.members as never : [], announcements: [] })
      else if (action === 'update-user') {
        const participant = snapshot.participants.find(({ id, kind }) => id === data.id && kind === 'user')
        if (!participant) throw new SandboxMcpError('participant_not_found', `用户不存在：${String(data.id)}`)
        participant.name = requireString(data.name, 'name')
        participant.avatar = typeof data.avatar === 'string' ? data.avatar : undefined
      } else if (action === 'update-bot' || action === 'set-capabilities') {
        const participant = snapshot.participants.find(({ id, kind }) => id === data.id && kind === 'bot')
        if (!participant || participant.kind !== 'bot') throw new SandboxMcpError('participant_not_found', `机器人不存在：${String(data.id)}`)
        if (action === 'update-bot') {
          participant.name = requireString(data.name, 'name')
          participant.implementation = data.implementation === 'llbot' ? 'llbot' : 'napcat'
          participant.enabled = data.enabled !== false
        }
        participant.disabledCapabilities = Array.isArray(data.disabledCapabilities) ? data.disabledCapabilities.map(String) : undefined
      } else if (action === 'update-group') {
        const group = snapshot.groups.find(({ id }) => id === data.id)
        if (!group) throw new SandboxMcpError('group_not_found', `群组不存在：${String(data.id)}`)
        group.name = requireString(data.name, 'name')
        if (Array.isArray(data.members)) group.members = data.members as never
      } else if (action === 'set-friendship') {
        const participantIds = [requireString(data.firstId, 'firstId'), requireString(data.secondId, 'secondId')].sort() as [string, string]
        const friendshipId = `friend:${participantIds[0]}:${participantIds[1]}`
        snapshot.friendships = snapshot.friendships.filter(({ id }) => id !== friendshipId)
        if (data.enabled !== false) snapshot.friendships.push({ id: friendshipId, participantIds, remarks: {}, createdAt: new Date().toISOString() })
        const conversationId = createDirectConversationId(...participantIds)
        if (data.enabled !== false && !snapshot.conversations.some(({ id }) => id === conversationId)) snapshot.conversations.push({ id: conversationId, type: 'direct', participantIds, messageIds: [] })
      }
      else throw new SandboxMcpError('unsupported_change', `不支持的环境变更：${action}`)
    }
    control.replaceScene(snapshot)
    return { revision: control.getSnapshot().revision, cursor: this.currentCursor(), affected: changes.map((change) => String(asRecord(change).action)) }
  }

  private prepareDestructiveAction(control: SandboxControlService, credential: SandboxMcpCredential, args: Record<string, unknown>) {
    this.assertRevision(control, args.expectedRevision)
    const tool = requireString(args.tool, 'tool')
    const toolArguments = asRecord(args.arguments)
    const token = randomBytes(32).toString('base64url')
    this.confirmations.set(token, { credentialId: credential.id, tool, argumentsHash: createHash('sha256').update(stableValue(toolArguments)).digest('hex'), revision: control.getSnapshot().revision, expiresAt: Date.now() + 60_000 })
    return { confirmationToken: token, expiresInSeconds: 60, revision: control.getSnapshot().revision }
  }

  private runDestructive(control: SandboxControlService, credential: SandboxMcpCredential, tool: string, args: Record<string, unknown>, action: () => void) {
    const token = requireString(args.confirmationToken, 'confirmationToken')
    const confirmation = this.confirmations.get(token)
    this.confirmations.delete(token)
    const actionArgs = { ...args }; delete actionArgs.confirmationToken
    if (!confirmation || confirmation.expiresAt < Date.now() || confirmation.credentialId !== credential.id || confirmation.tool !== tool || confirmation.revision !== control.getSnapshot().revision || confirmation.argumentsHash !== createHash('sha256').update(stableValue(actionArgs)).digest('hex')) {
      throw new SandboxMcpError('confirmation_required', '破坏性操作需要有效的一次性确认令牌')
    }
    action()
    this.rotateEpoch()
    return { revision: control.getSnapshot().revision, cursor: this.currentCursor() }
  }

  private deleteEnvironmentEntity(control: SandboxControlService, args: Record<string, unknown>) {
    const kind = requireString(args.kind, 'kind')
    const id = requireString(args.id, 'id')
    if (kind === 'user') control.deleteUser({ id })
    else if (kind === 'bot') control.deleteBot({ id })
    else if (kind === 'group') control.deleteGroup({ id })
    else throw new SandboxMcpError('invalid_arguments', `未知实体类型：${kind}`)
  }

  private importScene(control: SandboxControlService, args: Record<string, unknown>) {
    const document = asRecord(args.document)
    if (document.testApiVersion !== 1) throw new SandboxMcpError('unsupported_scene_version', '仅支持 testApiVersion 1')
    control.replaceScene(asRecord(document.scene) as unknown as SandboxSnapshot)
  }

  private assertRevision(control: SandboxControlService, value: unknown) {
    if (Number(value) !== control.getSnapshot().revision) throw new SandboxMcpError('revision_conflict', '场景版本已变化，请重新读取快照')
  }

  private requireTestSpaces(): SandboxTestSpaceService {
    if (!this.testSpaces) throw new SandboxMcpError('test_spaces_unavailable', 'AI 测试空间服务不可用')
    return this.testSpaces
  }

  private getOwnedTestSpace(credential: SandboxMcpCredential, args: Record<string, unknown>) {
    const spaceId = requireString(args.spaceId, 'spaceId')
    const space = this.requireTestSpaces().getSpace(spaceId)
    if (space.controllerId !== credential.id) throw new SandboxMcpError('space_forbidden', '测试凭证无权读取此空间')
    return space
  }

  private resolveControl(credential: SandboxMcpCredential, args: Record<string, unknown>, mutation: boolean): SandboxControlService {
    if (typeof args.spaceId !== 'string' || !args.spaceId.trim()) {
      if (mutation && this.testSpaces) throw new SandboxMcpError('space_id_required', 'MCP 修改操作必须显式指定 AI 测试空间', false, '请先调用 create_test_space，再携带返回的 spaceId。')
      return this.control
    }
    try {
      return mutation
        ? this.requireTestSpaces().requireAiControl(args.spaceId, credential.id)
        : this.requireTestSpaces().requireReadable(args.spaceId, credential.id)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI 测试空间不可用'
      const code = message.includes('用户接管') ? 'space_taken_over' : message.includes('无权') ? 'space_forbidden' : message.includes('不存在') ? 'space_not_found' : 'space_unavailable'
      throw new SandboxMcpError(code, message, false, '请重新读取空间状态后重试。')
    }
  }

  private completeTestSpace(credential: SandboxMcpCredential, args: Record<string, unknown>, failed: boolean) {
    const spaceId = requireString(args.spaceId, 'spaceId')
    const space = failed
      ? this.requireTestSpaces().failSpace(spaceId, credential.id)
      : this.requireTestSpaces().completeSpace(spaceId, credential.id)
    return { spaceId, status: space.status, revision: space.snapshot.revision, cursor: this.appendEvent(`test-space.${space.status}`, { spaceId }, spaceId) }
  }

  private reactivateTestSpace(credential: SandboxMcpCredential, args: Record<string, unknown>) {
    const spaceId = requireString(args.spaceId, 'spaceId')
    const current = this.getOwnedTestSpace(credential, args)
    const space = this.requireTestSpaces().reactivateSpace(current.id, 'running')
    return { spaceId, status: space.status, revision: space.snapshot.revision, cursor: this.appendEvent('test-space.reactivated', { spaceId }, spaceId) }
  }

  private deleteTestSpace(credential: SandboxMcpCredential, args: Record<string, unknown>) {
    const spaceId = requireString(args.spaceId, 'spaceId')
    this.requireTestSpaces().deleteSpace(spaceId, credential.id)
    return { spaceId, deleted: true, cursor: this.appendEvent('test-space.deleted', { spaceId }, spaceId) }
  }

  private appendEvent(type: string, data: unknown, spaceId?: string): SandboxMcpEventCursor {
    const cursor = { epoch: this.epoch, sequence: ++this.sequence }
    this.events.push({ cursor, spaceId, type, data: structuredClone(data), createdAt: new Date().toISOString() })
    if (this.events.length > this.eventLimit) this.events.splice(0, this.events.length - this.eventLimit)
    return cursor
  }

  private rotateEpoch() {
    this.epoch = randomUUID()
    this.sequence = 0
    this.events = []
    this.idempotency.clear()
    this.confirmations.clear()
  }

  private requireCredential(token: string) {
    const credential = this.authenticate(token)
    if (!credential) throw new SandboxMcpError('unauthorized', 'Bearer 凭证无效或已禁用')
    return credential
  }

  private requireScope(credential: SandboxMcpCredential, scope: SandboxMcpScope) {
    if (!credential.scopes.includes(scope)) throw new SandboxMcpError('permission_denied', `凭证缺少 ${scope} 权限`)
  }

  private appendCallRecord(credential: SandboxMcpCredential, tool: string, args: Record<string, unknown>, sourceIp: string | undefined, status: 'success' | 'error', result?: unknown, errorCode?: string, durationMs = 0) {
    const affected = result && typeof result === 'object' && Array.isArray(Reflect.get(result, 'affected')) ? Reflect.get(result, 'affected').map(String) : []
    this.callRecords.push({ id: randomUUID(), createdAt: new Date().toISOString(), credentialName: credential.name, sourceIp, tool, testRunId: typeof args.testRunId === 'string' ? args.testRunId : undefined, durationMs, status, affected, errorCode })
    if (this.callRecords.length > this.callRecordLimit) this.callRecords.splice(0, this.callRecords.length - this.callRecordLimit)
  }

  private consumeRateLimit(credentialId: string, category: 'read' | 'mutation' | 'wait' | 'upload', limit: number) {
    const key = `${credentialId}:${category}`
    const now = Date.now()
    const window = (this.rateWindows.get(key) ?? []).filter((timestamp) => timestamp > now - 60_000)
    if (window.length >= limit) {
      const retryAfterMs = Math.max(1, 60_000 - (now - window[0]))
      throw new SandboxMcpError('rate_limited', '调用频率超过凭证限制', true, '请在 retryAfterMs 后重试。', undefined, retryAfterMs)
    }
    window.push(now)
    this.rateWindows.set(key, window)
  }

  private async withConcurrency<T>(credentialId: string, category: 'mutation' | 'wait' | 'upload', action: () => Promise<T>): Promise<T> {
    const key = `${credentialId}:${category}`
    const active = this.activeCalls.get(key) ?? 0
    if (active >= this.concurrentLimits[category]) throw new SandboxMcpError('concurrency_limited', '并发调用超过凭证限制', true, '请等待现有调用结束后重试。', undefined, 100)
    this.activeCalls.set(key, active + 1)
    try {
      return await action()
    } finally {
      const remaining = (this.activeCalls.get(key) ?? 1) - 1
      if (remaining > 0) this.activeCalls.set(key, remaining)
      else this.activeCalls.delete(key)
    }
  }

  private loadCredentials() {
    try {
      const credentials = JSON.parse(readFileSync(this.credentialFile, 'utf8'))
      this.credentials = Array.isArray(credentials) ? credentials : []
    } catch {
      // 凭证存储损坏时必须安全地回到“无有效凭证”，不能让可选 MCP 能力阻断 WebQQ。
      this.credentials = []
    }
  }

  private saveCredentials() {
    writeFileSync(this.credentialFile, `${JSON.stringify(this.credentials, null, 2)}\n`, { mode: 0o600 })
  }
}

export { TOOL_DEFINITIONS }
