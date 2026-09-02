import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getOneBotProfileBaseline } from '../src/onebot-profiles'
import { isSandboxExtensionAction, SANDBOX_EXTENSION_DESCRIPTION } from '../client/webqq/sandbox-extension'
import {
  getGroupMemberMenuActions,
  isSandboxExtensionGroupMemberAction,
  type GroupMemberMenuAction,
} from '../client/webqq/group-menu'

const owner = { participantId: 'owner', role: 'owner' as const }
const admin = { participantId: 'admin', role: 'admin' as const }
const member = { participantId: 'member', role: 'member' as const }

describe('群成员右键菜单权限', () => {
  it('群主可以管理普通成员和管理员', () => {
    expect(getGroupMemberMenuActions(owner, member)).toEqual(['mention', 'poke', 'set-card', 'set-title', 'set-admin', 'transfer-owner', 'kick'])
    expect(getGroupMemberMenuActions(owner, admin)).toEqual(['mention', 'poke', 'set-card', 'set-title', 'unset-admin', 'transfer-owner', 'kick'])
  })

  it('管理员只能管理普通成员，普通成员只能修改自己名片', () => {
    expect(getGroupMemberMenuActions(admin, owner)).toEqual(['mention', 'poke'])
    expect(getGroupMemberMenuActions(admin, member)).toEqual(['mention', 'poke', 'set-card', 'kick'])
    expect(getGroupMemberMenuActions(member, member)).toEqual(['set-card'])
  })

  it('专属头衔只对群主开放，包括授予自己', () => {
    expect(getGroupMemberMenuActions(owner, owner)).toEqual(['set-card', 'set-title'])
    expect(getGroupMemberMenuActions(admin, member)).not.toContain('set-title')
    expect(getGroupMemberMenuActions(member, member)).not.toContain('set-title')
  })

  it('机器人和普通用户使用相同的群角色菜单', () => {
    expect(getGroupMemberMenuActions(owner, member)).toEqual(['mention', 'poke', 'set-card', 'set-title', 'set-admin', 'transfer-owner', 'kick'])
  })

  it('只把能力矩阵中不存在的转让群主标成协议外扩展', () => {
    const protocolActions: GroupMemberMenuAction[] = ['mention', 'poke', 'set-card', 'set-title', 'set-admin', 'unset-admin', 'kick']
    expect(isSandboxExtensionGroupMemberAction('transfer-owner')).toBe(true)
    expect(isSandboxExtensionAction('transfer-group-owner')).toBe(true)
    expect(SANDBOX_EXTENSION_DESCRIPTION).toBe('非 OneBot action，仅用于构造测试场景')
    for (const action of protocolActions) {
      expect(isSandboxExtensionGroupMemberAction(action)).toBe(false)
    }

    for (const profile of ['napcat', 'llbot'] as const) {
      const capabilities = getOneBotProfileBaseline(profile).capabilities
      const names = capabilities.flatMap(({ action, aliases }) => [action, ...(aliases ?? [])])
      expect(capabilities).toEqual(expect.arrayContaining([
        expect.objectContaining({ action: 'set_group_kick', surface: 'standard', supported: true }),
        expect.objectContaining({ action: 'set_group_admin', surface: 'standard', supported: true }),
        expect.objectContaining({ action: 'set_group_card', surface: 'standard', supported: true }),
        expect.objectContaining({ action: 'set_group_special_title', surface: 'standard', supported: true }),
        expect.objectContaining({ action: 'send_poke', surface: 'native', supported: true }),
      ]))
      expect(names.some(name => /transfer|set_group_owner/i.test(name))).toBe(false)
    }
  })

  it('群成员菜单只在转让群主后显示紧凑扩展标记', () => {
    const menuSource = readFileSync(resolve('client/group-member-menu.vue'), 'utf8')
    const markSource = readFileSync(resolve('client/webqq-menu-extension-mark.vue'), 'utf8')
    const transferBlock = menuSource.slice(
      menuSource.indexOf("actions.includes('transfer-owner')"),
      menuSource.indexOf("actions.includes('kick')"),
    )
    const unmarkedLabels = ['@ 用户', '戳一戳', '修改群名片', '设置专属头衔', '设为管理员', '取消管理员', '踢出群组']

    expect(transferBlock).toContain('<WebqqMenuExtensionMark')
    expect(menuSource).toContain("from './webqq-menu-extension-mark.vue'")
    expect(markSource).toContain('沙盒扩展')
    expect(markSource).toContain('SANDBOX_EXTENSION_DESCRIPTION')
    expect(markSource).toContain("from '#client/webqq/sandbox-extension'")
    expect(markSource).toContain("import { Badge } from '#client/components/ui/badge'")
    expect(markSource).toContain('variant="secondary"')
    expect(markSource).toContain('class="webqq-menu-extension-mark ml-auto shrink-0"')
    for (const label of unmarkedLabels) {
      const line = menuSource.split('\n').find(item => item.includes(label)) ?? ''
      expect(line).not.toContain('WebqqMenuExtensionMark')
    }
    expect(markSource).toContain('class="sr-only"')
    expect(markSource).not.toContain('cursor')
  })
})
