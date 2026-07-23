import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getFriendMenuActions } from '../client/webqq/friend-menu'

describe('好友操作菜单', () => {
  it('侧栏保留关系管理但不显示聊天互动', () => {
    expect(getFriendMenuActions({ isFriend: true, pendingOutgoing: false, pendingIncoming: false }, false))
      .toEqual(['remark', 'delete'])
  })

  it('聊天头像同时提供关系管理和戳一戳', () => {
    expect(getFriendMenuActions({ isFriend: true, pendingOutgoing: false, pendingIncoming: false }, true))
      .toEqual(['poke', 'remark', 'delete'])
    expect(getFriendMenuActions({ isFriend: false, pendingOutgoing: false, pendingIncoming: false }, true))
      .toEqual(['request'])
  })

  it('子菜单内容不重复使用 Portal', () => {
    const source = readFileSync(resolve('client/components/ui/context-menu/ContextMenuSubContent.vue'), 'utf8')
    expect(source).not.toContain('ContextMenuPortal')
  })
})
