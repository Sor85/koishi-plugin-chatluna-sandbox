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
    expect(debugSource).toMatch(/variant="destructive"[^>]*>\s*<IconTrash/s)
    expect(debugSource).toContain("record.direction === 'action' ? '输入' : '事件数据'")
    expect(debugSource).toContain("record.direction === 'action' ? '输出' : '处理结果'")
    expect(debugSource).toContain('不能重放')
    expect(debugSource).not.toContain("emit('replay'")
  })

  it('使用独立网格和显式 WebQQ 控件主题，避免筛选器溢出与黑色描边', () => {
    const debugSource = readFileSync(resolve('client/onebot-debug-workspace.vue'), 'utf8')
    const debugStyles = readFileSync(resolve('client/styles/webqq-debug.css'), 'utf8')

    expect(debugSource).toContain('webqq-debug-control')
    expect(debugSource).toContain('webqq-debug-button')
    expect(debugStyles).toMatch(/\.webqq-debug-workspace\s*\{[^}]*grid-template-rows:\s*auto auto minmax\(0, 1fr\)/s)
    expect(debugStyles).toMatch(/\.webqq-debug-control[^}]*border-color:\s*var\(--webqq-border\)/s)
    expect(debugStyles).toMatch(/\.webqq-debug-button[^}]*border-color:\s*var\(--webqq-border\)/s)
    expect(debugStyles).toMatch(/\.webqq-debug-records\s*\{[^}]*height:\s*100%/s)
  })
})
