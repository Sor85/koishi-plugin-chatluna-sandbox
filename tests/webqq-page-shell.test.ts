import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('WebQQ 主页面装配', () => {
  it('只装配工作区区域与组合模块', () => {
    const pageSource = readFileSync(resolve('client/page.vue'), 'utf8')
    const shellSource = readFileSync(resolve('client/webqq/workspace-shell.ts'), 'utf8')

    expect(pageSource).toContain('createWebqqWorkspaceShell')
    expect(pageSource).toContain('<WebqqSidebar')
    expect(pageSource).toContain('<WebqqChatPane')
    expect(pageSource).toContain('<WebqqDetailsPanel')
    expect(pageSource).toContain('<WorkspaceOverlayHost')
    expect(pageSource).not.toContain('snapshot.value')
    expect(pageSource).not.toContain('workspaceController.')
    expect(pageSource).not.toContain('async function sendComposerMessage')
    expect(pageSource).not.toContain('async function manageEnvironment')
    expect(shellSource).toContain('export function createWebqqWorkspaceShell')
    expect(shellSource).not.toContain("from '@koishijs/client'")
  })
})
