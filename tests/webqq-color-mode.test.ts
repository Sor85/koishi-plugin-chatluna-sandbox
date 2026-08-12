import { describe, expect, it } from 'vitest'
import { resolveSandboxColorMode } from '../client/webqq/resolve-color-mode'

describe('WebQQ 配色模式', () => {
  it('自动模式跟随 Koishi 已解析的主题', () => {
    expect(resolveSandboxColorMode('auto', 'dark')).toBe('dark')
    expect(resolveSandboxColorMode('auto', 'light')).toBe('light')
  })

  it('显式配色优先于 Koishi 主题', () => {
    expect(resolveSandboxColorMode('dark', 'light')).toBe('dark')
    expect(resolveSandboxColorMode('light', 'dark')).toBe('light')
  })
})
