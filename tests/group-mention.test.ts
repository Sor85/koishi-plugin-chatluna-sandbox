import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  createEmptyComposerDraft,
  insertComposerMention,
  serializeComposerDraft,
} from '../client/webqq/composer-draft'
import { formatMentionContent } from '../client/webqq/mention'

describe('群聊右键提及成员', () => {
  it('右键提及按光标插入 token 并按顺序序列化为 Koishi at 消息元素', () => {
    const draft = insertComposerMention(
      createEmptyComposerDraft().tokens,
      0,
      0,
      { id: '10002', name: '测试用户2' },
    )
    const withText = insertComposerMention(
      [{ type: 'text', text: '你好' }],
      0,
      2,
      { id: '10002', name: '测试用户2' },
    )

    expect(serializeComposerDraft(draft.tokens)).toBe('<at id="10002"/>')
    expect(serializeComposerDraft(withText.tokens)).toBe('你好 <at id="10002"/>')
    expect(formatMentionContent('<at id="10002"/> 你好', { '10002': '测试用户2' })).toBe('@测试用户2 你好')
  })

  it('群成员列表与聊天头像共用提及事件并送入发送控件', () => {
    const menuSource = readFileSync(resolve('client/webqq/group-member-menu.vue'), 'utf8')
    const detailsSource = readFileSync(resolve('client/webqq/details-panel.vue'), 'utf8')
    const messageSource = readFileSync(resolve('client/webqq/message-list.vue'), 'utf8')
    const pageSource = readFileSync(resolve('client/workspace/page.vue'), 'utf8')
    const composerSource = readFileSync(resolve('client/webqq/composer.vue'), 'utf8')
    const shellSource = readFileSync(resolve('client/workspace/shell.ts'), 'utf8')
    // 会话列表预览的口径住在会话树投影 module 里；行为本身由 tests/conversation-tree.test.ts 验证。
    const conversationTreeSource = readFileSync(resolve('client/webqq/conversation-tree.ts'), 'utf8')

    expect(menuSource).toContain("actions.includes('mention')")
    expect(menuSource).toContain("emit('mention')")
    // 两处提及入口都在发出事件前记下焦点交接意图，让位判定由 menu-focus-handoff 的行为断言执行。
    expect(detailsSource).toContain("@mention=\"menuFocusHandoff.request(member.participantId); emit('mentionGroupMember', member.participantId)\"")
    // 消息头像菜单把高频提及动作提升到一级，但继续发出相同事件。
    expect(messageSource).toContain("emit('mentionGroupMember', message.authorId)\"")
    expect(pageSource).toContain('@mention-group-member="mentionGroupMember"')
    // 接线断言（ADR 0073 第 4 类）：提及请求确实交给草稿宿主，插入位置与光标落点由
    // composer-draft-host.test.ts「从别处插入提及」两条执行。少接这根线的表现是右键提及无反应。
    expect(composerSource).toContain('draftHost.insertMention({ id: mention.id, name: mention.name })')
    expect(composerSource).toContain('mentionCandidates')
    expect(conversationTreeSource).toContain('formatMentionContent(message.content, participantNames)')
    expect(shellSource).toContain('mentionCandidates')
    // 会话列表预览复用领域格式化函数，避免硬编码文案或直接展示撤回原文。
    expect(conversationTreeSource).toContain('formatRecalledMessageEventText(message, participantNames[operatorId] ?? operatorId)')
  })
})
