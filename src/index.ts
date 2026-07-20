import { Context, Schema } from 'koishi'
import { registerConsole } from './console'
import { SandboxControlService } from './control-service'
import type { SandboxAppearance } from './types'

export * from './control-service'
export * from './types'

export const name = 'onebot-sandbox'
export const inject = {
  required: ['console'],
}

export interface Config extends SandboxAppearance {}

export const Config: Schema<Config> = Schema.object({
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
}).description('WebQQ 外观')

declare module 'koishi' {
  interface Context {
    onebotSandbox: SandboxControlService
  }
}

export function apply(ctx: Context, config: Config) {
  const control = new SandboxControlService(ctx)
  ctx.provide('onebotSandbox', control, true)
  registerConsole(ctx.console, control, config)
}
