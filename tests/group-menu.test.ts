import { describe, expect, it } from 'vitest'
import { getGroupMemberMenuActions } from '../client/group-menu'

const owner = { participantId: 'owner', role: 'owner' as const }
const admin = { participantId: 'admin', role: 'admin' as const }
const member = { participantId: 'member', role: 'member' as const }

describe('群成员右键菜单权限', () => {
  it('群主可以管理普通成员和管理员', () => {
    expect(getGroupMemberMenuActions(owner, member)).toEqual(['poke', 'set-card', 'set-admin', 'transfer-owner', 'kick'])
    expect(getGroupMemberMenuActions(owner, admin)).toEqual(['poke', 'set-card', 'unset-admin', 'transfer-owner', 'kick'])
  })

  it('管理员只能管理普通成员，普通成员只能修改自己名片', () => {
    expect(getGroupMemberMenuActions(admin, owner)).toEqual(['poke'])
    expect(getGroupMemberMenuActions(admin, member)).toEqual(['poke', 'set-card', 'kick'])
    expect(getGroupMemberMenuActions(member, member)).toEqual(['set-card'])
  })

  it('机器人和普通用户使用相同的群角色菜单', () => {
    expect(getGroupMemberMenuActions(owner, member)).toEqual(['poke', 'set-card', 'set-admin', 'transfer-owner', 'kick'])
  })
})
