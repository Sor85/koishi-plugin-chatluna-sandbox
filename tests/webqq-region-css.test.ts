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
    expect(sources.chat).toContain('.chatluna-sandbox-chat-header')
    expect(sources.messages).toContain('.chatluna-sandbox-message-row')
    expect(sources.composer).toContain('.webqq-composer-user-stack')
    expect(sources.details).toContain('.chatluna-sandbox-group-member')
    expect(sources.details).toContain('.chatluna-sandbox-group-announcements {')
    expect(sources.details).toContain('border-color: rgb(113 113 122 / 36%);\n  background: rgb(57 57 63);')
    expect(sources.details).toMatch(/\.webqq-info-header \{[^}]*background: var\(--webqq-bg\);/s)
    expect(sources.details).toMatch(/\.chatluna-sandbox-group-announcements \{[^}]*background: var\(--webqq-bg\);/s)
    expect(entry).not.toContain('.webqq-session {')
    expect(entry).not.toContain('.chatluna-sandbox-message-row {\n  max-width: 74%')
    expect(entry).not.toContain('.webqq-composer {\n  position: absolute')
  })

  it('只允许用于状态装饰的点阵渐变，不使用区域背景渐变', () => {
    const styleDirectory = resolve('client/styles')
    const sources = readdirSync(styleDirectory)
      .filter((name) => name.endsWith('.css') && name !== 'tailwind.generated.css')
      .map((name) => readFileSync(resolve(styleDirectory, name), 'utf8'))
      .join('\n')
    const visibleBackgroundGradients = sources
      .split('\n')
      .filter((line) => /(?:background|background-image):.*gradient\s*\(/.test(line))

    expect(visibleBackgroundGradients).toEqual([
      '.webqq-agent-observe-dots { position: absolute; inset: 0; opacity: 0.5; background-image: radial-gradient(circle, rgb(55 55 55 / 10%) 1px, transparent 1px); background-size: 6px 6px; }',
      '.webqq-workspace[data-color-mode="dark"] .webqq-agent-observe-dots { background-image: radial-gradient(circle, rgb(255 255 255 / 15%) 1px, transparent 1px); }',
    ])
  })

  it('暗色模式区分聊天区与侧栏背景', () => {
    const workspace = readFileSync(resolve('client/styles/webqq-workspace.css'), 'utf8')

    expect(workspace).toContain('.webqq-workspace[data-color-mode="dark"] .chatluna-sandbox-chat,\n.webqq-workspace[data-color-mode="dark"] .chatluna-sandbox-chat-header {\n  background: rgb(44 44 48);')
    expect(workspace).toContain('.webqq-workspace[data-color-mode="dark"] .webqq-rail,')
    expect(workspace).toContain('.webqq-workspace[data-color-mode="dark"] .webqq-conversations {\n  background: rgb(37 37 41);')
    expect(workspace).toContain('.webqq-workspace[data-color-mode="dark"] .webqq-profile {\n  background: rgb(51 51 56);')
    expect(workspace).toContain('.webqq-workspace.is-frosted[data-color-mode="dark"] .chatluna-sandbox-chat,\n.webqq-workspace.is-frosted[data-color-mode="dark"] .chatluna-sandbox-chat-header {\n  background: rgb(44 44 48);')
    expect(workspace).toContain('.webqq-workspace.is-frosted[data-color-mode="dark"] .webqq-conversations {\n  background: rgb(37 37 41);')
    expect(workspace).toContain('.webqq-workspace.is-frosted[data-color-mode="dark"] .webqq-profile {\n  background: rgb(51 51 56);')
    expect(workspace).not.toMatch(/gradient\s*\(/)
  })
})
