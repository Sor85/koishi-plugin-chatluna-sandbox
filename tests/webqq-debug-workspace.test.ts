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
    expect(pageSource).toContain('avatar: resolveAvatar(bot.avatar)')
    expect(debugSource).toContain("from './components/ui/select'")
    expect(debugSource).toContain("from './components/ui/checkbox'")
    expect(debugSource).toContain("from './components/ui/button'")
    expect(debugSource).toContain('清理调试记录')
    expect(debugSource).toMatch(/variant="destructive"[^>]*>\s*<IconTrash/s)
    expect(debugSource).toContain("record.direction === 'action' ? '输入' : '事件数据'")
    expect(debugSource).toContain("record.direction === 'action' ? '输出' : '处理结果'")
    expect(debugSource).toContain('不能重放')
    expect(debugSource).toContain('record.source.name')
    expect(debugSource).toContain('getRecordKey(record)')
    expect(debugSource).toContain('SandboxDirectoryBot')
    expect(debugSource).toContain("import WebqqAvatar from './webqq-avatar.vue'")
    expect(debugSource).toContain('class="webqq-debug-bot-avatar"')
    expect(debugSource).toContain(':avatar="bot.avatar"')
    expect(debugSource).toContain(':show-bot-badge="false"')
    expect(debugSource).toContain('countLargeValueSummaries')
    expect(debugSource).toContain('已折叠')
    expect(debugSource).not.toContain("emit('replay'")
  })

  it('使用独立网格和统一控件基线，避免筛选器溢出与黑色描边', () => {
    const debugSource = readFileSync(resolve('client/onebot-debug-workspace.vue'), 'utf8')
    const debugStyles = readFileSync(resolve('client/styles/webqq-debug.css'), 'utf8')
    const primitives = readFileSync(resolve('client/styles/webqq-primitives.css'), 'utf8')

    expect(debugSource).toContain('webqq-debug-control')
    expect(debugStyles).toMatch(/\.webqq-debug-bot-avatar\s*\{[^}]*border-radius:\s*50%/s)
    expect(debugStyles).toMatch(/\.webqq-debug-workspace\s*\{[^}]*grid-template-rows:\s*auto auto minmax\(0, 1fr\)/s)
    expect(debugStyles).toMatch(/\.webqq-debug-records\s*\{[^}]*height:\s*100%/s)
    // 控件颜色统一由 shadcn 控件基线接管：devMode 缺失按需工具类时也不会退化成黑描边或无底色
    expect(primitives).toContain('[data-slot="select-trigger"]')
    expect(primitives).toMatch(/\[data-variant="destructive"\][^}]*\{[^}]*background:\s*#dc2626/s)
  })
})
