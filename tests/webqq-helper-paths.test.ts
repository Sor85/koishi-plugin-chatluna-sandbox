import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const helperFiles = [
  'workspace-state.ts',
  'message-cluster.ts',
  'user-stack.ts',
  'relationship-directory.ts',
  'notification-requests.ts',
  'friend-menu.ts',
  'group-menu.ts',
]

describe('WebQQ 辅助模块路径', () => {
  it('统一归属 WebQQ 功能目录且旧路径已删除', () => {
    for (const file of helperFiles) {
      expect(existsSync(resolve('client/webqq', file))).toBe(true)
      expect(existsSync(resolve('client', file))).toBe(false)
    }
  })

  it('客户端与测试不再引用旧辅助模块路径', () => {
    const sources = [
      'client/webqq-sidebar.vue',
      'client/webqq-composer.vue',
      'client/webqq-message-list.vue',
      'client/group-member-menu.vue',
      'tests/workspace-state.test.ts',
      'tests/message-cluster.test.ts',
      'tests/user-stack.test.ts',
      'tests/relationship-directory.test.ts',
      'tests/notification-requests.test.ts',
      'tests/friend-menu.test.ts',
      'tests/group-menu.test.ts',
    ].map(file => readFileSync(resolve(file), 'utf8')).join('\n')

    expect(sources).not.toMatch(/(?:\.\/|\.\.\/client\/)(?:workspace-state|message-cluster|user-stack|relationship-directory|notification-requests|friend-menu|group-menu)(?:'|")/)

    for (const file of ['workspace-controller.ts', 'workspace-layout.ts', 'workspace-shell.ts']) {
      const source = readFileSync(resolve('client/webqq', file), 'utf8')
      expect(source).not.toContain("from '../workspace-state'")
    }
  })
})
