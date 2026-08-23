import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('WebQQ MCP 调用工作台', () => {
  it('从最左侧导航进入独立视图，并提供筛选、详情和清理控件', () => {
    const pageSource = readFileSync(resolve('client/page.vue'), 'utf8')
    const sidebarSource = readFileSync(resolve('client/webqq-sidebar.vue'), 'utf8')
    const shellSource = readFileSync(resolve('client/webqq/workspace-shell.ts'), 'utf8')
    const workspaceSource = readFileSync(resolve('client/mcp-call-workspace.vue'), 'utf8')
    const styles = readFileSync(resolve('client/styles/webqq-mcp-calls.css'), 'utf8')

    expect(sidebarSource).toMatch(/label:\s*['"]MCP 调用['"]/)
    expect(sidebarSource).toContain('IconHistory')
    expect(sidebarSource).toContain("id === 'messages' || id === 'model-requests' || id === 'presets' || id === 'spaces'")
    expect(sidebarSource).not.toContain("id === 'mcp-calls'")
    expect(sidebarSource.indexOf("label: '调试'")).toBeLessThan(sidebarSource.indexOf("label: 'MCP 调用'"))
    expect(sidebarSource.indexOf("label: 'MCP 调用'")).toBeLessThan(sidebarSource.indexOf("label: '模型请求'"))
    expect(pageSource).toContain("currentView === 'mcp-calls'")
    expect(pageSource).toContain('<McpCallWorkspace')
    expect(pageSource).toContain('@query="loadMcpCallRecords"')
    expect(pageSource).toContain('@open="loadMcpCallRecord"')
    expect(pageSource).toContain('@clear="clearMcpCallRecords"')
    expect(shellSource).toContain("if (view === 'mcp-calls') void loadMcpCallRecords()")
    expect(shellSource).toContain("if (currentView.value === 'mcp-calls') await loadMcpCallRecords()")
    expect(workspaceSource).toContain("from './components/ui/input'")
    expect(workspaceSource).toContain("from './components/ui/checkbox'")
    expect(workspaceSource).toContain("from './components/ui/button'")
    expect(workspaceSource).toContain('清理调用记录')
    expect(workspaceSource).toMatch(/variant="destructive"[^>]*>\s*<IconTrash/s)
    expect(workspaceSource).toContain('查看外部测试控制器的工具调用')
    expect(workspaceSource).toContain('选择一条记录查看参数和结果')
    expect(workspaceSource).toContain('detail.arguments')
    expect(workspaceSource).toContain('detail.result')
    expect(workspaceSource).toContain('detail.error')
    expect(workspaceSource).not.toContain("emit('replay'")
    expect(styles).toMatch(/\.webqq-mcp-call-workspace\s*\{[^}]*grid-template-rows:\s*auto auto minmax\(0, 1fr\)/s)
  })
})
