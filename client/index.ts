import { Context, icons } from '@koishijs/client'
import Page from './page.vue'
import SandboxActivityIcon from './sandbox-activity-icon.vue'
import { installContextMcpActivityReceiver } from './webqq/koishi-mcp-admin-port'
import { installContextMutationReceiver } from './webqq/scene-sync'
import './style.css'

// 控制台内置图标表里没有 'chat'，必须注册自定义图标，否则侧边栏入口显示为空白。
icons.register('activity:chatluna-sandbox', SandboxActivityIcon)

export default (ctx: Context) => {
  installContextMutationReceiver(ctx)
  installContextMcpActivityReceiver(ctx)
  ctx.page({
    name: 'ChatLuna 沙盒',
    path: '/chatluna-sandbox',
    icon: 'activity:chatluna-sandbox',
    order: 300,
    authority: 4,
    component: Page,
  })
}
