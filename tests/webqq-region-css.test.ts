import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('WebQQ 区域样式', () => {
  it('按视觉区域加载且入口不保留区域规则', () => {
    const entry = readFileSync(resolve('client/style.css'), 'utf8')
    const files = ['sidebar', 'chat', 'messages', 'composer', 'details']
    const sources = Object.fromEntries(files.map((name) => [name, readFileSync(resolve(`client/styles/webqq-${name}.css`), 'utf8')]))

    expect(files.map((name) => entry.indexOf(`@import "./styles/webqq-${name}.css";`)))
      .toEqual([...files.map((name) => entry.indexOf(`@import "./styles/webqq-${name}.css";`))].sort((a, b) => a - b))
    expect(sources.sidebar).toContain('.webqq-conversations')
    expect(sources.sidebar).toMatch(
      /\.webqq-sidebar-tabs-row \{[^}]*background: transparent;[^}]*\}/s,
    )
    expect(sources.sidebar).not.toMatch(
      /\.webqq-sidebar-tabs-row \{[^}]*backdrop-filter:/s,
    )
    expect(sources.chat).toContain('.webqq-chat-header')
    expect(sources.messages).toContain('.webqq-message-row')
    expect(sources.composer).toContain('.webqq-composer-user-stack')
    expect(sources.details).toContain('.webqq-group-member')
    expect(sources.details).toContain('.webqq-group-announcements {')
    expect(sources.details).toMatch(/\.webqq-info-header \{[^}]*background: var\(--webqq-bg\);/s)
    expect(sources.details).toMatch(/\.webqq-group-announcements \{[^}]*background: var\(--webqq-bg\);/s)
    expect(entry).not.toContain('.webqq-session {')
    expect(entry).not.toContain('.webqq-message-row {\n  max-width: 74%')
    expect(entry).not.toContain('.webqq-composer {\n  position: absolute')
  })

  it('不使用可见背景渐变', () => {
    const styleDirectory = resolve('client/styles')
    const sources = readdirSync(styleDirectory)
      .filter((name) => name.endsWith('.css') && name !== 'tailwind.generated.css')
      .map((name) => readFileSync(resolve(styleDirectory, name), 'utf8'))
      .join('\n')
    const visibleBackgroundGradients = sources
      .split('\n')
      .filter((line) => /(?:background|background-image):.*gradient\s*\(/.test(line))

    expect(visibleBackgroundGradients).toEqual([])
  })

  it('暗色模式区分聊天区与侧栏背景', () => {
    const workspace = readFileSync(resolve('client/styles/webqq-workspace.css'), 'utf8')

    expect(workspace).toContain('.webqq-workspace[data-color-mode="dark"] .webqq-chat,\n.webqq-workspace[data-color-mode="dark"] .webqq-chat-header {\n  background: rgb(15 23 42);')
    expect(workspace).toContain('.webqq-workspace[data-color-mode="dark"] .webqq-rail,')
    expect(workspace).toContain('.webqq-workspace[data-color-mode="dark"] .webqq-conversations {\n  background: rgb(17 24 39);')
    expect(workspace).toContain('.webqq-workspace[data-color-mode="dark"] .webqq-profile {\n  background: rgb(30 41 59);')
    expect(workspace).toContain('.webqq-workspace.is-frosted[data-color-mode="dark"] .webqq-chat,\n.webqq-workspace.is-frosted[data-color-mode="dark"] .webqq-chat-header {\n  background: rgb(15 23 42);')
    expect(workspace).toContain('.webqq-workspace.is-frosted[data-color-mode="dark"] .webqq-conversations {\n  background: rgb(17 24 39);')
    expect(workspace).toContain('.webqq-workspace.is-frosted[data-color-mode="dark"] .webqq-profile {\n  background: rgb(30 41 59);')
    expect(workspace).not.toMatch(/gradient\s*\(/)
  })
})
