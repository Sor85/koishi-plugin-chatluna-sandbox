import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('AI 测试空间总览', () => {
  it('在主导航提供入口并渲染固定主场景、按时间排序空间和末尾创建卡', () => {
    const sidebar = readFileSync(resolve('client/webqq-sidebar.vue'), 'utf8')
    const overview = readFileSync(resolve('client/ai-test-space-overview.vue'), 'utf8')
    const styles = readFileSync(resolve('client/styles/webqq-spaces.css'), 'utf8')

    expect(sidebar).toContain("label: 'AI 测试空间'")
    expect(overview).toContain('主模拟 QQ 环境')
    expect(overview).toContain('filteredSpaces')
    expect(overview).toContain('创建测试空间')
    expect(overview).toContain("space.status === 'running'")
    // AI 控制中卡片：ego 式边框光晕 + 脉冲点 + 游走的 agent 光标
    expect(styles).toContain('.webqq-space-card.is-running')
    expect(styles).toContain('@keyframes webqq-agent-pulse')
    expect(styles).toContain('@keyframes webqq-agent-float')
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)')
  })

  it('进入和退出空间时对整层做连续 transform 缩放', () => {
    const overview = readFileSync(resolve('client/ai-test-space-overview.vue'), 'utf8')
    const shell = readFileSync(resolve('client/webqq/test-space-shell.ts'), 'utf8')
    const zoom = readFileSync(resolve('client/webqq/workspace-zoom.ts'), 'utf8')
    expect(existsSync(resolve('client/webqq/workspace-transition.ts'))).toBe(false)
    expect(overview).not.toContain('cloneNode')
    expect(overview).toContain(':data-space-id="space.id"')
    expect(shell).not.toContain('createLayout')
    expect(shell).toContain('zoomWorkspaceFromRect')
    expect(shell).toContain('zoomCardFromRect')
    expect(shell).toContain('staggerCardsIn')
    // ease 字符串 'cubicBezier(...)' 在 anime.js 4 已废弃并静默降级为线性，必须导入函数形式。
    expect(zoom).toContain("import { animate, cubicBezier, stagger } from 'animejs'")
    expect(zoom).toContain('cubicBezier(0.32, 0.72, 0, 1)')
    expect(zoom).toContain('prefers-reduced-motion')
  })

  it('卡片缩略图渲染快照的真实迷你界面', () => {
    const thumbnail = readFileSync(resolve('client/workspace-thumbnail.vue'), 'utf8')
    const preview = readFileSync(resolve('client/webqq/workspace-preview.ts'), 'utf8')
    expect(thumbnail).toContain('buildWorkspacePreview')
    expect(thumbnail).toContain('WebqqAvatar')
    expect(thumbnail).toContain('webqq-message-bubble')
    expect(preview).toContain('resolveWorkspaceSelection')
  })

  it('复刻 ego lite 的 agent 光标与被控空间观察覆盖层', () => {
    const cursor = readFileSync(resolve('client/agent-cursor.vue'), 'utf8')
    const overlay = readFileSync(resolve('client/agent-observe-overlay.vue'), 'utf8')
    const page = readFileSync(resolve('client/page.vue'), 'utf8')
    const styles = readFileSync(resolve('client/styles/webqq-spaces.css'), 'utf8')
    // ego lite 官方光标 path 与随机跳位节奏（5.2-9s）
    expect(cursor).toContain('M6.465 15.647')
    expect(cursor).toContain('5200 + Math.random() * 3800')
    expect(styles).toContain('cubic-bezier(0.22, 1, 0.36, 1)')
    // 观察覆盖层：内发光 + 点阵 + 控制条接管
    expect(overlay).toContain('webqq-agent-observe-glow')
    expect(overlay).toContain('webqq-agent-observe-dots')
    expect(overlay).toContain('接管')
    expect(page).toContain('AgentObserveOverlay')
    expect(page).toContain("space.status === 'running'")
  })
})
