import { Context, Schema } from 'koishi'
import { registerConsole } from './console'
import { includesConversationParticipant, resolveConversation } from './conversation-resolution'
import {
  DEFAULT_SCENE_MESSAGE_LIMIT,
  DEFAULT_SCENE_MESSAGE_MAX_BYTES,
  SandboxControlService,
  SandboxRuntimeBotRegistry,
} from './control-service'
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
import { seedDevelopmentModelRequestErrors } from './model-request-error-preview'
import { MAIN_MODEL_REQUEST_SCOPE_ID, SandboxModelRequestStore, UNATTRIBUTED_MODEL_REQUEST_SCOPE_ID, type SandboxModelRequestPersistence } from './model-request'
import { SandboxTestEndpointServer, type SandboxTestEndpointProtocolConfig, type SandboxTestEndpointServerConfig } from './mcp/server'
import { SandboxMcpService, type SandboxMcpQuotaConfig } from './mcp/service'
import { SandboxTestSpaceService } from './test-spaces'
import { createScopeDirectory } from './scope-directory'
import { resolve } from 'node:path'
import { PresetRuntimeSnapshotTracker, SandboxPresetService, type PresetRuntimeResolvedTarget } from './presets'
import type { SandboxAppearance, SandboxModelRequestEntities, SandboxPersistenceMode } from './types'

export * from './control-service'
export * from './persistence'
export * from './record-store'
export * from './onebot-debug'
export * from './model-request'
export * from './model-request-collector'
export * from './model-request-error-preview'
export * from './chatluna-error'
export * from './types'
export * from './mcp/server'
export * from './mcp/http-api'
export * from './mcp/service'
export * from './mcp/types'
export * from './test-spaces'
export * from './presets'

export const name = 'chatluna-sandbox'
/**
 * `chatluna_usage` 刻意不出现在这里。
 *
 * chatluna-usage 的用量服务是 Console `DataService`，Cordis 里的真实服务名是
 * `console.services.chatluna_usage`，根上下文永远没有 `chatluna_usage`。把它写进 `inject.optional`
 * 或 `koishi.service.optional`，只会让插件配置页一直显示「可选服务: chatluna_usage (未加载)」——即使
 * 用量插件已启用、用量也读得到。用量按服务名现取（见 `findChatLunaUsage`），不进 `inject`。
 */
export const inject = {
  required: ['console'],
  optional: ['database'],
}

/**
 * 端点通用设置：监听、门禁与配额。
 *
 * 单独成组不是为了代码结构，而是为了配置页：Koishi 按声明顺序把嵌套分组渲染成 h2，紧跟其后的散字段
 * 会挂在上一个 h2 下面。这些字段如果留在 `testEndpoint` 顶层，就会视觉上落进「HTTP 测试端点」标题
 * 里，读起来像是只对 HTTP 生效——而它们对两个端点同时生效。监听地址与端口同样是两个端点共用的一份
 * （同一个监听器按路径分流），配额共用同一份额度更是安全属性（换个端点绕不开限流），都不能让人误读。
 * 依 ADR-0025，配额只能由插件全局配置调整。
 */
export interface SandboxTestEndpointSharedConfig extends SandboxMcpQuotaConfig {
  host: string
  port: number
  allowedSources: string[]
  allowedOrigins: string[]
  tlsCertPath?: string
  tlsKeyPath?: string
}

/** 用户可见的测试控制端点配置：两个端点各自的开关与路径 + 共用的监听、门禁与配额。 */
export interface SandboxTestEndpointConfig {
  mcp: SandboxTestEndpointProtocolConfig
  http: SandboxTestEndpointProtocolConfig
  shared: SandboxTestEndpointSharedConfig
}

export interface Config extends SandboxAppearance {
  persistenceMode: SandboxPersistenceMode
  sceneMessageLimit: number
  sceneMessageMaxBytes: number
  modelRequestRecordLimit: number
  testEndpoint: SandboxTestEndpointConfig
}

/**
 * 两个端点的配置形状相同，只有默认路径与文案不同；分组标题由调用方补上。
 *
 * 配置页把分组的 `.description()` 渲染成标题、把字段的 `.description()` 渲染成字段说明，因此标题
 * 只写端点名，「这个端点是干什么的、开关控制什么」全部落在字段说明里。
 */
const protocolSchema = (path: string, enabledDescription: string, pathDescription: string): Schema<SandboxTestEndpointProtocolConfig> => Schema.object({
  enabled: Schema.boolean().default(true).description(enabledDescription),
  path: Schema.string().default(path).description(pathDescription),
})

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
  sceneMessageLimit: Schema.number().min(1).default(DEFAULT_SCENE_MESSAGE_LIMIT)
    .description('每个空间保留的场景消息条数上限；主环境与每个 AI 测试空间各自独立，超出后从最旧消息开始丢弃，被丢弃的历史消息不可恢复'),
  sceneMessageMaxBytes: Schema.number().min(64 * 1024).default(DEFAULT_SCENE_MESSAGE_MAX_BYTES)
    .description('每个空间场景 JSON 的字节上限；达到后继续从最旧消息开始丢弃，被丢弃的历史消息不可恢复'),
  testEndpoint: Schema.object({
    mcp: protocolSchema(
      '/mcp',
      '是否开启 MCP',
      '该端点的请求路径，按完整路径精确匹配。AI 客户端里要填的地址是`http://<监听地址>:<端口><该路径>`',
    ).description('MCP 测试端点'),
    http: protocolSchema(
      '/api',
      '是否开启 HTTP',
      '该端点的路径前缀。填`/api`时可用的地址是`/api/v1/tools`看工具清单、`/api/v1/tools/<工具名>`调用工具、`/api/v1/resources`读只读资源',
    ).description('HTTP 测试端点'),
    // 声明顺序即渲染顺序：这一组必须排在 mcp / http 之后，否则它的字段会挂到别的标题下面。
    shared: Schema.object({
      host: Schema.string().default('127.0.0.1').description('监听地址。`127.0.0.1`只允许本机访问，改成`0.0.0.0`可被局域网访问，此时建议填写 TLS 证书，否则测试凭证以明文传输'),
      port: Schema.number().min(1).max(65535).default(61901).description('监听端口。端口被占用时端点启动失败，沙盒工作台不受影响'),
      allowedSources: Schema.array(String).default(['127.0.0.1', '::1']).description('只有以下来源 IP 能访问，支持 IPv4 CIDR 写法。留空表示不限制来源'),
      allowedOrigins: Schema.array(String).default([]).description('只有以下浏览器 Origin 能访问，要写全协议与端口，例如`http://localhost:5173`。浏览器请求必带 Origin 头，留空表示一律拒绝；curl 与 AI 客户端不带 Origin，不受此项限制'),
      tlsCertPath: Schema.string().description('TLS 证书路径。监听地址不是本机时建议填写，留空则以明文 HTTP 传输测试凭证'),
      tlsKeyPath: Schema.string().description('TLS 私钥路径。监听地址不是本机时建议填写，留空则以明文 HTTP 传输测试凭证'),
      readPerMinute: Schema.number().min(1).default(120).description('每个测试凭证每分钟的读取调用次数上限，超出返回 429'),
      mutationPerMinute: Schema.number().min(1).default(60).description('每个测试凭证每分钟的变更调用次数上限，超出返回 429'),
      waitPerMinute: Schema.number().min(1).default(120).description('每个测试凭证每分钟的等待调用次数上限，超出返回 429'),
      uploadPerMinute: Schema.number().min(1).default(30).description('每个测试凭证每分钟的媒体上传次数上限，超出返回 429'),
      maxConcurrentMutations: Schema.number().min(1).default(4).description('每个测试凭证同时进行的变更调用数上限，超出返回 429'),
      maxConcurrentWaits: Schema.number().min(1).default(8).description('每个测试凭证同时进行的等待调用数上限，超出返回 429'),
      maxConcurrentUploads: Schema.number().min(1).default(2).description('每个测试凭证同时进行的媒体上传数上限，超出返回 429'),
    }).description('端点通用设置'),
    // 外层刻意不写 description：配置页只在 object 有 description 时渲染 h2，而这一层已经没有自己的
    // 字段了，给它标题只会得到一个下面什么都没有、紧接着又是一个标题的空标题。配置键仍是
    // `testEndpoint.*`，分组只在页面上消失。
  }),
}).description('ChatLuna 沙盒')

declare module 'koishi' {
  interface Context {
    chatlunaSandbox: SandboxControlService
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
      sceneMessageLimit: config.sceneMessageLimit,
      sceneMessageMaxBytes: config.sceneMessageMaxBytes,
    })
    const testSpaces = new SandboxTestSpaceService(
      inner,
      runtimeBots,
      config.persistenceMode === 'database' ? new KoishiDatabaseTestSpacePersistence(() => inner.database) : undefined,
      createDebugPersistence,
      createModelRequestPersistence,
      config.modelRequestRecordLimit,
      {
        sceneMessageLimit: config.sceneMessageLimit,
        sceneMessageMaxBytes: config.sceneMessageMaxBytes,
      },
    )
    // 「谁是全部记录域」的唯一答案；装配里三处扇出与两个端点的联邦读取共享同一份口径。
    const scopes = createScopeDirectory({ control, testSpaces, unattributedModelRequests })
    const resolvePresetRuntimeTarget = ({ botId, conversationId }: Pick<PresetRuntimeResolvedTarget, 'botId' | 'conversationId'>): PresetRuntimeResolvedTarget | undefined => {
      const belongsToTarget = (snapshot: ReturnType<SandboxControlService['getSnapshot']>) => {
        const botExists = snapshot.participants.some(({ id, kind }) => id === botId && kind === 'bot')
        const conversation = resolveConversation(snapshot, conversationId)
        if (!botExists || !conversation) return false
        // 解除好友只撤销可见性，运行时预设快照仍要能归属到这一对参与者，因此按归属而不是可见性判定。
        return includesConversationParticipant(snapshot, conversation, botId)
      }
      const matches = scopes.listScenes()
        .filter(({ control: scopeControl }) => belongsToTarget(scopeControl.getSnapshot()))
        .map(({ id }): PresetRuntimeResolvedTarget => ({ scopeId: id, botId, conversationId }))
      // 只有恰好一个记录域能证明归属时才认，否则同名参与者会把快照归到错误的记录域。
      return matches.length === 1 ? matches[0] : undefined
    }
    const presetSnapshots = new PresetRuntimeSnapshotTracker(inner, resolvePresetRuntimeTarget)
    const getActivePresetSnapshots = (entities: SandboxModelRequestEntities) => {
      if (!entities.scopeId || !entities.botId || !entities.conversationId) return []
      return presetSnapshots.getActiveSnapshots({
        scopeId: entities.scopeId,
        botId: entities.botId,
        conversationId: entities.conversationId,
      })
    }
    const chatLunaPlugin = resolveChatLunaPluginClass(inner.baseDir)
    const disposeModelRequestCollector = installModelRequestCollector({
      plugin: chatLunaPlugin,
      baseDir: inner.baseDir,
      unattributed: unattributedModelRequests,
      getActivePresetSnapshots,
      onAttributedRequest: (record) => {
        const { scopeId, botId, conversationId } = record.entities
        if (!scopeId || !botId || !conversationId) return
        if (scopeId === MAIN_MODEL_REQUEST_SCOPE_ID) {
          control.recordChatLunaModelRequest(scopeId, record.id, botId, conversationId)
          return
        }
        try {
          testSpaces.getControl(scopeId).recordChatLunaModelRequest(scopeId, record.id, botId, conversationId)
        } catch {
          // 请求归属后空间可能被并发删除；此时不把引用错误写入其他空间。
        }
      },
      getCandidates: () => scopes.listScenes().map(({ id, control: scopeControl }) => ({
        scopeId: id,
        store: scopeControl.getModelRequestStore(),
        thinking: scopeControl.getThinkingModelRequestTargets(),
      })),
    })
    inner.logger('chatluna-sandbox').info(chatLunaPlugin
      ? 'ChatLuna 模型请求采集器已安装。'
      : '未找到 ChatLuna 运行时，模型请求采集器未安装。')
    // 用量关联要覆盖未归属记录库，因此用完整清单而不是只看拥有场景的那些。
    const modelRequestStores = () => scopes.listScopes().map((scope) => (scope.kind === 'unattributed'
      ? scope.records
      : scope.control.getModelRequestStore()))
    inner.on('chatluna/model-usage', (payload) => {
      // 记录库读取是异步的，事件回调不可等待；失败只写日志，不影响 ChatLuna 主流程。
      void linkChatLunaUsageRequest(modelRequestStores(), payload).catch((error) => {
        inner.logger('chatluna-sandbox').warn('ChatLuna 用量事件关联模型请求失败。', error)
      })
    })
    inner.provide('chatlunaSandbox', control, true)
    const presetService = new SandboxPresetService({
      baseDir: inner.baseDir,
      mainModelRequests: control.getModelRequestStore(),
      getTestSpaceModelRequests: (spaceId) => {
        if (spaceId === MAIN_MODEL_REQUEST_SCOPE_ID) return control.getModelRequestStore()
        try {
          return testSpaces.getControl(spaceId).getModelRequestStore()
        } catch {
          return undefined
        }
      },
    })
    try {
      const mcp = new SandboxMcpService(inner, control, {
        dataDirectory: resolve(inner.baseDir, 'data/chatluna-sandbox'),
        readPerMinute: config.testEndpoint.shared.readPerMinute,
        mutationPerMinute: config.testEndpoint.shared.mutationPerMinute,
        waitPerMinute: config.testEndpoint.shared.waitPerMinute,
        uploadPerMinute: config.testEndpoint.shared.uploadPerMinute,
        maxConcurrentMutations: config.testEndpoint.shared.maxConcurrentMutations,
        maxConcurrentWaits: config.testEndpoint.shared.maxConcurrentWaits,
        maxConcurrentUploads: config.testEndpoint.shared.maxConcurrentUploads,
        testSpaces,
        unattributedModelRequests,
      })
      const testEndpointServer = new SandboxTestEndpointServer(inner, mcp, {
        // 逐字段构造传输配置：监听器只要门禁与路径，不需要配额；整体铺开会让读代码的人以为它也用配额。
        // 配置页的 `shared` 分组是展示分工，监听器接口按自己需要的字段扁平声明，两者在此对接。
        host: config.testEndpoint.shared.host,
        port: config.testEndpoint.shared.port,
        allowedSources: config.testEndpoint.shared.allowedSources,
        allowedOrigins: config.testEndpoint.shared.allowedOrigins,
        tlsCertPath: config.testEndpoint.shared.tlsCertPath,
        tlsKeyPath: config.testEndpoint.shared.tlsKeyPath,
        mcp: config.testEndpoint.mcp,
        http: config.testEndpoint.http,
      })
      // chatluna-usage 位于另一个 loader group，Cordis 会为服务建立隔离映射；复用 usage 插件的 Context 才能解析到同一实例。
      const getChatLunaUsage = () => findChatLunaUsage(inner)
      registerConsole(inner.console, control, config, mcp, testSpaces, unattributedModelRequests, getChatLunaUsage, presetService)
      inner.on('ready', async () => {
        await control.waitForSceneReady()
        const seeded = await seedDevelopmentModelRequestErrors(control)
        if (seeded) inner.logger('chatluna-sandbox').info(`已生成 ${seeded} 条开发环境 ChatLuna 错误预览记录。`)
        await testEndpointServer.start().catch((error) => inner.logger('chatluna-sandbox').error('测试控制端点监听器启动失败；WebQQ 仍可继续使用。', error))
      })
      inner.on('dispose', () => {
        disposeModelRequestCollector()
        presetSnapshots.dispose()
        // Koishi 的 dispose 不可等待（cordis scope.reset 不 await disposer），
        // 这里只保证收尾写入的失败进日志，而不是被静默丢弃。
        void unattributedModelRequests.waitForPersistence().catch((error) => {
          inner.logger('chatluna-sandbox').error('未归属模型请求关机收尾持久化失败。', error)
        })
        testEndpointServer.stop()
      })
    } catch (error) {
      inner.logger('chatluna-sandbox').error('测试控制端点初始化失败；WebQQ 仍可继续使用。', error)
      const getChatLunaUsage = () => findChatLunaUsage(inner)
      registerConsole(inner.console, control, config, undefined, testSpaces, unattributedModelRequests, getChatLunaUsage, presetService)
      inner.on('ready', async () => {
        await control.waitForSceneReady()
        const seeded = await seedDevelopmentModelRequestErrors(control)
        if (seeded) inner.logger('chatluna-sandbox').info(`已生成 ${seeded} 条开发环境 ChatLuna 错误预览记录。`)
      })
      inner.on('dispose', () => {
        disposeModelRequestCollector()
        presetSnapshots.dispose()
        void unattributedModelRequests.waitForPersistence().catch((error) => {
          inner.logger('chatluna-sandbox').error('未归属模型请求关机收尾持久化失败。', error)
        })
      })
    }
  })
}
