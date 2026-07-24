import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('WebQQ 主页面装配', () => {
  it('只装配工作区区域与组合模块', () => {
    const pageSource = readFileSync(resolve('client/page.vue'), 'utf8')
    const shellSource = readFileSync(resolve('client/webqq/workspace-shell.ts'), 'utf8')

    expect(pageSource).toContain('createWebqqWorkspaceShell')
    expect(pageSource).toContain('<WebqqSidebar')
    expect(pageSource).toContain('<WebqqChatPane')
    expect(pageSource).toContain('<WebqqDetailsPanel')
    expect(pageSource).toContain('<WorkspaceOverlayHost')
    expect(pageSource).not.toContain('snapshot.value')
    expect(pageSource).not.toContain('workspaceController.')
    expect(pageSource).not.toContain('async function sendComposerMessage')
    expect(pageSource).not.toContain('async function manageEnvironment')
    expect(shellSource).toContain('export function createWebqqWorkspaceShell')
    expect(shellSource).not.toContain('currentUserId')
    expect(shellSource).toContain('currentOperatorName: currentOperator.value?.name')
    expect(shellSource).toMatch(/avatarKind: group \? 'group'.*bot \? 'bot'.*'user'/)
    expect(shellSource).not.toContain("from '@koishijs/client'")
  })

  it('用户头像不继承机器人灰色样式', () => {
    const chatPaneSource = readFileSync(resolve('client/webqq-chat-pane.vue'), 'utf8')
    const messageListSource = readFileSync(resolve('client/webqq-message-list.vue'), 'utf8')
    const messageStyles = readFileSync(resolve('client/styles/webqq-messages.css'), 'utf8')

    expect(chatPaneSource).not.toContain('class="webqq-avatar webqq-avatar-bot"')
    expect(messageListSource).not.toContain('class="webqq-avatar webqq-avatar-large webqq-avatar-bot"')
    expect(messageStyles).not.toContain('.webqq-message-row.is-incoming .webqq-message-avatar:not(.is-bot)')
  })

  it('群环境编辑允许机器人承担群主角色', () => {
    const dialogSource = readFileSync(resolve('client/environment-entity-dialog.vue'), 'utf8')
    const createSource = readFileSync(resolve('client/environment-create-popover.vue'), 'utf8')

    expect(dialogSource).toContain('<SelectItem value="owner">群主</SelectItem>')
    expect(dialogSource).not.toContain('isBotParticipant')
    expect(createSource).toContain("currentOperator?: Pick<SandboxParticipant, 'id' | 'name'>")
    expect(createSource).toContain('.filter(({ id }) => id !== owner.id)')
  })

  it('机器人操作者与普通用户共用好友和群组操作入口', () => {
    const shellSource = readFileSync(resolve('client/webqq/workspace-shell.ts'), 'utf8')
    const sidebarSource = readFileSync(resolve('client/webqq-sidebar.vue'), 'utf8')
    const messageListSource = readFileSync(resolve('client/webqq-message-list.vue'), 'utf8')

    for (const source of [shellSource, sidebarSource, messageListSource]) {
      expect(source).not.toContain('currentOperatorIsBot')
    }
    expect(sidebarSource).not.toContain('当前机器人不支持主动申请加群')
    expect(sidebarSource).not.toContain('当前机器人不支持主动发送好友申请')
  })
})
