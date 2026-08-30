import { describe, expect, it } from 'vitest'
import { createConversationTreeExpansion } from '../client/webqq/conversation-tree-expansion'
import type { ConversationTreeInstanceRow, ConversationTreeNode } from '../client/webqq/conversation-tree'

function fields(id: string) {
  return {
    id,
    title: id,
    avatarKind: 'user' as const,
    preview: '',
    time: '',
    entityTarget: { type: 'user' as const, id: '10001' },
    entityLabel: '用户' as const,
  }
}

function instance(id: string): ConversationTreeInstanceRow {
  return { ...fields(id), kind: 'instance' }
}

function root(id: string, children: ConversationTreeInstanceRow[]): ConversationTreeNode {
  return { ...fields(id), kind: 'root', children }
}

/** 两个根会话，各挂一个会话实例。 */
function tree(): ConversationTreeNode[] {
  return [
    root('private:10001:20001', [instance('instance-1')]),
    root('group:30001', [instance('instance-2')]),
  ]
}

describe('侧栏会话树的展开态', () => {
  it('默认全部收起', () => {
    const expansion = createConversationTreeExpansion()

    expect(expansion.isConversationExpanded('private:10001:20001')).toBe(false)
  })

  it('切换一次展开，再切换一次收起，且只影响被切换的那一行', () => {
    const expansion = createConversationTreeExpansion()

    expansion.toggleConversationExpanded('private:10001:20001')
    expect(expansion.isConversationExpanded('private:10001:20001')).toBe(true)
    expect(expansion.isConversationExpanded('group:30001')).toBe(false)

    expansion.toggleConversationExpanded('private:10001:20001')
    expect(expansion.isConversationExpanded('private:10001:20001')).toBe(false)
  })

  it('选中一个会话实例后它所属那一行被补齐为展开', () => {
    // 新建与分叉完成后新实例会被自动选中；父行还收着的话侧栏一行都不会高亮。
    const expansion = createConversationTreeExpansion()

    expansion.revealConversation('instance-2', tree())

    expect(expansion.isConversationExpanded('group:30001')).toBe(true)
    expect(expansion.isConversationExpanded('private:10001:20001')).toBe(false)
  })

  it('手动收起后不因为仍然选中而被强行展开回去', () => {
    const expansion = createConversationTreeExpansion()
    expansion.revealConversation('instance-1', tree())

    expansion.toggleConversationExpanded('private:10001:20001')
    // 选中没有变，补齐只在选中变化时发生，因此用户的收起不会被立刻撤销。
    expansion.revealConversation('instance-1', tree())

    expect(expansion.isConversationExpanded('private:10001:20001')).toBe(false)
  })

  it('收起后重新选中同一个实例会再次补齐展开', () => {
    const expansion = createConversationTreeExpansion()
    expansion.revealConversation('instance-1', tree())
    expansion.toggleConversationExpanded('private:10001:20001')

    expansion.revealConversation('private:10001:20001', tree())
    expansion.revealConversation('instance-1', tree())

    expect(expansion.isConversationExpanded('private:10001:20001')).toBe(true)
  })

  it('选中根会话不改变任何展开态', () => {
    const expansion = createConversationTreeExpansion()
    expansion.toggleConversationExpanded('group:30001')

    expansion.revealConversation('private:10001:20001', tree())

    expect(expansion.isConversationExpanded('private:10001:20001')).toBe(false)
    expect(expansion.isConversationExpanded('group:30001')).toBe(true)
  })

  it('没有选中任何会话时不改变展开态', () => {
    const expansion = createConversationTreeExpansion()
    expansion.toggleConversationExpanded('group:30001')

    expansion.revealConversation(undefined, tree())

    expect(expansion.isConversationExpanded('group:30001')).toBe(true)
  })

  it('选中的会话不在会话树里时不改变展开态', () => {
    const expansion = createConversationTreeExpansion()

    expansion.revealConversation('instance-9', tree())

    expect(expansion.isConversationExpanded('private:10001:20001')).toBe(false)
    expect(expansion.isConversationExpanded('group:30001')).toBe(false)
  })

  it('实例被删除后残留的展开态不影响其余行', () => {
    const expansion = createConversationTreeExpansion()
    expansion.revealConversation('instance-1', tree())
    expansion.revealConversation('instance-2', tree())
    // 删掉第一个根会话下的唯一实例：那一行的展开态成了残留项。
    const shrunk = [root('private:10001:20001', []), root('group:30001', [instance('instance-2')])]

    expansion.revealConversation('instance-2', shrunk)
    expansion.toggleConversationExpanded('group:30001')

    expect(expansion.isConversationExpanded('group:30001')).toBe(false)
    // 残留项既不消失也不扩散：它只对自己那一行成立，而那一行已经没有子项可展开。
    expect(expansion.isConversationExpanded('private:10001:20001')).toBe(true)
    expect(expansion.isConversationExpanded('instance-1')).toBe(false)
  })
})
