import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('WebQQ 顶部导航与会话栏', () => {
  it('只在 WebQQ 视图输出会话侧栏，顶部导航不显示悬停提示', () => {
    const source = readFileSync(resolve('client/webqq-sidebar.vue'), 'utf8')
    const pageSource = readFileSync(resolve('client/page.vue'), 'utf8')

    const notificationSource = readFileSync(resolve('client/notification-menu.vue'), 'utf8')
    const sidebarStyles = readFileSync(resolve('client/styles/webqq-sidebar.css'), 'utf8')

    expect(source).toContain('<nav class="webqq-rail webqq-overlay-header"')
    expect(source).toContain('<div class="webqq-brand" aria-label="ChatLuna Sandbox">')
    expect(source).toContain('<SandboxActivityIcon />')
    expect(source).toContain('<strong>ChatLuna Sandbox</strong>')
    expect(source).toContain("import SandboxActivityIcon from './sandbox-activity-icon.vue'")
    expect(source).toContain('<span v-if="item.id !== \'spaces\'" class="webqq-rail-label">{{ item.label }}</span>')
    expect(sidebarStyles).not.toMatch(/\.webqq-brand\s*\{[^}]*border-right:/s)
    expect(sidebarStyles).toMatch(/\.webqq-brand-logo\s*\{[^}]*color:\s*var\(--webqq-accent\)/s)
    expect(sidebarStyles).not.toMatch(/\.webqq-brand-logo\s*\{[^}]*background:/s)
    expect(source).toContain('<aside v-if="isWebqqView" class="webqq-conversations"')
    expect(source).toContain("currentView.value === 'messages' || currentView.value === 'contacts'")
    expect(source).not.toContain("{ id: 'contacts' as const, label: '联系人'")
    expect(source).not.toContain('<TooltipProvider>')
    expect(source).not.toContain('<TooltipContent')
    expect(source).not.toContain("from './components/ui/tooltip'")
    expect(source).toContain('v-for="item in visibleNavigationItems"')
    expect(source).toContain('class="webqq-rail-label">{{ item.label }}</span>')
    expect(sidebarStyles).toMatch(/\.webqq-rail-button\s*\{[^}]*gap:\s*7px[^}]*padding:\s*0 14px/s)
    expect(sidebarStyles).toMatch(/\.webqq-rail-label\s*\{[^}]*font-size:\s*var\(--webqq-font-md\)/s)
    expect(source).not.toContain('<div class="webqq-sidebar-root"')
    expect(source).toContain("const searchQuery = ref('')")
    expect(source).toContain("const sidebarTab = ref<SidebarTab>('recent')")
    expect(source).toContain("const notificationTab = ref<'friends' | 'groups'>('friends')")
    expect(source).toContain(':kind="conversation.avatarKind"')
    expect(source).not.toContain('class="webqq-avatar webqq-avatar-bot"\n                    :kind="conversation.groupId ? \'group\' : \'bot\'"')
    expect(source).toContain("group.conversationId && group.conversationId === activeConversationId")
    expect(source).toContain("entry.conversationId && entry.conversationId === activeConversationId")
    expect(source).toMatch(/import \{[^}]*IconPlus[^}]*\} from '@tabler\/icons-vue'/s)
    expect(source).toContain('visibleNavigationItems')
    expect(source).toContain("id === 'messages' || id === 'spaces'")
    expect(source).not.toContain("id === 'messages' || id === 'model-requests' || id === 'presets' || id === 'spaces'")
    expect(source).toContain("label: '测试调用'")
    expect(source).toContain('IconHistory')
    expect(source).toContain("label: '模型请求'")
    expect(source).toContain('IconBrain')
    expect(source).toContain("label: '预设'")
    expect(source).toContain('IconFileCode')
    const navigationSource = source.slice(source.indexOf('const navigationItems = ['), source.indexOf('const visibleNavigationItems'))
    expect([...navigationSource.matchAll(/label: '([^']+)'/g)].map(match => match[1])).toEqual([
      '消息',
      '模型请求',
      '预设',
      'OneBot 调试',
      '测试调用',
      '环境管理',
      'AI 测试空间',
    ])
    expect(source).toContain('IconSettings')
    expect(source).toContain("'is-rail-pin-end': item.id === 'spaces'")
    expect(source).toContain("'is-mcp-running': item.id === 'spaces' && spacesBusy")
    expect(source).toContain('<SandboxAgentControlIcon v-if="item.id === \'spaces\'" :running="spacesBusy" />')
    expect(source).toContain("import SandboxAgentControlIcon from './sandbox-agent-control-icon.vue'")
    expect(source).not.toContain('IconLayoutGrid')
    expect(source).toContain('spacesBusy = computed(() => !!props.mcpRunning && !preview.value)')
    expect(pageSource).toContain(':mcp-running="mcpRunning"')
    expect(pageSource).toContain('createMcpActivitySync')
    expect(readFileSync(resolve('client/index.ts'), 'utf8')).toContain('installContextMcpActivityReceiver')
    expect(readFileSync(resolve('client/webqq/koishi-mcp-admin-port.ts'), 'utf8')).toContain("receive('chatluna-sandbox/mcp-activity'")
    expect(sidebarStyles).toMatch(/\.webqq-rail-button\.is-rail-pin-end\s*\{[^}]*margin-left:\s*auto/s)
    expect(sidebarStyles).toContain('.webqq-rail-button.is-mcp-running')
    expect(sidebarStyles).not.toContain('@keyframes webqq-rail-mcp-glow')
    expect(readFileSync(resolve('client/styles/webqq-spaces.css'), 'utf8')).toContain('@keyframes sandbox-agent-control-orbit')
    expect(source.indexOf("label: 'OneBot 调试'")).toBeLessThan(source.indexOf("label: 'AI 测试空间'"))
    expect(source.indexOf("label: '环境管理'")).toBeLessThan(source.indexOf("label: 'AI 测试空间'"))
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

describe('会话树的信息密度与展开控件', () => {
  /*
   * 侧栏是 .vue 组件，本仓库不引入组件挂载测试。按 ADR-0073 这里只用允许的几类源码断言：
   * 用户可见内容（时间、实例数量、无障碍标签）、样式源断言、否定式的「已删除实现」守卫，以及
   * 一条按规则跑遍样式源的死选择器守卫。
   *
   * 会话树的投影口径与展开态的三条行为都不在这里断言：它们住在
   * client/webqq/conversation-tree.ts 与 conversation-tree-expansion.ts 里，
   * 由 tests/conversation-tree.test.ts 与 tests/conversation-tree-expansion.test.ts
   * 在各自的 interface 上验证。组件确实驱动了它们这件事由浏览器实测执行验证，
   * 不用肯定式的源码接线断言冒充。
   *
   * 「什么时候出现」这类条件本身不在这里断言：模板条件的写法属于实现文本，锁住它只会在等价
   * 重构时变红。展开按钮随实例存在与否出现、页签切换后会话树消失，都由票 08 的浏览器实测逐项
   * 执行验证（Chrome 与 Firefox 各一轮）。
   */
  const sidebarSource = () => readFileSync(resolve('client/webqq-sidebar.vue'), 'utf8')
  const sidebarStyles = () => readFileSync(resolve('client/styles/webqq-sidebar.css'), 'utf8')

  it('展开态与那条自动展开规则不再住在组件里', () => {
    const source = sidebarSource()

    // 否定式的「已删除实现」守卫：把展开着的会话 ID 集合或找父行那条规则搬回组件时这里变红。
    expect(source).not.toContain('expandedConversationIds')
    expect(source).not.toContain('children.some(')
    expect(source).not.toContain('children?.some(')
  })

  it('会话行与实例子项都渲染最后消息时间', () => {
    const source = sidebarSource()

    expect(source).toContain('{{ conversation.time }}')
    expect(source).toContain('{{ child.time }}')
    // 时间与会话预览共用一套弱化前景色与字号，右上角定位在样式源里只有一处。
    expect(sidebarStyles()).toMatch(/\.webqq-session-copy small,\s*\.webqq-session time\s*\{[^}]*color:\s*var\(--webqq-muted\)/s)
    expect(sidebarStyles()).toMatch(/\.webqq-session time\s*\{[^}]*position:\s*absolute[^}]*top:\s*var\(--webqq-session-meta-top\)/s)
  })

  it('展开按钮显示实例数量，文案用领域词汇里的正式术语', () => {
    const source = sidebarSource()
    const expandButton = source.slice(source.indexOf('class="webqq-session-expand"') - 200, source.indexOf('webqq-session-expand-count') + 120)

    // 数量与无障碍标签都是用户可感知的内容：不展开就能知道这个联系人下有几个会话实例。
    expect(expandButton).toContain('{{ instanceCount(conversation) }}')
    expect(expandButton).toContain('个会话实例')
    // 「对话线」是 CONTEXT.md 明确列入 Avoid 的同义词，不得用它命名这个概念。
    expect(expandButton).not.toContain('对话线')
    expect(sidebarStyles()).toMatch(/\.webqq-session-expand-count\s*\{[^}]*font-size:\s*var\(--webqq-font-2xs\)/s)
    // 时间与展开按钮都从行的上沿起算，行高变化不会让两者互相压住。
    expect(sidebarStyles()).toMatch(/\.webqq-session-expand\s*\{[^}]*top:\s*calc\(var\(--webqq-session-meta-top\)/s)
  })

  it('「创建新会话」不再常驻子项列表末尾，只留右键入口', () => {
    const source = sidebarSource()
    const menus = [...source.matchAll(/<ContextMenuContent[\s\S]*?<\/ContextMenuContent>/g)].map(([menu]) => menu)

    // 常驻子项按钮及其样式一起删除：它占着每个展开会话的最后一行，而右键菜单已经有同一入口。
    expect(source).not.toContain('webqq-session-child-create')
    expect(sidebarStyles()).not.toContain('webqq-session-child-create')
    // 入口唯一：菜单项散成两处时，其中一处的行为回归不会被任何测试抓到。
    expect(menus.filter((menu) => menu.includes('创建新会话'))).toHaveLength(1)
  })

  it('样式源里没有无对应 class 的死选择器', () => {
    const source = sidebarSource()
    const styles = sidebarStyles()
    // .webqq-session-add 从来没有对应的模板 class，它的悬停规则一直是死代码。
    expect(styles).not.toContain('webqq-session-add')
    for (const selector of [...styles.matchAll(/\.(webqq-session[\w-]*)/g)].map(([, name]) => name)) {
      expect(source, selector).toContain(selector)
    }
  })

  it('会话树的页签收敛只有一处实现', () => {
    const source = sidebarSource()

    // 模板里重复判断一次页签是本票删掉的写法：数据源已经按页签收敛，两处判断迟早对不上。
    expect(source).not.toContain("sidebarTab === 'recent' ? filteredConversations : []")
  })
})

describe('会话树的改名与删除入口', () => {
  // 侧栏是 .vue 组件，本仓库不引入组件挂载测试。按 ADR-0073，这里只用两类允许的源码文本
  // 断言：用户可见文案，以及否定式的「已删除实现」守卫。改名与删除的行为本身由
  // tests/webqq-conversation-tree.test.ts 在工作台外壳的 interface 上逐个执行验证。
  it('实例子项的重命名与删除文案不被误删', () => {
    const source = readFileSync(resolve('client/webqq-sidebar.vue'), 'utf8')
    const overlaySource = readFileSync(resolve('client/workspace-overlay-host.vue'), 'utf8')

    expect(source).toContain('重命名会话')
    expect(source).toContain('删除会话')
    expect(overlaySource).toContain('<DialogTitle>重命名会话</DialogTitle>')
    expect(overlaySource).toContain('placeholder="输入会话名称"')
  })

  it('根会话行不再提供删除入口，客户端最近会话隐藏标记也不会被加回来', () => {
    const source = readFileSync(resolve('client/webqq-sidebar.vue'), 'utf8')
    const pageSource = readFileSync(resolve('client/page.vue'), 'utf8')
    // 根会话的右键菜单是唯一带「创建新会话」菜单项的那个 ContextMenuContent。
    const menus = [...source.matchAll(/<ContextMenuContent[\s\S]*?<\/ContextMenuContent>/g)].map(([menu]) => menu)
    const rootMenus = menus.filter((menu) => menu.includes('创建新会话'))

    expect(rootMenus).toHaveLength(1)
    // 根会话的存在由参与者关系与群组决定；删除入口只属于会话实例子项。
    expect(rootMenus[0]).not.toContain('删除会话')
    // 「最近会话隐藏标记」是本票删掉的假按钮，重新加回来时这三条守卫会变红。
    expect(source).not.toContain('removeRecentConversation')
    expect(pageSource).not.toContain('removeRecentConversation')
    for (const file of ['client/webqq/workspace-controller.ts', 'client/webqq/workspace-state.ts']) {
      expect(readFileSync(resolve(file), 'utf8'), file).not.toContain('hiddenRecentConversations')
    }
  })
})
