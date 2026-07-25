import { send } from '@koishijs/client'
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
    const workspace = document.querySelector<HTMLElement>('.webqq-workspace')
    const clone = workspace?.cloneNode(true) as HTMLElement | undefined
    const start = workspace?.getBoundingClientRect()
    if (clone && start) {
      Object.assign(clone.style, {
        position: 'fixed', zIndex: '300', margin: '0', left: `${start.left}px`, top: `${start.top}px`,
        width: `${start.width}px`, height: `${start.height}px`, pointerEvents: 'none', transformOrigin: 'top left',
      })
      document.body.append(clone)
    }
    try {
      selectWorkspaceNavigation(view)
      await loadTestSpaces()
      await nextTick()
      const targetId = activeSpaceId.value ?? 'main'
      const target = document.querySelector<HTMLElement>(`[data-space-id="${targetId.replaceAll('"', '\\"')}"]`)
      if (clone && start && target) {
        const end = target.getBoundingClientRect()
        await clone.animate([
          { left: `${start.left}px`, top: `${start.top}px`, width: `${start.width}px`, height: `${start.height}px`, borderRadius: '0' },
          { left: `${end.left}px`, top: `${end.top}px`, width: `${end.width}px`, height: `${end.height}px`, borderRadius: '18px' },
        ], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' }).finished.catch(() => undefined)
      }
    } finally {
      clone?.remove()
    }
  }

  async function enterTestSpace(spaceId?: string) {
    activeSpaceId.value = spaceId
    await controller.load()
    selectWorkspaceNavigation('messages')
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
