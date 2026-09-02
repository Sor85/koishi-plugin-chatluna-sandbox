import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch, type Ref } from 'vue'
import type { SandboxTestSpaceSummary } from '../../src/test-spaces'
import type { SandboxAppearance, SandboxSnapshot } from '../../src/types'
import { buildEnvironmentDirectoryModel, buildSandboxBotDirectory } from '#client/environment/directory-model'
import type { TestSpacePort } from './port'
import { createWorkspaceController } from '#client/workspace/controller'
import type { WorkspacePort } from '#client/workspace/port'
import type { SandboxWorkspaceView } from '#client/workspace/state'
import { captureWorkspaceThumbnail, isWorkspaceThumbnailView, type WorkspaceThumbnailCapture } from './thumbnail-capture'
import { createWorkspaceThumbnailProjection, type WorkspaceThumbnailSource } from './thumbnail-projection'
import { captureZoomRect, staggerCardsIn, zoomCardFromRect, zoomWorkspaceFromRect } from './zoom'

const emptySnapshot: SandboxSnapshot = {
  revision: 0,
  participants: [],
  groups: [],
  conversations: [],
  messages: [],
  friendships: [],
  requests: [],
}

export interface AiTestSpaceShellOptions {
  controller: ReturnType<typeof createWorkspaceController>
  testSpacePort: TestSpacePort
  /** 定域到主环境的工作区端口：总览要读主场景与任意空间的头像媒体，不是当前活动空间。 */
  mainWorkspacePort: WorkspacePort
  activeSpaceId: Ref<string | undefined>
  currentView: Ref<SandboxWorkspaceView>
  selectWorkspaceNavigation: (view: SandboxWorkspaceView, commit?: boolean) => boolean
  appearance: Ref<SandboxAppearance>
  colorMode: Ref<'light' | 'dark'>
  resolveAvatar: (avatar?: string) => string | undefined
}

export function createAiTestSpaceShell({
  controller,
  testSpacePort,
  mainWorkspacePort,
  activeSpaceId,
  currentView,
  selectWorkspaceNavigation,
  appearance,
  colorMode,
  resolveAvatar,
}: AiTestSpaceShellOptions) {
  const testSpaces = ref<SandboxTestSpaceSummary[]>([])
  const mainSnapshot = ref<SandboxSnapshot>(emptySnapshot)
  const thumbnailCaptures = shallowRef<Record<string, WorkspaceThumbnailCapture>>({})
  const thumbnailProjection = createWorkspaceThumbnailProjection(mainWorkspacePort)
  let refreshTimer: ReturnType<typeof setInterval> | undefined

  const thumbnailSources = computed<WorkspaceThumbnailSource[]>(() => [
    { key: 'main', snapshot: mainSnapshot.value },
    ...testSpaces.value.map((space) => ({ key: space.id, spaceId: space.id, snapshot: space.snapshot })),
  ])
  const thumbnailModels = computed(() => thumbnailProjection.buildModels(
    thumbnailSources.value,
    appearance.value,
    colorMode.value,
  ))
  /** 主环境与全部测试空间的机器人目录：模型请求、OneBot 调试与环境管理三处共用同一份。 */
  const botDirectory = computed(() => buildSandboxBotDirectory(mainSnapshot.value, testSpaces.value, resolveAvatar))
  /**
   * 环境管理页的区域目录。它落在这里是因为本模块是唯一同时握有当前工作区快照与全部测试
   * 空间的地方；用户目录与群组目录取当前工作区，机器人目录跨全部空间。
   */
  const environmentDirectory = computed(() => buildEnvironmentDirectoryModel(
    controller.workspace.value.snapshot,
    testSpaces.value,
    resolveAvatar,
  ))
  const spaceOptions = computed(() => [
    { id: 'main', name: '主环境' },
    ...testSpaces.value.map((space) => ({ id: space.id, name: space.name })),
  ])

  // 只在快照真的换了修订号时补媒体：轮询每 1.5 秒返回一次，逐次重新请求会把头像端点打满。
  watch(
    () => thumbnailSources.value.map(({ key, snapshot }) => `${key}:${snapshot.revision}`).join('|'),
    () => void thumbnailProjection.loadMissingMedia(thumbnailSources.value),
    { immediate: true },
  )

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
      testSpacePort.listTestSpaces(),
      mainWorkspacePort.getWorkspace(),
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
    const space = await testSpacePort.createTestSpace()
    await loadTestSpaces()
    await enterTestSpace(space.id)
  }

  const spaceActions = {
    'take-over': (spaceId: string) => testSpacePort.takeOverTestSpace({ spaceId }),
    return: (spaceId: string) => testSpacePort.returnTestSpace({ spaceId }),
    terminate: (spaceId: string) => testSpacePort.terminateTestSpace({ spaceId }),
    reactivate: (spaceId: string) => testSpacePort.reactivateTestSpace({ spaceId }),
    delete: (spaceId: string) => testSpacePort.deleteTestSpace({ spaceId }),
  } satisfies Record<string, (spaceId: string) => Promise<unknown>>

  async function handleTestSpaceAction(action: keyof typeof spaceActions, spaceId: string) {
    await spaceActions[action](spaceId)
    // 删掉正在观察的空间后必须退回主环境，否则工作区停在一个已经不存在的空间上。
    if (action === 'delete' && activeSpaceId.value === spaceId) await enterTestSpace()
    await loadTestSpaces()
  }

  onMounted(() => {
    void loadTestSpaces()
    refreshTimer = setInterval(() => {
      // 顶栏占用特效、总览卡片和被控覆盖层都依赖空间 status，任意视图都要轮询。
      void loadTestSpaces()
    }, 1500)
  })
  onBeforeUnmount(() => {
    if (refreshTimer) clearInterval(refreshTimer)
  })

  return {
    botDirectory,
    createTestSpace,
    environmentDirectory,
    enterTestSpace,
    handleTestSpaceAction,
    selectNavigation,
    spaceOptions,
    testSpaces,
    thumbnailCaptures,
    thumbnailModels,
  }
}
