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

  it('二级菜单统一使用共享标题、正文和操作区间距', () => {
    const dialogContent = readFileSync(resolve('client/components/ui/dialog/DialogContent.vue'), 'utf8')
    const dialogTitle = readFileSync(resolve('client/components/ui/dialog/DialogTitle.vue'), 'utf8')
    const dialogDescription = readFileSync(resolve('client/components/ui/dialog/DialogDescription.vue'), 'utf8')
    const dialogIndex = readFileSync(resolve('client/components/ui/dialog/index.ts'), 'utf8')
    const entityDialog = readFileSync(resolve('client/environment-entity-dialog.vue'), 'utf8')
    const overlayHost = readFileSync(resolve('client/workspace-overlay-host.vue'), 'utf8')
    const createPopover = readFileSync(resolve('client/environment-create-popover.vue'), 'utf8')

    expect(dialogContent).toContain('gap: var(--webqq-secondary-row-gap, 8px)')
    expect(dialogTitle).toContain('margin: 0')
    expect(dialogDescription).toContain('margin: 0')
    expect(dialogIndex).toContain("DialogHeader")
    expect(dialogIndex).toContain("DialogFooter")
    expect(entityDialog).toContain('<DialogHeader>')
    expect(entityDialog).toContain('<DialogFooter>')
    expect(entityDialog).toContain('class="webqq-secondary-form"')
    expect(overlayHost.match(/<DialogHeader>/g)).toHaveLength(2)
    expect(overlayHost.match(/<DialogFooter>/g)).toHaveLength(2)
    expect(createPopover).toContain('<form class="webqq-secondary-form"')
  })

  it('危险按钮和下拉浮层使用全局显式主题，避免 Portal 中样式退化', () => {
    const entityDialog = readFileSync(resolve('client/environment-entity-dialog.vue'), 'utf8')
    const buttonVariants = readFileSync(resolve('client/components/ui/button/index.ts'), 'utf8')
    const selectContent = readFileSync(resolve('client/components/ui/select/SelectContent.vue'), 'utf8')

    expect(entityDialog).toContain('variant="destructive"')
    expect(buttonVariants).toContain('bg-red-600 text-white shadow-xs')
    expect(selectContent).toContain('z-[200]')
    expect(selectContent).toContain('border-slate-200 bg-white text-slate-900')
  })

  it('Portal 二级菜单提供完整的 shadcn 颜色变量，避免控件回退为黑色描边', () => {
    const overlayStyles = readFileSync(resolve('client/styles/webqq-overlays.css'), 'utf8')

    for (const token of [
      '--color-background',
      '--color-primary',
      '--color-primary-foreground',
      '--color-accent',
      '--color-accent-foreground',
      '--color-border',
      '--color-input',
      '--color-ring',
    ]) {
      expect(overlayStyles).toContain(token)
    }

    expect(overlayStyles).toContain("[data-slot='input']")
    expect(overlayStyles).toContain("[data-slot='checkbox']")
    expect(overlayStyles).toContain("[data-slot='button'][data-variant='outline']")
    expect(overlayStyles).toContain("[data-slot='button']:not([data-variant])")
    expect(overlayStyles).toContain('border-color: var(--color-input)')
    expect(overlayStyles).toContain('background: var(--color-primary)')
  })
})
