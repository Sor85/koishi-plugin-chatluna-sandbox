import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('WebQQ 响应式样式', () => {
  it('在所有区域和覆盖层之后最终加载', () => {
    const entry = readFileSync(resolve('client/style.css'), 'utf8')
    const responsive = readFileSync(resolve('client/styles/webqq-responsive.css'), 'utf8')
    const responsiveImport = '@import "./styles/webqq-responsive.css";'

    expect(entry.trim().endsWith(responsiveImport)).toBe(true)
    expect(entry.indexOf(responsiveImport)).toBeGreaterThan(entry.indexOf('@import "./styles/webqq-overlays.css";'))
    expect(responsive).toContain('@media (max-width: 1180px)')
    expect(responsive).toContain('@media (max-width: 768px)')
    expect(responsive).toContain('[data-mobile-view="debug"] .webqq-chat')
    expect(responsive).toContain('@media (prefers-reduced-motion: reduce)')
    expect(entry).not.toContain('@media (max-width: 1180px)')
  })
})
