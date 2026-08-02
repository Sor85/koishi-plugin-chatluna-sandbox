import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildProfileCardModel } from '../client/webqq/profile-card'
import type { SandboxSnapshot } from '../src/types'

const snapshot: SandboxSnapshot = {
  revision: 1,
  participants: [
    {
      kind: 'user',
      id: '10001',
      name: '测试用户1',
      profile: { personalNote: '用户签名', sex: 'male', age: 20, city: '杭州' },
    },
    {
      kind: 'bot',
      id: '20001',
      name: 'Koishi',
      implementation: 'napcat',
      enabled: true,
      disabledCapabilities: ['set_qq_profile'],
      profile: { personalNote: '机器人签名', sex: 'unknown' },
    },
  ],
  groups: [{
    id: '30001',
    name: '测试群',
    members: [
      { participantId: '10001', card: '群主名片', role: 'owner', title: '元老', area: '西湖', level: '5' },
      { participantId: '20001', card: 'Koishi', role: 'admin' },
    ],
    announcements: [],
  }],
  conversations: [],
  messages: [],
  friendships: [{
    id: 'friend:10001:20001',
    participantIds: ['10001', '20001'],
    remarks: { '10001': '机器人备注' },
    createdAt: '2026-01-01T00:00:00.000Z',
  }],
  requests: [],
}

describe('WebQQ 个人信息卡模型', () => {
  it('按账号、好友、群成员和机器人范围分组字段', () => {
    const card = buildProfileCardModel({
      snapshot,
      participantId: '20001',
      viewerId: '10001',
      groupId: '30001',
    })
    expect(card).toMatchObject({
      participantId: '20001',
      name: 'Koishi',
      isBot: true,
      personalNote: '机器人签名',
    })
    expect(card?.fields).toEqual(expect.arrayContaining([
      { scope: 'account', label: '个性签名', value: '机器人签名' },
      { scope: 'friend', label: '好友备注', value: '机器人备注' },
      { scope: 'group-member', label: '群名片', value: 'Koishi' },
      { scope: 'bot-runtime', label: '实现配置', value: 'NapCat' },
      { scope: 'bot-runtime', label: '禁用能力', value: 'set_qq_profile' },
    ]))
  })

  it('缺少可选资料时不伪造字段', () => {
    const card = buildProfileCardModel({
      snapshot: {
        ...snapshot,
        participants: [{ kind: 'user', id: '10009', name: '空资料用户' }],
        friendships: [],
        groups: [],
      },
      participantId: '10009',
    })
    expect(card?.fields).toEqual([
      { scope: 'account', label: 'QQ 号', value: '10009' },
      { scope: 'account', label: '昵称', value: '空资料用户' },
    ])
  })
})

describe('WebQQ 个人信息卡入口', () => {
  it('消息、私聊头部、好友列表和群成员列表提供查看资料', () => {
    const messageList = readFileSync(resolve('client/webqq-message-list.vue'), 'utf8')
    const chatPane = readFileSync(resolve('client/webqq-chat-pane.vue'), 'utf8')
    const sidebar = readFileSync(resolve('client/webqq-sidebar.vue'), 'utf8')
    const details = readFileSync(resolve('client/webqq-details-panel.vue'), 'utf8')
    const groupMemberMenu = readFileSync(resolve('client/group-member-menu.vue'), 'utf8')
    const overlay = readFileSync(resolve('client/workspace-overlay-host.vue'), 'utf8')
    const page = readFileSync(resolve('client/page.vue'), 'utf8')

    expect(messageList).toContain('查看资料')
    expect(messageList).toContain("emit('openProfile'")
    expect(chatPane).toContain('openProfile')
    expect(sidebar).toContain('查看资料')
    expect(sidebar).toContain("emit('openProfile'")
    expect(details).toContain("emit('openProfile'")
    expect(details).toContain('personalNote')
    expect(details).toContain('个性签名')
    expect(groupMemberMenu).toContain('查看资料')
    expect(overlay).toContain('个人信息卡')
    expect(overlay).toContain('openProfile')
    expect(page).toContain('openProfile')
  })
})
