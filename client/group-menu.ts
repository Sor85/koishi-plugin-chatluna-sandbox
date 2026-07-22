import type { SandboxGroupMember } from '../src/types'

export type GroupMemberMenuAction = 'poke' | 'set-card' | 'kick' | 'set-admin' | 'unset-admin' | 'transfer-owner'

export function getGroupMemberMenuActions(
  actor: SandboxGroupMember | undefined,
  target: SandboxGroupMember,
  targetIsBot: boolean,
): GroupMemberMenuAction[] {
  if (!actor) return []
  const actions: GroupMemberMenuAction[] = []
  if (actor.participantId !== target.participantId) actions.push('poke')
  if (actor.participantId === target.participantId
    || actor.role === 'owner'
    || (actor.role === 'admin' && target.role === 'member')) actions.push('set-card')
  if (actor.role === 'owner' && !targetIsBot && target.role !== 'owner') {
    actions.push(target.role === 'admin' ? 'unset-admin' : 'set-admin')
  }
  if (actor.role === 'owner' && actor.participantId !== target.participantId) actions.push('transfer-owner')
  if (actor.participantId !== target.participantId
    && target.role !== 'owner'
    && (actor.role === 'owner' || (actor.role === 'admin' && target.role === 'member'))) actions.push('kick')
  return actions
}
