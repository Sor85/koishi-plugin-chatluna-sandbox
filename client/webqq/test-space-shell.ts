import { send } from '@koishijs/client'
import { createLayout } from 'animejs'
import { nextTick, onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import type { SandboxTestSpaceSummary } from '../../src/test-spaces'
import type { SandboxSnapshot } from '../../src/types'
import { createWorkspaceController } from './workspace-controller'
import type { SandboxWorkspaceView } from './workspace-state'

const emptySnapshot: SandboxSnapshot = {
  revision: 0,
  participants: [],
  groups: [],
  conversations: [],
  messages: [],
  friendships: [],
  requests: [],
}

export function createAiTestSpaceShell(
  controller: ReturnType<typeof createWorkspaceController>,
  activeSpaceId: Ref<string | undefined>,
  currentView: Ref<SandboxWorkspaceView>,
  selectWorkspaceNavigation: (view: SandboxWorkspaceView) => void,
) {
  const testSpaces = ref<SandboxTestSpaceSummary[]>([])
  const mainSnapshot = ref<SandboxSnapshot>(emptySnapshot)
  let refreshTimer: ReturnType<typeof setInterval> | undefined

  async function loadTestSpaces() {
    const [spaces, mainWorkspace] = await Promise.all([
      send('onebot-sandbox/test-spaces'),
      send('onebot-sandbox/workspace', {}),
    ])
    testSpaces.value = spaces
    mainSnapshot.value = mainWorkspace.snapshot
  }

  async function selectNavigation(view: SandboxWorkspaceView) {
    if (view !== 'spaces') {
      selectWorkspaceNavigation(view)
      return
    }
    const layout = createWorkspaceLayout()
    layout?.record()
    selectWorkspaceNavigation(view)
    await loadTestSpaces()
    await nextTick()
    animateWorkspaceLayout(layout)
  }

  function createWorkspaceLayout() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const workspace = document.querySelector<HTMLElement>('.webqq-workspace')
    const layoutRoot = workspace?.parentElement
    // 只让共享空间 ID 参与布局匹配；Anime.js 仍会生成内部 node-* ID，动画结束后会单独清理。
    return layoutRoot ? createLayout(layoutRoot, { children: '[data-layout-id^="webqq-space-"]' }) : undefined
  }

  function animateWorkspaceLayout(layout: ReturnType<typeof createLayout> | undefined) {
    if (!layout) return
    const timeline = layout.animate({ duration: 560, ease: 'out(4)' })
    timeline.then(() => {
      window.setTimeout(() => {
        document.querySelectorAll('[data-layout-id^="node-"]').forEach((node) => node.removeAttribute('data-layout-id'))
      }, 0)
    })
  }

  async function enterTestSpace(spaceId?: string) {
    const layout = createWorkspaceLayout()
    layout?.record()
    activeSpaceId.value = spaceId
    await controller.load()
    selectWorkspaceNavigation('messages')
    await nextTick()
    // 共享 layout id 让 Anime.js 在空间卡片和真实 WebQQ 之间变形，不再维护手写坐标与快照克隆。
    animateWorkspaceLayout(layout)
  }

  async function createTestSpace() {
    const space = await send('onebot-sandbox/create-test-space', {})
    await loadTestSpaces()
    await enterTestSpace(space.id)
  }

  async function handleTestSpaceAction(action: 'take-over' | 'return' | 'reactivate' | 'delete', spaceId: string) {
    if (action === 'take-over') await send('onebot-sandbox/take-over-test-space', { spaceId })
    if (action === 'return') await send('onebot-sandbox/return-test-space', { spaceId })
    if (action === 'reactivate') await send('onebot-sandbox/reactivate-test-space', { spaceId })
    if (action === 'delete') await send('onebot-sandbox/delete-test-space', { spaceId })
    if (action === 'delete' && activeSpaceId.value === spaceId) await enterTestSpace()
    await loadTestSpaces()
  }

  onMounted(() => {
    void loadTestSpaces()
    refreshTimer = setInterval(() => {
      if (currentView.value === 'spaces') void loadTestSpaces()
    }, 1500)
  })
  onBeforeUnmount(() => {
    if (refreshTimer) clearInterval(refreshTimer)
  })

  return { createTestSpace, enterTestSpace, handleTestSpaceAction, mainSnapshot, selectNavigation, testSpaces }
}
