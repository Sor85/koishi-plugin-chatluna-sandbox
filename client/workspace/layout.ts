import { computed, ref, watch, type Ref } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import {
  resolveDetailsPreferenceAfterLayoutChange,
  resolveDetailsVisibility,
  toggleDetailsPreference,
  type SandboxDetailsPreference,
} from './state'

export function createWorkspaceLayout(wideLayout: Ref<boolean> = useMediaQuery('(min-width: 1181px)')) {
  const detailsPreference = ref<SandboxDetailsPreference>('auto')
  const detailsVisible = computed(() => resolveDetailsVisibility(detailsPreference.value, wideLayout.value))

  watch(wideLayout, (value) => {
    detailsPreference.value = resolveDetailsPreferenceAfterLayoutChange(value)
  })

  return {
    detailsVisible,
    closeDetails: () => { detailsPreference.value = 'closed' },
    resetDetails: () => { detailsPreference.value = 'auto' },
    toggleDetails: () => { detailsPreference.value = toggleDetailsPreference(detailsVisible.value) },
  }
}
