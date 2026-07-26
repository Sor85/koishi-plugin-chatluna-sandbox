import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createWorkspaceLayoutId } from '../client/webqq/workspace-transition'

describe('AI 测试空间总览', () => {
  it('在主导航提供入口并渲染固定主场景、按时间排序空间和末尾创建卡', () => {
    const sidebar = readFileSync(resolve('client/webqq-sidebar.vue'), 'utf8')
    const overview = readFileSync(resolve('client/ai-test-space-overview.vue'), 'utf8')
    const styles = readFileSync(resolve('client/styles/webqq-spaces.css'), 'utf8')

    expect(sidebar).toContain("label: 'AI 测试空间'")
    expect(overview).toContain('主模拟 QQ 环境')
    expect(overview).toContain('filteredSpaces')
    expect(overview).toContain('创建测试空间')
    expect(overview).toContain("space.status === 'running'")
    expect(styles).toContain('@keyframes webqq-space-running')
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)')
  })

  it('使用真实 WebQQ 工作区从卡片位置缩放变形到整页', () => {
    const overview = readFileSync(resolve('client/ai-test-space-overview.vue'), 'utf8')
    const shell = readFileSync(resolve('client/webqq/test-space-shell.ts'), 'utf8')
    expect(overview).not.toContain('cloneNode')
    expect(shell).toContain("import { createLayout } from 'animejs'")
    expect(shell).toContain("children: '[data-layout-id^=\"webqq-space-\"]'")
    expect(shell).toContain('layout?.record()')
    expect(shell).toContain('const timeline = layout.animate({')
    expect(shell).toContain("'[data-layout-id^=\"node-\"]'")
    expect(shell).not.toContain('layout.revert()')
    expect(shell).not.toContain('workspace.animate(')
    expect(overview).toContain(':data-layout-id="createWorkspaceLayoutId(space.id)"')
    expect(createWorkspaceLayoutId()).toBe('webqq-space-main')
    expect(createWorkspaceLayoutId('space-1')).toBe('webqq-space-space-1')
  })
})
