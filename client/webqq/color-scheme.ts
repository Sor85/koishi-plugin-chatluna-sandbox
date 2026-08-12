import { useColorMode } from '@koishijs/client'
import { computed, onBeforeUnmount, watchEffect, type Ref } from 'vue'
import type { SandboxAppearance } from '../../src/types'
import { resolveSandboxColorMode } from './resolve-color-mode'

// Koishi 已经把控制台的自动主题解析成最终明暗模式；插件的 auto 必须继承该响应式结果，
// 不能再次读取 prefers-color-scheme，否则控制台被用户强制设为深色时 WebQQ 仍会跟随操作系统亮色。
// 同时把解析结果同步到 body，供 teleport 到 body 的 Dialog/Popover/Select 面板继承工作区配色。
export function useResolvedColorMode(appearance: Ref<SandboxAppearance>): Ref<'light' | 'dark'> {
  const koishiColorMode = useColorMode()
  const resolved = computed<'light' | 'dark'>(() => resolveSandboxColorMode(
    appearance.value.webQQColorMode,
    koishiColorMode.value,
  ))
  watchEffect(() => {
    document.body.dataset.sandboxColorScheme = resolved.value
  })
  onBeforeUnmount(() => {
    delete document.body.dataset.sandboxColorScheme
  })
  return resolved
}
