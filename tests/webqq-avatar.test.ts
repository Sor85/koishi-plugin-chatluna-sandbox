import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('WebQQ 共享头像', () => {
  it('只渲染头像身份而不接管外层交互', () => {
    const source = readFileSync(resolve('client/webqq-avatar.vue'), 'utf8')

    expect(source).toContain("kind: 'user' | 'bot' | 'group'")
    expect(source).toContain("['webqq-identity-avatar'")
    expect(source).toContain(':alt="alt || name"')
    expect(source).toContain('@error="imageFailed = true"')
    expect(source).toContain('webqq-avatar-bot-badge')
    expect(source).not.toContain('ContextMenu')
    expect(source).not.toContain('Tooltip')
  })

  it('共享头像基线和所有尺寸变体保持圆形', () => {
    const primitives = readFileSync(resolve('client/styles/webqq-primitives.css'), 'utf8')
    const chat = readFileSync(resolve('client/styles/webqq-chat.css'), 'utf8')
    const overlays = readFileSync(resolve('client/styles/webqq-overlays.css'), 'utf8')

    expect(primitives).toMatch(/\.webqq-identity-avatar\s*\{[^}]*width:\s*var\(--webqq-avatar-size\)[^}]*height:\s*var\(--webqq-avatar-size\)[^}]*border-radius:\s*50%/s)
    expect(primitives).toMatch(/\.webqq-identity-avatar\s*>\s*img\s*\{[^}]*border-radius:\s*inherit/s)
    expect(chat).toMatch(/\.webqq-avatar-large\s*\{[^}]*border-radius:\s*50%/s)
    expect(overlays).toContain('--webqq-avatar-size: 48px')
    expect(overlays).toContain('--webqq-avatar-size: 40px')
  })

  it('主要身份区域统一使用共享头像', () => {
    const pageSource = readFileSync(resolve('client/page.vue'), 'utf8')
    const composerSource = readFileSync(resolve('client/webqq-composer.vue'), 'utf8')
    const messageListSource = readFileSync(resolve('client/webqq-message-list.vue'), 'utf8')
    const detailsPanelSource = readFileSync(resolve('client/webqq-details-panel.vue'), 'utf8')
    const sidebarSource = readFileSync(resolve('client/webqq-sidebar.vue'), 'utf8')
    const notificationSource = readFileSync(resolve('client/notification-menu.vue'), 'utf8')
    const environmentSource = readFileSync(resolve('client/environment-manager.vue'), 'utf8')

    const avatarCount = [pageSource, composerSource, messageListSource, detailsPanelSource, sidebarSource]
      .reduce((count, source) => count + (source.match(/<WebqqAvatar/g)?.length ?? 0), 0)
    expect(avatarCount).toBeGreaterThanOrEqual(10)
    expect(pageSource).not.toContain('<span v-if="entry.isBot" class="webqq-avatar-bot-badge">')
    expect(notificationSource).toContain('<WebqqAvatar')
    expect(environmentSource.match(/<WebqqAvatar/g)).toHaveLength(3)
  })

  it('把 sandbox-media 头像引用解析为可显示的 data URL', () => {
    const shellSource = readFileSync(resolve('client/webqq/workspace-shell.ts'), 'utf8')
    const sidebarSource = readFileSync(resolve('client/webqq-sidebar.vue'), 'utf8')
    expect(shellSource).toContain('resolveAvatar(reference')
    expect(shellSource).toContain('snapshot.value.participants.map(({ avatar }) => avatar)')
    expect(shellSource).toContain('data:${content.mimeType};base64,${content.dataBase64}')
    expect(shellSource).toContain('avatar: resolveAvatar(entry.avatar)')
    expect(shellSource).toContain('avatar: resolveAvatar(group.avatar)')
    expect(shellSource).toContain('const environmentModel = computed(() => ({')
    expect(sidebarSource).toContain(':avatar="group.avatar"')
  })
})
