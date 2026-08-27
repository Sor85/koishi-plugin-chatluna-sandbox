import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const SCALE = {
  '--webqq-font-3xs': '9px',
  '--webqq-font-2xs': '10px',
  '--webqq-font-xs': '11px',
  '--webqq-font-sm': '12px',
  '--webqq-font-md': '13px',
  '--webqq-font-lg': '14px',
  '--webqq-font-xl': '16px',
  '--webqq-font-2xl': '18px',
  '--webqq-font-3xl': '24px',
}

/** 头像首字母按圆形直径派生，是几何量而不是排版档位，允许保留字面 px。 */
const AVATAR_DERIVED = 'clamp(9px, calc(var(--webqq-avatar-size, 38px) / 3), 32px)'

function collectStyleSources() {
  const files: Array<[string, string]> = []
  for (const name of readdirSync('client/styles')) {
    if (!name.startsWith('webqq-') || !name.endsWith('.css')) continue
    files.push([`client/styles/${name}`, readFileSync(resolve('client/styles', name), 'utf8')])
  }
  const walk = (dir: string) => {
    for (const entry of readdirSync(resolve(dir), { withFileTypes: true })) {
      if (entry.isDirectory()) {
        walk(`${dir}/${entry.name}`)
      } else if (entry.name.endsWith('.vue')) {
        files.push([`${dir}/${entry.name}`, readFileSync(resolve(dir, entry.name), 'utf8')])
      }
    }
  }
  walk('client')
  return files
}

describe('排版标度', () => {
  it('把整套字号标度和等宽栈定义在所有渲染根上', () => {
    const tokens = readFileSync(resolve('client/styles/webqq-tokens.css'), 'utf8')
    const scaleRule = tokens.slice(0, tokens.indexOf('}'))

    // teleport 到 body 的浮层拿不到 .webqq-workspace 上的令牌，漏掉任何一个渲染根，
    // 那棵子树里的 var(--webqq-font-*) 会解析失败并静默退回继承字号。
    for (const root of [
      '.chatluna-sandbox-page',
      '.webqq-workspace',
      '.sandbox-dialog-content',
      '.sandbox-popover-content',
      '.sandbox-select-content',
      '[data-slot="chatluna-sandbox-context-menu-content"]',
      '[data-slot="chatluna-sandbox-context-menu-sub-content"]',
      '.chatluna-sandbox-secondary-page',
    ]) {
      expect(scaleRule).toContain(root)
    }

    for (const [token, value] of Object.entries(SCALE)) {
      expect(scaleRule).toContain(`${token}: ${value};`)
    }
    expect(scaleRule).toContain('--webqq-font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;')
  })

  it('工作区与浮层各自落一个基准字号，不继承宿主的 16px', () => {
    const workspace = readFileSync(resolve('client/styles/webqq-workspace.css'), 'utf8')
    const primitives = readFileSync(resolve('client/styles/webqq-primitives.css'), 'utf8')

    const workspaceRule = workspace.slice(workspace.indexOf('.webqq-workspace {')).split('}')[0]
    expect(workspaceRule).toContain('font-size: var(--webqq-font-md)')
    expect(workspaceRule).toContain('line-height: 1.5')

    // 浮层基准写在原语层：Dialog/Popover/Select/右键菜单/二级页各自是独立的继承树。
    const overlayBaseRule = primitives
      .slice(primitives.indexOf('.chatluna-sandbox-secondary-page {'))
      .split('}')[0]
    expect(overlayBaseRule).toContain('font-size: var(--webqq-font-md)')
  })

  it('头像首字母按直径派生，不再逐处硬编码', () => {
    const read = (name: string) => readFileSync(resolve('client/styles', name), 'utf8')
    const primitives = read('webqq-primitives.css')
    const chat = read('webqq-chat.css')

    expect(primitives).toContain(AVATAR_DERIVED)
    expect(read('webqq-messages.css')).toContain(AVATAR_DERIVED)

    // 这些直径此前各自带一个手写字号（9/10/10.667/12.667/24/25.333/28/32px）。
    for (const name of ['webqq-primitives.css', 'webqq-chat.css', 'webqq-details.css', 'webqq-debug.css', 'webqq-overlays.css']) {
      for (const stale of ['10.667px', '12.667px', '25.333px']) {
        expect(read(name), `${name} 不应再出现派生前的字面字号 ${stale}`).not.toContain(stale)
      }
    }

    // 大头像必须自带 --webqq-avatar-size，否则派生公式会退回 38px 基准。
    expect(chat.slice(chat.indexOf('.webqq-avatar-large {')).split('}')[0]).toContain('--webqq-avatar-size: 68px')
  })

  it('样式源里不再出现标度之外的字面字号或等宽栈', () => {
    const offenders: string[] = []
    for (const [file, source] of collectStyleSources()) {
      for (const match of source.matchAll(/font-size:\s*([^;{}]+)/g)) {
        const value = match[1].trim()
        if (value.startsWith('var(--webqq-font-')) continue
        if (value === AVATAR_DERIVED) continue
        offenders.push(`${file}: font-size: ${value}`)
      }
      // 收敛前这套等宽栈在 14 处重复，还分裂成三种不同排列。
      if (/font-family:\s*[^;{}]*(JetBrains Mono|SFMono-Regular|Cascadia Code|Menlo)/.test(source)) {
        offenders.push(`${file}: 硬编码等宽字体栈`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('工具定义摘要三段文本各占一档字号', () => {
    const styles = readFileSync(resolve('client/styles/webqq-model-requests.css'), 'utf8')
    const rule = (selector: string) => styles.slice(styles.indexOf(selector)).split('}')[0]

    // 三者原先都没写 font-size：工具名和描述一起继承成 16px，属性统计被
    // Tailwind preflight 的 small{80%} 变成 12.8px，看起来就是"描述比工具名大一号"。
    expect(rule('.webqq-model-analysis-tool-copy > strong {')).toContain('font-size: var(--webqq-font-md)')
    expect(rule('.webqq-model-analysis-tool-copy > strong {')).toContain('font-family: var(--webqq-font-mono)')
    expect(rule('.webqq-model-analysis-tool-desc > span {')).toContain('font-size: var(--webqq-font-sm)')
    expect(rule('.webqq-model-analysis-tool-copy > small {')).toContain('font-size: var(--webqq-font-xs)')
  })
})
