import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('WebQQ 左侧栏', () => {
  it('只在 WebQQ 视图输出会话侧栏，并为最左导航提供名称提示', () => {
    const source = readFileSync(resolve('client/webqq-sidebar.vue'), 'utf8')
    const pageSource = readFileSync(resolve('client/page.vue'), 'utf8')

    expect(source).toContain('<nav class="webqq-rail"')
    expect(source).toContain('<aside v-if="isWebqqView" class="webqq-conversations"')
    expect(source).toContain("currentView.value === 'messages' || currentView.value === 'contacts'")
    expect(source).not.toContain("{ id: 'contacts' as const, label: '联系人'")
    expect(source).toContain('<TooltipProvider>')
    expect(source).toContain('<span class="webqq-rail-tooltip-trigger">')
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
    expect(pageSource).toContain('<WebqqSidebar')
    expect(pageSource).not.toContain('class="webqq-conversations"')
    expect(pageSource).toContain("'is-standalone-view': !isWebqqView")
    expect(pageSource).toContain('<WebqqDetailsPanel\n          v-if="isWebqqView"')
  })
})
