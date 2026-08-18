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
    appearance.value.sandboxColorMode,
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

// 毛玻璃开关同样写到 body：teleport 到 body 的 Dialog/Popover/Select/右键菜单
// 和浮动二级页拿不到工作区 DOM 上的状态类，统一由 body[data-sandbox-frosted]
// 驱动实体/雾化双态，避免给每个浮层组件都穿一条 frosted prop 链。
export function useFrostedSurfaceFlag(appearance: Ref<SandboxAppearance>): void {
  watchEffect(() => {
    if (appearance.value.enableSandboxFrostedGlass) {
      document.body.dataset.sandboxFrosted = 'true'
    } else {
      delete document.body.dataset.sandboxFrosted
    }
  })
  onBeforeUnmount(() => {
    delete document.body.dataset.sandboxFrosted
  })
}
