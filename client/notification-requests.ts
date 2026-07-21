import type { SandboxRelationshipRequest, SandboxSnapshot } from '../src/types'

export interface IncomingNotificationRequests {
  friends: SandboxRelationshipRequest[]
  groups: SandboxRelationshipRequest[]
}

export function getIncomingNotificationRequests(snapshot: SandboxSnapshot, actorUserId: string | undefined): IncomingNotificationRequests {
  if (!actorUserId) return { friends: [], groups: [] }

  const manageableGroupIds = new Set(snapshot.groups
    .filter(({ members }) => members.some(({ participantId, role }) => participantId === actorUserId && (role === 'owner' || role === 'admin')))
    .map(({ id }) => id))

  return {
    friends: snapshot.requests.filter(({ type, targetId }) => type === 'friend' && targetId === actorUserId),
    groups: snapshot.requests.filter(({ type, groupId }) => type === 'group' && !!groupId && manageableGroupIds.has(groupId)),
  }
}
