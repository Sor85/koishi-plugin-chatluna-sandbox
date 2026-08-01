import { describe, expect, it } from 'vitest'
import { getGroupMemberDisplayName, getGroupRoleBadge, getGroupRoleLabel } from '../client/webqq/group-display'

describe('WebQQ 群身份显示', () => {
  it('群名片优先，空白名片回退全局昵称', () => {
    expect(getGroupMemberDisplayName({ card: ' 群内昵称 ' }, '全局昵称')).toBe('群内昵称')
    expect(getGroupMemberDisplayName({ card: '   ' }, '全局昵称')).toBe('全局昵称')
    expect(getGroupMemberDisplayName(undefined, '全局昵称')).toBe('全局昵称')
  })

  it('角色标签保持详情栏文案，消息徽标只显示群主和管理员', () => {
    expect(getGroupRoleLabel('owner')).toBe('群主')
    expect(getGroupRoleLabel('admin')).toBe('管理员')
    expect(getGroupRoleLabel('member')).toBe('成员')
    expect(getGroupRoleBadge('owner')).toEqual({ text: '群主', kind: 'owner' })
    expect(getGroupRoleBadge('admin')).toEqual({ text: '管理员', kind: 'admin' })
    expect(getGroupRoleBadge('member')).toBeUndefined()
  })
})
