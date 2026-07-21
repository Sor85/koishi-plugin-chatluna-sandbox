import { describe, expect, it } from 'vitest'
import { getIncomingNotificationRequests } from '../client/notification-requests'
import type { SandboxSnapshot } from '../src/types'

const snapshot = {
  revision: 0,
  users: [{ id: 'owner', name: '群主' }, { id: 'member', name: '成员' }, { id: 'applicant', name: '申请人' }],
  bots: [{ id: 'bot', name: '机器人', implementation: 'napcat', enabled: true }],
  groups: [{
    id: 'group',
    name: '测试群',
    members: [{ participantId: 'owner', role: 'owner' }, { participantId: 'member', role: 'member' }, { participantId: 'bot', role: 'member' }],
    announcements: [],
  }],
  conversations: [],
  messages: [],
  friendships: [],
  requests: [
    { id: 'friend', type: 'friend', requesterId: 'applicant', targetId: 'owner', status: 'pending', createdAt: '' },
    { id: 'group-request', type: 'group', requesterId: 'applicant', groupId: 'group', status: 'pending', createdAt: '' },
  ],
} satisfies SandboxSnapshot

describe('铃铛通知申请', () => {
  it('群主可以看到发给自己的好友申请和负责群组的入群申请', () => {
    expect(getIncomingNotificationRequests(snapshot, 'owner')).toEqual({
      friends: [snapshot.requests[0]],
      groups: [snapshot.requests[1]],
    })
  })

  it('普通群成员不能看到需要管理员审批的入群申请', () => {
    expect(getIncomingNotificationRequests(snapshot, 'member')).toEqual({ friends: [], groups: [] })
  })
})
