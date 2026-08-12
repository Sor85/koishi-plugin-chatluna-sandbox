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
    const menuSource = readFileSync(resolve('client/group-member-menu.vue'), 'utf8')
    const detailsSource = readFileSync(resolve('client/webqq-details-panel.vue'), 'utf8')
    const messageSource = readFileSync(resolve('client/webqq-message-list.vue'), 'utf8')
    const pageSource = readFileSync(resolve('client/page.vue'), 'utf8')
    const composerSource = readFileSync(resolve('client/webqq-composer.vue'), 'utf8')
    const shellSource = readFileSync(resolve('client/webqq/workspace-shell.ts'), 'utf8')

    expect(menuSource).toContain("actions.includes('mention')")
    expect(menuSource).toContain("emit('mention')")
    expect(detailsSource).toContain("@mention=\"emit('mentionGroupMember', member.participantId)\"")
    // 消息头像菜单把高频提及动作提升到一级，但继续发出相同事件。
    expect(messageSource).toContain("@select=\"emit('mentionGroupMember', message.authorId)\"")
    expect(pageSource).toContain('@mention-group-member="mentionGroupMember"')
    expect(composerSource).toContain('serializeComposerDraft(draft.value.tokens)')
    expect(composerSource).toContain('insertComposerMention')
    expect(composerSource).toContain('mentionCandidates')
    expect(shellSource).toContain('formatMentionContent(latestMessage.content, participantNames.value)')
    expect(shellSource).toContain('mentionCandidates')
    // 会话列表预览复用领域格式化函数，避免硬编码文案或直接展示撤回原文。
    expect(shellSource).toContain('formatRecalledMessageEventText(latestMessage, operatorName)')
  })
})
