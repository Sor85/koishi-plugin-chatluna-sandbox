import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('WebQQ 共享样式', () => {
  it('按令牌、工作区、原语和覆盖层顺序加载', () => {
    const entry = readFileSync(resolve('client/style.css'), 'utf8')
    const tokens = readFileSync(resolve('client/styles/webqq-tokens.css'), 'utf8')
    const workspace = readFileSync(resolve('client/styles/webqq-workspace.css'), 'utf8')
    const primitives = readFileSync(resolve('client/styles/webqq-primitives.css'), 'utf8')
    const overlays = readFileSync(resolve('client/styles/webqq-overlays.css'), 'utf8')

    const imports = [
      '@import "./styles/webqq-tokens.css";',
      '@import "./styles/webqq-workspace.css";',
      '@import "./styles/webqq-primitives.css";',
      '@import "./styles/webqq-overlays.css";',
    ]
    expect(imports.map((value) => entry.indexOf(value))).toEqual([...imports.map((value) => entry.indexOf(value))].sort((a, b) => a - b))
    expect(tokens).toContain('--webqq-accent-shadow')
    expect(workspace).toContain('.onebot-sandbox-page')
    expect(workspace).toContain('.webqq-workspace.is-details-closed')
    expect(workspace).toContain('.webqq-workspace.is-standalone-view')
    expect(primitives).toContain('[data-webqq-scrollbar="true"]')
    expect(primitives).not.toContain('.webqq-avatar-bot-badge')
    expect(primitives).not.toContain('--webqq-bot-badge')
    const scrollbarRule = primitives.slice(primitives.indexOf('.webqq-scrollbar-overlay {')).split('}')[0]
    expect(scrollbarRule).toContain('z-index: 100')
    expect(scrollbarRule).not.toContain('z-index: 10001')
    expect(primitives).toContain('.onebot-sandbox-workspace-zooming .webqq-scrollbar-overlay')
    expect(primitives).toContain('opacity: 0 !important')
    expect(primitives).not.toContain('cursor:')
    expect(overlays).not.toContain('cursor:')
    expect(overlays).toContain('--webqq-secondary-row-gap: 8px')
    expect(overlays).toContain('.webqq-secondary-page')
    const secondaryPageRule = overlays.slice(overlays.indexOf('.webqq-secondary-page {')).split('}')[0]
    expect(secondaryPageRule).toContain('position: fixed')
    expect(secondaryPageRule).toContain('width: 380px')
    expect(secondaryPageRule).toContain('border: 1px solid transparent')
    expect(secondaryPageRule).not.toContain('inset: 0')
    const solidSecondaryPageRule = overlays.slice(overlays.indexOf('.webqq-secondary-page.webqq-solid-secondary-surface {')).split('}')[0]
    expect(solidSecondaryPageRule).toContain('border-color: var(--webqq-secondary-outline)')
    expect(solidSecondaryPageRule).toContain('box-shadow: var(--webqq-secondary-shadow)')
    expect(solidSecondaryPageRule).toContain('backdrop-filter: none')
    const profilePageRule = overlays.slice(overlays.indexOf('.webqq-profile-card-page {')).split('}')[0]
    expect(profilePageRule).toContain('width: max-content')
    expect(profilePageRule).toContain('max-width: min(320px')
    const scopedSecondaryHeaderRule = overlays
      .slice(overlays.indexOf('.webqq-secondary-page.onebot-sandbox-secondary-page > .webqq-secondary-page-header {'))
      .split('}')[0]
    expect(scopedSecondaryHeaderRule).toContain('position: relative')
    expect(scopedSecondaryHeaderRule).toContain('inset: auto')
    expect(scopedSecondaryHeaderRule).toContain('color: var(--webqq-text)')
    expect(scopedSecondaryHeaderRule).toContain('background: var(--webqq-bg)')
    const profileCardRule = overlays.slice(overlays.indexOf('.webqq-profile-card {')).split('}')[0]
    expect(profileCardRule).toContain('overflow-y: auto')
    expect(profileCardRule).toContain('scrollbar-width: none')
    expect(overlays).toContain('.onebot-sandbox-profile-card-page .webqq-profile-card::-webkit-scrollbar {')
    const profileHeroRule = overlays.slice(overlays.indexOf('.webqq-profile-card-hero {')).split('}')[0]
    expect(profileHeroRule).toContain('display: flex')
    expect(profileHeroRule).toContain('flex-direction: column')
    expect(profileHeroRule).toContain('align-items: center')
    expect(profileHeroRule).toContain('justify-content: center')
    expect(profileHeroRule).toContain('text-align: center')
    expect(profileHeroRule).not.toContain('grid-template-columns')
    const profileAvatarRule = overlays.slice(overlays.indexOf('.webqq-profile-card-hero .webqq-avatar-profile {')).split('}')[0]
    expect(profileAvatarRule).toContain('--webqq-avatar-size: 96px')
    expect(profileAvatarRule).toContain('width: 96px')
    expect(profileAvatarRule).toContain('height: 96px')
    expect(profileAvatarRule).toContain('overflow: hidden')
    expect(profileAvatarRule).toContain('border: 0')
    expect(profileAvatarRule).toContain('border-radius: 50%')
    expect(profileAvatarRule).toContain('-webkit-mask-image: none')
    expect(profileAvatarRule).toContain('mask-image: none')
    expect(profileAvatarRule).not.toContain('var(--webqq-accent)')
    const profileAvatarImageRule = overlays.slice(overlays.indexOf('.webqq-profile-card-hero .webqq-avatar-profile > img {')).split('}')[0]
    expect(profileAvatarImageRule).toContain('-webkit-mask-image: none')
    expect(profileAvatarImageRule).toContain('mask-image: none')
    const profileFieldsRule = overlays.slice(overlays.indexOf('.webqq-profile-card-fields {')).split('}')[0]
    expect(profileFieldsRule).not.toContain('border')
    const profileValueRule = overlays.slice(overlays.indexOf('.webqq-profile-card-fields dd {')).split('}')[0]
    expect(profileValueRule).toContain('text-align: left')
    expect(overlays).toContain('.webqq-secondary-form')
    expect(overlays).toContain('.webqq-secondary-field')
    expect(overlays).toContain('.webqq-forward-modal-backdrop')
    const forwardBackdropRule = overlays.slice(overlays.indexOf('.webqq-forward-modal-backdrop {')).split('}')[0]
    expect(forwardBackdropRule).toContain('z-index: 160')
    expect(forwardBackdropRule).toContain('position: fixed')
    expect(entry).not.toContain('.webqq-scrollbar-overlay {')
    expect(entry).not.toContain('.webqq-secondary-form {')
  })
})
