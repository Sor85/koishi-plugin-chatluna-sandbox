import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('环境管理组件传输边界', () => {
  it('创建和编辑组件只提交结构化环境命令', () => {
    const sources = [
      readFileSync(resolve('client/environment-create-popover.vue'), 'utf8'),
      readFileSync(resolve('client/environment-entity-dialog.vue'), 'utf8'),
    ]

    for (const source of sources) {
      expect(source).not.toContain("from '@koishijs/client'")
      expect(source).not.toContain('onebot-sandbox/manage-environment')
      expect(source).toContain('submit: [')
    }
  })
})
