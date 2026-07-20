import { Context, Schema } from 'koishi'
import { registerConsole } from './console'
import { SandboxControlService } from './control-service'

export * from './control-service'
export * from './types'

export const name = 'onebot-sandbox'
export const inject = {
  required: ['console'],
}

export interface Config {}

export const Config: Schema<Config> = Schema.object({})

declare module 'koishi' {
  interface Context {
    onebotSandbox: SandboxControlService
  }
}

export function apply(ctx: Context) {
  const control = new SandboxControlService(ctx)
  ctx.provide('onebotSandbox', control, true)
  registerConsole(ctx.console, control)
}
