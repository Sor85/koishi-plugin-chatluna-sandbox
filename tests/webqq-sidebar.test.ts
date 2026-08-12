import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('WebQQ 左侧栏', () => {
  it('只在 WebQQ 视图输出会话侧栏，并为最左导航提供名称提示', () => {
    const source = readFileSync(resolve('client/webqq-sidebar.vue'), 'utf8')
    const pageSource = readFileSync(resolve('client/page.vue'), 'utf8')

    const notificationSource = readFileSync(resolve('client/notification-menu.vue'), 'utf8')
    const sidebarStyles = readFileSync(resolve('client/styles/webqq-sidebar.css'), 'utf8')

    expect(source).toContain('<nav class="webqq-rail"')
    expect(source).toContain('<aside v-if="isWebqqView" class="webqq-conversations"')
    expect(source).toContain("currentView.value === 'messages' || currentView.value === 'contacts'")
    expect(source).not.toContain("{ id: 'contacts' as const, label: '联系人'")
    expect(source).toContain('<TooltipProvider>')
    expect(source).toContain('class="webqq-rail-tooltip-trigger"')
    expect(source).toContain('<TooltipContent side="right">{{ item.label }}</TooltipContent>')
    expect(source).toContain("from './components/ui/tooltip'")
    expect(source).not.toContain('<div class="webqq-sidebar-root"')
    expect(source).toContain("const searchQuery = ref('')")
    expect(source).toContain("const sidebarTab = ref<SidebarTab>('recent')")
    expect(source).toContain("const notificationTab = ref<'friends' | 'groups'>('friends')")
    expect(source).toContain("avatarKind: 'user' | 'bot' | 'group'")
    expect(source).toContain(':kind="conversation.avatarKind"')
    expect(source).not.toContain('class="webqq-avatar webqq-avatar-bot"\n                    :kind="conversation.groupId ? \'group\' : \'bot\'"')
    expect(source).toContain("group.conversationId && group.conversationId === activeConversationId")
    expect(source).toContain("entry.conversationId && entry.conversationId === activeConversationId")
    expect(source).toMatch(/import \{[^}]*IconPlus[^}]*\} from '@tabler\/icons-vue'/s)
    expect(source).toContain('visibleNavigationItems')
    expect(source).toContain("id === 'messages' || id === 'spaces'")
    expect(source).toContain("'is-rail-pin-bottom': item.id === 'spaces'")
    expect(sidebarStyles).toMatch(/\.webqq-rail-tooltip-trigger\.is-rail-pin-bottom\s*\{[^}]*margin-top:\s*auto/s)
    expect(source.indexOf("label: '调试'")).toBeLessThan(source.indexOf("label: 'AI 测试空间'"))
    expect(source.indexOf("label: '资料'")).toBeLessThan(source.indexOf("label: 'AI 测试空间'"))
    expect(sidebarStyles).toMatch(/\.webqq-sidebar-tabs button\s*\{[^}]*border-radius:\s*8px 8px 0 0/s)
    expect(sidebarStyles).toMatch(/\.webqq-sidebar-notify:hover,\s*\.webqq-sidebar-notify:focus-visible,\s*\.webqq-sidebar-notify\.is-active\s*\{[^}]*border-radius:\s*8px 8px 0 0/s)
    expect(source).toContain("'is-color-dark': colorMode === 'dark'")
    expect(source).not.toContain("'is-color-auto'")
    expect(source).toContain(':color-mode="colorMode"')
    expect(source).toContain("colorMode: 'light' | 'dark'")
    expect(notificationSource).toContain('v-webqq-scrollbar="{ showOverlay: false }"')
    const notificationRule = sidebarStyles.slice(sidebarStyles.indexOf('.webqq-notification-popover {')).split('}')[0]
    const plainNotificationRule = sidebarStyles.slice(sidebarStyles.indexOf('.webqq-notification-popover.is-plain {')).split('}')[0]
    const frostedNotificationRule = sidebarStyles.slice(sidebarStyles.indexOf('.webqq-notification-popover.is-frosted {')).split('}')[0]
    const darkNotificationRule = sidebarStyles.slice(sidebarStyles.indexOf('.webqq-notification-popover.is-color-dark {')).split('}')[0]
    expect(notificationRule).toContain('border: 1px solid transparent')
    expect(plainNotificationRule).toContain('border: 1px solid var(--webqq-secondary-outline)')
    expect(frostedNotificationRule).toContain('border: 1px solid color-mix(in srgb, var(--webqq-secondary-outline) 64%, transparent)')
    expect(plainNotificationRule).toContain('box-shadow: var(--webqq-secondary-shadow)')
    expect(plainNotificationRule).toContain('backdrop-filter: none')
    expect(darkNotificationRule).toContain('background: rgb(44 44 48 / 98%)')
    expect(sidebarStyles).toContain('background: rgb(57 57 63)')
    expect(sidebarStyles).not.toContain('@media (prefers-color-scheme: dark)')
    expect(pageSource).toContain('<WebqqSidebar')
    expect(pageSource).toContain(':active-space-id="activeSpaceId"')
    expect(pageSource).toContain(':color-mode="resolvedColorMode"')
    expect(pageSource).not.toContain('class="webqq-conversations"')
    expect(pageSource).toContain("'is-standalone-view': !isWebqqView")
    expect(pageSource).toContain('<WebqqDetailsPanel\n          v-if="isWebqqView"')
  })
})
