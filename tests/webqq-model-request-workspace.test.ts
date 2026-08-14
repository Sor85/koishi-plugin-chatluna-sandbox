import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { extractModelResponseContent } from '../client/webqq/model-response-content'
import { buildModelRequestJsonTree, parseModelResponseBody } from '../client/webqq/model-request-json'
import { createModelRequestLiveRefresh, MODEL_REQUEST_LIVE_REFRESH_INTERVAL_MS } from '../client/webqq/model-request-live-refresh'

describe('WebQQ 模型请求工作台', () => {
  it('从最左侧导航进入独立视图，并提供分类、分页摘要、详情和未归属二次确认', () => {
    const pageSource = readFileSync(resolve('client/page.vue'), 'utf8')
    const sidebarSource = readFileSync(resolve('client/webqq-sidebar.vue'), 'utf8')
    const workspaceSource = readFileSync(resolve('client/model-request-workspace.vue'), 'utf8')
    const jsonSource = readFileSync(resolve('client/model-request-json-tree.vue'), 'utf8')
    const responsePreviewSource = readFileSync(resolve('client/model-response-content-preview.vue'), 'utf8')
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
    expect(workspaceSource).toMatch(/webqq-model-request-list-pane[\s\S]*webqq-model-request-filters[\s\S]*webqq-model-request-list/)
    expect(workspaceSource.indexOf('webqq-model-request-filters')).toBeGreaterThan(workspaceSource.indexOf('webqq-model-request-list-pane'))
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
    expect(workspaceSource).toContain('展开长字符串')
    expect(workspaceSource).toContain("bodyView = ref<'request' | 'response'>('request')")
    expect(workspaceSource).toContain("responseView = ref<'content' | 'json'>('content')")
    expect(workspaceSource).toMatch(/role="tab"[\s\S]*请求[\s\S]*role="tab"[\s\S]*响应/)
    expect(workspaceSource).toContain('正在采集响应体…')
    expect(workspaceSource).toContain('响应体采集失败')
    expect(workspaceSource).toContain('detail.responseBodyRaw')
    expect(workspaceSource).toContain('parseModelResponseBody')
    expect(workspaceSource).toContain('extractModelResponseContent')
    expect(workspaceSource).toContain('<ModelResponseContentPreview')
    expect(workspaceSource).toContain('内容预览')
    expect(workspaceSource).toContain('JSON 原文')
    expect(responsePreviewSource).toContain('模型输出')
    expect(responsePreviewSource).toContain('思考内容')
    expect(responsePreviewSource).toContain('工具调用')
    expect(responsePreviewSource).toContain('结束原因')
    expect(workspaceSource).toContain(':strings-expanded="stringsExpanded"')
    expect(workspaceSource).toContain(':root="true"')
    expect(jsonSource).toContain('IconChevronDown')
    expect(jsonSource).toContain('IconChevronRight')
    expect(jsonSource).toContain("parentKind !== 'array'")
    expect(jsonSource).toContain('normalizeModelRequestJsonString')
    expect(jsonSource).toContain('localStringExpanded')
    expect(jsonSource).not.toContain('clipboard')
    expect(jsonSource).not.toContain(':title=')
    expect(jsonSource).toMatch(/<span\s+v-if="node\.valueKind === 'string'"\s+class="webqq-model-request-json-string"/)
    expect(jsonSource).toMatch(/class="webqq-model-request-json-toggle webqq-model-request-json-string-toggle"/)
    expect(jsonSource).toMatch(/class="webqq-model-request-json-row webqq-model-request-json-leaf"[\s\S]*@pointerdown="startRowPointer"[\s\S]*@pointerup="finishRowPointer"[\s\S]*@click\.stop="toggleStringFromRow"/)
    expect(jsonSource).toMatch(/class="webqq-model-request-json-row webqq-model-request-json-branch"[\s\S]*@pointerdown="startRowPointer"[\s\S]*@pointerup="finishRowPointer"[\s\S]*@click\.stop="toggleBranchFromRow"/)
    expect(jsonSource).toContain('@click.stop="expanded = !expanded"')
    expect(jsonSource).toContain('@click.stop="toggleString"')
    expect(jsonSource).toContain('suppressRowClick = distance > 3')
    expect(jsonSource).not.toContain("window.getSelection()?.isCollapsed")
    expect(styles).toMatch(/\.webqq-model-request-json-viewer\s*\{[^}]*overflow:\s*auto[^}]*border:\s*1px solid var\(--webqq-border\)[^}]*border-radius:\s*8px[^}]*user-select:\s*text/s)
    expect(styles).toMatch(/\.webqq-model-request-json-children\s*\{[^}]*border-left:\s*1px solid var\(--webqq-border\)/s)
    expect(styles).toMatch(/data-value-kind="number"[^}]*color:\s*#d97706/s)
    expect(styles).toMatch(/data-value-kind="boolean"[^}]*color:\s*#2563eb/s)
    expect(styles).toMatch(/data-value-kind="null"[^}]*color:\s*#e11d48/s)
    expect(styles).toMatch(/\.webqq-model-request-json-string\s*\{[^}]*text-overflow:\s*ellipsis[^}]*white-space:\s*nowrap/s)
    expect(styles).toMatch(/\.webqq-model-request-json-string-expanded\s*\{[^}]*white-space:\s*pre-wrap/s)
    expect(styles).toMatch(/\.webqq-model-request-response-raw\s*\{[^}]*overflow:\s*auto[^}]*white-space:\s*pre-wrap[^}]*user-select:\s*text/s)
    expect(styles).toMatch(/\.webqq-model-response-preview\s*\{[^}]*display:\s*grid[^}]*overflow:\s*auto/s)
    expect(styles).toMatch(/\.webqq-model-response-section\.is-content\s*\{[^}]*border-left-color:\s*#2563eb/s)
    expect(styles).toMatch(/\.webqq-model-request-workspace\s*\{[^}]*grid-template-rows:\s*auto auto minmax\(0, 1fr\)/s)
    expect(styles).toMatch(/\.webqq-model-request-list-pane\s*\{[^}]*display:\s*grid[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\)/s)
    expect(styles).toMatch(/\.webqq-model-request-filters\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)[^}]*border-bottom:\s*1px solid var\(--webqq-border\)/s)
    expect(styles).toMatch(/\.webqq-model-request-error-filter\s*\{[^}]*grid-column:\s*1 \/ -1/s)
    expect(styles).not.toContain('cursor:')
  })

  it('结构化 JSON 只展开对象和数组，标量保持为只读节点', () => {
    const tree = buildModelRequestJsonTree({
      model: 'gpt-4.1',
      messages: [{ role: 'user', content: '你好' }],
    }, 'requestBody')

    expect(tree.kind).toBe('object')
    expect(tree.children.map(({ key }) => key)).toEqual(['model', 'messages'])
    expect(tree.children[0]).toMatchObject({ key: 'model', kind: 'value', valueKind: 'string', preview: '"gpt-4.1"' })
    expect(tree.children[1]).toMatchObject({ key: 'messages', kind: 'array', preview: '1 items' })
  })

  it('将 JSON 与 SSE 原始响应派生为结构化预览', () => {
    expect(parseModelResponseBody('{"content":"你好"}', 'json')).toEqual({
      kind: 'json',
      value: { content: '你好' },
    })
    expect(parseModelResponseBody([
      'event: message',
      'data: {"delta":"你"}',
      '',
      'data: {"delta":"好"}',
      '',
      'data: [DONE]',
      '',
    ].join('\n'), 'sse')).toEqual({
      kind: 'sse',
      value: [
        { event: 'message', data: { delta: '你' } },
        { event: 'message', data: { delta: '好' } },
        { event: 'message', data: '[DONE]' },
      ],
    })
  })

  it('从 OpenAI、Anthropic 和 Gemini 响应提取内容预览', () => {
    expect(extractModelResponseContent({
      choices: [{
        message: {
          content: '最终回复',
          reasoning_content: '思考过程',
          tool_calls: [{ id: 'call-1', function: { name: 'search', arguments: '{"q":"test"}' } }],
        },
        finish_reason: 'tool_calls',
      }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    })).toMatchObject({
      content: ['最终回复'],
      reasoning: ['思考过程'],
      toolCalls: [{ id: 'call-1', name: 'search', arguments: '{"q":"test"}' }],
      finishReasons: ['tool_calls'],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    })

    expect(extractModelResponseContent({
      content: [
        { type: 'thinking', thinking: '分析' },
        { type: 'text', text: '答案' },
        { type: 'tool_use', id: 'tool-1', name: 'lookup', input: { id: 1 } },
      ],
      stop_reason: 'end_turn',
    })).toMatchObject({
      content: ['答案'],
      reasoning: ['分析'],
      toolCalls: [{ id: 'tool-1', name: 'lookup' }],
      finishReasons: ['end_turn'],
    })

    expect(extractModelResponseContent({
      candidates: [{
        content: { parts: [{ text: 'Gemini 回复' }, { text: '内部思考', thought: true }] },
        finishReason: 'STOP',
      }],
      usageMetadata: { promptTokenCount: 8 },
    })).toMatchObject({
      content: ['Gemini 回复'],
      reasoning: ['内部思考'],
      finishReasons: ['STOP'],
      usage: { promptTokenCount: 8 },
    })
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
