import { nextTick, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { createWorkspaceLayout } from '../client/webqq/workspace-layout'

describe('WebQQ 工作区布局状态', () => {
  it('统一处理手动切换和浏览器宽度变化', async () => {
    const wideLayout = ref(true)
    const layout = createWorkspaceLayout(wideLayout)

    expect(layout.detailsVisible.value).toBe(true)
    layout.toggleDetails()
    expect(layout.detailsVisible.value).toBe(false)

    wideLayout.value = false
    await nextTick()
    expect(layout.detailsVisible.value).toBe(false)

    wideLayout.value = true
    await nextTick()
    expect(layout.detailsVisible.value).toBe(true)

    layout.closeDetails()
    expect(layout.detailsVisible.value).toBe(false)
    layout.resetDetails()
    expect(layout.detailsVisible.value).toBe(true)
  })
})
