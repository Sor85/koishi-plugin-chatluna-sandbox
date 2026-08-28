import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
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

function listVueFiles(directory: string): string[] {
  return readdirSync(resolve(directory), { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return listVueFiles(join(directory, entry.name))
    return entry.name.endsWith('.vue') ? [join(directory, entry.name)] : []
  })
}

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

  /**
   * 模板里用到但没导入的图标不会让构建失败，只在运行时打一条
   * 「Failed to resolve component」警告，图标静默消失，因此需要守卫。
   */
  it('模板用到的每个图标都在脚本里导入', () => {
    for (const file of listVueFiles('client')) {
      const source = readFileSync(resolve(file), 'utf8')
      const scriptStart = source.indexOf('<script')
      if (scriptStart < 0) continue
      const template = source.slice(0, scriptStart)
      const script = source.slice(scriptStart)
      const used = new Set([
        ...template.matchAll(/<(Icon[A-Za-z0-9]+)/g),
        ...template.matchAll(/:is="(Icon[A-Za-z0-9]+)"/g),
      ].map(match => match[1]!))
      const imported = new Set([...script.matchAll(/\b(Icon[A-Za-z0-9]+)\b/g)].map(match => match[1]!))
      expect([...used].filter(icon => !imported.has(icon)), file).toEqual([])
    }
  })
})
