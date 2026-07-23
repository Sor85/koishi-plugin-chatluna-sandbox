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

  it('主要身份区域统一使用共享头像', () => {
    const pageSource = readFileSync(resolve('client/page.vue'), 'utf8')
    const composerSource = readFileSync(resolve('client/webqq-composer.vue'), 'utf8')
    const notificationSource = readFileSync(resolve('client/notification-menu.vue'), 'utf8')
    const environmentSource = readFileSync(resolve('client/environment-manager.vue'), 'utf8')

    expect((pageSource.match(/<WebqqAvatar/g)?.length ?? 0) + (composerSource.match(/<WebqqAvatar/g)?.length ?? 0)).toBeGreaterThanOrEqual(10)
    expect(pageSource).not.toContain('<span v-if="entry.isBot" class="webqq-avatar-bot-badge">')
    expect(notificationSource).toContain('<WebqqAvatar')
    expect(environmentSource.match(/<WebqqAvatar/g)).toHaveLength(3)
  })
})
