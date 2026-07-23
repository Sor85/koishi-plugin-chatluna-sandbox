import { Bot, Context, Fragment, h, Universal } from 'koishi'
import type { SandboxControlService } from './control-service'
import { createDirectConversationId, getDirectConversationPeerId } from './types'

export namespace SandboxBot {
  export interface Config {
    selfId: string
    name: string
    avatar?: string
  }

  export interface Internal {
    _request(action: string, params: Record<string, unknown>): Promise<unknown>
    set_friend_add_request(input: { flag: string; approve: boolean; remark?: string }): Promise<unknown>
    set_group_add_request(input: { flag: string; sub_type: 'add' | 'invite'; approve: boolean; reason?: string }): Promise<unknown>
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
    this.user = { id: config.selfId, name: config.name, avatar: config.avatar }
    this.status = Universal.Status.ONLINE
    const request = async (action: string, params: Record<string, unknown>) => {
        if (action === 'get_status') {
          const online = this.status === Universal.Status.ONLINE
          return { status: 'ok', retcode: 0, data: { online, good: online && !this.error } }
        }
        if (action === 'get_login_info') {
          return {
            status: 'ok',
            retcode: 0,
            data: { user_id: Number(this.selfId), nickname: this.user?.name ?? this.selfId },
          }
        }
        if (action === 'get_version_info') {
          return {
            status: 'ok',
            retcode: 0,
            data: { app_name: 'onebot-sandbox', app_version: '0.0.1', protocol_version: 'v11' },
          }
        }
        if (action === 'get_stranger_info') {
          const user = await this.getUser(String(params.user_id ?? ''))
          return { status: 'ok', retcode: 0, data: this.toOneBotUser(user) }
        }
        if (action === 'get_friend_list') {
          const friends = await this.getFriendList()
          return {
            status: 'ok',
            retcode: 0,
            data: friends.data.map(({ user, nick }) => ({
              ...this.toOneBotUser(user),
              remark: nick ?? '',
            })),
          }
        }
        if (action === 'get_group_list') {
          const groups = await this.getGuildList()
          const snapshot = this.control.getSnapshot()
          return {
            status: 'ok',
            retcode: 0,
            data: groups.data.map((group) => {
              const memberCount = snapshot.groups.find(({ id }) => id === group.id)?.members.length ?? 0
              return { group_id: Number(group.id), group_name: group.name, member_count: memberCount, max_member_count: memberCount }
            }),
          }
        }
        if (action === 'get_group_info') {
          const group = await this.getGuild(String(params.group_id ?? ''))
          const memberCount = this.control.getSnapshot().groups.find(({ id }) => id === group.id)?.members.length ?? 0
          return {
            status: 'ok',
            retcode: 0,
            data: { group_id: Number(group.id), group_name: group.name, member_count: memberCount, max_member_count: memberCount },
          }
        }
        if (action === 'get_group_member_info') {
          const member = await this.getGuildMember(String(params.group_id ?? ''), String(params.user_id ?? ''))
          return { status: 'ok', retcode: 0, data: this.toOneBotGuildMember(String(params.group_id ?? ''), member) }
        }
        if (action === 'get_group_member_list') {
          const groupId = String(params.group_id ?? '')
          const members = await this.getGuildMemberList(groupId)
          return { status: 'ok', retcode: 0, data: members.data.map((member) => this.toOneBotGuildMember(groupId, member)) }
        }
        if (action === 'send_private_msg') {
          const userId = String(params.user_id ?? '')
          const [messageId] = await this.sendPrivateMessage(userId, this.normalizeOneBotMessage(params.message))
          return { status: 'ok', retcode: 0, data: { message_id: messageId } }
        }
        if (action === 'send_group_msg') {
          const groupId = String(params.group_id ?? '')
          await this.getGuild(groupId)
          const content = this.normalizeOneBotMessage(params.message)
          const messageIds = this.control.recordBotGroupMessage(this.selfId, groupId, content).map(({ id }) => id)
          return { status: 'ok', retcode: 0, data: { message_id: messageIds[0] } }
        }
        if (action === 'send_msg') {
          if (params.message_type === 'group' || params.group_id !== undefined) {
            return this.internal._request('send_group_msg', params)
          }
          return this.internal._request('send_private_msg', params)
        }
        if (action === 'get_msg') {
          const message = this.findVisibleMessage(String(params.message_id ?? ''))
          return { status: 'ok', retcode: 0, data: this.toOneBotMessage(message) }
        }
        if (action === 'delete_msg') {
          this.control.deleteBotMessage(this.selfId, String(params.message_id ?? ''))
          return { status: 'ok', retcode: 0, data: null }
        }
        if (action === 'delete_friend') {
          this.control.deleteBotFriend(this.selfId, String(params.user_id ?? ''))
          return { status: 'ok', retcode: 0, data: null }
        }
        if (action === 'set_group_kick') {
          return this.control.performBotGroupAction(this.selfId, {
            action: 'kick',
            groupId: String(params.group_id ?? ''),
            targetId: String(params.user_id ?? ''),
          })
        }
        if (action === 'set_group_admin') {
          return this.control.performBotGroupAction(this.selfId, {
            action: 'set-admin',
            groupId: String(params.group_id ?? ''),
            targetId: String(params.user_id ?? ''),
            enabled: params.enable === true,
          })
        }
        if (action === 'set_group_owner') {
          return this.control.performBotGroupAction(this.selfId, {
            action: 'transfer-owner',
            groupId: String(params.group_id ?? ''),
            targetId: String(params.user_id ?? ''),
          })
        }
        if (action === 'set_group_card') {
          return this.control.performBotGroupAction(this.selfId, {
            action: 'set-card',
            groupId: String(params.group_id ?? ''),
            targetId: String(params.user_id ?? ''),
            card: typeof params.card === 'string' ? params.card : '',
          })
        }
        if (action === 'set_group_name') {
          return this.control.performBotGroupAction(this.selfId, {
            action: 'set-name',
            groupId: String(params.group_id ?? ''),
            name: typeof params.group_name === 'string' ? params.group_name : '',
          })
        }
        if (action === 'set_qq_profile') {
          if (typeof params.nickname !== 'string' || !params.nickname.trim()) throw new Error('机器人昵称不能为空')
          return this.control.updateBotSelfProfile(this.selfId, {
            name: params.nickname,
          })
        }
        if (action === 'set_qq_avatar') {
          if (typeof params.file !== 'string' || !params.file.trim()) throw new Error('机器人头像不能为空')
          return this.control.updateBotSelfProfile(this.selfId, {
            avatar: params.file,
          })
        }
        if (action === 'set_friend_add_request') {
          return this.control.handleBotFriendRequest(this.selfId, {
            flag: typeof params.flag === 'string' ? params.flag : '',
            approve: params.approve === true,
            remark: typeof params.remark === 'string' ? params.remark : undefined,
          })
        }
        if (action === 'set_group_add_request') {
          return this.control.handleBotGroupRequest(this.selfId, {
            flag: typeof params.flag === 'string' ? params.flag : '',
            subType: params.sub_type === 'invite' ? 'invite' : 'add',
            approve: params.approve === true,
            reason: typeof params.reason === 'string' ? params.reason : undefined,
          })
        }
        throw new Error(`不支持的 OneBot action：${action}`)
    }
    const internal: SandboxBot.Internal = {
      _request: request,
      set_friend_add_request: (input) => this.control.handleBotFriendRequest(this.selfId, input),
      set_group_add_request: (input) => this.control.handleBotGroupRequest(this.selfId, {
        flag: input.flag,
        subType: input.sub_type,
        approve: input.approve,
        reason: input.reason,
      }),
    }
    this.internal = new Proxy(internal, {
      get: (target, property) => {
        if (property in target) return Reflect.get(target, property)
        if (typeof property === 'string') return (params: Record<string, unknown> = {}) => request(property, params)
      },
    })
  }

  async createDirectChannel(userId: string): Promise<Universal.Channel> {
    return {
      id: createDirectConversationId(userId, this.selfId),
      type: Universal.Channel.Type.DIRECT,
    }
  }

  async getUser(userId: string): Promise<Universal.User> {
    const snapshot = this.control.getSnapshot()
    const participant = snapshot.participants.find(({ id }) => id === userId)
    if (!participant) throw new Error(`参与者不存在：${userId}`)
    return { id: participant.id, name: participant.name, avatar: participant.avatar, isBot: participant.kind === 'bot' }
  }

  async getFriendList(): Promise<Universal.List<Universal.Friend>> {
    const snapshot = this.control.getSnapshot()
    const friendIds = snapshot.friendships.flatMap(({ participantIds }) => participantIds.includes(this.selfId)
      ? participantIds.filter((id) => id !== this.selfId)
      : [])
    return {
      data: await Promise.all(friendIds.map(async (id) => {
        const user = await this.getUser(id)
        return { user, nick: user.name }
      })),
    }
  }

  async getGuild(guildId: string): Promise<Universal.Guild> {
    const group = this.control.getSnapshot().groups.find(({ id, members }) => id === guildId
      && members.some(({ participantId }) => participantId === this.selfId))
    if (!group) throw new Error(`群组不存在：${guildId}`)
    return { id: group.id, name: group.name }
  }

  async getGuildList(): Promise<Universal.List<Universal.Guild>> {
    const snapshot = this.control.getSnapshot()
    return {
      data: snapshot.groups
        .filter(({ members }) => members.some(({ participantId }) => participantId === this.selfId))
        .map(({ id, name }) => ({ id, name })),
    }
  }

  async getGuildMember(guildId: string, userId: string): Promise<Universal.GuildMember> {
    await this.getGuild(guildId)
    const snapshot = this.control.getSnapshot()
    const group = snapshot.groups.find(({ id }) => id === guildId)!
    const member = group.members.find(({ participantId }) => participantId === userId)
    if (!member) throw new Error(`群成员不存在：${userId}`)
    const user = await this.getUser(userId)
    const roleName = member.role === 'owner' ? '群主' : member.role === 'admin' ? '管理员' : '成员'
    return { user, name: user.name, nick: member.card ?? user.name, avatar: user.avatar, roles: [{ id: member.role, name: roleName }] }
  }

  async getGuildMemberList(guildId: string): Promise<Universal.List<Universal.GuildMember>> {
    await this.getGuild(guildId)
    const group = this.control.getSnapshot().groups.find(({ id }) => id === guildId)!
    return { data: await Promise.all(group.members.map(({ participantId }) => this.getGuildMember(guildId, participantId))) }
  }

  async getMessage(channelId: string, messageId: string): Promise<Universal.Message> {
    const message = this.findVisibleMessage(messageId, channelId)
    return this.toUniversalMessage(message)
  }

  async getMessageList(channelId: string): Promise<Universal.BidiList<Universal.Message>> {
    const conversation = this.getVisibleConversation(channelId)
    const messages = this.control.getSnapshot().messages.filter(({ id }) => conversation.messageIds.includes(id))
    return { data: await Promise.all(messages.map((message) => this.toUniversalMessage(message))) }
  }

  async deleteMessage(channelId: string, messageId: string): Promise<void> {
    this.getVisibleConversation(channelId)
    this.control.deleteBotMessage(this.selfId, messageId, channelId)
  }

  async deleteFriend(userId: string): Promise<void> {
    this.control.deleteBotFriend(this.selfId, userId)
  }

  async kickGuildMember(guildId: string, userId: string): Promise<void> {
    await this.control.performBotGroupAction(this.selfId, { action: 'kick', groupId: guildId, targetId: userId })
  }

  async setGuildMemberRole(guildId: string, userId: string, roleId: string): Promise<void> {
    if (roleId === 'owner') {
      await this.control.performBotGroupAction(this.selfId, { action: 'transfer-owner', groupId: guildId, targetId: userId })
      return
    }
    if (roleId !== 'admin') throw new Error(`不支持的群角色：${roleId}`)
    await this.control.performBotGroupAction(this.selfId, { action: 'set-admin', groupId: guildId, targetId: userId, enabled: true })
  }

  async unsetGuildMemberRole(guildId: string, userId: string, roleId: string): Promise<void> {
    if (roleId !== 'admin') throw new Error(`不支持的群角色：${roleId}`)
    await this.control.performBotGroupAction(this.selfId, { action: 'set-admin', groupId: guildId, targetId: userId, enabled: false })
  }

  async handleFriendRequest(messageId: string, approve: boolean, comment?: string): Promise<void> {
    await this.control.handleBotFriendRequest(this.selfId, { flag: messageId, approve, remark: comment })
  }

  async handleGuildRequest(messageId: string, approve: boolean, comment?: string): Promise<void> {
    await this.control.handleBotGroupRequest(this.selfId, { flag: messageId, subType: 'invite', approve, reason: comment })
  }

  async handleGuildMemberRequest(messageId: string, approve: boolean, comment?: string): Promise<void> {
    await this.control.handleBotGroupRequest(this.selfId, { flag: messageId, subType: 'add', approve, reason: comment })
  }

  dispose() {
    // Koishi 整体停机时可能先释放 Satori 的 bots 服务，再触发插件作用域 dispose。
    // 热卸载时服务仍存在，必须继续使用基类路径发送正确的 bot-removed 生命周期事件。
    if (!this.ctx.bots) return this.stop()
    return super.dispose()
  }

  async sendMessage(channelId: string, fragment: Fragment) {
    if (this.status !== Universal.Status.ONLINE) throw new Error(`机器人已离线：${this.selfId}`)
    const content = h.normalize(fragment).join('').trim()
    if (!content) return []
    const message = this.control.recordBotMessage(this.selfId, channelId, content)
    return [message.id]
  }

  private toOneBotUser(user?: Universal.User) {
    return {
      user_id: Number(user?.id ?? 0),
      nickname: user?.name ?? user?.id ?? '',
    }
  }

  private toOneBotGuildMember(groupId: string, member: Universal.GuildMember) {
    const role = member.roles?.[0]?.id ?? 'member'
    return {
      group_id: Number(groupId),
      user_id: Number(member.user?.id ?? 0),
      nickname: member.user?.name ?? member.user?.id ?? '',
      card: member.nick ?? '',
      role,
    }
  }

  private getVisibleConversation(channelId: string) {
    const conversation = this.control.getVisibleSnapshot(this.selfId).conversations.find(({ id }) => id === channelId)
    if (!conversation) throw new Error(`会话不存在：${channelId}`)
    return conversation
  }

  private findVisibleMessage(messageId: string, channelId?: string) {
    const snapshot = this.control.getVisibleSnapshot(this.selfId)
    const message = snapshot.messages.find(({ id, conversationId }) => id === messageId
      && (!channelId || conversationId === channelId))
    if (!message) throw new Error(`消息不存在：${messageId}`)
    return message
  }

  private async toUniversalMessage(message: ReturnType<SandboxControlService['getSnapshot']>['messages'][number]): Promise<Universal.Message> {
    const snapshot = this.control.getSnapshot()
    const conversation = snapshot.conversations.find(({ id }) => id === message.conversationId)
    const user = await this.getUser(message.authorId)
    return {
      id: message.id,
      messageId: message.id,
      channel: conversation ? { id: conversation.id, type: conversation.type === 'group' ? Universal.Channel.Type.TEXT : Universal.Channel.Type.DIRECT } : undefined,
      guild: conversation?.groupId ? { id: conversation.groupId, name: snapshot.groups.find(({ id }) => id === conversation.groupId)?.name } : undefined,
      user,
      content: message.content,
      elements: h.parse(message.content),
      timestamp: new Date(message.createdAt).getTime(),
      createdAt: new Date(message.createdAt).getTime(),
    }
  }

  private normalizeOneBotMessage(message: unknown): string {
    if (typeof message === 'string') return message.trim()
    if (!Array.isArray(message)) throw new Error('OneBot 消息不能为空')
    const content = message.map((segment) => {
      if (!segment || typeof segment !== 'object') return ''
      const type = Reflect.get(segment, 'type')
      const data = Reflect.get(segment, 'data')
      if (type === 'text' && data && typeof data === 'object') return String(Reflect.get(data, 'text') ?? '')
      return `[CQ:${String(type ?? 'unknown')}]`
    }).join('').trim()
    if (!content) throw new Error('OneBot 消息不能为空')
    return content
  }

  private toOneBotMessage(message: ReturnType<SandboxControlService['getSnapshot']>['messages'][number]) {
    const conversation = this.control.getSnapshot().conversations.find(({ id }) => id === message.conversationId)
    const directPeerId = conversation?.type === 'direct'
      ? getDirectConversationPeerId(conversation, this.selfId)
      : undefined
    return {
      time: Math.floor(new Date(message.createdAt).getTime() / 1000),
      message_type: conversation?.type === 'group' ? 'group' : 'private',
      message_id: message.id,
      real_id: message.id,
      sender: { user_id: Number(message.authorId), nickname: this.control.getSnapshot().participants.find(({ id }) => id === message.authorId)?.name ?? this.user?.name ?? message.authorId },
      user_id: Number(conversation?.type === 'group' ? conversation.userId : directPeerId ?? message.authorId),
      group_id: conversation?.groupId ? Number(conversation.groupId) : undefined,
      message: [{ type: 'text', data: { text: message.content } }],
      raw_message: message.content,
    }
  }
}
