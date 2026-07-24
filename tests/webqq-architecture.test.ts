import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const uiModules = [
  'client/webqq-sidebar.vue',
  'client/webqq-chat-pane.vue',
  'client/webqq-message-list.vue',
  'client/webqq-composer.vue',
  'client/webqq-details-panel.vue',
  'client/notification-menu.vue',
  'client/environment-create-popover.vue',
]

describe('WebQQ 模块化架构', () => {
  it('UI 模块不读取完整工作区快照或直接调用 Koishi RPC', () => {
    for (const file of uiModules) {
      const source = readFileSync(resolve(file), 'utf8')
      expect(source, file).not.toContain('SandboxSnapshot')
      expect(source, file).not.toMatch(/model\.snapshot|props\.snapshot/)
      expect(source, file).not.toMatch(/ctx\.console|koishiWorkspacePort|workspaceController/)
    }
  })

  it('主页面只负责工作台初始化与区域装配', () => {
    const source = readFileSync(resolve('client/page.vue'), 'utf8')

    expect(source).toContain('createWebqqWorkspaceShell')
    expect(source).not.toMatch(/SandboxSnapshot|ctx\.console|document\./)
    expect(source).not.toContain('async function')
  })
})
