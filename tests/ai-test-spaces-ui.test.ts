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
    // "接管"入口已移入空间内部任务栏，总览卡片不再提供 take-over 动作
    expect(overview).not.toContain("'take-over'")
    // AI 控制中卡片：ego 式边框光晕 + 脉冲点 + 游走的 agent 光标
    expect(styles).toContain('.webqq-space-card.is-running')
    expect(styles).toContain('@keyframes webqq-agent-pulse')
    expect(styles).toContain('@keyframes webqq-agent-loading-loop')
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
    const effect = readFileSync(resolve('client/webqq/agent-overlay-effect.ts'), 'utf8')
    const page = readFileSync(resolve('client/page.vue'), 'utf8')
    const styles = readFileSync(resolve('client/styles/webqq-spaces.css'), 'utf8')
    // ego lite 官方光标 path 与随机跳位节奏（5.2-9s），到位后 400ms 点击挤压 + 闲置 loading 浮动
    expect(cursor).toContain('M6.465 15.647')
    expect(cursor).toContain('5200 + Math.random() * 3800')
    expect(styles).toContain('cubic-bezier(0.6, 0, 0.4, 1)')
    expect(styles).toContain('@keyframes webqq-agent-cursor-click')
    // 覆盖层：scrim 渐变 + 点阵背景，边缘跑马灯为 WebGL 移植的 ego lite 光晕 shader（ramp 沿边滚动）
    expect(overlay).toContain('webqq-agent-observe-dots')
    expect(overlay).toContain('webqq-agent-observe-canvas')
    expect(overlay).toContain('mountAgentOverlayEffect')
    expect(effect).toContain('uScrollOffset')
    expect(effect).toContain('rampColor')
    expect(effect).toContain('uAccent')
    expect(styles).toContain('.webqq-agent-observe-dots')
    // 空间内任务栏：接管 + 终止任务置于空间内部（ego 底栏置顶复刻）
    expect(overlay).toContain('webqq-agent-taskbar')
    expect(overlay).toContain('Agent 正在控制')
    expect(overlay).toContain('接管')
    expect(overlay).toContain('终止任务')
    expect(overlay).toContain('webqq-agent-taskbar-control-icon')
    expect(overlay).toContain('viewBox="0 0 20 20" width="20" height="20"')
    expect(overlay).toContain('transform="translate(1.6 1)"')
    expect(overlay).toContain('M9.3 16.3 8.08 9.53')
    expect(styles).not.toContain('webqq-agent-spinner')
    expect(styles).toContain('color: rgb(193 217 244)')
    expect(styles).toContain('font-size: 12px; font-weight: 600; line-height: 15px')
    expect(styles).toContain('font-size: 11px; line-height: 15px')
    expect(page).toContain('AgentObserveOverlay')
    expect(page).toContain("space.status === 'running'")
    expect(page).toContain("handleTestSpaceAction('terminate'")
  })
})
