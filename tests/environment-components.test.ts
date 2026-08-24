import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('环境管理组件传输边界', () => {
  it('创建和编辑组件只提交结构化环境命令', () => {
    const sources = [
      readFileSync(resolve('client/environment-create-popover.vue'), 'utf8'),
      readFileSync(resolve('client/environment-entity-dialog.vue'), 'utf8'),
    ]

    for (const source of sources) {
      expect(source).not.toContain("from '@koishijs/client'")
      expect(source).not.toContain('chatluna-sandbox/manage-environment')
      expect(source).toContain('submit: [')
    }
  })

  it('环境管理页联邦展示主环境和测试空间机器人，并使用与模型请求页一致的左右布局', () => {
    const source = readFileSync(resolve('client/environment-manager.vue'), 'utf8')
    const page = readFileSync(resolve('client/page.vue'), 'utf8')

    expect(page).toContain('<EnvironmentManager :snapshot="environmentModel" :test-spaces="testSpaces" />')
    expect(source).toContain('<h1>环境管理</h1>')
    expect(source).toContain('<p>查看模拟 QQ 环境中的普通用户、机器人、群组和 MCP 凭证</p>')
    expect(source).toContain('class="environment-split"')
    expect(source).toContain('class="environment-list-pane"')
    expect(source).toContain('class="environment-detail-pane"')
    expect(source).toContain('grid-template-columns: minmax(280px, 360px) minmax(0, 1fr)')
    expect(source).toContain('grid-template-rows: minmax(180px, 36%) minmax(0, 1fr)')
    expect(source).toContain(':variant="section === item.id ? \'secondary\' : \'ghost\'"')
    expect(source).toContain('<Badge v-if="item.count !== undefined" variant="outline">')
    expect(source).not.toContain('<h1>模拟 QQ 环境</h1>')
    expect(source).not.toContain('集中查看')
    expect(source).not.toContain('<small>环境管理</small>')
    expect(source).toMatch(/\.environment-header h1\s*\{[^}]*font-size:\s*24px[^}]*font-weight:\s*700/s)
    expect(source).toContain('SandboxDirectoryBot')
    expect(source).toContain("source: { type: 'main' as const, name: '主环境' }")
    expect(source).toContain("source: { type: 'test-space' as const, spaceId: space.id, name: space.name }")
    expect(source).toContain('getSandboxBots(space.snapshot)')
    expect(source).toContain('{{ bot.source.name }}')
    expect(source).toContain('getSandboxUsers(props.snapshot)')
    expect(source).toContain('props.snapshot.groups')
  })

  it('跨区域 Dialog 由窄输入 OverlayHost 统一渲染', () => {
    const pageSource = readFileSync(resolve('client/page.vue'), 'utf8')
    const overlaySource = readFileSync(resolve('client/workspace-overlay-host.vue'), 'utf8')

    expect(pageSource).toContain('<WorkspaceOverlayHost')
    expect(pageSource).not.toContain('<Dialog')
    expect(overlaySource).toContain('<Teleport to="body">')
    expect(overlaySource).not.toContain('SandboxSnapshot')
    expect(overlaySource).not.toContain('snapshot')
    expect(overlaySource).toContain('<EnvironmentEntityDialog')
    expect(overlaySource).toContain('class="chatluna-sandbox-secondary-page chatluna-sandbox-profile-card-page chatluna-sandbox-solid-secondary-surface"')
    expect(overlaySource).not.toContain('<Dialog v-model:open="profileOpen">')
    expect(overlaySource.match(/<Dialog /g)).toHaveLength(2)
  })

  it('三类实体编辑与创建表单通过二级页面选择内置或本地头像', () => {
    const source = readFileSync(resolve('client/environment-entity-dialog.vue'), 'utf8')
    const picker = readFileSync(resolve('client/webqq-avatar-picker.vue'), 'utf8')
    const create = readFileSync(resolve('client/environment-create-popover.vue'), 'utf8')
    const shell = readFileSync(resolve('client/webqq/workspace-shell.ts'), 'utf8')

    expect(source).toContain('<WebqqAvatarPicker')
    expect(source).toContain('class="webqq-avatar-editor-trigger"')
    expect(source).not.toContain('show-bot-badge')
    expect(source).toContain(':kind="target?.type ?? \'user\'"')
    expect(source).toContain('avatar: draft.avatar')
    expect(create).toContain('<WebqqAvatarPicker')
    expect(create).toContain('<WebqqAvatar :kind="effectiveType"')
    expect(create).not.toContain('show-bot-badge')
    expect(create).toContain('input-id="environment-create-avatar-file"')
    expect(create).toContain('...(draft.avatar ? { avatar: draft.avatar } : {})')
    expect(picker).toContain('v-for="avatar in avatars"')
    expect(picker).toContain('class="webqq-avatar-picker-file-input"')
    expect(picker).toContain('class="webqq-avatar-picker-upload-button"')
    expect(picker).toContain('上传本地图片')
    expect(picker).not.toContain('<Input')
    expect(picker).toContain('type="file"')
    expect(picker).toContain('accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"')
    expect(picker).toContain('reader.readAsDataURL(file)')
    expect(shell).toContain('users: users.value.map((user) => ({ ...user, avatar: resolveAvatar(user.avatar) }))')
    expect(shell).toContain('avatar: resolveAvatar(participant.avatar)')
  })

  it('群组编辑以全部用户和机器人头像管理成员资料', () => {
    const source = readFileSync(resolve('client/environment-entity-dialog.vue'), 'utf8')
    const styles = readFileSync(resolve('client/styles/webqq-overlays.css'), 'utf8')

    expect(source).toContain('v-for="participant in participants"')
    expect(source).toContain('class="chatluna-sandbox-group-member-avatar"')
    expect(source).not.toContain('show-bot-badge')
    expect(source).toContain('{{ participant.id }}')
    expect(source).toContain('class="chatluna-sandbox-group-member-controls"')
    expect(source).toContain('class="chatluna-sandbox-group-member-edit"')
    expect(source).toContain('class="chatluna-sandbox-group-member-editor"')
    expect(source).toContain('editingMemberId')
    expect(source).toContain('memberRoleLabel')
    expect(source).toContain('@click="toggleGroupMember(participant.id)"')
    expect(source).toContain('`${editingParticipant.name}的群身份`')
    expect(source).toContain('`${editingParticipant.name}的群昵称`')
    expect(styles).toContain('.chatluna-sandbox-group-member-grid')
    expect(styles).not.toContain('--webqq-bot-badge')
    expect(styles).not.toContain('.webqq-avatar-bot-badge')
    expect(styles).toMatch(/\.chatluna-sandbox-group-member-state\s*\{[^}]*z-index:\s*2/s)
    expect(styles).toContain('.chatluna-sandbox-group-member-card.is-selected')
    expect(styles).toContain('@media (max-width: 640px)')
  })

  it('机器人编辑 Dialog 使用 shadcn-vue 能力覆盖控件', () => {
    const source = readFileSync(resolve('client/environment-entity-dialog.vue'), 'utf8')

    expect(source).toContain('getOneBotProfileBaseline')
    expect(source).toContain('能力覆盖')
    expect(source).toContain('<Checkbox')
    expect(source).toContain("from './components/ui/badge'")
    expect(source).toContain('<Badge variant="secondary"')
    expect(source).toContain('搜索 action、别名或作用')
    expect(source).toContain('absolute inset-y-0 left-3 flex items-center')
    expect(source).toContain('items-center gap-2')
    expect(source).toContain('class="webqq-secondary-panel overflow-hidden rounded-lg"')
    expect(source).toContain('class="webqq-capability-list grid max-h-48 gap-2 overflow-y-auto p-3"')
    expect(source).toContain('filteredCapabilities')
    expect(source).toContain('capability.description')
    expect(source).toContain('disabledCapabilities')
  })

  it('实体编辑 Dialog 将标题、滚动正文和操作区分层，避免长表单遮挡操作按钮', () => {
    const source = readFileSync(resolve('client/environment-entity-dialog.vue'), 'utf8')
    const styles = readFileSync(resolve('client/styles/webqq-overlays.css'), 'utf8')

    expect(source).toContain("'webqq-entity-editor-dialog': mode === 'edit'")
    expect(source).toContain('class="webqq-entity-editor-form"')
    expect(source).toContain('class="webqq-entity-editor-body webqq-secondary-form"')
    expect(styles).toMatch(/\.webqq-entity-editor-dialog\s*\{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\)[^}]*overflow:\s*hidden/s)
    expect(styles).toMatch(/\.webqq-entity-editor-form\s*\{[^}]*grid-template-rows:\s*minmax\(0, 1fr\) auto[^}]*min-height:\s*0[^}]*overflow:\s*hidden/s)
    expect(styles).toMatch(/\.webqq-entity-editor-body\s*\{[^}]*min-height:\s*0[^}]*overflow-y:\s*auto[^}]*padding-right:\s*12px/s)
  })

  it('二级菜单统一使用共享标题、正文和操作区间距', () => {
    const dialogContent = readFileSync(resolve('client/components/ui/dialog/DialogContent.vue'), 'utf8')
    const dialogTitle = readFileSync(resolve('client/components/ui/dialog/DialogTitle.vue'), 'utf8')
    const dialogDescription = readFileSync(resolve('client/components/ui/dialog/DialogDescription.vue'), 'utf8')
    const dialogIndex = readFileSync(resolve('client/components/ui/dialog/index.ts'), 'utf8')
    const entityDialog = readFileSync(resolve('client/environment-entity-dialog.vue'), 'utf8')
    const overlayHost = readFileSync(resolve('client/workspace-overlay-host.vue'), 'utf8')
    const createPopover = readFileSync(resolve('client/environment-create-popover.vue'), 'utf8')

    expect(dialogContent).toContain('gap: var(--webqq-secondary-row-gap, 8px)')
    expect(dialogContent).toContain('v-webqq-scrollbar="{ showOverlay: false, zIndex: 160 }"')
    expect(dialogTitle).toContain('margin: 0')
    expect(dialogDescription).toContain('margin: 0')
    expect(dialogIndex).toContain("DialogHeader")
    expect(dialogIndex).toContain("DialogFooter")
    expect(entityDialog).toContain('<DialogHeader>')
    expect(entityDialog).toContain('<DialogFooter>')
    expect(entityDialog).toContain('class="webqq-secondary-form"')
    expect(overlayHost.match(/<DialogHeader>/g)).toHaveLength(2)
    expect(overlayHost.match(/<DialogFooter>/g)).toHaveLength(2)
    expect(createPopover).toContain('class="webqq-environment-create-popover relative"')
    expect(createPopover).toContain(":class=\"{ 'is-color-dark': colorMode === 'dark' }\"")
    expect(createPopover).toContain("colorMode: 'light' | 'dark'")
    expect(createPopover).toContain('class="webqq-secondary-form"')
  })

  it('危险按钮和下拉浮层使用统一控件基线，避免 Portal 中样式退化', () => {
    const entityDialog = readFileSync(resolve('client/environment-entity-dialog.vue'), 'utf8')
    const dialogContent = readFileSync(resolve('client/components/ui/dialog/DialogContent.vue'), 'utf8')
    const popoverContent = readFileSync(resolve('client/components/ui/popover/PopoverContent.vue'), 'utf8')
    const selectContent = readFileSync(resolve('client/components/ui/select/SelectContent.vue'), 'utf8')
    const primitives = readFileSync(resolve('client/styles/webqq-primitives.css'), 'utf8')

    expect(entityDialog).toContain('variant="destructive"')
    expect(dialogContent).toContain('sandbox-dialog-content chatluna-sandbox-solid-secondary-surface')
    expect(popoverContent).toContain('sandbox-popover-content chatluna-sandbox-solid-secondary-surface')
    expect(selectContent).toContain('z-[200]')
    expect(selectContent).toContain('sandbox-select-content chatluna-sandbox-solid-secondary-surface')
    expect(selectContent).toContain('v-webqq-scrollbar="{ showOverlay: false }"')
    expect(primitives).toContain('.sandbox-select-content')
    const dialogPopoverRule = primitives.slice(primitives.indexOf('.sandbox-dialog-content,\n.sandbox-popover-content {')).split('}')[0]
    const solidSurfaceRule = primitives.slice(primitives.indexOf('.chatluna-sandbox-solid-secondary-surface:not(.is-frosted) {')).split('}')[0]
    expect(dialogPopoverRule).toContain('border-color: transparent')
    expect(solidSurfaceRule).toContain('border-color: var(--webqq-secondary-outline)')
    expect(solidSurfaceRule).toContain('box-shadow: var(--webqq-secondary-shadow)')
    expect(solidSurfaceRule).toContain('backdrop-filter: none')
  })

  it('Portal 二级菜单提供完整的控件令牌，避免控件回退为黑色描边', () => {
    const tokens = readFileSync(resolve('client/styles/webqq-tokens.css'), 'utf8')
    const primitives = readFileSync(resolve('client/styles/webqq-primitives.css'), 'utf8')

    // teleport 面板拿不到 .webqq-workspace 上的令牌，必须有镜像定义（含 .dark 暗色）
    expect(tokens).toContain('.sandbox-dialog-content')
    expect(tokens).toContain('body[data-sandbox-color-scheme="dark"] .sandbox-dialog-content')
    expect(tokens).toContain('--webqq-bg: #2c2c30')
    expect(tokens).toContain('--webqq-surface-muted: #323238')
    expect(tokens).toContain('--webqq-border: #45454c')
    expect(tokens).toContain('--webqq-hover: #39393f')
    expect(tokens).toContain('--webqq-panel: #333338')
    expect(primitives).toContain('[data-slot="input"]')
    expect(primitives).toContain('[data-slot="checkbox"]')
    expect(primitives).toContain('[data-slot="button"][data-variant="outline"]')
    expect(primitives).toContain('[data-slot="button"]:not([data-variant])')
    expect(primitives).toContain('body[data-sandbox-color-scheme="dark"] .webqq-environment-create-popover')
    expect(primitives).toContain('.webqq-environment-create-popover.is-color-dark')
    expect(primitives).toContain('background: rgb(44 44 48)')
    expect(primitives).toContain('background: rgb(57 57 63)')
    expect(primitives).toContain('border-color: transparent')
    expect(tokens).toContain('--webqq-secondary-outline: color-mix(in srgb, var(--webqq-border) 72%, transparent)')
    expect(tokens).toContain('--webqq-secondary-shadow: 0 18px 42px rgb(15 23 42 / 18%)')
    expect(tokens).toContain('--webqq-secondary-shadow: 0 18px 42px rgb(9 9 11 / 42%)')
    const solidSurfaceRule = primitives.slice(primitives.indexOf('.chatluna-sandbox-solid-secondary-surface:not(.is-frosted) {')).split('}')[0]
    expect(solidSurfaceRule).toContain('border-color: var(--webqq-secondary-outline)')
    expect(solidSurfaceRule).toContain('box-shadow: var(--webqq-secondary-shadow)')
  })

  it('已创建的 MCP 凭证可以查看并修改名称和权限', () => {
    const source = readFileSync(resolve('client/mcp-credential-manager.vue'), 'utf8')
    const shim = readFileSync(resolve('client/koishi-client-shim.d.ts'), 'utf8')

    expect(source).toContain('openEdit(credential)')
    expect(source).toContain('查看 MCP 凭证')
    expect(source).toContain('可查看 Token，并修改名称和权限范围。')
    expect(source).toContain('class="credential-token"')
    expect(source).toContain('editing.token')
    expect(source).toContain("send('chatluna-sandbox/rotate-mcp-credential-token'")
    expect(source).toContain("send('chatluna-sandbox/update-mcp-credential'")
    expect(source).toContain('{{ editing ? \'保存\' : \'创建\' }}')
    expect(source).not.toContain('createOpen')
    expect(source).not.toContain('明文 Token 无法再次查看')
    expect(shim).toContain("'chatluna-sandbox/update-mcp-credential'")
    expect(shim).toContain("'chatluna-sandbox/rotate-mcp-credential-token'")
  })
})
