import { Context, icons } from '@koishijs/client'
import Page from './page.vue'
import SandboxActivityIcon from './sandbox-activity-icon.vue'
import { installContextMutationReceiver } from './webqq/scene-sync'
import './style.css'

// 控制台内置图标表里没有 'chat'，必须注册自定义图标，否则侧边栏入口显示为空白。
icons.register('activity:onebot-sandbox', SandboxActivityIcon)

export default (ctx: Context) => {
  installContextMutationReceiver(ctx)
  ctx.page({
    name: 'OneBot 沙盒',
    path: '/onebot-sandbox',
    icon: 'activity:onebot-sandbox',
    order: 300,
    authority: 4,
    component: Page,
  })
}
