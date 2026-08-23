import { send } from '@koishijs/client'
import { nextTick, onBeforeUnmount, onMounted, ref, shallowRef, type Ref } from 'vue'
import type { SandboxTestSpaceSummary } from '../../src/test-spaces'
import type { SandboxSnapshot } from '../../src/types'
import { createWorkspaceController } from './workspace-controller'
import type { SandboxWorkspaceView } from './workspace-state'
import { captureWorkspaceThumbnail, isWorkspaceThumbnailView, type WorkspaceThumbnailCapture } from './workspace-thumbnail-capture'
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
  selectWorkspaceNavigation: (view: SandboxWorkspaceView, commit?: boolean) => boolean,
) {
  const testSpaces = ref<SandboxTestSpaceSummary[]>([])
  const mainSnapshot = ref<SandboxSnapshot>(emptySnapshot)
  const thumbnailCaptures = shallowRef<Record<string, WorkspaceThumbnailCapture>>({})
  let refreshTimer: ReturnType<typeof setInterval> | undefined

  function rememberCurrentWorkspaceThumbnail() {
    const workspace = document.querySelector<HTMLElement>('.webqq-workspace')
    if (!workspace || currentView.value === 'spaces') return
    const key = activeSpaceId.value ?? 'main'
    // 独立页（模型请求/预设/调试等）不是空间画面；总览卡片始终展示消息工作区。
    if (!isWorkspaceThumbnailView(currentView.value)) {
      const existing = thumbnailCaptures.value[key]
      if (existing && !isWorkspaceThumbnailView(existing.element.getAttribute('data-mobile-view'))) {
        const next = { ...thumbnailCaptures.value }
        delete next[key]
        thumbnailCaptures.value = next
      }
      return
    }
    thumbnailCaptures.value = { ...thumbnailCaptures.value, [key]: captureWorkspaceThumbnail(workspace) }
  }

  async function loadTestSpaces() {
    const [spaces, mainWorkspace] = await Promise.all([
      send('chatluna-sandbox/test-spaces'),
      send('chatluna-sandbox/workspace', {}),
    ])
    testSpaces.value = spaces
    mainSnapshot.value = mainWorkspace.snapshot
  }

  async function selectNavigation(view: SandboxWorkspaceView) {
    if (view !== 'spaces') {
      selectWorkspaceNavigation(view)
      return
    }
    if (currentView.value === 'presets' && !selectWorkspaceNavigation(view, false)) return
    // 已在总览时重复点击导航只刷新数据，不能再做"卡片从全屏缩回"动画。
    if (currentView.value === 'spaces') {
      await loadTestSpaces()
      return
    }
    // 切到总览前只保存消息工作区 DOM；独立页不能覆盖空间缩略图。
    rememberCurrentWorkspaceThumbnail()
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
    const space = await send('chatluna-sandbox/create-test-space', {})
    await loadTestSpaces()
    await enterTestSpace(space.id)
  }

  async function handleTestSpaceAction(action: 'take-over' | 'return' | 'terminate' | 'reactivate' | 'delete', spaceId: string) {
    if (action === 'take-over') await send('chatluna-sandbox/take-over-test-space', { spaceId })
    if (action === 'return') await send('chatluna-sandbox/return-test-space', { spaceId })
    if (action === 'terminate') await send('chatluna-sandbox/terminate-test-space', { spaceId })
    if (action === 'reactivate') await send('chatluna-sandbox/reactivate-test-space', { spaceId })
    if (action === 'delete') await send('chatluna-sandbox/delete-test-space', { spaceId })
    if (action === 'delete' && activeSpaceId.value === spaceId) await enterTestSpace()
    await loadTestSpaces()
  }

  onMounted(() => {
    void loadTestSpaces()
    refreshTimer = setInterval(() => {
      // 除总览外，进入测试空间观察时也要轮询：AI 完成或失败后被控覆盖层要实时消失。
      if (currentView.value === 'spaces' || currentView.value === 'profile' || currentView.value === 'debug' || currentView.value === 'mcp-calls' || currentView.value === 'model-requests' || currentView.value === 'presets' || activeSpaceId.value) {
        void loadTestSpaces()
      }
    }, 1500)
  })
  onBeforeUnmount(() => {
    if (refreshTimer) clearInterval(refreshTimer)
  })

  return { createTestSpace, enterTestSpace, handleTestSpaceAction, mainSnapshot, selectNavigation, testSpaces, thumbnailCaptures }
}
