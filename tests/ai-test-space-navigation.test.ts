import { ref, type Ref } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import { createImplicitSpaceScope } from '../client/shared/koishi-implicit-space-scope'
import { FakeTestSpacePort } from '../client/test-space/fake-port'
import { createAiTestSpaceShell } from '../client/test-space/shell'
import { createFakeWorkspacePort } from '../client/workspace/fake-port'
import type { SandboxWorkspaceView } from '../client/workspace/state'
import { createTestWorkspaceController } from './helpers/workspace-controller'
import type { SandboxTestSpaceSummary } from '../src/test-spaces'
import type { SandboxAppearance, SandboxSnapshot, SandboxWorkspaceState } from '../src/types'

/**
 * 顶栏导航与观察定域的关系。断言的不是某个 ref 的即时值，而是**每次读工作区落在哪个空间**：
 * 定域由端口适配器在请求发出的那一刻解析，写在别处的顺序错误只有这样才会变红。
 */
const appearance: SandboxAppearance = {
  enableSandboxFrostedGlass: true,
  sandboxTimBubbleTail: true,
  sandboxColorMode: 'auto',
  sandboxAccentColor: '#2563eb',
  sandboxMarkRecalledMessages: true,
}

function createSnapshot(): SandboxSnapshot {
  return {
    revision: 1,
    participants: [
      { kind: 'user', id: '10001', name: '测试用户1' },
      { kind: 'bot', id: '20001', name: 'Koishi', implementation: 'napcat', enabled: true },
    ],
    groups: [],
    conversations: [],
    conversationInstances: [],
    messages: [],
    forwards: [],
    friendships: [],
    requests: [],
  }
}

function createWorkspace(): SandboxWorkspaceState {
  return {
    snapshot: createSnapshot(),
    chatLunaStates: [],
    appearance,
    persistence: { mode: 'memory', available: true, persisted: false },
  }
}

function createTestSpace(id: string): SandboxTestSpaceSummary {
  return {
    id,
    name: `测试空间 ${id}`,
    status: 'taken-over',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    snapshot: createSnapshot(),
  }
}

/**
 * 真实浏览器里进出空间走 anime.js 的连续缩放；node 环境没有 DOM，因此声明「用户偏好减少动效」
 * 让全部缩放函数早退，并把选择器解析成空。导航与定域这两件事因此可以脱离浏览器验证。
 */
function stubBrowserWithoutMotion() {
  const globals = globalThis as { window?: unknown, document?: unknown }
  globals.window = { matchMedia: () => ({ matches: true }) }
  globals.document = { querySelector: () => null }
  return () => {
    delete globals.window
    delete globals.document
  }
}

interface ShellHarness {
  activeSpaceId: Ref<string | undefined>
  currentView: Ref<SandboxWorkspaceView>
  /** 每次读工作区时生效的空间标识，`undefined` 表示主环境。 */
  workspaceScopes: (string | undefined)[]
  shell: ReturnType<typeof createAiTestSpaceShell>
}

function createShell(): ShellHarness {
  const activeSpaceId = ref<string>()
  const currentView = ref<SandboxWorkspaceView>('messages')
  const workspaceScopes: (string | undefined)[] = []
  const port = createFakeWorkspacePort(createWorkspace())
  // 套生产适配器那份隐式定域，而不是在用例里另写一遍「当前空间怎么进请求」。
  const scoped = createImplicitSpaceScope(() => activeSpaceId.value)
  const readWorkspace = port.getWorkspace.bind(port)
  port.getWorkspace = (input = {}) => {
    const request = scoped(input)
    workspaceScopes.push(request.spaceId)
    return readWorkspace(request)
  }
  const testSpacePort = new FakeTestSpacePort()
  testSpacePort.spaces = [createTestSpace('space-1')]
  const warn = console.warn
  console.warn = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].includes('is called when there is no active component')) return
    warn(...args)
  }
  try {
    const shell = createAiTestSpaceShell({
      controller: createTestWorkspaceController({ workspace: port }),
      testSpacePort,
      mainWorkspacePort: createFakeWorkspacePort(createWorkspace()),
      activeSpaceId,
      currentView,
      selectWorkspaceNavigation: (view, commit = true) => {
        if (commit) currentView.value = view
        return true
      },
      appearance: ref(appearance),
      colorMode: ref('light'),
      resolveAvatar: (avatar) => avatar,
    })
    return { activeSpaceId, currentView, workspaceScopes, shell }
  } finally {
    console.warn = warn
  }
}

describe('AI 测试空间总览的顶栏导航', () => {
  let restoreBrowser = () => {}

  afterEach(() => {
    restoreBrowser()
  })

  for (const view of ['messages', 'model-requests'] as const) {
    it(`从总览点顶栏的 ${view} 落在主环境，而不是刚离开的测试空间`, async () => {
      restoreBrowser = stubBrowserWithoutMotion()
      const { activeSpaceId, currentView, workspaceScopes, shell } = createShell()

      await shell.enterTestSpace('space-1')
      expect(activeSpaceId.value).toBe('space-1')
      expect(currentView.value).toBe('messages')

      await shell.selectNavigation('spaces')
      // 总览仍持有空间标识：卡片缩回动画要靠它定位那张卡。
      expect(activeSpaceId.value).toBe('space-1')

      await shell.selectNavigation(view)
      expect(activeSpaceId.value).toBeUndefined()
      expect(currentView.value).toBe(view)
      // 换定域必须发生在读工作区之前，否则页面拿回的是上一个空间的场景。
      expect(workspaceScopes).toEqual(['space-1', undefined])
    })
  }

  it('本来就在主环境时，总览上点顶栏只切页面，不重复读工作区', async () => {
    restoreBrowser = stubBrowserWithoutMotion()
    const { activeSpaceId, currentView, workspaceScopes, shell } = createShell()

    await shell.selectNavigation('spaces')
    const readsBeforeLeaving = workspaceScopes.length

    await shell.selectNavigation('presets')
    expect(currentView.value).toBe('presets')
    expect(activeSpaceId.value).toBeUndefined()
    expect(workspaceScopes.length).toBe(readsBeforeLeaving)
  })
})
