import { Context, Schema } from 'koishi'
import { registerConsole } from './console'
import { SandboxControlService, SandboxRuntimeBotRegistry } from './control-service'
import {
  KoishiDatabaseScenePersistence,
  KoishiDatabaseTestSpacePersistence,
  registerSandboxSceneModel,
  registerSandboxTestSpaceModel,
} from './persistence'
import { SandboxMcpHttpServer, type SandboxMcpServerConfig } from './mcp/server'
import { SandboxMcpService } from './mcp/service'
import { SandboxTestSpaceService } from './test-spaces'
import { resolve } from 'node:path'
import type { SandboxAppearance, SandboxPersistenceMode } from './types'

export * from './control-service'
export * from './persistence'
export * from './onebot-debug'
export * from './types'
export * from './mcp/server'
export * from './mcp/service'
export * from './mcp/types'
export * from './test-spaces'

export const name = 'onebot-sandbox'
export const inject = {
  required: ['console'],
  optional: ['database'],
}

export interface Config extends SandboxAppearance {
  persistenceMode: SandboxPersistenceMode
  mcp: SandboxMcpServerConfig
}

export const Config: Schema<Config> = Schema.object({
  persistenceMode: Schema.union([
    Schema.const('memory').description('服务端内存'),
    Schema.const('database').description('Koishi Database'),
  ]).default('memory').role('radio').description('模拟 QQ 环境状态存储方式'),
  enableWebQQFrostedGlass: Schema.boolean().default(true).description('启用 WebQQ 毛玻璃效果'),
  webQQChatStyle: Schema.union([
    Schema.const('tim').description('TIM'),
    Schema.const('qq').description('QQ'),
  ]).default('tim').role('radio').description('WebQQ 聊天气泡样式'),
  webQQTimBubbleTail: Schema.boolean().default(true).description('显示 TIM 气泡小尖角'),
  webQQColorMode: Schema.union([
    Schema.const('auto').description('自动'),
    Schema.const('light').description('明亮'),
    Schema.const('dark').description('暗色'),
  ]).default('auto').role('radio').description('WebQQ 颜色模式'),
  webQQAccentColor: Schema.string().default('#2563eb').role('color').description('WebQQ 强调色'),
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
}).description('OneBot 沙盒')

declare module 'koishi' {
  interface Context {
    onebotSandbox: SandboxControlService
  }
}

export function apply(ctx: Context, config: Config) {
  ctx.inject({
    console: { required: true },
    database: { required: false },
  }, (inner) => {
    let persistence: KoishiDatabaseScenePersistence | undefined
    if (config.persistenceMode === 'database') {
      registerSandboxSceneModel(inner)
      registerSandboxTestSpaceModel(inner)
      // database 是可选注入，可能在本插件之后加载；必须传 getter 延迟解析，不能在此刻取值。
      persistence = new KoishiDatabaseScenePersistence(() => inner.database)
    }
    const runtimeBots = new SandboxRuntimeBotRegistry()
    const control = new SandboxControlService(inner, { persistence, runtimeBots })
    const testSpaces = new SandboxTestSpaceService(
      inner,
      runtimeBots,
      config.persistenceMode === 'database' ? new KoishiDatabaseTestSpacePersistence(() => inner.database) : undefined,
    )
    inner.provide('onebotSandbox', control, true)
    try {
      const mcp = new SandboxMcpService(control, {
        dataDirectory: resolve(inner.baseDir, 'data/onebot-sandbox'),
        readPerMinute: config.mcp.readPerMinute,
        mutationPerMinute: config.mcp.mutationPerMinute,
        waitPerMinute: config.mcp.waitPerMinute,
        uploadPerMinute: config.mcp.uploadPerMinute,
        maxConcurrentMutations: config.mcp.maxConcurrentMutations,
        maxConcurrentWaits: config.mcp.maxConcurrentWaits,
        maxConcurrentUploads: config.mcp.maxConcurrentUploads,
        testSpaces,
      })
      const mcpServer = new SandboxMcpHttpServer(inner, mcp, config.mcp)
      registerConsole(inner.console, control, config, mcp, testSpaces)
      inner.on('ready', () => mcpServer.start().catch((error) => inner.logger('onebot-sandbox').error('MCP 监听器启动失败；WebQQ 仍可继续使用。', error)))
      inner.on('dispose', () => mcpServer.stop())
    } catch (error) {
      inner.logger('onebot-sandbox').error('MCP 初始化失败；WebQQ 仍可继续使用。', error)
      registerConsole(inner.console, control, config, undefined, testSpaces)
    }
  })
}
