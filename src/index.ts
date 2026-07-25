import { Context, Schema } from 'koishi'
import { registerConsole } from './console'
import { SandboxControlService } from './control-service'
import { KoishiDatabaseScenePersistence, registerSandboxSceneModel } from './persistence'
import type { SandboxAppearance, SandboxPersistenceMode } from './types'

export * from './control-service'
export * from './persistence'
export * from './onebot-debug'
export * from './types'

export const name = 'onebot-sandbox'
export const inject = {
  required: ['console'],
  optional: ['database'],
}

export interface Config extends SandboxAppearance {
  persistenceMode: SandboxPersistenceMode
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
      persistence = new KoishiDatabaseScenePersistence(inner.database)
    }
    const control = new SandboxControlService(inner, { persistence })
    inner.provide('onebotSandbox', control, true)
    registerConsole(inner.console, control, config)
  })
}
