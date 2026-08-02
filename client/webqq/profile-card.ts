import type {
  SandboxBotProfile,
  SandboxGroup,
  SandboxGroupMember,
  SandboxParticipant,
  SandboxSnapshot,
  SandboxUser,
} from '../../src/types'
import { isSandboxBot } from '../../src/types'

export interface ProfileCardField {
  label: '所在群' | '群名片' | '群身份' | '实现配置' | '启用状态' | '群成员' | '群公告'
  value: string
}

export interface ProfileCardModel {
  participantId: string
  name: string
  avatar?: string
  avatarKind: 'user' | 'bot' | 'group'
  identityLabel: 'QQ' | '群号'
  fields: ProfileCardField[]
}

function getGroupRole(member: SandboxGroupMember): string {
  if (member.role === 'owner') return '群主'
  if (member.role === 'admin') return '管理员'
  return '成员'
}

function getBotRuntimeFields(bot: SandboxBotProfile): ProfileCardField[] {
  return [
    { label: '实现配置', value: bot.implementation === 'napcat' ? 'NapCat' : 'LLBot' },
    { label: '启用状态', value: bot.enabled ? '已启用' : '已停用' },
  ]
}

export function buildProfileCardModel(input: {
  snapshot: Pick<SandboxSnapshot, 'participants' | 'friendships' | 'groups'>
  participantId: string
  viewerId?: string
  groupId?: string
}): ProfileCardModel | undefined {
  const participant = input.snapshot.participants.find(({ id }) => id === input.participantId) as SandboxParticipant | undefined
  if (!participant) return undefined
  const group = input.groupId
    ? input.snapshot.groups.find(({ id }) => id === input.groupId)
    : input.snapshot.groups.find(({ members }) => members.some(({ participantId }) => participantId === participant.id))
  const member = group?.members.find(({ participantId }) => participantId === participant.id)
  const fields: ProfileCardField[] = []
  if (group && member) {
    fields.push(
      { label: '所在群', value: group.name },
      { label: '群名片', value: member.card || '未设置' },
      { label: '群身份', value: getGroupRole(member) },
    )
  }
  if (isSandboxBot(participant)) fields.push(...getBotRuntimeFields(participant))
  return {
    participantId: participant.id,
    name: participant.name,
    avatar: participant.avatar,
    avatarKind: isSandboxBot(participant) ? 'bot' : 'user',
    identityLabel: 'QQ',
    fields,
  }
}

export function buildGroupProfileCardModel(group: SandboxGroup): ProfileCardModel {
  return {
    participantId: group.id,
    name: group.name,
    avatarKind: 'group',
    identityLabel: '群号',
    fields: [
      { label: '群成员', value: `${group.members.length} 人` },
      { label: '群公告', value: `${group.announcements.length} 条` },
    ],
  }
}

export function getParticipantPersonalNote(participant: SandboxUser | SandboxBotProfile | undefined): string | undefined {
  return participant?.profile?.personalNote
}
