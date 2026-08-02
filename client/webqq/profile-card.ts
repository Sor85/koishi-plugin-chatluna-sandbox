import type {
  SandboxAccountProfile,
  SandboxBotProfile,
  SandboxFriendship,
  SandboxGroup,
  SandboxGroupMember,
  SandboxParticipant,
  SandboxSnapshot,
  SandboxUser,
} from '../../src/types'
import { isSandboxBot } from '../../src/types'

export type ProfileCardScope = 'account' | 'friend' | 'group-member' | 'bot-runtime'

export interface ProfileCardField {
  scope: ProfileCardScope
  label: string
  value: string
}

export interface ProfileCardModel {
  participantId: string
  name: string
  avatar?: string
  isBot: boolean
  personalNote?: string
  fields: ProfileCardField[]
}

const SEX_LABEL: Record<string, string> = {
  male: '男',
  female: '女',
  unknown: '未知',
}

function formatValue(value: string | number | boolean | string[] | undefined): string | undefined {
  if (value === undefined) return undefined
  if (Array.isArray(value)) return value.length ? value.join('、') : undefined
  if (typeof value === 'boolean') return value ? '是' : '否'
  return String(value)
}

function pushField(fields: ProfileCardField[], scope: ProfileCardScope, label: string, value: string | number | boolean | string[] | undefined) {
  const text = formatValue(value)
  if (text === undefined || text === '') return
  fields.push({ scope, label, value: text })
}

function accountFields(profile: SandboxAccountProfile | undefined, name: string, id: string): ProfileCardField[] {
  const fields: ProfileCardField[] = []
  pushField(fields, 'account', 'QQ 号', id)
  pushField(fields, 'account', '昵称', name)
  pushField(fields, 'account', '个性签名', profile?.personalNote)
  pushField(fields, 'account', '性别', profile?.sex ? SEX_LABEL[profile.sex] ?? profile.sex : undefined)
  pushField(fields, 'account', '年龄', profile?.age)
  pushField(fields, 'account', 'QID', profile?.qid)
  pushField(fields, 'account', '等级', profile?.level)
  pushField(fields, 'account', '登录天数', profile?.loginDays)
  pushField(fields, 'account', '注册时间', profile?.regTime)
  pushField(fields, 'account', '城市', profile?.city)
  pushField(fields, 'account', '国家', profile?.country)
  if (profile?.birthdayYear || profile?.birthdayMonth || profile?.birthdayDay) {
    pushField(fields, 'account', '生日', `${profile.birthdayYear ?? '?'}-${profile.birthdayMonth ?? '?'}-${profile.birthdayDay ?? '?'}`)
  }
  pushField(fields, 'account', '标签', profile?.labels)
  pushField(fields, 'account', 'VIP', profile?.isVip)
  pushField(fields, 'account', '年费 VIP', profile?.isYearsVip)
  pushField(fields, 'account', 'VIP 等级', profile?.vipLevel)
  return fields
}

function friendFields(friendship: SandboxFriendship | undefined, viewerId?: string): ProfileCardField[] {
  if (!friendship || !viewerId) return []
  const fields: ProfileCardField[] = []
  pushField(fields, 'friend', '好友备注', friendship.remarks[viewerId])
  pushField(fields, 'friend', '成为好友时间', friendship.createdAt)
  return fields
}

function groupMemberFields(member: SandboxGroupMember | undefined, group?: SandboxGroup): ProfileCardField[] {
  if (!member) return []
  const fields: ProfileCardField[] = []
  if (group) pushField(fields, 'group-member', '所在群', `${group.name}（${group.id}）`)
  pushField(fields, 'group-member', '群名片', member.card)
  pushField(fields, 'group-member', '群身份', member.role === 'owner' ? '群主' : member.role === 'admin' ? '管理员' : '成员')
  pushField(fields, 'group-member', '专属头衔', member.title)
  pushField(fields, 'group-member', '地区', member.area)
  pushField(fields, 'group-member', '加群时间', member.joinTime)
  pushField(fields, 'group-member', '最后发言', member.lastSentTime)
  pushField(fields, 'group-member', '群等级', member.level)
  pushField(fields, 'group-member', '不友好', member.unfriendly)
  pushField(fields, 'group-member', '头衔过期', member.titleExpireTime)
  pushField(fields, 'group-member', '可改名片', member.cardChangeable)
  pushField(fields, 'group-member', '禁言至', member.mutedUntil)
  return fields
}

function botRuntimeFields(bot: SandboxBotProfile): ProfileCardField[] {
  const fields: ProfileCardField[] = []
  pushField(fields, 'bot-runtime', '实现配置', bot.implementation === 'napcat' ? 'NapCat' : 'LLBot')
  pushField(fields, 'bot-runtime', '启用状态', bot.enabled ? '已启用' : '已停用')
  pushField(fields, 'bot-runtime', '禁用能力', bot.disabledCapabilities)
  return fields
}

export function buildProfileCardModel(input: {
  snapshot: Pick<SandboxSnapshot, 'participants' | 'friendships' | 'groups'>
  participantId: string
  viewerId?: string
  groupId?: string
}): ProfileCardModel | undefined {
  const participant = input.snapshot.participants.find(({ id }) => id === input.participantId) as SandboxParticipant | undefined
  if (!participant) return undefined
  const friendship = input.snapshot.friendships.find(({ participantIds }) => participantIds.includes(participant.id)
    && (!input.viewerId || participantIds.includes(input.viewerId)))
  const group = input.groupId
    ? input.snapshot.groups.find(({ id }) => id === input.groupId)
    : input.snapshot.groups.find(({ members }) => members.some(({ participantId }) => participantId === participant.id))
  const member = group?.members.find(({ participantId }) => participantId === participant.id)
  const fields = [
    ...accountFields(participant.profile, participant.name, participant.id),
    ...friendFields(friendship, input.viewerId),
    ...groupMemberFields(member, group),
    ...(isSandboxBot(participant) ? botRuntimeFields(participant) : []),
  ]
  return {
    participantId: participant.id,
    name: participant.name,
    avatar: participant.avatar,
    isBot: isSandboxBot(participant),
    personalNote: participant.profile?.personalNote,
    fields,
  }
}

export function getParticipantPersonalNote(participant: SandboxUser | SandboxBotProfile | undefined): string | undefined {
  return participant?.profile?.personalNote
}
