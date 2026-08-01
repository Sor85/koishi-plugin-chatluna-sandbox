import type { SandboxGroupMember, SandboxGroupRole } from '../../src/types'

export function getGroupMemberDisplayName(member: Pick<SandboxGroupMember, 'card'> | undefined, participantName: string) {
  return member?.card?.trim() || participantName
}

export function getGroupRoleLabel(role: SandboxGroupRole) {
  if (role === 'owner') return '群主'
  if (role === 'admin') return '管理员'
  return '成员'
}

export function getGroupRoleBadge(role: SandboxGroupRole) {
  if (role === 'owner') return { text: '群主', kind: 'owner' as const }
  if (role === 'admin') return { text: '管理员', kind: 'admin' as const }
}
