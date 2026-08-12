import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildGroupProfileCardModel,
  buildProfileCardModel,
  groupProfileCardFields,
} from '../client/webqq/profile-card'
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
  forwards: [],
  friendships: [{
    id: 'friend:10001:20001',
    participantIds: ['10001', '20001'],
    remarks: { '10001': '机器人备注' },
    createdAt: '2026-01-01T00:00:00.000Z',
  }],
  requests: [],
}

describe('WebQQ 个人信息卡模型', () => {
  it('按账号、好友、群成员和机器人运行分组展示全部可用资料', () => {
    const card = buildProfileCardModel({
      snapshot,
      participantId: '20001',
      viewerId: '10001',
      groupId: '30001',
    })
    expect(card).toMatchObject({
      participantId: '20001',
      name: 'Koishi',
      avatarKind: 'bot',
      identityLabel: 'QQ',
      personalNote: '机器人签名',
    })
    expect(card?.fields).toEqual([
      { group: 'account', label: '性别', value: '未知' },
      { group: 'friendship', label: '测试用户1 的备注', value: '机器人备注' },
      { group: 'group-member', label: '所在群', value: '测试群' },
      { group: 'group-member', label: '群号', value: '30001' },
      { group: 'group-member', label: '群身份', value: '管理员' },
      { group: 'group-member', label: '群名片', value: 'Koishi' },
      { group: 'bot-runtime', label: '实现配置', value: 'NapCat' },
      { group: 'bot-runtime', label: '启用状态', value: '已启用' },
      { group: 'bot-runtime', label: '已禁用能力', value: 'set_qq_profile' },
    ])
    expect(groupProfileCardFields(card!.fields).map(({ label }) => label)).toEqual([
      '账号资料',
      '好友资料',
      '群成员资料',
      '机器人运行',
    ])
  })

  it('用户卡片展示签名、账号字段和群成员字段，且不伪造缺失值', () => {
    const card = buildProfileCardModel({
      snapshot,
      participantId: '10001',
      groupId: '30001',
    })
    expect(card?.personalNote).toBe('用户签名')
    expect(card?.fields).toEqual(expect.arrayContaining([
      { group: 'account', label: '性别', value: '男' },
      { group: 'account', label: '年龄', value: '20' },
      { group: 'account', label: '城市', value: '杭州' },
      { group: 'friendship', label: '备注 Koishi', value: '机器人备注' },
      { group: 'group-member', label: '群名片', value: '群主名片' },
      { group: 'group-member', label: '专属头衔', value: '元老' },
      { group: 'group-member', label: '地区', value: '西湖' },
      { group: 'group-member', label: '群等级', value: '5' },
    ]))
    expect(card?.fields.some(({ value }) => value === '未设置')).toBe(false)
  })

  it('群资料与 OneBot get_group_info 使用同一群事实', () => {
    expect(buildGroupProfileCardModel(snapshot.groups[0])).toEqual({
      participantId: '30001',
      name: '测试群',
      avatarKind: 'group',
      identityLabel: '群号',
      fields: [
        { group: 'group', label: '群成员', value: '2 人' },
        { group: 'group', label: '群公告', value: '0 条' },
      ],
    })
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
    expect(card?.personalNote).toBeUndefined()
    expect(card?.fields).toEqual([])
  })
})

describe('WebQQ 个人信息卡入口', () => {
  it('消息、私聊头部和好友列表提供查看资料，群成员操作菜单不重复显示', () => {
    const messageList = readFileSync(resolve('client/webqq-message-list.vue'), 'utf8')
    const chatPane = readFileSync(resolve('client/webqq-chat-pane.vue'), 'utf8')
    const sidebar = readFileSync(resolve('client/webqq-sidebar.vue'), 'utf8')
    const details = readFileSync(resolve('client/webqq-details-panel.vue'), 'utf8')
    const groupMemberMenu = readFileSync(resolve('client/group-member-menu.vue'), 'utf8')
    const overlay = readFileSync(resolve('client/workspace-overlay-host.vue'), 'utf8')
    const page = readFileSync(resolve('client/page.vue'), 'utf8')
    const styles = readFileSync(resolve('client/styles/webqq-overlays.css'), 'utf8')

    expect(messageList).toContain('handleMessageAvatarClick(message, $event)')
    expect(messageList).toContain("emit('openProfile', message.authorId)")
    expect(chatPane).toContain('@click="openTitleProfile"')
    expect(chatPane).toContain('function openTitleProfile()')
    expect(chatPane).toContain("emit('openProfile', props.model.profileParticipantId)")
    expect(chatPane).toContain('profileGroupId')
    expect(chatPane).toContain("emit('openGroupProfile', props.model.profileGroupId)")
    expect(sidebar).toContain('查看资料')
    expect(sidebar).toContain("emit('openProfile'")
    expect(details).not.toContain('@open-profile=')
    expect(details).toContain('personalNote')
    expect(details).toContain('个性签名')
    expect(groupMemberMenu).not.toContain('查看资料')
    expect(groupMemberMenu).not.toContain("'open-profile': []")
    expect(overlay).toContain('class="webqq-secondary-page webqq-profile-card-page webqq-solid-secondary-surface onebot-sandbox-secondary-page onebot-sandbox-profile-card-page"')
    expect(styles).toContain('scrollbar-width: none')
    expect(overlay).not.toContain('<Dialog v-model:open="profileOpen">')
    expect(overlay).not.toContain('aria-label="返回聊天"')
    expect(overlay).toContain('openProfile')
    expect(overlay).toContain('{{ profileCard.identityLabel }} {{ profileCard.participantId }}')
    expect(overlay).toContain('profileCard.personalNote')
    expect(overlay).toContain('profileCardSections')
    expect(overlay).toContain("document.addEventListener('pointerdown', closeProfileOnOutsidePointer)")
    expect(page).toContain('@click.capture="rememberFloatingPanelAnchor"')
    expect(page).toContain('@contextmenu.capture="rememberFloatingPanelAnchor"')
    expect(page).toContain('openProfile')
    expect(page).toContain('@open-group-profile="openGroupProfile"')
    expect(styles).toContain('.webqq-profile-card-section')
    expect(styles).toContain('var(--webqq-muted)')
    expect(styles).toContain('var(--webqq-text)')
  })
})
