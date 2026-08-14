import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildModelRequestJsonTree } from '../client/webqq/model-request-json'
import { createModelRequestLiveRefresh, MODEL_REQUEST_LIVE_REFRESH_INTERVAL_MS } from '../client/webqq/model-request-live-refresh'

describe('WebQQ 模型请求工作台', () => {
  it('从最左侧导航进入独立视图，并提供分类、分页摘要、详情和未归属二次确认', () => {
    const pageSource = readFileSync(resolve('client/page.vue'), 'utf8')
    const sidebarSource = readFileSync(resolve('client/webqq-sidebar.vue'), 'utf8')
    const workspaceSource = readFileSync(resolve('client/model-request-workspace.vue'), 'utf8')
    const jsonSource = readFileSync(resolve('client/model-request-json-tree.vue'), 'utf8')
    const styles = readFileSync(resolve('client/styles/webqq-model-requests.css'), 'utf8')

    expect(sidebarSource).toMatch(/label:\s*['"]模型请求['"]/)
    expect(sidebarSource).toContain('IconBrain')
    expect(pageSource).toContain("currentView === 'model-requests'")
    expect(pageSource).toContain('<ModelRequestWorkspace')
    expect(pageSource).toContain(':bots="modelRequestBots"')
    expect(pageSource).toContain('const debugBots = modelRequestBots')
    expect(pageSource).toContain("{ id: 'main', name: '主环境' }")
    expect(workspaceSource).toContain("from './components/ui/select'")
    expect(workspaceSource).toContain("from './components/ui/checkbox'")
    expect(workspaceSource).toContain("from './components/ui/button'")
    expect(workspaceSource).toContain("from './components/ui/dialog'")
    expect(workspaceSource).toContain('清理未归属记录')
    expect(workspaceSource).toContain("value=\"unattributed\"")
    expect(workspaceSource).toContain('加载更多')
    expect(workspaceSource).toContain('buildModelRequestJsonTree')
    expect(workspaceSource).toContain('<WebqqAvatar')
    expect(workspaceSource).toContain('resolveRequestBot(record).name')
    expect(workspaceSource).toMatch(/webqq-model-request-bot-copy[\s\S]*webqq-model-request-bot-name[\s\S]*resolveRequestBot\(record\)\.name[\s\S]*statusLabel\(record\.status\)[\s\S]*record\.provider[\s\S]*formatTime\(record\.createdAt\)[\s\S]*record\.durationMs/)
    expect(workspaceSource).toMatch(/webqq-model-request-bot-copy[\s\S]*webqq-model-request-bot-name[\s\S]*resolveRequestBot\(detail\)\.name[\s\S]*statusLabel\(detail\.status\)[\s\S]*detail\.provider[\s\S]*formatTime\(detail\.createdAt\)[\s\S]*detail\.durationMs/)
    expect(styles).toMatch(/\.webqq-model-request-bot-copy\s*\{[^}]*display:\s*grid[^}]*gap:\s*2px/s)
    expect(styles).toMatch(/\.webqq-model-request-bot-name\s*\{[^}]*flex-wrap:\s*wrap/s)
    expect(workspaceSource).toContain("'未归属机器人'")
    expect(workspaceSource).not.toContain("record.model || '未知模型'")
    expect(workspaceSource).not.toContain("detail.model || '未知模型'")
    expect(workspaceSource).toMatch(/<Badge v-if="record\.provider" variant="outline" class="webqq-model-request-provider">/)
    expect(workspaceSource).toMatch(/<Badge v-if="detail\.provider" variant="outline" class="webqq-model-request-provider">/)
    expect(styles).toMatch(/\.sandbox-badge\.webqq-model-request-provider\s*\{[^}]*border-color:\s*#c4b5fd[^}]*color:\s*#6d28d9[^}]*background:\s*#ede9fe/s)
    expect(styles).toMatch(/\.webqq-workspace\[data-color-mode="dark"\] \.sandbox-badge\.webqq-model-request-provider\s*\{[^}]*border-color:\s*#6d28d9[^}]*color:\s*#ddd6fe[^}]*background:\s*#4c1d95/s)
    expect(workspaceSource).toContain('createModelRequestLiveRefresh')
    expect(workspaceSource).toContain("liveRefresh = ref(false)")
    expect(workspaceSource).toContain("clearStep === 1")
    expect(workspaceSource).toContain('确认清理')
    expect(workspaceSource).toContain("visibilitychange")
    expect(workspaceSource).not.toContain('clipboard')
    expect(workspaceSource).not.toContain('download')
    expect(workspaceSource).not.toContain("emit('copy'")
    expect(jsonSource).toContain('<details')
    expect(jsonSource).toMatch(/const \{ node, open = true \} = defineProps/)
    expect(jsonSource).not.toContain('clipboard')
    expect(styles).toMatch(/\.webqq-model-request-workspace\s*\{[^}]*grid-template-rows:\s*auto auto auto minmax\(0, 1fr\)/s)
    expect(styles).not.toContain('cursor:')
  })

  it('结构化 JSON 只展开对象和数组，标量保持为只读节点', () => {
    const tree = buildModelRequestJsonTree({
      model: 'gpt-4.1',
      messages: [{ role: 'user', content: '你好' }],
    }, 'requestBody')

    expect(tree.kind).toBe('object')
    expect(tree.children.map(({ key }) => key)).toEqual(['model', 'messages'])
    expect(tree.children[0]).toMatchObject({ key: 'model', kind: 'value', preview: '"gpt-4.1"' })
    expect(tree.children[1]).toMatchObject({ key: 'messages', kind: 'array', preview: 'Array(1)' })
  })

  it('实时刷新默认关闭，仅在开关打开且页面可见时按 2 秒轮询', () => {
    expect(MODEL_REQUEST_LIVE_REFRESH_INTERVAL_MS).toBe(2000)
    const timeouts: Array<() => void> = []
    const handles: number[] = []
    let enabled = false
    let visible = true
    let refreshCount = 0
    const live = createModelRequestLiveRefresh({
      isEnabled: () => enabled,
      isVisible: () => visible,
      refresh: () => { refreshCount += 1 },
      setInterval: (handler) => {
        timeouts.push(handler)
        handles.push(handles.length + 1)
        return handles.at(-1) as unknown as ReturnType<typeof setInterval>
      },
      clearInterval: () => {
        timeouts.length = 0
      },
    })

    live.sync()
    expect(live.isRunning()).toBe(false)

    enabled = true
    live.sync()
    expect(live.isRunning()).toBe(true)
    timeouts[0]?.()
    expect(refreshCount).toBe(1)

    visible = false
    live.sync()
    expect(live.isRunning()).toBe(false)

    visible = true
    live.sync()
    expect(live.isRunning()).toBe(true)

    live.dispose()
    expect(live.isRunning()).toBe(false)
  })
})
