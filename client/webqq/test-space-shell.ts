import { send } from '@koishijs/client'
import { nextTick, onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import type { SandboxTestSpaceSummary } from '../../src/test-spaces'
import type { SandboxSnapshot } from '../../src/types'
import { createWorkspaceController } from './workspace-controller'
import type { SandboxWorkspaceView } from './workspace-state'
import { captureZoomRect, staggerCardsIn, zoomCardFromRect, zoomWorkspaceFromRect } from './workspace-zoom'

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
    // 已在总览时重复点击导航只刷新数据，不能再做"卡片从全屏缩回"动画。
    if (currentView.value === 'spaces') {
      await loadTestSpaces()
      return
    }
    // 记录工作区当前位置，切换视图后让活动空间的卡片从这里缩回网格位。
    const fromRect = captureZoomRect(document.querySelector('.webqq-workspace'))
    // 先取数据再切视图：nextTick 发生在浏览器绘制前，卡片的初始 transform 能赶在首帧写入；
    // 若先切视图再等待网络加载，网格会以常态先绘制若干帧，缩放起点随后才写入，视觉上产生跳变。
    await loadTestSpaces()
    selectWorkspaceNavigation(view)
    await nextTick()
    if (!fromRect) return
    const overview = document.querySelector<HTMLElement>('.webqq-space-overview')
    const activeCard = overview?.querySelector<HTMLElement>(`[data-space-id="${activeSpaceId.value ?? 'main'}"]`)
    const cards = [...overview?.querySelectorAll<HTMLElement>('.webqq-space-card') ?? []].filter((card) => card !== activeCard)
    if (overview && activeCard) zoomCardFromRect(activeCard, overview, fromRect)
    staggerCardsIn(cards)
  }

  async function enterTestSpace(spaceId?: string) {
    // 记录被点击卡片的位置，让真实工作区从卡片处连续放大；新建空间无卡片时从创建卡起步。
    const fromRect = captureZoomRect(
      document.querySelector(`[data-space-id="${spaceId ?? 'main'}"]`) ?? document.querySelector('.webqq-space-create'),
    )
    activeSpaceId.value = spaceId
    await controller.load()
    selectWorkspaceNavigation('messages')
    await nextTick()
    const workspace = document.querySelector<HTMLElement>('.webqq-workspace')
    if (workspace && fromRect) zoomWorkspaceFromRect(workspace, fromRect)
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
