import type { SandboxAppearance } from '../../src/types'

export function resolveSandboxColorMode(
  mode: SandboxAppearance['webQQColorMode'],
  koishiColorMode: 'light' | 'dark',
): 'light' | 'dark' {
  return mode === 'auto' ? koishiColorMode : mode
}
