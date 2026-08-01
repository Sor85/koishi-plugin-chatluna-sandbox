import { useMediaQuery } from '@vueuse/core'
import { computed, onBeforeUnmount, watchEffect, type Ref } from 'vue'
import type { SandboxAppearance } from '../../src/types'

// 把 webQQColorMode 的 auto 解析为实际配色再交给模板输出：
// webqq-*.css 的暗色规则只匹配 data-color-mode="dark"，若把 "auto" 原样写到 DOM，
// 跟随系统进入暗色时这些规则全部失效（气泡、输入区等仍是亮色）。
// 同时把解析结果同步到 body，供 teleport 到 body 的 Dialog/Popover/Select 面板
// 跟随工作区配色，而不是控制台自身的 .dark 主题。
export function useResolvedColorMode(appearance: Ref<SandboxAppearance>): Ref<'light' | 'dark'> {
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)')
  const resolved = computed<'light' | 'dark'>(() => appearance.value.webQQColorMode === 'auto'
    ? (prefersDark.value ? 'dark' : 'light')
    : appearance.value.webQQColorMode)
  watchEffect(() => {
    document.body.dataset.sandboxColorScheme = resolved.value
  })
  onBeforeUnmount(() => {
    delete document.body.dataset.sandboxColorScheme
  })
  return resolved
}
