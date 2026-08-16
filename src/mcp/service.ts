import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  normalizeFriendshipRemarks,
  normalizeGroupMemberFromUnknown,
  parseAccountProfileFromUnknown,
} from '../account-profile'
import type { SandboxControlService } from '../control-service'
import {
  DEFAULT_MODEL_REQUEST_PAGE_SIZE,
  MAIN_MODEL_REQUEST_SCOPE_ID,
  MAX_MODEL_REQUEST_PAGE_SIZE,
  mergeModelRequestRecordPages,
  type SandboxModelRequestStore,
} from '../model-request'
import type { SandboxTestSpaceService } from '../test-spaces'
import type { GetSandboxModelRequestRecordsInput, SandboxForwardNodeInput, SandboxMedia, SandboxImplementationProfile, SandboxSnapshot } from '../types'
import { createDirectConversationId, createGroupConversationId, isRecalledMessage, SandboxModelRequestCursorExpiredError, SandboxOneBotDebugCursorExpiredError } from '../types'
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
  unattributedModelRequests?: SandboxModelRequestStore
}

interface ToolDefinition {
  name: string
  scope: SandboxMcpScope
  description: string
  inputSchema: Record<string, unknown>
}

interface SandboxMcpWaitResult {
  matched: boolean
  reason?: string
  event?: SandboxMcpEvent
  cursor: SandboxMcpEventCursor
}

// —— 工具参数 JSON Schema ——
// MCP 客户端只能从 tools/list 的 inputSchema 学习参数契约（实际校验在 executeTool
// 内部完成），因此这里的 schema 是给 AI 消费者的文档，必须与实现保持一致。
const SPACE_REQUIRED = { type: 'string', description: 'AI 测试空间 ID，由 create_test_space 返回；修改与等待类操作必填' }
const SPACE_OPTIONAL = { type: 'string', description: 'AI 测试空间 ID；省略时读取主场景' }
const IDEMPOTENCY_KEY = { type: 'string', description: '幂等键；使用相同键重放时参数必须逐字段一致' }
const CURSOR = {
  type: 'object',
  properties: { epoch: { type: 'string' }, sequence: { type: 'number' } },
  required: ['epoch', 'sequence'],
  description: '事件游标，取自 get_server_info 或先前调用返回的 cursor；破坏性操作后游标失效需重新获取',
}
const TIMEOUT_SECONDS = { type: 'number', minimum: 1, maximum: 120, description: '等待超时秒数，默认 30' }
const OPERATOR_ID = { type: 'string', description: '操作者参与者 ID（十进制数字字符串）' }
const PARTICIPANT_ID = { type: 'string', description: '参与者 ID（十进制数字字符串）' }
const IMPLEMENTATION = { type: 'string', enum: ['napcat', 'llbot'] }
const GROUP_MEMBERS = {
  type: 'array',
  description: '完整成员列表，必须且只能包含一个 owner',
  items: {
    type: 'object',
    properties: {
      participantId: PARTICIPANT_ID,
      role: { type: 'string', enum: ['owner', 'admin', 'member'] },
      card: { type: 'string', description: '群名片' },
      title: { type: 'string', description: '专属头衔' },
    },
    required: ['participantId', 'role'],
  },
}

// 判别联合：每种环境变更各自声明必填字段，MCP 客户端不必从一段散文描述里猜参数。
const ENVIRONMENT_CHANGE_SCHEMAS = [
  {
    title: 'create-user',
    description: '创建普通用户',
    properties: {
      action: { const: 'create-user' },
      data: {
        type: 'object',
        properties: { id: PARTICIPANT_ID, name: { type: 'string' }, avatar: { type: 'string' } },
        required: ['id', 'name'],
      },
    },
  },
  {
    title: 'update-user',
    description: '整体替换用户资料；省略 avatar 表示清除头像',
    properties: {
      action: { const: 'update-user' },
      data: {
        type: 'object',
        properties: { id: PARTICIPANT_ID, name: { type: 'string' }, avatar: { type: 'string' } },
        required: ['id', 'name'],
      },
    },
  },
  {
    title: 'create-bot',
    description: '创建虚拟 OneBot 机器人；机器人 ID 不得与其他活动场景冲突（主场景默认机器人为 20001）',
    properties: {
      action: { const: 'create-bot' },
      data: {
        type: 'object',
        properties: {
          id: PARTICIPANT_ID,
          name: { type: 'string' },
          implementation: { ...IMPLEMENTATION, description: '协议实现，默认 napcat' },
          enabled: { type: 'boolean', description: '默认 true' },
          avatar: { type: 'string' },
          disabledCapabilities: { type: 'array', items: { type: 'string' }, description: '禁用的能力 ID' },
        },
        required: ['id', 'name'],
      },
    },
  },
  {
    title: 'update-bot',
    description: '局部更新机器人资料；只有显式提供的字段会被修改，省略 implementation 不会改变协议实现',
    properties: {
      action: { const: 'update-bot' },
      data: {
        type: 'object',
        properties: {
          id: PARTICIPANT_ID,
          name: { type: 'string' },
          implementation: IMPLEMENTATION,
          enabled: { type: 'boolean' },
          avatar: { type: 'string' },
          disabledCapabilities: { type: 'array', items: { type: 'string' } },
        },
        required: ['id'],
      },
    },
  },
  {
    title: 'set-capabilities',
    description: '整体替换机器人的能力禁用列表，不修改其他机器人资料',
    properties: {
      action: { const: 'set-capabilities' },
      data: {
        type: 'object',
        properties: { id: PARTICIPANT_ID, disabledCapabilities: { type: 'array', items: { type: 'string' } } },
        required: ['id'],
      },
    },
  },
  {
    title: 'create-group',
    description: '创建群组并自动建立群会话',
    properties: {
      action: { const: 'create-group' },
      data: {
        type: 'object',
        properties: { id: PARTICIPANT_ID, name: { type: 'string' }, avatar: { type: 'string' }, members: GROUP_MEMBERS },
        required: ['id', 'name'],
      },
    },
  },
  {
    title: 'update-group',
    description: '更新群名称；提供 members 时整体替换成员列表',
    properties: {
      action: { const: 'update-group' },
      data: {
        type: 'object',
        properties: { id: PARTICIPANT_ID, name: { type: 'string' }, avatar: { type: 'string' }, members: GROUP_MEMBERS },
        required: ['id', 'name'],
      },
    },
  },
  {
    title: 'set-friendship',
    description: '建立或解除好友关系；建立时自动创建私聊会话',
    properties: {
      action: { const: 'set-friendship' },
      data: {
        type: 'object',
        properties: {
          firstId: PARTICIPANT_ID,
          secondId: PARTICIPANT_ID,
          enabled: { type: 'boolean', description: '默认 true；false 表示解除好友关系' },
        },
        required: ['firstId', 'secondId'],
      },
    },
  },
].map((schema) => ({ type: 'object', ...schema, required: ['action', 'data'] }))

const TOOL_SCHEMAS: Record<string, Record<string, unknown>> = {
  get_server_info: { type: 'object', properties: {} },
  list_test_spaces: { type: 'object', properties: {} },
  get_test_space: { type: 'object', properties: { spaceId: SPACE_REQUIRED }, required: ['spaceId'] },
  get_scene_snapshot: { type: 'object', properties: { spaceId: SPACE_OPTIONAL } },
  list_conversations: {
    type: 'object',
    properties: {
      spaceId: SPACE_OPTIONAL,
      operatorId: OPERATOR_ID,
      limit: { type: 'number', minimum: 1, maximum: 200, description: '返回条数，默认 50' },
      offset: { type: 'number', minimum: 0 },
    },
    required: ['operatorId'],
  },
  get_conversation: {
    type: 'object',
    properties: {
      spaceId: SPACE_OPTIONAL,
      operatorId: OPERATOR_ID,
      conversationId: { type: 'string', description: '会话 ID，如 private:10001:20001 或 group:30001' },
      messageLimit: { type: 'number', minimum: 1, maximum: 100, description: '消息条数，默认 50' },
    },
    required: ['operatorId', 'conversationId'],
  },
  list_pending_requests: { type: 'object', properties: { spaceId: SPACE_OPTIONAL } },
  get_capability_matrix: {
    type: 'object',
    properties: {
      spaceId: SPACE_OPTIONAL,
      implementation: { type: 'string', enum: ['napcat', 'llbot'], description: '默认 napcat' },
    },
  },
  export_scene: { type: 'object', properties: { spaceId: SPACE_OPTIONAL } },
  upload_media: {
    type: 'object',
    properties: {
      spaceId: SPACE_REQUIRED,
      fileName: { type: 'string' },
      mimeType: { type: 'string' },
      dataBase64: { type: 'string', description: '文件内容的 Base64 编码' },
      sha256: { type: 'string', description: '可选内容摘要；不匹配时拒绝上传' },
    },
    required: ['spaceId', 'fileName', 'mimeType', 'dataBase64'],
  },
  send_message: {
    type: 'object',
    properties: {
      spaceId: SPACE_REQUIRED,
      operatorId: OPERATOR_ID,
      conversationId: { type: 'string' },
      content: { type: 'string', description: '消息文本；支持 <at id="参与者ID"/> 元素（群聊中触发命令通常需要 at 机器人）' },
      mediaIds: { type: 'array', items: { type: 'string' }, description: 'upload_media 返回的媒体 ID 列表' },
      externalMediaUrls: { type: 'array', items: { type: 'string' }, description: '外部媒体 URL，仅允许 HTTPS' },
      replyToMessageId: { type: 'string' },
      idempotencyKey: IDEMPOTENCY_KEY,
    },
    required: ['spaceId', 'operatorId', 'conversationId', 'idempotencyKey'],
    description: '等待机器人回复的正确模式：先记录发送前 cursor，发送后用 wait_for_message({ cursor: 发送前游标, authorId: 机器人ID }) 等待；同步回复在本调用返回前即已进入事件流，用返回的 cursor 会错过。',
  },
  send_forward_message: {
    type: 'object',
    properties: {
      spaceId: SPACE_REQUIRED,
      operatorId: OPERATOR_ID,
      conversationId: { type: 'string' },
      messageIds: { type: 'array', items: { type: 'string' }, maxItems: 100, description: '要引用的已有消息 ID；与 nodes 二选一，服务端按消息时间稳定排序' },
      nodes: {
        type: 'array',
        maxItems: 100,
        description: '显式节点；与 messageIds 二选一，可混合引用节点与自定义节点',
        items: {
          oneOf: [
            {
              type: 'object',
              properties: { type: { type: 'string', const: 'reference' }, messageId: { type: 'string' } },
              required: ['type', 'messageId'],
            },
            {
              type: 'object',
              properties: {
                type: { type: 'string', const: 'custom' },
                userId: PARTICIPANT_ID,
                nickname: { type: 'string' },
                content: { type: 'string' },
                createdAt: { type: 'string', description: '可选 ISO 8601 时间' },
                mediaIds: { type: 'array', items: { type: 'string' }, description: 'upload_media 返回的媒体 ID 列表' },
                forwardId: { type: 'string', description: '嵌套已有合并转发资源 ID' },
              },
              required: ['type', 'userId', 'nickname'],
            },
          ],
        },
      },
      idempotencyKey: IDEMPOTENCY_KEY,
    },
    required: ['spaceId', 'operatorId', 'conversationId', 'idempotencyKey'],
    description: 'messageIds 与 nodes 必须且只能提供一项。等待机器人回复时应先记录发送前 cursor，再用 wait_for_message 等待。',
  },
  get_forward_message: {
    type: 'object',
    properties: {
      spaceId: SPACE_OPTIONAL,
      operatorId: OPERATOR_ID,
      forwardId: { type: 'string', description: '合并转发资源 ID；与 messageId 至少提供一项' },
      messageId: { type: 'string', description: '外层合并转发消息 ID；与 forwardId 至少提供一项' },
    },
    required: ['operatorId'],
  },
  perform_friend_action: {
    type: 'object',
    properties: {
      spaceId: SPACE_REQUIRED,
      operatorId: OPERATOR_ID,
      action: { type: 'string', enum: ['request', 'handle-request', 'delete', 'set-remark', 'poke'] },
      targetId: { type: 'string', description: 'request/delete/set-remark/poke 的目标参与者 ID' },
      requestId: { type: 'string', description: 'handle-request 的申请 ID' },
      approve: { type: 'boolean', description: 'handle-request 是否批准' },
      comment: { type: 'string', description: 'request 附言' },
      remark: { type: 'string', description: 'set-remark 的备注' },
      conversationId: { type: 'string', description: 'poke 可选会话' },
      idempotencyKey: IDEMPOTENCY_KEY,
    },
    required: ['spaceId', 'operatorId', 'action', 'idempotencyKey'],
  },
  perform_group_action: {
    type: 'object',
    properties: {
      spaceId: SPACE_REQUIRED,
      operatorId: OPERATOR_ID,
      action: { type: 'string', enum: ['request-join', 'invite', 'handle-request', 'leave', 'kick', 'set-admin', 'transfer-owner', 'set-card', 'set-title', 'set-name', 'poke'] },
      groupId: { type: 'string' },
      targetId: { type: 'string' },
      requestId: { type: 'string', description: 'handle-request 的申请 ID' },
      approve: { type: 'boolean' },
      comment: { type: 'string' },
      enabled: { type: 'boolean', description: 'set-admin 是否授予' },
      card: { type: 'string', description: 'set-card 的群名片' },
      title: { type: 'string', description: 'set-title 的专属头衔，仅群主可设置；传空字符串清除' },
      name: { type: 'string', description: 'set-name 的群名' },
      conversationId: { type: 'string' },
      idempotencyKey: IDEMPOTENCY_KEY,
    },
    required: ['spaceId', 'operatorId', 'action', 'idempotencyKey'],
  },
  handle_request: {
    type: 'object',
    properties: {
      spaceId: SPACE_REQUIRED,
      operatorId: OPERATOR_ID,
      requestId: { type: 'string' },
      approve: { type: 'boolean' },
      idempotencyKey: IDEMPOTENCY_KEY,
    },
    required: ['spaceId', 'operatorId', 'requestId', 'approve', 'idempotencyKey'],
  },
  wait_for_event: {
    type: 'object',
    properties: {
      spaceId: SPACE_REQUIRED,
      cursor: CURSOR,
      type: { type: 'string', description: '事件类型过滤，如 message.created、scene.changed、friend.action' },
      timeoutSeconds: TIMEOUT_SECONDS,
    },
    required: ['spaceId', 'cursor'],
  },
  wait_for_message: {
    type: 'object',
    description: '等待消息事件；机器人常先回一条中间消息再给最终结果，需要最终回复时传 settleSeconds。',
    properties: {
      spaceId: SPACE_REQUIRED,
      cursor: CURSOR,
      conversationId: { type: 'string' },
      authorId: { type: 'string', description: '按消息作者过滤；等待机器人回复时传机器人 ID' },
      recipientBotId: { type: 'string', description: '按投递目标机器人过滤（send_message 与 send_forward_message 的投递事件携带）' },
      settleSeconds: {
        type: 'number',
        minimum: 1,
        maximum: 30,
        description: '静默期秒数；匹配到消息后继续收集同条件消息，直到静默期内不再出现新消息。返回 event 为最后一条，events 为完整序列。省略则匹配到第一条即返回',
      },
      timeoutSeconds: TIMEOUT_SECONDS,
    },
    required: ['spaceId', 'cursor'],
  },
  wait_for_onebot_action: {
    type: 'object',
    description: '等待被测插件真实发起的 OneBot action 调用记录，用于断言某条消息是否触发了预期 action 及其成败。成功时直接返回匹配记录与事件游标。',
    properties: {
      spaceId: SPACE_REQUIRED,
      cursor: CURSOR,
      botId: { type: 'string', description: '按发起机器人过滤' },
      action: { type: 'string', description: '按规范 action 过滤，并覆盖能力矩阵声明的全部别名' },
      requestedAction: { type: 'string', description: '仅精确匹配插件实际请求名' },
      status: { type: 'string', enum: ['success', 'error'], description: '按调用结果过滤' },
      timeoutSeconds: TIMEOUT_SECONDS,
    },
    required: ['spaceId', 'cursor'],
  },
  wait_for_chatluna_state: {
    type: 'object',
    description: '等待 ChatLuna 思考或完成状态；观察 thinking=true 时必须先启动等待，再并发调用 send_message，因为 send_message 会等待同步回复完成。',
    properties: {
      spaceId: SPACE_REQUIRED,
      cursor: CURSOR,
      botParticipantId: { type: 'string' },
      conversationId: { type: 'string' },
      thinking: { type: 'boolean' },
      timeoutSeconds: TIMEOUT_SECONDS,
    },
    required: ['spaceId', 'cursor'],
  },
  apply_environment_changes: {
    type: 'object',
    properties: {
      spaceId: SPACE_REQUIRED,
      expectedRevision: { type: 'number', description: '当前场景 revision（从 get_scene_snapshot 获取）；不一致时拒绝' },
      changes: {
        type: 'array',
        description: '按顺序原子应用的环境变更；任一项失败则整体不生效',
        items: { oneOf: ENVIRONMENT_CHANGE_SCHEMAS },
      },
    },
    required: ['spaceId', 'expectedRevision', 'changes'],
  },
  create_test_space: {
    type: 'object',
    properties: { name: { type: 'string' }, idempotencyKey: IDEMPOTENCY_KEY },
    required: ['idempotencyKey'],
  },
  complete_test_space: { type: 'object', properties: { spaceId: SPACE_REQUIRED, idempotencyKey: IDEMPOTENCY_KEY }, required: ['spaceId', 'idempotencyKey'] },
  fail_test_space: { type: 'object', properties: { spaceId: SPACE_REQUIRED, idempotencyKey: IDEMPOTENCY_KEY }, required: ['spaceId', 'idempotencyKey'] },
  reactivate_test_space: { type: 'object', properties: { spaceId: SPACE_REQUIRED, idempotencyKey: IDEMPOTENCY_KEY }, required: ['spaceId', 'idempotencyKey'] },
  delete_test_space: { type: 'object', properties: { spaceId: SPACE_REQUIRED, idempotencyKey: IDEMPOTENCY_KEY }, required: ['spaceId', 'idempotencyKey'] },
  prepare_destructive_action: {
    type: 'object',
    properties: {
      spaceId: SPACE_REQUIRED,
      expectedRevision: { type: 'number' },
      tool: { type: 'string', enum: ['delete_environment_entity', 'reset_scene', 'clear_scene', 'import_scene'] },
      arguments: { type: 'object', description: '必须与随后实际调用去除 confirmationToken 后的参数逐字段一致（含 spaceId），否则确认失败' },
    },
    required: ['spaceId', 'expectedRevision', 'tool', 'arguments'],
  },
  delete_environment_entity: {
    type: 'object',
    properties: {
      spaceId: SPACE_REQUIRED,
      kind: { type: 'string', enum: ['user', 'bot', 'group'] },
      id: { type: 'string' },
      confirmationToken: { type: 'string', description: 'prepare_destructive_action 返回的一次性令牌，60 秒内有效' },
    },
    required: ['spaceId', 'kind', 'id', 'confirmationToken'],
  },
  reset_scene: { type: 'object', properties: { spaceId: SPACE_REQUIRED, confirmationToken: { type: 'string' } }, required: ['spaceId', 'confirmationToken'] },
  clear_scene: { type: 'object', properties: { spaceId: SPACE_REQUIRED, confirmationToken: { type: 'string' } }, required: ['spaceId', 'confirmationToken'] },
  import_scene: {
    type: 'object',
    properties: {
      spaceId: SPACE_REQUIRED,
      document: {
        type: 'object',
        properties: { testApiVersion: { type: 'number', enum: [1] }, scene: { type: 'object' } },
        required: ['testApiVersion', 'scene'],
        description: 'export_scene 导出的文档；scene.revision 须与当前 revision 一致',
      },
      confirmationToken: { type: 'string' },
    },
    required: ['spaceId', 'document', 'confirmationToken'],
  },
  list_onebot_debug_records: {
    type: 'object',
    properties: {
      spaceId: SPACE_OPTIONAL,
      botId: { type: 'string' },
      direction: { type: 'string', enum: ['event', 'action'] },
      action: { type: 'string', description: '匹配规范 action，并覆盖能力矩阵声明的全部别名' },
      requestedAction: { type: 'string', description: '仅精确匹配插件实际请求名' },
      errorsOnly: { type: 'boolean' },
      limit: { type: 'number', description: '每页条数，默认 50，最大 200' },
      beforeSequence: { type: 'number', description: '新到旧分页游标：仅返回 sequence 更小的记录' },
    },
  },
  get_onebot_debug_record: {
    type: 'object',
    description: '按记录 ID 读取单条 OneBot 调试记录；仅在此接口允许 includeLargeValues 展开完整大型值。',
    properties: {
      spaceId: SPACE_OPTIONAL,
      recordId: { type: 'string' },
      includeLargeValues: { type: 'boolean', description: '显式展开完整大型值；列表接口不支持此参数' },
    },
    required: ['recordId'],
  },
  clear_onebot_debug_records: { type: 'object', properties: { spaceId: SPACE_REQUIRED }, required: ['spaceId'] },
  list_model_request_records: {
    type: 'object',
    properties: {
      scope: { type: 'string', enum: ['all', 'main', 'space', 'unattributed'], description: 'all 读取全部已归属空间，main 读取主环境，space 读取指定 AI 测试空间，unattributed 读取无法安全归属的记录' },
      spaceId: { type: 'string', description: 'AI 测试空间 ID；scope=space 且省略时读取主环境' },
      botId: { type: 'string' },
      conversationId: { type: 'string' },
      interactionId: { type: 'string' },
      model: { type: 'string' },
      errorsOnly: { type: 'boolean' },
      order: { type: 'string', enum: ['asc', 'desc'], description: '按创建时间正序或倒序，默认倒序' },
      limit: { type: 'number', description: '每页条数，默认 50，最大 200' },
      beforeSequence: { type: 'number', description: '新到旧分页游标：仅返回 sequence 更小的记录' },
      beforeCreatedAt: { type: 'string', description: '全部空间视图的时间游标：仅返回更早的记录' },
      beforeId: { type: 'string', description: '与 beforeCreatedAt 一起用于稳定分页' },
    },
    required: ['scope'],
  },
  get_model_request_record: {
    type: 'object',
    description: '按记录 ID 读取完整模型请求与原始响应体；流式响应以 SSE 原文返回。',
    properties: {
      scope: { type: 'string', enum: ['main', 'space', 'unattributed'] },
      spaceId: { type: 'string', description: 'AI 测试空间 ID；scope=space 且省略时读取主环境' },
      recordId: { type: 'string' },
    },
    required: ['scope', 'recordId'],
  },
  clear_model_request_records: {
    type: 'object',
    properties: {
      scope: { type: 'string', enum: ['space'], description: '仅允许清理已归属到 AI 测试空间的记录；未归属分类只能在 WebQQ 清理' },
      spaceId: SPACE_REQUIRED,
    },
    required: ['spaceId'],
  },
  list_mcp_call_records: { type: 'object', properties: { spaceId: SPACE_REQUIRED }, required: ['spaceId'] },
  clear_mcp_call_records: { type: 'object', properties: { spaceId: SPACE_REQUIRED }, required: ['spaceId'] },
}

const TOOL_DEFINITIONS: ToolDefinition[] = [
  ['get_server_info', 'read', '获取沙盒服务、测试 API 和 MCP 状态'],
  ['list_test_spaces', 'read', '列出当前 Sandbox 实例的全部 AI 测试空间'],
  ['get_test_space', 'read', '读取单个 AI 测试空间状态'],
  ['get_scene_snapshot', 'read', '读取当前模拟 QQ 场景快照'],
  ['list_conversations', 'read', '分页列出当前操作者可见会话'],
  ['get_conversation', 'read', '读取单个会话及其消息'],
  ['get_forward_message', 'read', '按操作者可见性读取合并转发资源详情'],
  ['list_pending_requests', 'read', '列出当前待处理好友和群申请'],
  ['get_capability_matrix', 'read', '读取 NapCat 或 LLBot 能力覆盖'],
  ['export_scene', 'read', '导出版本化 JSON 场景'],
  ['upload_media', 'interact', '上传供消息引用的媒体'],
  ['send_message', 'interact', '以明确操作者身份发送消息'],
  ['send_forward_message', 'interact', '以明确操作者身份发送合并转发消息'],
  ['perform_friend_action', 'interact', '执行好友申请、审批、删除、备注或戳一戳'],
  ['perform_group_action', 'interact', '执行入群、邀请、退群、管理或戳一戳'],
  ['handle_request', 'interact', '处理普通用户有权审批的申请'],
  ['wait_for_event', 'interact', '从事件游标等待匹配事件'],
  ['wait_for_message', 'interact', '从事件游标等待消息，可按静默期等待最终回复'],
  ['wait_for_chatluna_state', 'interact', '从事件游标等待 ChatLuna 状态'],
  ['wait_for_onebot_action', 'debug', '从事件游标等待插件发起的 OneBot action 调用'],
  ['apply_environment_changes', 'manage', '原子应用测试环境变更'],
  ['create_test_space', 'manage', '创建空白且隔离的 AI 测试空间'],
  ['complete_test_space', 'manage', '将 AI 测试空间标记为已完成并停止机器人'],
  ['fail_test_space', 'manage', '将 AI 测试空间标记为失败并停止机器人'],
  ['reactivate_test_space', 'manage', '重新激活已完成或失败的 AI 测试空间'],
  ['delete_test_space', 'manage', '删除 AI 测试空间；除非用户明确要求，否则测试完成后应默认保留'],
  ['prepare_destructive_action', 'manage', '准备一次性破坏性操作确认令牌'],
  ['delete_environment_entity', 'manage', '删除现有环境实体'],
  ['reset_scene', 'manage', '恢复初始场景（主场景为默认场景，测试空间为创建时的空白场景）'],
  ['clear_scene', 'manage', '清空当前场景'],
  ['import_scene', 'manage', '导入版本化 JSON 场景'],
  ['list_onebot_debug_records', 'debug', '读取 OneBot 调试记录（默认折叠大型值）'],
  ['get_onebot_debug_record', 'debug', '读取单条 OneBot 调试记录，可显式展开大型值'],
  ['clear_onebot_debug_records', 'debug', '清理 OneBot 调试记录'],
  ['list_model_request_records', 'debug', '读取模型请求记录'],
  ['get_model_request_record', 'debug', '读取单条模型请求记录，含完整请求体和原始响应体'],
  ['clear_model_request_records', 'debug', '清理指定 AI 测试空间的模型请求记录'],
  ['list_mcp_call_records', 'debug', '读取 MCP 调用记录'],
  ['clear_mcp_call_records', 'debug', '清理 MCP 调用记录'],
].map(([name, scope, description]) => ({ name, scope, description, inputSchema: TOOL_SCHEMAS[name as string] ?? { type: 'object', properties: {} } }) as ToolDefinition)

const READ_RESOURCES = [
  { uri: 'chatluna-sandbox://guide', name: 'MCP 测试指南' },
  { uri: 'chatluna-sandbox://scene-schema', name: '场景 JSON Schema' },
  { uri: 'chatluna-sandbox://capabilities/napcat', name: 'NapCat 能力基线' },
  { uri: 'chatluna-sandbox://capabilities/llbot', name: 'LLBot 能力基线' },
  { uri: 'chatluna-sandbox://errors', name: '稳定错误码' },
  { uri: 'chatluna-sandbox://examples', name: '工具调用示例' },
]

const ALL_SCOPES: SandboxMcpScope[] = ['read', 'interact', 'manage', 'debug']

function digestToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function isSandboxMcpScope(value: unknown): value is SandboxMcpScope {
  return typeof value === 'string' && ALL_SCOPES.includes(value as SandboxMcpScope)
}

function normalizeScopes(scopes: unknown, fallback?: SandboxMcpScope[]): SandboxMcpScope[] {
  const source = Array.isArray(scopes) ? scopes : []
  const normalized = [...new Set(source.filter(isSandboxMcpScope))]
  if (normalized.length) return normalized
  if (fallback?.length) return [...fallback]
  throw new SandboxMcpError('invalid_arguments', '至少选择一项有效权限')
}

function toPublicCredential(credential: SandboxMcpCredential): Omit<SandboxMcpCredential, 'tokenDigest'> {
  const { tokenDigest: _tokenDigest, ...publicCredential } = credential
  return structuredClone(publicCredential)
}

function toCreatedCredential(credential: SandboxMcpCredential): SandboxMcpCreatedCredential {
  if (!credential.token) throw new SandboxMcpError('internal_error', '凭证缺少明文 Token')
  return { ...toPublicCredential(credential), token: credential.token }
}

function normalizeStoredCredential(value: unknown): SandboxMcpCredential | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string' || typeof record.name !== 'string' || typeof record.tokenDigest !== 'string' || typeof record.createdAt !== 'string') return undefined
  if (!Array.isArray(record.scopes)) return undefined
  return {
    id: record.id,
    name: record.name,
    scopes: normalizeScopes(record.scopes, ['read']),
    enabled: record.enabled !== false,
    // 旧记录只有摘要，明文无法恢复；新记录必须带 token，供控制台再次查看。
    ...(typeof record.token === 'string' && record.token ? { token: record.token } : {}),
    tokenDigest: record.tokenDigest,
    createdAt: record.createdAt,
  }
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

function requireImplementation(value: unknown): SandboxImplementationProfile {
  // 非法值必须显式失败：静默回落到 napcat 会让测试控制器以为自己在测另一个协议。
  if (value === 'napcat' || value === 'llbot') return value
  throw new SandboxMcpError('invalid_arguments', `implementation 必须是 napcat 或 llbot：${String(value)}`)
}

function requireCapabilityList(value: unknown): string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) throw new SandboxMcpError('invalid_arguments', 'disabledCapabilities 必须是字符串数组')
  return value.map(String)
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
  private unattributedModelRequests?: SandboxModelRequestStore

  constructor(private control: SandboxControlService, options: SandboxMcpServiceOptions) {
    this.testSpaces = options.testSpaces
    this.unattributedModelRequests = options.unattributedModelRequests
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
    // 消息事件统一在此处从场景 diff 产生：被测机器人经 Koishi 适配器主动回复的
    // 消息不会经过 MCP 的 send_message，只有场景变更回调可见；若只发 scene.changed，
    // wait_for_message（匹配 message.created）将永远等不到机器人回复。
    const seenMessageIds = new Set(control.getSnapshot().messages.map(({ id }) => id))
    const recalledMessageIds = new Set(
      control.getSnapshot().messages.filter((message) => isRecalledMessage(message)).map(({ id }) => id),
    )
    control.onSceneMutation((snapshot) => {
      this.appendEvent('scene.changed', { revision: snapshot.revision }, spaceId)
      for (const message of snapshot.messages) {
        if (seenMessageIds.has(message.id)) continue
        seenMessageIds.add(message.id)
        // 此处不查投递记录：投递在 middleware 完成后才登记，场景通知时必然拿不到；
        // 带 recipientBotId 的投递事件由 send_message 等待投递完成后单独补发。
        this.appendEvent('message.created', message, spaceId)
      }
      // 撤回是生命周期变化：外部测试控制器可精确等待 message.recalled，并读取权威原文复盘。
      for (const message of snapshot.messages) {
        if (!isRecalledMessage(message) || recalledMessageIds.has(message.id)) continue
        recalledMessageIds.add(message.id)
        this.appendEvent('message.recalled', message, spaceId)
      }
    })
    // OneBot 调试记录并入事件流，wait_for_onebot_action 才能等待插件真实发起的调用，
    // 而不必轮询 list_onebot_debug_records。
    control.onOneBotDebugRecord((record) => this.appendEvent(`onebot.${record.direction}`, record, spaceId))
  }

  createCredential(name: string, scopes: SandboxMcpScope[] = ['read']): SandboxMcpCreatedCredential {
    const normalizedName = requireString(name, '凭证名称')
    const token = randomBytes(32).toString('base64url')
    const credential: SandboxMcpCredential = {
      id: randomUUID(),
      name: normalizedName,
      scopes: normalizeScopes(scopes, ['read']),
      enabled: true,
      token,
      tokenDigest: digestToken(token),
      createdAt: new Date().toISOString(),
    }
    this.credentials.push(credential)
    this.saveCredentials()
    return toCreatedCredential(credential)
  }

  listCredentials(): Array<Omit<SandboxMcpCredential, 'tokenDigest'>> {
    return this.credentials.map((credential) => toPublicCredential(credential))
  }

  getCredential(id: string): Omit<SandboxMcpCredential, 'tokenDigest'> {
    return toPublicCredential(this.requireStoredCredential(id))
  }

  updateCredential(id: string, input: { name?: string; scopes?: SandboxMcpScope[] }): Omit<SandboxMcpCredential, 'tokenDigest'> {
    const credential = this.requireStoredCredential(id)
    if (input.name !== undefined) credential.name = requireString(input.name, '凭证名称')
    if (input.scopes !== undefined) credential.scopes = normalizeScopes(input.scopes)
    this.saveCredentials()
    return toPublicCredential(credential)
  }

  rotateCredentialToken(id: string): SandboxMcpCreatedCredential {
    const credential = this.requireStoredCredential(id)
    const token = randomBytes(32).toString('base64url')
    credential.token = token
    credential.tokenDigest = digestToken(token)
    this.saveCredentials()
    return toCreatedCredential(credential)
  }

  setCredentialEnabled(id: string, enabled: boolean): void {
    const credential = this.requireStoredCredential(id)
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
    if (uri === 'chatluna-sandbox://guide') return { testApiVersion: 1, tools: TOOL_DEFINITIONS }
    if (uri === 'chatluna-sandbox://scene-schema') return { testApiVersion: { const: 1 }, scene: { type: 'object' } }
    if (uri === 'chatluna-sandbox://capabilities/napcat') return this.getCapabilityMatrix(this.control, 'napcat')
    if (uri === 'chatluna-sandbox://capabilities/llbot') return this.getCapabilityMatrix(this.control, 'llbot')
    if (uri === 'chatluna-sandbox://errors') return ['unauthorized', 'permission_denied', 'invalid_arguments', 'idempotency_conflict', 'cursor_expired', 'confirmation_required', 'revision_conflict', 'rate_limited', 'space_id_required', 'space_taken_over', 'space_not_found', 'space_unavailable', 'test_spaces_unavailable', 'internal_error']
    if (uri === 'chatluna-sandbox://examples') return {
      create_test_space: {
        name: '退群公告测试',
        idempotencyKey: 'example-space-1',
      },
      apply_environment_changes: {
        spaceId: '<create_test_space.spaceId>',
        expectedRevision: 0,
        changes: [
          { action: 'create-user', data: { id: '10001', name: '测试用户' } },
          { action: 'create-bot', data: { id: '20002', name: '被测机器人', implementation: 'napcat' } },
          { action: 'set-friendship', data: { firstId: '10001', secondId: '20002' } },
        ],
      },
      send_message: {
        spaceId: '<create_test_space.spaceId>',
        operatorId: '10001',
        conversationId: 'private:10001:20002',
        content: '你好',
        idempotencyKey: 'example-message-1',
      },
      send_forward_message: {
        spaceId: '<create_test_space.spaceId>',
        operatorId: '10001',
        conversationId: 'private:10001:20002',
        messageIds: ['<send_message.messageId>', '<另一条可见消息 ID>'],
        idempotencyKey: 'example-forward-1',
      },
      get_forward_message: {
        spaceId: '<create_test_space.spaceId>',
        operatorId: '10001',
        forwardId: '<send_forward_message.forwardId>',
      },
      自定义媒体转发节点: {
        说明: '先用 upload_media 上传媒体，再把 mediaId 放进 custom node；嵌套转发使用已有 forwardId。',
        send_forward_message: {
          spaceId: '<spaceId>', operatorId: '10001', conversationId: 'private:10001:20002', idempotencyKey: 'example-forward-2',
          nodes: [{ type: 'custom', userId: '10001', nickname: '测试用户', content: '图片节点', mediaIds: ['<upload_media.mediaId>'], forwardId: '<可选嵌套 forwardId>' }],
        },
      },
      等待机器人回复: {
        说明: 'send_message 与 send_forward_message 都会等待被测机器人的同步处理完成才返回，回复可能在返回前已进入事件流；必须用发送前的 cursor 加 authorId 过滤等待，用发送工具返回的 cursor 会错过同步回复。',
        步骤: [
          { tool: 'get_server_info', 得到: 'cursor（发送前）' },
          { tool: 'send_message', arguments: { spaceId: '<spaceId>', operatorId: '10001', conversationId: 'private:10001:20002', content: 'help', idempotencyKey: 'example-message-2' } },
          { tool: 'wait_for_message', arguments: { spaceId: '<spaceId>', cursor: '<发送前 cursor>', conversationId: 'private:10001:20002', authorId: '20002', timeoutSeconds: 30 } },
        ],
      },
      等待ChatLuna思考状态: {
        说明: 'thinking=true 是瞬时状态；先用发送前 cursor 启动 wait_for_chatluna_state，再并发调用 send_message。发送完成后可直接等待或读取 thinking=false。',
        并发调用: [
          { tool: 'wait_for_chatluna_state', arguments: { spaceId: '<spaceId>', cursor: '<发送前 cursor>', botParticipantId: '20002', conversationId: 'private:10001:20002', thinking: true, timeoutSeconds: 30 } },
          { tool: 'send_message', arguments: { spaceId: '<spaceId>', operatorId: '10001', conversationId: 'private:10001:20002', content: 'chatluna.chat 你好', idempotencyKey: 'example-chatluna-1' } },
        ],
      },
      等待机器人最终回复: {
        说明: '机器人常先回一条「稍等」再给最终结果。传 settleSeconds 后会持续收集同条件消息，直到静默期内不再出现新消息；返回的 event 是最后一条，events 是完整序列。',
        wait_for_message: { spaceId: '<spaceId>', cursor: '<发送前 cursor>', conversationId: 'private:10001:20002', authorId: '20002', settleSeconds: 5, timeoutSeconds: 60 },
      },
      断言插件发起的_OneBot_action: {
        说明: '机器人回复文本可能与实际执行结果不一致；要确认某次交互是否真的调用了 action 及其成败，用发送前 cursor 等待 onebot.action 事件。',
        wait_for_onebot_action: { spaceId: '<spaceId>', cursor: '<发送前 cursor>', botId: '20002', action: 'set_group_kick', timeoutSeconds: 30 },
      },
      群聊触发命令: {
        说明: '群聊中触发 Koishi 命令通常需要 at 机器人；content 支持 <at id="参与者ID"/> 元素。',
        send_message: { spaceId: '<spaceId>', operatorId: '10001', conversationId: 'group:30001', content: '<at id="20002"/> help', idempotencyKey: 'example-message-3' },
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
    if (tool === 'get_server_info') return { name: 'chatluna-sandbox', testApiVersion: 1, transport: 'streamable-http', stateless: true, cursor: this.currentCursor() }
    if (tool === 'list_test_spaces') return this.requireTestSpaces().listSpaces()
    if (tool === 'get_test_space') return this.getTestSpace(args)
    if (tool === 'create_test_space') return this.withIdempotency(credential, tool, args, async () => {
      const space = this.requireTestSpaces().createSpace({ name: typeof args.name === 'string' ? args.name : undefined })
      return { spaceId: space.id, status: space.status, revision: space.snapshot.revision, cursor: this.appendEvent('test-space.created', { spaceId: space.id }, space.id) }
    })
    if (tool === 'complete_test_space') return this.withIdempotency(credential, tool, args, async () => this.completeTestSpace(args, false))
    if (tool === 'fail_test_space') return this.withIdempotency(credential, tool, args, async () => this.completeTestSpace(args, true))
    if (tool === 'reactivate_test_space') return this.withIdempotency(credential, tool, args, async () => this.reactivateTestSpace(args))
    if (tool === 'delete_test_space') return this.withIdempotency(credential, tool, args, async () => this.deleteTestSpace(args))
    if (tool === 'list_model_request_records') return this.listModelRequestRecords(args)
    if (tool === 'get_model_request_record') return this.getModelRequestRecord(args)
    if (tool === 'clear_model_request_records') {
      if (args.scope === 'unattributed') {
        throw new SandboxMcpError('invalid_arguments', 'MCP 不能清理未归属模型请求记录')
      }
      return { cleared: this.resolveControl(args, true).clearModelRequestRecords() }
    }
    const activeControl = this.resolveControl(args, tool !== 'get_scene_snapshot' && tool !== 'list_conversations' && tool !== 'get_conversation' && tool !== 'get_forward_message' && tool !== 'list_pending_requests' && tool !== 'get_capability_matrix' && tool !== 'export_scene' && tool !== 'list_onebot_debug_records' && tool !== 'get_onebot_debug_record')
    if (tool === 'get_scene_snapshot') return activeControl.getSnapshot()
    if (tool === 'list_conversations') return this.listConversations(activeControl, args)
    if (tool === 'get_conversation') return this.getConversation(activeControl, args)
    if (tool === 'get_forward_message') return this.getForwardMessage(activeControl, args)
    if (tool === 'list_pending_requests') return activeControl.getSnapshot().requests
    if (tool === 'get_capability_matrix') return this.getCapabilityMatrix(activeControl, args.implementation)
    if (tool === 'export_scene') return this.exportScene(activeControl)
    if (tool === 'upload_media') return this.uploadMedia(activeControl, args)
    if (tool === 'send_message') return this.withIdempotency(credential, tool, args, async () => this.sendMessage(activeControl, args))
    if (tool === 'send_forward_message') return this.withIdempotency(credential, tool, args, async () => this.sendForwardMessage(activeControl, args))
    if (tool === 'perform_friend_action') return this.withIdempotency(credential, tool, args, async () => this.performFriendAction(activeControl, args))
    if (tool === 'perform_group_action') return this.withIdempotency(credential, tool, args, async () => this.performGroupAction(activeControl, args))
    if (tool === 'handle_request') return this.withIdempotency(credential, tool, args, async () => this.handleRequest(activeControl, args))
    if (tool === 'wait_for_event') return this.waitFor(args, (event) => !args.type || event.type === args.type)
    // authorId 过滤是「等待机器人回复」的关键：沙盒 send_message 会等待 middleware
    // 完成才返回，同步命令的回复在返回前已入事件流，消费者只能用「发送前 cursor +
    // authorId=机器人」的组合等待回复，否则会匹配到自己刚发的消息或错过回复。
    if (tool === 'wait_for_message') return this.waitForMessage(args, (event) => event.type === 'message.created'
      && (!args.conversationId || Reflect.get(event.data as object, 'conversationId') === args.conversationId)
      && (!args.authorId || Reflect.get(event.data as object, 'authorId') === args.authorId)
      && (!args.recipientBotId || Reflect.get(event.data as object, 'recipientBotId') === args.recipientBotId))
    if (tool === 'wait_for_onebot_action') return this.waitForOneBotAction(args)
    if (tool === 'wait_for_chatluna_state') return this.waitForChatLuna(activeControl, args)
    if (tool === 'apply_environment_changes') return this.applyEnvironmentChanges(activeControl, args)
    if (tool === 'prepare_destructive_action') return this.prepareDestructiveAction(activeControl, credential, args)
    if (tool === 'delete_environment_entity') return this.runDestructive(activeControl, credential, tool, args, () => this.deleteEnvironmentEntity(activeControl, args))
    if (tool === 'reset_scene') return this.runDestructive(activeControl, credential, tool, args, () => activeControl.resetScene())
    if (tool === 'clear_scene') return this.runDestructive(activeControl, credential, tool, args, () => activeControl.replaceScene({ revision: activeControl.getSnapshot().revision, participants: [], groups: [], conversations: [], messages: [], forwards: [], friendships: [], requests: [] }))
    if (tool === 'import_scene') return this.runDestructive(activeControl, credential, tool, args, () => this.importScene(activeControl, args))
    if (tool === 'list_onebot_debug_records') {
      if ('includeLargeValues' in args) {
        throw new SandboxMcpError('invalid_argument', '列表接口不允许 includeLargeValues；请使用 get_onebot_debug_record 展开单条记录。')
      }
      try {
        return activeControl.getOneBotDebugRecords({
          botId: typeof args.botId === 'string' ? args.botId : undefined,
          direction: args.direction === 'action' || args.direction === 'event' ? args.direction : undefined,
          action: typeof args.action === 'string' ? args.action : undefined,
          requestedAction: typeof args.requestedAction === 'string' ? args.requestedAction : undefined,
          errorsOnly: args.errorsOnly === true ? true : undefined,
          limit: typeof args.limit === 'number' ? args.limit : undefined,
          beforeSequence: typeof args.beforeSequence === 'number' ? args.beforeSequence : undefined,
        })
      } catch (error) {
        if (error instanceof SandboxOneBotDebugCursorExpiredError) {
          throw new SandboxMcpError('cursor_expired', error.message, false, error.earliestCursor === undefined
            ? '请重新从最新页开始读取。'
            : `请使用 earliestCursor=${error.earliestCursor} 恢复分页。`)
        }
        throw error
      }
    }
    if (tool === 'get_onebot_debug_record') {
      try {
        return activeControl.getOneBotDebugRecord({
          recordId: requireString(args.recordId, 'recordId'),
          includeLargeValues: args.includeLargeValues === true,
        })
      } catch (error) {
        throw new SandboxMcpError('record_not_found', error instanceof Error ? error.message : '调试记录不存在')
      }
    }
    if (tool === 'clear_onebot_debug_records') return { cleared: activeControl.clearOneBotDebugRecords() }
    if (tool === 'list_mcp_call_records') return structuredClone(this.callRecords).reverse()
    if (tool === 'clear_mcp_call_records') { const cleared = this.callRecords.length; this.callRecords = []; return { cleared } }
    throw new SandboxMcpError('tool_not_found', `工具不存在：${tool}`)
  }

  private listConversations(control: SandboxControlService, args: Record<string, unknown>) {
    const operatorId = requireString(args.operatorId, 'operatorId')
    // control 层消息分页上限为 100（control-service.ts assertMessageLimit），超出会直接抛错。
    const snapshot = control.getVisibleSnapshot(operatorId, 100)
    const limit = Math.min(Math.max(Number(args.limit ?? 50), 1), 200)
    const offset = Math.max(Number(args.offset ?? 0), 0)
    return { items: snapshot.conversations.slice(offset, offset + limit), nextOffset: offset + limit < snapshot.conversations.length ? offset + limit : undefined }
  }

  private getConversation(control: SandboxControlService, args: Record<string, unknown>) {
    const operatorId = requireString(args.operatorId, 'operatorId')
    const conversationId = requireString(args.conversationId, 'conversationId')
    const snapshot = control.getVisibleSnapshot(operatorId, Math.min(Math.max(Number(args.messageLimit ?? 50), 1), 100))
    const conversation = snapshot.conversations.find(({ id }) => id === conversationId)
    if (!conversation) throw new SandboxMcpError('conversation_not_found', `会话不存在或不可见：${conversationId}`)
    const messageIds = new Set(conversation.messageIds)
    return { conversation, messages: snapshot.messages.filter(({ id }) => messageIds.has(id)) }
  }

  private getForwardMessage(control: SandboxControlService, args: Record<string, unknown>) {
    const operatorId = requireString(args.operatorId, 'operatorId')
    const forwardId = typeof args.forwardId === 'string' ? args.forwardId : undefined
    const messageId = typeof args.messageId === 'string' ? args.messageId : undefined
    if (!forwardId?.trim() && !messageId?.trim()) {
      throw new SandboxMcpError('invalid_arguments', 'forwardId 与 messageId 至少需要提供一项')
    }
    return control.getForwardMessage({ operatorId, forwardId, messageId })
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
    // 消息创建事件已由场景变更监听统一产生（observeControl）；此处只补发
    // 投递完成事件（带 recipientBotId），供 wait_for_message 按接收机器人过滤。
    for (const message of control.getSnapshot().messages.filter(({ id }) => !previousMessageIds.has(id))) {
      for (const delivery of control.getBotDeliveries({ messageId: message.id })) {
        this.appendEvent('message.created', { ...message, recipientBotId: delivery.recipientBotId }, spaceId)
      }
    }
    return { ...result, cursor: this.currentCursor() }
  }

  private async sendForwardMessage(control: SandboxControlService, args: Record<string, unknown>) {
    const operatorId = requireString(args.operatorId, 'operatorId')
    const conversationId = requireString(args.conversationId, 'conversationId')
    const operator = control.getSnapshot().participants.find(({ id }) => id === operatorId)
    if (operator?.kind === 'bot') {
      throw new SandboxMcpError('permission_denied', 'MCP 测试控制器不能代机器人发送合并转发；请由被测插件调用 OneBot action')
    }
    const messageIds = Array.isArray(args.messageIds) ? args.messageIds.map(String) : []
    const rawNodes = Array.isArray(args.nodes) ? args.nodes : []
    if (!!messageIds.length === !!rawNodes.length) {
      throw new SandboxMcpError('invalid_arguments', 'messageIds 与 nodes 必须且只能提供一项')
    }
    const nodes = rawNodes.length ? this.resolveForwardNodes(args, rawNodes) : undefined
    const previousMessageIds = new Set(control.getSnapshot().messages.map(({ id }) => id))
    const { result, delivery } = control.startForwardMessage({
      operatorId,
      conversationId,
      ...(messageIds.length ? { messageIds } : {}),
      ...(nodes ? { nodes } : {}),
    })
    await delivery
    const spaceId = typeof args.spaceId === 'string' ? args.spaceId : undefined
    // 场景监听已产生外层消息事件；这里只补齐按接收机器人过滤所需的投递事件。
    for (const message of control.getSnapshot().messages.filter(({ id }) => !previousMessageIds.has(id))) {
      for (const item of control.getBotDeliveries({ messageId: message.id })) {
        this.appendEvent('message.created', { ...message, recipientBotId: item.recipientBotId }, spaceId)
      }
    }
    return { ...result, cursor: this.currentCursor() }
  }

  private resolveForwardNodes(args: Record<string, unknown>, rawNodes: unknown[]): SandboxForwardNodeInput[] {
    return rawNodes.map((rawNode, index) => {
      const node = asRecord(rawNode)
      if (node.type === 'reference') {
        return { type: 'reference', messageId: requireString(node.messageId, `nodes[${index}].messageId`) }
      }
      if (node.type !== 'custom') {
        throw new SandboxMcpError('invalid_arguments', `nodes[${index}].type 必须是 reference 或 custom`)
      }
      const mediaIds = Array.isArray(node.mediaIds) ? node.mediaIds.map(String) : []
      const media = mediaIds.map((id) => this.uploadedMedia.get(this.mediaCacheKey(args, id))
        ?? (() => { throw new SandboxMcpError('media_not_found', `媒体不存在：${id}`) })())
      return {
        type: 'custom',
        userId: requireString(node.userId, `nodes[${index}].userId`),
        nickname: requireString(node.nickname, `nodes[${index}].nickname`),
        content: typeof node.content === 'string' ? node.content : '',
        ...(typeof node.createdAt === 'string' ? { createdAt: node.createdAt } : {}),
        ...(media.length ? { media } : {}),
        ...(typeof node.forwardId === 'string' ? { forwardId: node.forwardId } : {}),
      }
    })
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

  private async waitForOneBotAction(args: Record<string, unknown>) {
    const waited = await this.waitFor(args, (event) => {
      if (event.type !== 'onebot.action') return false
      const data = event.data as {
        botId?: string
        status?: string
        action?: string
        requestedAction?: string
        matchedAlias?: string
      }
      if (args.botId && data.botId !== args.botId) return false
      if (args.status && data.status !== args.status) return false
      if (args.requestedAction && data.requestedAction !== args.requestedAction) return false
      if (args.action) {
        const action = String(args.action)
        if (data.action !== action && data.requestedAction !== action && data.matchedAlias !== action) return false
      }
      return true
    }) as SandboxMcpWaitResult
    if (!waited.matched || !waited.event) return waited
    // 成功时直接返回匹配记录，避免消费者再从通用 event.data 中解包旧 type 字段。
    return {
      matched: true,
      record: waited.event.data,
      cursor: waited.cursor,
    }
  }

  // 机器人常先回一条「稍等」再给最终结果。静默期内继续收集同条件消息，
  // 返回最后一条与完整序列，避免消费者把中间回复当成最终回复。
  private async waitForMessage(args: Record<string, unknown>, predicate: (event: SandboxMcpEvent) => boolean) {
    const first = await this.waitFor(args, predicate) as SandboxMcpWaitResult
    const settleSeconds = Math.min(Math.max(Number(args.settleSeconds ?? 0), 0), 30)
    if (settleSeconds < 1 || !first.matched || !first.event) return first
    const events = [first.event]
    let cursor = first.cursor
    for (;;) {
      const next = await this.waitFor({ ...args, cursor, timeoutSeconds: settleSeconds }, predicate) as SandboxMcpWaitResult
      if (!next.matched || !next.event) break
      events.push(next.event)
      cursor = next.cursor
    }
    return { matched: true, event: events[events.length - 1], events, cursor }
  }

  private async waitFor(args: Record<string, unknown>, predicate: (event: SandboxMcpEvent) => boolean) {    const cursor = asRecord(args.cursor)
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

  private async applyEnvironmentChanges(control: SandboxControlService, args: Record<string, unknown>) {
    this.assertRevision(control, args.expectedRevision)
    const snapshot = structuredClone(control.getSnapshot())
    const changes = Array.isArray(args.changes) ? args.changes : []
    for (const raw of changes) {
      const change = asRecord(raw)
      const action = requireString(change.action, 'change.action')
      const data = asRecord(change.data)
      if (action === 'create-user') {
        const profile = parseAccountProfileFromUnknown(data.profile)
        const id = requireString(data.id, 'id')
        snapshot.participants.push({
          kind: 'user',
          id,
          name: requireString(data.name, 'name'),
          avatar: await control.importAvatar('user', id, typeof data.avatar === 'string' ? data.avatar : undefined),
          ...(profile ? { profile } : {}),
        })
      }
      else if (action === 'create-bot') {
        const profile = parseAccountProfileFromUnknown(data.profile)
        const id = requireString(data.id, 'id')
        snapshot.participants.push({
          kind: 'bot',
          id,
          name: requireString(data.name, 'name'),
          implementation: data.implementation === undefined ? 'napcat' : requireImplementation(data.implementation),
          enabled: data.enabled !== false,
          avatar: await control.importAvatar('bot', id, typeof data.avatar === 'string' ? data.avatar : undefined),
          disabledCapabilities: requireCapabilityList(data.disabledCapabilities),
          ...(profile ? { profile } : {}),
        })
      }
      else if (action === 'create-group') {
        const groupId = requireString(data.id, 'id')
        const members = Array.isArray(data.members)
          ? data.members.flatMap((member) => {
            const normalized = normalizeGroupMemberFromUnknown(member)
            return normalized ? [normalized] : []
          })
          : []
        snapshot.groups.push({
          id: groupId,
          name: requireString(data.name, 'name'),
          avatar: await control.importAvatar('group', groupId, typeof data.avatar === 'string' ? data.avatar : undefined),
          members,
          announcements: [],
        })
        // 与 set-friendship 自动创建私聊会话保持一致：建群即建群会话，
        // 否则 AI 需要先执行一次群操作才能拿到可发消息的会话。
        const conversationId = createGroupConversationId(groupId)
        if (!snapshot.conversations.some(({ id }) => id === conversationId)) snapshot.conversations.push({ id: conversationId, type: 'group', groupId, messageIds: [] })
      }
      else if (action === 'update-user') {
        const participant = snapshot.participants.find(({ id, kind }) => id === data.id && kind === 'user')
        if (!participant) throw new SandboxMcpError('participant_not_found', `用户不存在：${String(data.id)}`)
        participant.name = requireString(data.name, 'name')
        participant.avatar = await control.importAvatar('user', participant.id, typeof data.avatar === 'string' ? data.avatar : undefined)
        if (data.profile !== undefined) {
          const profile = parseAccountProfileFromUnknown(data.profile)
          if (profile) participant.profile = profile
          else delete participant.profile
        }
      } else if (action === 'update-bot' || action === 'set-capabilities') {
        const participant = snapshot.participants.find(({ id, kind }) => id === data.id && kind === 'bot')
        if (!participant || participant.kind !== 'bot') throw new SandboxMcpError('participant_not_found', `机器人不存在：${String(data.id)}`)
        if (action === 'update-bot') {
          // 局部补丁语义：只改显式提供的字段。旧实现把省略的 implementation 回落成
          // napcat，导致「只改昵称」会静默把 LLBot 重置为 NapCat。
          if (data.name !== undefined) participant.name = requireString(data.name, 'name')
          if (data.avatar !== undefined) participant.avatar = await control.importAvatar('bot', participant.id, typeof data.avatar === 'string' ? data.avatar : undefined)
          if (data.implementation !== undefined) participant.implementation = requireImplementation(data.implementation)
          if (data.enabled !== undefined) participant.enabled = data.enabled !== false
          if (data.disabledCapabilities !== undefined) participant.disabledCapabilities = requireCapabilityList(data.disabledCapabilities)
          if (data.profile !== undefined) {
            const profile = parseAccountProfileFromUnknown(data.profile)
            if (profile) participant.profile = profile
            else delete participant.profile
          }
        } else {
          participant.disabledCapabilities = requireCapabilityList(data.disabledCapabilities)
        }
      } else if (action === 'update-group') {
        const group = snapshot.groups.find(({ id }) => id === data.id)
        if (!group) throw new SandboxMcpError('group_not_found', `群组不存在：${String(data.id)}`)
        group.name = requireString(data.name, 'name')
        if (data.avatar !== undefined) group.avatar = await control.importAvatar('group', group.id, typeof data.avatar === 'string' ? data.avatar : undefined)
        if (Array.isArray(data.members)) {
          group.members = data.members.flatMap((member) => {
            const normalized = normalizeGroupMemberFromUnknown(member)
            return normalized ? [normalized] : []
          })
        }
      } else if (action === 'set-friendship') {
        const participantIds = [requireString(data.firstId, 'firstId'), requireString(data.secondId, 'secondId')].sort() as [string, string]
        const friendshipId = `friend:${participantIds[0]}:${participantIds[1]}`
        snapshot.friendships = snapshot.friendships.filter(({ id }) => id !== friendshipId)
        if (data.enabled !== false) {
          snapshot.friendships.push({
            id: friendshipId,
            participantIds,
            remarks: normalizeFriendshipRemarks(data.remarks),
            createdAt: new Date().toISOString(),
          })
        }
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

  private getTestSpace(args: Record<string, unknown>) {
    const spaceId = requireString(args.spaceId, 'spaceId')
    return this.requireTestSpaces().getSpace(spaceId)
  }

  private requireUnattributedModelRequests(): SandboxModelRequestStore {
    if (!this.unattributedModelRequests) throw new SandboxMcpError('internal_error', '未归属模型请求库不可用')
    return this.unattributedModelRequests
  }

  private resolveModelRequestScope(args: Record<string, unknown>) {
    if (args.scope === 'unattributed') return { kind: 'unattributed' as const }
    if (args.scope === 'all') return { kind: 'all' as const }
    if (args.scope === 'main') return { kind: 'main' as const }
    if (args.scope !== 'space') throw new SandboxMcpError('invalid_arguments', 'scope 必须是 all、main、space 或 unattributed')
    const spaceId = typeof args.spaceId === 'string' && args.spaceId.trim() ? args.spaceId.trim() : MAIN_MODEL_REQUEST_SCOPE_ID
    if (spaceId === MAIN_MODEL_REQUEST_SCOPE_ID) return { kind: 'main' as const }
    return { kind: 'space' as const, spaceId }
  }

  private listModelRequestRecords(args: Record<string, unknown>) {
    const query: GetSandboxModelRequestRecordsInput = {
      botId: typeof args.botId === 'string' ? args.botId : undefined,
      conversationId: typeof args.conversationId === 'string' ? args.conversationId : undefined,
      interactionId: typeof args.interactionId === 'string' ? args.interactionId : undefined,
      model: typeof args.model === 'string' ? args.model : undefined,
      errorsOnly: args.errorsOnly === true ? true : undefined,
      order: args.order === 'asc' ? 'asc' : args.order === 'desc' ? 'desc' : undefined,
      limit: typeof args.limit === 'number' ? args.limit : undefined,
      beforeSequence: typeof args.beforeSequence === 'number' ? args.beforeSequence : undefined,
      beforeCreatedAt: typeof args.beforeCreatedAt === 'string' ? args.beforeCreatedAt : undefined,
      beforeId: typeof args.beforeId === 'string' ? args.beforeId : undefined,
    }
    try {
      const scope = this.resolveModelRequestScope(args)
      if (scope.kind === 'unattributed') return this.requireUnattributedModelRequests().getRecords(query)
      if (scope.kind === 'all') {
        const limit = Math.min(Math.max(Number(query.limit ?? DEFAULT_MODEL_REQUEST_PAGE_SIZE) || DEFAULT_MODEL_REQUEST_PAGE_SIZE, 1), MAX_MODEL_REQUEST_PAGE_SIZE)
        const federatedQuery = { ...query, beforeSequence: undefined }
        return mergeModelRequestRecordPages([
          this.control.getModelRequestRecords(federatedQuery),
          ...(this.testSpaces?.listSpaces() ?? []).map((space) => this.resolveControl({ spaceId: space.id }, false).getModelRequestRecords(federatedQuery)),
        ], limit, query.order === 'asc' ? 'asc' : 'desc')
      }
      if (scope.kind === 'main') return this.control.getModelRequestRecords(query)
      return this.resolveControl({ spaceId: scope.spaceId }, false).getModelRequestRecords(query)
    } catch (error) {
      if (error instanceof SandboxModelRequestCursorExpiredError) {
        throw new SandboxMcpError('cursor_expired', error.message, false, error.earliestCursor === undefined
          ? '请重新从最新页开始读取。'
          : `请使用 earliestCursor=${error.earliestCursor} 恢复分页。`)
      }
      throw error
    }
  }

  private getModelRequestRecord(args: Record<string, unknown>) {
    const recordId = requireString(args.recordId, 'recordId')
    try {
      const scope = this.resolveModelRequestScope(args)
      if (scope.kind === 'unattributed') {
        const record = this.requireUnattributedModelRequests().getRecord(recordId)
        if (!record) throw new Error(`模型请求记录不存在：${recordId}`)
        return record
      }
      if (scope.kind === 'main') return this.control.getModelRequestRecord({ recordId })
      return this.resolveControl({ spaceId: scope.spaceId }, false).getModelRequestRecord({ recordId })
    } catch (error) {
      if (error instanceof SandboxMcpError) throw error
      throw new SandboxMcpError('record_not_found', error instanceof Error ? error.message : '模型请求记录不存在')
    }
  }

  private resolveControl(args: Record<string, unknown>, mutation: boolean): SandboxControlService {
    if (typeof args.spaceId !== 'string' || !args.spaceId.trim()) {
      if (mutation && this.testSpaces) throw new SandboxMcpError('space_id_required', 'MCP 修改操作必须显式指定 AI 测试空间', false, '请先调用 create_test_space，再携带返回的 spaceId。')
      return this.control
    }
    try {
      return mutation
        ? this.requireTestSpaces().requireAiControl(args.spaceId)
        : this.requireTestSpaces().requireReadable(args.spaceId)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI 测试空间不可用'
      const code = message.includes('用户接管') ? 'space_taken_over' : message.includes('不存在') ? 'space_not_found' : 'space_unavailable'
      throw new SandboxMcpError(code, message, false, '请重新读取空间状态后重试。')
    }
  }

  private completeTestSpace(args: Record<string, unknown>, failed: boolean) {
    const spaceId = requireString(args.spaceId, 'spaceId')
    const space = failed
      ? this.requireTestSpaces().failSpace(spaceId)
      : this.requireTestSpaces().completeSpace(spaceId)
    return { spaceId, status: space.status, revision: space.snapshot.revision, cursor: this.appendEvent(`test-space.${space.status}`, { spaceId }, spaceId) }
  }

  private reactivateTestSpace(args: Record<string, unknown>) {
    const spaceId = requireString(args.spaceId, 'spaceId')
    const current = this.getTestSpace(args)
    const space = this.requireTestSpaces().reactivateSpace(current.id, 'running')
    return { spaceId, status: space.status, revision: space.snapshot.revision, cursor: this.appendEvent('test-space.reactivated', { spaceId }, spaceId) }
  }

  private deleteTestSpace(args: Record<string, unknown>) {
    const spaceId = requireString(args.spaceId, 'spaceId')
    this.requireTestSpaces().deleteSpace(spaceId)
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

  private requireStoredCredential(id: string): SandboxMcpCredential {
    const credential = this.credentials.find((item) => item.id === id)
    if (!credential) throw new SandboxMcpError('credential_not_found', `凭证不存在：${id}`)
    return credential
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
      this.credentials = Array.isArray(credentials)
        ? credentials.flatMap((item) => {
          const credential = normalizeStoredCredential(item)
          return credential ? [credential] : []
        })
        : []
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
