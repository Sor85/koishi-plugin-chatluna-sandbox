import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('WebQQ 共享样式', () => {
  it('按令牌、工作区、原语和覆盖层顺序加载', () => {
    const entry = readFileSync(resolve('client/style.css'), 'utf8')
    const tokens = readFileSync(resolve('client/styles/webqq-tokens.css'), 'utf8')
    const workspace = readFileSync(resolve('client/styles/webqq-workspace.css'), 'utf8')
    const primitives = readFileSync(resolve('client/styles/webqq-primitives.css'), 'utf8')
    const overlays = readFileSync(resolve('client/styles/webqq-overlays.css'), 'utf8')

    const imports = [
      '@import "./styles/webqq-tokens.css";',
      '@import "./styles/webqq-workspace.css";',
      '@import "./styles/webqq-primitives.css";',
      '@import "./styles/webqq-overlays.css";',
    ]
    expect(imports.map((value) => entry.indexOf(value))).toEqual([...imports.map((value) => entry.indexOf(value))].sort((a, b) => a - b))
    expect(tokens).toContain('--webqq-accent-shadow')
    expect(workspace).toContain('.onebot-sandbox-page')
    expect(workspace).toContain('.webqq-workspace.is-details-closed')
    expect(workspace).toContain('.webqq-workspace.is-standalone-view')
    expect(primitives).toContain('[data-webqq-scrollbar="true"]')
    expect(primitives).toContain('.webqq-avatar-bot-badge')
    expect(overlays).toContain('--webqq-secondary-row-gap: 8px')
    expect(overlays).toContain('.webqq-secondary-form')
    expect(overlays).toContain('.webqq-secondary-field')
    expect(entry).not.toContain('.webqq-scrollbar-overlay {')
    expect(entry).not.toContain('.webqq-secondary-form {')
  })
})
