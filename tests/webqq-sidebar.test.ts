import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('WebQQ 左侧栏', () => {
  it('以 Fragment 输出 rail 与 conversations 两个网格子节点', () => {
    const source = readFileSync(resolve('client/webqq-sidebar.vue'), 'utf8')
    const pageSource = readFileSync(resolve('client/page.vue'), 'utf8')

    expect(source).toContain('<nav class="webqq-rail"')
    expect(source).toContain('<aside class="webqq-conversations"')
    expect(source).not.toContain('<div class="webqq-sidebar-root"')
    expect(source).toContain("const searchQuery = ref('')")
    expect(source).toContain("const sidebarTab = ref<SidebarTab>('recent')")
    expect(source).toContain("const notificationTab = ref<'friends' | 'groups'>('friends')")
    expect(pageSource).toContain('<WebqqSidebar')
    expect(pageSource).not.toContain('class="webqq-conversations"')
  })
})
