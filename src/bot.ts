import { Bot, Context, Fragment, h, Universal } from 'koishi'
import type { SandboxControlService } from './control-service'

export namespace SandboxBot {
  export interface Config {
    selfId: string
    name: string
  }

  export interface Internal {
    _request(action: string, params: Record<string, unknown>): Promise<unknown>
    set_friend_add_request(input: { flag: string; approve: boolean; remark?: string }): Promise<unknown>
  }
}

// Koishi Context 覆盖了 Cordis 的递归数据库泛型，在 strict 模式下无法满足
// Satori Bot<C> 的基础约束；只在第三方基类边界放宽，领域服务仍使用具体 Context。
export class SandboxBot extends Bot<any, SandboxBot.Config> {
  hidden = true
  internal: SandboxBot.Internal

  constructor(ctx: Context, public control: SandboxControlService, config: SandboxBot.Config) {
    // 被测插件通常按 session.platform === 'onebot' 选择协议逻辑；
    // 沙盒身份由服务和机器人配置区分，不能伪造一个插件无法识别的新平台名。
    super(ctx, config, 'onebot')
    this.platform = 'onebot'
    this.selfId = config.selfId
    this.user = { id: config.selfId, name: config.name }
    this.status = Universal.Status.ONLINE
    this.internal = {
      _request: async (action, params) => {
        if (action !== 'set_friend_add_request') throw new Error(`不支持的 OneBot action：${action}`)
        return this.control.handleBotFriendRequest(this.selfId, {
          flag: typeof params.flag === 'string' ? params.flag : '',
          approve: params.approve === true,
          remark: typeof params.remark === 'string' ? params.remark : undefined,
        })
      },
      set_friend_add_request: (input) => this.control.handleBotFriendRequest(this.selfId, input),
    }
  }

  async createDirectChannel(userId: string): Promise<Universal.Channel> {
    return {
      id: `private:${userId}:${this.selfId}`,
      type: Universal.Channel.Type.DIRECT,
    }
  }

  dispose() {
    // Koishi 整体停机时可能先释放 Satori 的 bots 服务，再触发插件作用域 dispose。
    // 热卸载时服务仍存在，必须继续使用基类路径发送正确的 bot-removed 生命周期事件。
    if (!this.ctx.bots) return this.stop()
    return super.dispose()
  }

  async sendMessage(channelId: string, fragment: Fragment) {
    const content = h.normalize(fragment).join('').trim()
    if (!content) return []
    const message = this.control.recordBotMessage(channelId, content)
    return [message.id]
  }
}
