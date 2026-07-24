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

  it('跨区域 Dialog 由窄输入 OverlayHost 统一渲染', () => {
    const pageSource = readFileSync(resolve('client/page.vue'), 'utf8')
    const overlaySource = readFileSync(resolve('client/workspace-overlay-host.vue'), 'utf8')

    expect(pageSource).toContain('<WorkspaceOverlayHost')
    expect(pageSource).not.toContain('<Dialog')
    expect(overlaySource).not.toContain('SandboxSnapshot')
    expect(overlaySource).not.toContain('snapshot')
    expect(overlaySource).toContain('<EnvironmentEntityDialog')
    expect(overlaySource.match(/<Dialog /g)).toHaveLength(2)
  })

  it('机器人编辑 Dialog 使用 shadcn-vue 能力覆盖控件', () => {
    const source = readFileSync(resolve('client/environment-entity-dialog.vue'), 'utf8')

    expect(source).toContain('getOneBotProfileBaseline')
    expect(source).toContain('能力覆盖')
    expect(source).toContain('<Checkbox')
    expect(source).toContain("from './components/ui/badge'")
    expect(source).toContain('<Badge variant="secondary"')
    expect(source).toContain('搜索 action、别名或作用')
    expect(source).toContain('absolute inset-y-0 left-3 flex items-center')
    expect(source).toContain('items-center gap-2')
    expect(source).toContain('filteredCapabilities')
    expect(source).toContain('capability.description')
    expect(source).toContain('disabledCapabilities')
  })
})
