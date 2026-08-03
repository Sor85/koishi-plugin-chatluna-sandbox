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
      expect(source).not.toContain('onebot-sandbox/manage-environment')
      expect(source).toContain('submit: [')
    }
  })

  it('资料页联邦展示主环境和测试空间机器人，并保留用户与群组的主环境边界', () => {
    const source = readFileSync(resolve('client/environment-manager.vue'), 'utf8')
    const page = readFileSync(resolve('client/page.vue'), 'utf8')

    expect(page).toContain('<EnvironmentManager :snapshot="environmentModel" :test-spaces="testSpaces" />')
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
    expect(overlaySource).not.toContain('SandboxSnapshot')
    expect(overlaySource).not.toContain('snapshot')
    expect(overlaySource).toContain('<EnvironmentEntityDialog')
    expect(overlaySource).toContain('class="webqq-secondary-page webqq-profile-card-page"')
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
    expect(source).toContain(':kind="target?.type ?? \'user\'"')
    expect(source).toContain('avatar: draft.avatar')
    expect(create).toContain('<WebqqAvatarPicker')
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
    expect(source).toContain('filteredCapabilities')
    expect(source).toContain('capability.description')
    expect(source).toContain('disabledCapabilities')
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
    expect(dialogTitle).toContain('margin: 0')
    expect(dialogDescription).toContain('margin: 0')
    expect(dialogIndex).toContain("DialogHeader")
    expect(dialogIndex).toContain("DialogFooter")
    expect(entityDialog).toContain('<DialogHeader>')
    expect(entityDialog).toContain('<DialogFooter>')
    expect(entityDialog).toContain('class="webqq-secondary-form"')
    expect(overlayHost.match(/<DialogHeader>/g)).toHaveLength(2)
    expect(overlayHost.match(/<DialogFooter>/g)).toHaveLength(2)
    expect(createPopover).toContain('class="webqq-secondary-form"')
  })

  it('危险按钮和下拉浮层使用统一控件基线，避免 Portal 中样式退化', () => {
    const entityDialog = readFileSync(resolve('client/environment-entity-dialog.vue'), 'utf8')
    const selectContent = readFileSync(resolve('client/components/ui/select/SelectContent.vue'), 'utf8')
    const primitives = readFileSync(resolve('client/styles/webqq-primitives.css'), 'utf8')

    expect(entityDialog).toContain('variant="destructive"')
    expect(selectContent).toContain('z-[200]')
    expect(selectContent).toContain('sandbox-select-content')
    expect(primitives).toContain('.sandbox-select-content')
  })

  it('Portal 二级菜单提供完整的控件令牌，避免控件回退为黑色描边', () => {
    const tokens = readFileSync(resolve('client/styles/webqq-tokens.css'), 'utf8')
    const primitives = readFileSync(resolve('client/styles/webqq-primitives.css'), 'utf8')

    // teleport 面板拿不到 .webqq-workspace 上的令牌，必须有镜像定义（含 .dark 暗色）
    expect(tokens).toContain('.sandbox-dialog-content')
    expect(tokens).toContain('body[data-sandbox-color-scheme="dark"] .sandbox-dialog-content')
    expect(primitives).toContain('[data-slot="input"]')
    expect(primitives).toContain('[data-slot="checkbox"]')
    expect(primitives).toContain('[data-slot="button"][data-variant="outline"]')
    expect(primitives).toContain('[data-slot="button"]:not([data-variant])')
  })
})
