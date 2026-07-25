import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('WebQQ OneBot 调试工作台', () => {
  it('从最左侧导航进入独立视图并提供 shadcn-vue 筛选与清理控件', () => {
    const pageSource = readFileSync(resolve('client/page.vue'), 'utf8')
    const sidebarSource = readFileSync(resolve('client/webqq-sidebar.vue'), 'utf8')
    const debugSource = readFileSync(resolve('client/onebot-debug-workspace.vue'), 'utf8')

    expect(sidebarSource).toMatch(/label:\s*['"]调试['"]/)
    expect(sidebarSource).toContain('IconBug')
    expect(pageSource).toContain("currentView === 'debug'")
    expect(pageSource).toContain('<OneBotDebugWorkspace')
    expect(debugSource).toContain("from './components/ui/select'")
    expect(debugSource).toContain("from './components/ui/checkbox'")
    expect(debugSource).toContain("from './components/ui/button'")
    expect(debugSource).toContain('清理调试记录')
    expect(debugSource).toContain('不能重放')
    expect(debugSource).not.toContain("emit('replay'")
  })
})
