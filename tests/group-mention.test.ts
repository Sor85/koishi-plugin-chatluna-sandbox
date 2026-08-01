import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { addComposerMention, buildMentionContent, formatMentionContent } from '../client/webqq/mention'

describe('群聊右键提及成员', () => {
  it('去重提及并编码为 Koishi at 消息元素', () => {
    const mentions = addComposerMention([], { id: '10002', name: '测试用户2' })
    expect(addComposerMention(mentions, { id: '10002', name: '重复名称' })).toEqual(mentions)
    expect(buildMentionContent(mentions, '你好')).toBe('<at id="10002"/> 你好')
    expect(buildMentionContent(mentions, '')).toBe('<at id="10002"/>')
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
    expect(messageSource).toContain("@mention=\"emit('mentionGroupMember', message.authorId)\"")
    expect(pageSource).toContain('@mention-group-member="mentionGroupMember"')
    expect(composerSource).toContain('buildMentionContent(mentions.value, input.value)')
    expect(shellSource).toContain('formatMentionContent(latestMessage.content, participantNames.value)')
  })
})
