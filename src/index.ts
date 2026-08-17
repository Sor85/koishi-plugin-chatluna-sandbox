import { Context, Schema } from 'koishi'
import { registerConsole } from './console'
import { SandboxControlService, SandboxRuntimeBotRegistry } from './control-service'
import {
  KoishiDatabaseModelRequestPersistence,
  KoishiDatabaseOneBotDebugPersistence,
  KoishiDatabaseScenePersistence,
  KoishiDatabaseTestSpacePersistence,
  MemoryModelRequestPersistence,
  MemoryOneBotDebugPersistence,
  registerSandboxModelRequestModel,
  registerSandboxOneBotDebugModel,
  registerSandboxSceneModel,
  registerSandboxTestSpaceModel,
} from './persistence'
import type { SandboxOneBotDebugPersistence } from './onebot-debug'
import { linkChatLunaUsageRequest, type ChatLunaUsageLookup } from './chatluna-usage'
import { installModelRequestCollector, resolveChatLunaPluginClass } from './model-request-collector'
import { MAIN_MODEL_REQUEST_SCOPE_ID, SandboxModelRequestStore, UNATTRIBUTED_MODEL_REQUEST_SCOPE_ID, type SandboxModelRequestPersistence } from './model-request'
import { SandboxMcpHttpServer, type SandboxMcpServerConfig } from './mcp/server'
import { SandboxMcpService } from './mcp/service'
import { SandboxTestSpaceService } from './test-spaces'
import { resolve } from 'node:path'
import type { SandboxAppearance, SandboxPersistenceMode } from './types'

export * from './control-service'
export * from './persistence'
export * from './onebot-debug'
export * from './model-request'
export * from './model-request-collector'
export * from './types'
export * from './mcp/server'
export * from './mcp/service'
export * from './mcp/types'
export * from './test-spaces'

export const name = 'chatluna-sandbox'
export const inject = {
  required: ['console'],
  optional: ['database', 'chatluna_usage'],
}

export interface Config extends SandboxAppearance {
  persistenceMode: SandboxPersistenceMode
  modelRequestRecordLimit: number
  mcp: SandboxMcpServerConfig
}

export const Config: Schema<Config> = Schema.object({
  persistenceMode: Schema.union([
    Schema.const('memory').description('服务端内存'),
    Schema.const('database').description('Koishi Database'),
  ]).default('memory').role('radio').description('模拟 QQ 环境状态存储方式'),
  enableSandboxFrostedGlass: Schema.boolean().default(true).description('启用 Sandbox 毛玻璃效果'),
  sandboxTimBubbleTail: Schema.boolean().default(true).description('显示气泡小尖角'),
  sandboxColorMode: Schema.union([
    Schema.const('auto').description('自动'),
    Schema.const('light').description('明亮'),
    Schema.const('dark').description('暗色'),
  ]).default('auto').role('radio').description('Sandbox 颜色模式'),
  sandboxAccentColor: Schema.string().default('#2563eb').role('color').description('Sandbox 强调色'),
  sandboxMarkRecalledMessages: Schema.boolean().default(true).description('仅影响 Sandbox 展示：开启时保留撤回气泡并显示撤回线，关闭时只显示撤回事件'),
  modelRequestRecordLimit: Schema.number().min(1).default(500).description('每个空间保留的模型请求记录上限'),
  mcp: Schema.object({
    enabled: Schema.boolean().default(false).description('启用独立 MCP Streamable HTTP 端点'),
    host: Schema.string().default('127.0.0.1').description('监听地址'),
    port: Schema.number().min(1).max(65535).default(61901).description('监听端口'),
    path: Schema.string().default('/mcp').description('请求路径'),
    allowedSources: Schema.array(String).default(['127.0.0.1', '::1']).description('允许的真实来源 IP 或 IPv4 CIDR'),
    allowedOrigins: Schema.array(String).default([]).description('允许的精确 Origin；无 Origin 请求仍可访问'),
    allowInsecureRemote: Schema.boolean().default(false).description('允许非回环地址使用明文 HTTP（不推荐）'),
    tlsCertPath: Schema.string().description('TLS 证书路径'),
    tlsKeyPath: Schema.string().description('TLS 私钥路径'),
    readPerMinute: Schema.number().min(1).default(120).description('每个凭证每分钟读取调用上限'),
    mutationPerMinute: Schema.number().min(1).default(60).description('每个凭证每分钟变更调用上限'),
    waitPerMinute: Schema.number().min(1).default(120).description('每个凭证每分钟等待调用上限'),
    uploadPerMinute: Schema.number().min(1).default(30).description('每个凭证每分钟上传调用上限'),
    maxConcurrentMutations: Schema.number().min(1).default(4).description('每个凭证最大并发变更数'),
    maxConcurrentWaits: Schema.number().min(1).default(8).description('每个凭证最大并发等待数'),
    maxConcurrentUploads: Schema.number().min(1).default(2).description('每个凭证最大并发上传数'),
  }).description('MCP 测试端点'),
}).description('ChatLuna 沙盒')

declare module 'koishi' {
  interface Context {
    chatlunaSandbox: SandboxControlService
    chatluna_usage?: ChatLunaUsageLookup
  }
  interface Events {
    'chatluna/model-usage'(payload: import('./chatluna-usage').ChatLunaModelUsageEvent): void
  }
}

function findChatLunaUsage(ctx: Context): ChatLunaUsageLookup | undefined {
  for (const runtime of ctx.registry.values()) {
    const service = runtime.ctx.get('console.services.chatluna_usage') as ChatLunaUsageLookup | undefined
    if (service) return service
  }
}

export function apply(ctx: Context, config: Config) {
  ctx.inject({
    console: { required: true },
    database: { required: false },
    chatluna_usage: { required: false },
  }, (inner) => {
    let persistence: KoishiDatabaseScenePersistence | undefined
    let createDebugPersistence: (scopeId: string) => SandboxOneBotDebugPersistence
    let createModelRequestPersistence: (scopeId: string) => SandboxModelRequestPersistence
    if (config.persistenceMode === 'database') {
      registerSandboxSceneModel(inner)
      registerSandboxTestSpaceModel(inner)
      registerSandboxOneBotDebugModel(inner)
      registerSandboxModelRequestModel(inner)
      // database 是可选注入，可能在本插件之后加载；必须传 getter 延迟解析，不能在此刻取值。
      persistence = new KoishiDatabaseScenePersistence(() => inner.database)
      createDebugPersistence = (scopeId) => new KoishiDatabaseOneBotDebugPersistence(scopeId, () => inner.database)
      createModelRequestPersistence = (scopeId) => new KoishiDatabaseModelRequestPersistence(scopeId, () => inner.database)
    } else {
      // 内存 Adapter 与数据库 Adapter 共用同一 Interface；进程内跨控制服务实例可恢复，进程退出后不保留。
      const memoryDebug = new Map<string, MemoryOneBotDebugPersistence>()
      const memoryModelRequests = new Map<string, MemoryModelRequestPersistence>()
      createDebugPersistence = (scopeId) => {
        const existing = memoryDebug.get(scopeId)
        if (existing) return existing
        const created = new MemoryOneBotDebugPersistence(scopeId)
        memoryDebug.set(scopeId, created)
        return created
      }
      createModelRequestPersistence = (scopeId) => {
        const existing = memoryModelRequests.get(scopeId)
        if (existing) return existing
        const created = new MemoryModelRequestPersistence(scopeId)
        memoryModelRequests.set(scopeId, created)
        return created
      }
    }
    const runtimeBots = new SandboxRuntimeBotRegistry()
    const unattributedModelRequests = new SandboxModelRequestStore({
      persistence: createModelRequestPersistence(UNATTRIBUTED_MODEL_REQUEST_SCOPE_ID),
      maxRecords: config.modelRequestRecordLimit,
    })
    const control = new SandboxControlService(inner, {
      persistence,
      runtimeBots,
      debugPersistence: createDebugPersistence('main'),
      modelRequestPersistence: createModelRequestPersistence(MAIN_MODEL_REQUEST_SCOPE_ID),
      modelRequestRecordLimit: config.modelRequestRecordLimit,
    })
    const testSpaces = new SandboxTestSpaceService(
      inner,
      runtimeBots,
      config.persistenceMode === 'database' ? new KoishiDatabaseTestSpacePersistence(() => inner.database) : undefined,
      createDebugPersistence,
      createModelRequestPersistence,
      config.modelRequestRecordLimit,
    )
    const chatLunaPlugin = resolveChatLunaPluginClass(inner.baseDir)
    const disposeModelRequestCollector = installModelRequestCollector({
      plugin: chatLunaPlugin,
      baseDir: inner.baseDir,
      unattributed: unattributedModelRequests,
      getCandidates: () => [
        {
          scopeId: MAIN_MODEL_REQUEST_SCOPE_ID,
          store: control.getModelRequestStore(),
          thinking: control.getThinkingModelRequestTargets(),
        },
        ...testSpaces.listSpaces().map((space) => {
          const spaceControl = testSpaces.getControl(space.id)
          return {
            scopeId: space.id,
            store: spaceControl.getModelRequestStore(),
            thinking: spaceControl.getThinkingModelRequestTargets(),
          }
        }),
      ],
    })
    inner.logger('chatluna-sandbox').info(chatLunaPlugin
      ? 'ChatLuna 模型请求采集器已安装。'
      : '未找到 ChatLuna 运行时，模型请求采集器未安装。')
    const modelRequestStores = () => [
      control.getModelRequestStore(),
      unattributedModelRequests,
      ...testSpaces.listSpaces().map((space) => testSpaces.getControl(space.id).getModelRequestStore()),
    ]
    inner.on('chatluna/model-usage', (payload) => {
      linkChatLunaUsageRequest(modelRequestStores(), payload)
    })
    inner.provide('chatlunaSandbox', control, true)
    try {
      const mcp = new SandboxMcpService(control, {
        dataDirectory: resolve(inner.baseDir, 'data/chatluna-sandbox'),
        readPerMinute: config.mcp.readPerMinute,
        mutationPerMinute: config.mcp.mutationPerMinute,
        waitPerMinute: config.mcp.waitPerMinute,
        uploadPerMinute: config.mcp.uploadPerMinute,
        maxConcurrentMutations: config.mcp.maxConcurrentMutations,
        maxConcurrentWaits: config.mcp.maxConcurrentWaits,
        maxConcurrentUploads: config.mcp.maxConcurrentUploads,
        testSpaces,
        unattributedModelRequests,
      })
      const mcpServer = new SandboxMcpHttpServer(inner, mcp, config.mcp)
      // chatluna-usage 位于另一个 loader group，Cordis 会为服务建立隔离映射；复用 usage 插件的 Context 才能解析到同一实例。
      const getChatLunaUsage = () => findChatLunaUsage(inner)
      registerConsole(inner.console, control, config, mcp, testSpaces, unattributedModelRequests, getChatLunaUsage)
      inner.on('ready', async () => {
        await control.waitForSceneReady()
        await mcpServer.start().catch((error) => inner.logger('chatluna-sandbox').error('MCP 监听器启动失败；WebQQ 仍可继续使用。', error))
      })
      inner.on('dispose', () => {
        disposeModelRequestCollector()
        void unattributedModelRequests.waitForPersistence()
        mcpServer.stop()
      })
    } catch (error) {
      inner.logger('chatluna-sandbox').error('MCP 初始化失败；WebQQ 仍可继续使用。', error)
      const getChatLunaUsage = () => findChatLunaUsage(inner)
      registerConsole(inner.console, control, config, undefined, testSpaces, unattributedModelRequests, getChatLunaUsage)
      inner.on('dispose', () => {
        disposeModelRequestCollector()
        void unattributedModelRequests.waitForPersistence()
      })
    }
  })
}
