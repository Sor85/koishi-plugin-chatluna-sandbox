import { Context } from '@koishijs/client'
import Page from './page.vue'
import './style.css'

export default (ctx: Context) => {
  ctx.page({
    name: 'OneBot 沙盒',
    path: '/onebot-sandbox',
    icon: 'chat',
    order: 300,
    authority: 4,
    component: Page,
  })
}
