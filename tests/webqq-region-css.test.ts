import { readFileSync } from 'node:fs'
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
    expect(sources.chat).toContain('.webqq-chat-header')
    expect(sources.messages).toContain('.webqq-message-row')
    expect(sources.composer).toContain('.webqq-composer-user-stack')
    expect(sources.details).toContain('.webqq-group-member')
    expect(entry).not.toContain('.webqq-session {')
    expect(entry).not.toContain('.webqq-message-row {\n  max-width: 74%')
    expect(entry).not.toContain('.webqq-composer {\n  position: absolute')
  })
})
