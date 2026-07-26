import { Bot, Context, Fragment, h, Random, Universal } from 'koishi'
import type { SandboxControlService } from './control-service'
import { toOneBotMessageSegments, toOneBotRawMessage } from './onebot-message'
import { getOneBotMessageSequence, getOneBotProfileBaseline, resolveOneBotAction } from './onebot-profiles'
import { createDirectConversationId, createGroupConversationId, getDirectConversationPeerId, type SandboxImplementationProfile } from './types'

export namespace SandboxBot {
  export interface Config {
    selfId: string
    name: string
    avatar?: string
    implementation: SandboxImplementationProfile
    disabledCapabilities?: string[]
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
  private implementation: SandboxImplementationProfile
  private disabledCapabilities: string[]

  constructor(ctx: Context, public control: SandboxControlService, config: SandboxBot.Config) {
    // 被测插件通常按 session.platform === 'onebot' 选择协议逻辑；
    // 沙盒身份由服务和机器人配置区分，不能伪造一个插件无法识别的新平台名。
    super(ctx, config, 'onebot')
    this.platform = 'onebot'
    this.selfId = config.selfId
    this.implementation = config.implementation
    this.disabledCapabilities = config.disabledCapabilities ?? []
    this.user = { id: config.selfId, name: config.name, avatar: config.avatar }
    this.status = Universal.Status.ONLINE
    const executeRequest = async (
      capability: ReturnType<typeof resolveOneBotAction>,
      params: Record<string, unknown>,
    ) => {
        const action = capability.handler
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
          const baseline = getOneBotProfileBaseline(this.implementation)
          return {
            status: 'ok',
            retcode: 0,
            data: { app_name: baseline.appName, app_version: baseline.appVersion, protocol_version: 'v11' },
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
        if (action === 'get_friends_with_category') {
          const friends = await this.getFriendList()
          const buddyList = friends.data.map(({ user, nick }) => ({
            ...this.toOneBotUser(user),
            remark: nick ?? '',
          }))
          return {
            status: 'ok',
            retcode: 0,
            data: [{
              categoryId: 0,
              categoryName: '我的好友',
              categoryMbCount: buddyList.length,
              buddyList,
              ...(this.implementation === 'llbot' ? { categorySortId: 0, onlineCount: buddyList.length } : {}),
            }],
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
        if (action === 'get_recent_contact') {
          const count = Number(params.count)
          const limit = Number.isFinite(count) && count > 0 ? Math.floor(count) : 10
          const snapshot = this.control.getVisibleSnapshot(this.selfId, 1)
          const participants = new Map(snapshot.participants.map((participant) => [participant.id, participant]))
          const groups = new Map(snapshot.groups.map((group) => [group.id, group]))
          const messages = new Map(snapshot.messages.map((message) => [message.id, message]))
          const recentContacts = snapshot.conversations.flatMap((conversation) => {
            const latestMessage = messages.get(conversation.messageIds.at(-1) ?? '')
            if (!latestMessage) return []
            const peerId = conversation.type === 'group'
              ? conversation.groupId
              : getDirectConversationPeerId(conversation, this.selfId)
            const peerName = conversation.type === 'group'
              ? groups.get(peerId)?.name ?? peerId
              : participants.get(peerId)?.name ?? peerId
            const senderName = participants.get(latestMessage.authorId)?.name ?? latestMessage.authorId
            const sendMemberName = conversation.type === 'group'
              ? groups.get(peerId)?.members.find(({ participantId }) => participantId === latestMessage.authorId)?.card ?? ''
              : ''
            return [{
              createdAt: new Date(latestMessage.createdAt).getTime(),
              contact: {
                lastestMsg: this.toOneBotMessage(latestMessage),
                peerUin: peerId,
                remark: conversation.type === 'direct'
                  ? snapshot.friendships.find(({ participantIds }) => participantIds.includes(this.selfId) && participantIds.includes(peerId))?.remarks[this.selfId] ?? ''
                  : '',
                msgTime: String(Math.floor(new Date(latestMessage.createdAt).getTime() / 1000)),
                chatType: conversation.type === 'group' ? 2 : 1,
                msgId: latestMessage.id,
                sendNickName: senderName,
                sendMemberName,
                peerName,
              },
            }]
          }).sort((left, right) => right.createdAt - left.createdAt).slice(0, limit).map(({ contact }) => contact)
          return { status: 'ok', retcode: 0, data: recentContacts }
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
          const result = await this.control.sendMessage({
            operatorId: this.selfId,
            conversationId: createGroupConversationId(groupId),
            content,
          })
          return { status: 'ok', retcode: 0, data: { message_id: result.messageId } }
        }
        if (action === 'send_msg') {
          const targetAction = params.message_type === 'group' || params.group_id !== undefined
            ? 'send_group_msg'
            : 'send_private_msg'
          const targetCapability = resolveOneBotAction(this.implementation, this.disabledCapabilities, targetAction)
          if (!targetCapability) throw new Error(`OneBot action ${targetAction} is not supported`)
          // send_msg 只是协议级分流入口；直接进入具体实现，避免一次外部调用生成两条调试记录。
          return executeRequest(targetCapability, params)
        }
        if (action === 'get_msg') {
          const message = this.findVisibleMessage(String(params.message_id ?? ''))
          return { status: 'ok', retcode: 0, data: this.toOneBotMessage(message) }
        }
        if (action === 'get_friend_msg_history') {
          return this.getOneBotMessageHistory(createDirectConversationId(this.selfId, String(params.user_id ?? '')), params)
        }
        if (action === 'get_group_msg_history') {
          return this.getOneBotMessageHistory(createGroupConversationId(String(params.group_id ?? '')), params)
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
        if (action === 'batch_kick_group_members') {
          const rawUserIds = this.implementation === 'napcat' ? params.user_id : params.user_ids
          if (!Array.isArray(rawUserIds) || !rawUserIds.length) {
            throw new Error(`${capability.action} 需要至少一个群成员 ID`)
          }
          for (const userId of rawUserIds) {
            await this.control.performBotGroupAction(this.selfId, {
              action: 'kick',
              groupId: String(params.group_id ?? ''),
              targetId: String(userId),
            })
          }
          return { status: 'ok', retcode: 0, data: null }
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
        if (action === 'delete_group_notice') {
          const noticeId = String(params.notice_id ?? '')
          if (!noticeId) throw new Error(`${capability.action} 缺少 notice_id`)
          this.control.deleteGroupAnnouncement({
            operatorId: this.selfId,
            groupId: String(params.group_id ?? ''),
            announcementId: noticeId,
          })
          return { status: 'ok', retcode: 0, data: null }
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
        if (action === 'send_poke') {
          const targetId = String(params.target_id ?? params.user_id ?? '')
          if (params.group_id !== undefined) {
            const groupId = String(params.group_id)
            return this.control.performGroupAction({
              action: 'poke',
              operatorId: this.selfId,
              groupId,
              targetId,
              conversationId: createGroupConversationId(groupId),
            })
          }
          return this.control.performFriendAction({
            action: 'poke',
            operatorId: this.selfId,
            targetId,
            conversationId: createDirectConversationId(this.selfId, targetId),
          })
        }
        throw new Error(`OneBot action 已声明但未接入处理器：${capability.action}`)
    }
    const request = async (requestedAction: string, params: Record<string, unknown>) => {
      const startedAt = Date.now()
      let resolvedType: string | undefined
      try {
        const capability = resolveOneBotAction(this.implementation, this.disabledCapabilities, requestedAction)
        resolvedType = capability.handler
        const result = await executeRequest(capability, params)
        this.control.recordOneBotDebug({
          botId: this.selfId,
          implementation: this.implementation,
          direction: 'action',
          type: requestedAction,
          resolvedType,
          status: 'success',
          durationMs: Date.now() - startedAt,
          payload: params,
          result,
        })
        return result
      } catch (error) {
        const traceId = Random.id()
        this.ctx.logger('onebot-sandbox').error(`OneBot action 调用失败 [${traceId}]`, error)
        this.control.recordOneBotDebug({
          botId: this.selfId,
          implementation: this.implementation,
          direction: 'action',
          type: requestedAction,
          resolvedType,
          status: 'error',
          durationMs: Date.now() - startedAt,
          payload: params,
          error: {
            message: error instanceof Error ? error.message : 'OneBot action 调用失败',
            traceId,
          },
        })
        throw error
      }
    }
    const internal: SandboxBot.Internal = {
      _request: request,
      set_friend_add_request: (input) => request('set_friend_add_request', input),
      set_group_add_request: (input) => request('set_group_add_request', input),
    }
    this.internal = new Proxy(internal, {
      get: (target, property) => {
        if (property in target) return Reflect.get(target, property)
        if (typeof property === 'string') return (params: Record<string, unknown> = {}) => request(property, params)
      },
    })
  }

  updateImplementation(implementation: SandboxImplementationProfile, disabledCapabilities: string[] | undefined) {
    this.implementation = implementation
    this.disabledCapabilities = disabledCapabilities ?? []
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
    const result = await this.control.sendMessage({ operatorId: this.selfId, conversationId: channelId, content })
    return [result.messageId]
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

  private getOneBotMessageHistory(conversationId: string, params: Record<string, unknown>) {
    const count = Number(params.count ?? 20)
    const limit = Number.isInteger(count) && count > 0 ? Math.min(count, 100) : 20
    const messageSequence = Number(params.message_seq)
    let beforeMessageId: string | undefined
    if (Number.isFinite(messageSequence) && messageSequence > 0) {
      const conversation = this.getVisibleConversation(conversationId)
      beforeMessageId = conversation.messageIds.find((messageId) => getOneBotMessageSequence(messageId) === messageSequence)
      if (!beforeMessageId) throw new Error(`消息不存在：${params.message_seq}`)
    }
    const messages = this.control.getMessageHistory({
      operatorId: this.selfId,
      conversationId,
      limit,
      beforeMessageId,
    }).messages.map((message) => this.toOneBotMessage(message))
    if (params.reverseOrder === true || params.reverse_order === true) messages.reverse()
    return { status: 'ok', retcode: 0, data: { messages } }
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
    const snapshot = this.control.getSnapshot()
    const conversation = snapshot.conversations.find(({ id }) => id === message.conversationId)
    const directPeerId = conversation?.type === 'direct'
      ? getDirectConversationPeerId(conversation, this.selfId)
      : undefined
    const sequence = getOneBotMessageSequence(message.id)
    const participant = snapshot.participants.find(({ id }) => id === message.authorId)
    const groupMember = conversation?.groupId
      ? snapshot.groups.find(({ id }) => id === conversation.groupId)?.members.find(({ participantId }) => participantId === message.authorId)
      : undefined
    const onebotMessage = toOneBotMessageSegments(message.content, message.media)
    return {
      time: Math.floor(new Date(message.createdAt).getTime() / 1000),
      message_type: conversation?.type === 'group' ? 'group' : 'private',
      message_id: message.id,
      message_seq: sequence,
      real_id: sequence,
      sender: {
        user_id: Number(message.authorId),
        nickname: participant?.name ?? this.user?.name ?? message.authorId,
        ...(groupMember ? { card: groupMember.card ?? '', role: groupMember.role } : {}),
      },
      user_id: Number(conversation?.type === 'group' ? message.authorId : directPeerId ?? message.authorId),
      group_id: conversation?.groupId ? Number(conversation.groupId) : undefined,
      message: onebotMessage,
      message_format: 'array',
      font: 0,
      raw_message: toOneBotRawMessage(onebotMessage),
    }
  }
}
