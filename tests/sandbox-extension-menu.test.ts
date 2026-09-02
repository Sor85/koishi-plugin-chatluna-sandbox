import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  isSandboxExtensionAction,
  sandboxExtensionActions,
  SANDBOX_EXTENSION_DESCRIPTION,
} from '../client/webqq/sandbox-extension'

function readClientSource(path: string): string {
  return readFileSync(resolve('client', path), 'utf8')
}

function menuBlock(source: string, label: string): string {
  const labelIndex = source.indexOf(label)
  expect(labelIndex, `缺少菜单文案：${label}`).toBeGreaterThanOrEqual(0)
  const start = source.lastIndexOf('<ContextMenuItem', labelIndex)
  const end = source.indexOf('</ContextMenuItem>', labelIndex)
  expect(start, `缺少菜单项起点：${label}`).toBeGreaterThanOrEqual(0)
  expect(end, `缺少菜单项终点：${label}`).toBeGreaterThan(labelIndex)
  return source.slice(start, end)
}

describe('沙盒扩展菜单标识', () => {
  it('统一登记协议外的场景构造动作', () => {
    expect(sandboxExtensionActions).toEqual([
      'request-friend',
      'set-friend-remark',
      'request-join-group',
      'invite-group-member',
      'transfer-group-owner',
      'edit-environment-entity',
      'delete-environment-entity',
    ])
    expect(SANDBOX_EXTENSION_DESCRIPTION).toBe('非 OneBot action，仅用于构造测试场景')
    expect(isSandboxExtensionAction('transfer-group-owner')).toBe(true)
    expect(isSandboxExtensionAction('delete-friend')).toBe(false)
    expect(isSandboxExtensionAction('set-group-card')).toBe(false)
  })

  it('侧栏只给协议外动作显示标识', () => {
    const source = readClientSource('webqq-sidebar.vue')
    const extensionLabels = [
      '申请加入群组',
      '编辑群组',
      '删除群组',
      '发送好友申请',
      '设置好友备注',
      '邀请加入当前群组',
      "编辑{{ entry.isBot ? '机器人' : '用户' }}",
      "删除{{ entry.isBot ? '机器人' : '用户' }}",
      '编辑{{ conversation.entityLabel }}',
      '删除{{ conversation.entityLabel }}',
    ]
    const protocolLabels = ['修改群名称', '退出群组', '查看资料', '删除好友']

    for (const label of extensionLabels) {
      expect(menuBlock(source, label)).toContain('<WebqqMenuExtensionMark')
    }
    for (const label of protocolLabels) {
      expect(menuBlock(source, label)).not.toContain('<WebqqMenuExtensionMark')
    }
    expect(source).toContain("import WebqqMenuExtensionMark from './webqq-menu-extension-mark.vue'")
  })

  it('消息发送者菜单区分扩展关系操作与 OneBot 操作', () => {
    const source = readClientSource('webqq-message-list.vue')

    expect(menuBlock(source, '发送好友申请')).toContain('<WebqqMenuExtensionMark')
    expect(menuBlock(source, '设置好友备注')).toContain('<WebqqMenuExtensionMark')
    expect(menuBlock(source, '查看资料')).not.toContain('<WebqqMenuExtensionMark')
    expect(menuBlock(source, '戳一戳')).not.toContain('<WebqqMenuExtensionMark')
    expect(menuBlock(source, '删除好友')).not.toContain('<WebqqMenuExtensionMark')
  })

  it('发送者栈的环境实体操作都显示标识', () => {
    const source = readClientSource('webqq-composer.vue')

    expect(menuBlock(source, "编辑{{ sender.type === 'bot' ? '机器人' : '用户' }}")).toContain('<WebqqMenuExtensionMark')
    expect(menuBlock(source, "删除{{ sender.type === 'bot' ? '机器人' : '用户' }}")).toContain('<WebqqMenuExtensionMark')
  })

  it('复用可访问的 secondary Badge 且不修改鼠标指针', () => {
    const mark = readClientSource('webqq-menu-extension-mark.vue')
    const styles = readClientSource('styles/webqq-primitives.css')

    expect(mark).toContain("import { Badge } from '#client/components/ui/badge'")
    expect(mark).toContain('variant="secondary"')
    expect(mark).toContain('class="webqq-menu-extension-mark ml-auto shrink-0"')
    expect(mark).toContain('沙盒扩展')
    expect(mark).toContain(':title="SANDBOX_EXTENSION_DESCRIPTION"')
    expect(mark).toContain('class="sr-only"')
    expect(mark).not.toContain('cursor')
    expect(styles).not.toContain('.webqq-menu-extension-mark {')
  })
})
