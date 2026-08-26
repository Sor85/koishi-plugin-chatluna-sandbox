import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildModelRequestAnalysisNavigation,
  exceedsAnalysisLineLimit,
  isPreviewableConversationImage,
  modelAnalysisTargetId,
  normalizeAnalysisQuery,
  resolveActiveAnalysisGroup,
  resolveActiveAnalysisTarget,
  resolveCollapsedAnalysisGroups,
  resolveAnalysisEvidenceTarget,
  shouldExpandAnalysisText,
} from '../client/webqq/model-request-analysis'
import { parseModelRequestConversationDetail } from '../client/webqq/model-request-conversation'
import type { SandboxModelRequestDetail } from '../src/types'

function detail(): SandboxModelRequestDetail {
  return {
    id: 'request-9',
    sequence: 9,
    createdAt: '2026-08-20T02:00:00.000Z',
    status: 'success',
    durationMs: 245,
    provider: 'openai',
    model: 'gpt-5',
    attribution: 'unattributed',
    entities: {},
    requestBodyAvailable: true,
    requestBody: {
      messages: [
        { role: 'system', content: '遵守规则' },
        { role: 'user', content: '查询天气' },
        { role: 'assistant', content: '准备查询', tool_calls: [{ id: 'call-1', function: { name: 'weather', arguments: '{"city":"北京"}' } }] },
        { role: 'tool', tool_call_id: 'call-1', content: '晴' },
      ],
      tools: [{ type: 'function', function: { name: 'weather', description: '查询天气', parameters: { type: 'object' } } }],
    },
    variables: [],
    responseBodyStatus: 'complete',
    responseBodyFormat: 'json',
    responseBodyRaw: JSON.stringify({ choices: [{ message: { content: '北京晴朗' }, finish_reason: 'stop' }] }),
  }
}

describe('模型请求分析展示模型', () => {
  it('把请求边界、角色消息、工具交互和响应映射到共享证据身份', () => {
    const request = detail()
    const navigation = buildModelRequestAnalysisNavigation(parseModelRequestConversationDetail(request), request)

    expect(navigation.boundary).toMatchObject({
      label: '请求 9',
      status: 'success',
      model: 'gpt-5',
      provider: 'openai',
      durationMs: 245,
      target: 'model-analysis-response',
    })
    expect(navigation.groups.map(({ key, count }) => ({ key, count }))).toEqual([
      { key: 'system', count: 1 },
      { key: 'user', count: 1 },
      { key: 'response', count: 1 },
      { key: 'assistant', count: 2 },
      { key: 'tool', count: 2 },
    ])

    request.variables = [{
      id: 'variable-1',
      name: 'weather',
      presetKind: 'character',
      presetName: 'koishi',
      path: ['system'],
      occurrence: 0,
      status: 'observed',
      value: '晴朗',
      evidenceId: 'req:message:messages.0',
      range: { start: 0, end: 2 },
    }]
    const navigationWithVariables = buildModelRequestAnalysisNavigation(parseModelRequestConversationDetail(request), request)
    expect(navigationWithVariables.groups.map(({ key }) => key)).toEqual([
      'system', 'user', 'variables', 'response', 'assistant', 'tool',
    ])

    expect(navigation.groups.find(({ key }) => key === 'assistant')?.items[1]).toMatchObject({
      kind: 'tool-call',
      label: 'TOOL CALL',
      preview: 'weather',
      evidenceId: 'req:tool-call:messages.2.tool_calls.0',
      target: 'model-analysis-req:tool-call:messages.2.tool_calls.0',
    })
    expect(navigation.groups.find(({ key }) => key === 'tool')?.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'TOOL RESULT', evidenceId: 'req:message:messages.3' }),
      expect.objectContaining({ label: 'TOOL DEFS', target: 'model-analysis-tools' }),
    ]))
    expect(navigation.groups.every(({ items }) => items.every(({ evidenceId, target }) => (
      evidenceId === undefined || navigation.targets[evidenceId] === target
    )))).toBe(true)
  })

  it('按阅读探针切换左侧当前展开分类', () => {
    const positions = [
      { key: 'system' as const, top: -600 },
      { key: 'variables' as const, top: 80 },
      { key: 'response' as const, top: 900 },
    ]

    expect(resolveActiveAnalysisGroup(positions, 0, 800)).toBe('variables')
    expect(resolveActiveAnalysisGroup([
      { key: 'system', top: -1400 },
      { key: 'variables', top: -700 },
      { key: 'response', top: 100 },
    ], 0, 800)).toBe('response')
    expect(resolveActiveAnalysisGroup([], 0, 800)).toBeUndefined()
  })

  it('右侧切换分类后只折叠实际已经越过的左侧分类', () => {
    const positions = [
      { key: 'system' as const, top: -600 },
      { key: 'user' as const, top: -200 },
      { key: 'variables' as const, top: 80 },
      { key: 'response' as const, top: 900 },
      // 左侧 Tool 虽排在 Variables 前，但右侧尚未读到时必须保持展开。
      { key: 'tool' as const, top: 1200 },
    ]

    expect(resolveCollapsedAnalysisGroups(positions, 0, 800)).toEqual(['system', 'user'])
    expect(resolveCollapsedAnalysisGroups([
      { key: 'system', top: -1200 },
      { key: 'user', top: -800 },
      { key: 'assistant', top: -400 },
      { key: 'tool', top: 80 },
    ], 0, 800)).toEqual(['system', 'user', 'assistant'])
    expect(resolveCollapsedAnalysisGroups([{ key: 'system', top: 200 }], 0, 800)).toEqual([])
  })

  it('按阅读探针追踪右侧具体卡片对应的左侧条目', () => {
    const positions = [
      { target: 'model-analysis-system-0', top: -500 },
      { target: 'model-analysis-variable-time', top: 40 },
      { target: 'model-analysis-variable-groupShutList', top: 100 },
      { target: 'model-analysis-response', top: 900 },
    ]

    expect(resolveActiveAnalysisTarget(positions, 0, 800)).toBe('model-analysis-variable-groupShutList')
    expect(resolveActiveAnalysisTarget(positions, 0, 200)).toBe('model-analysis-variable-time')
    expect(resolveActiveAnalysisTarget([], 0, 800)).toBeUndefined()
  })

  it('按模型证据身份把轨迹行和组成分段定位到同一分析目标', () => {
    const request = detail()
    const navigation = buildModelRequestAnalysisNavigation(parseModelRequestConversationDetail(request), request)

    expect(resolveAnalysisEvidenceTarget(navigation, 'req:message:messages.0')).toBe('model-analysis-req:message:messages.0')
    expect(resolveAnalysisEvidenceTarget(navigation, 'req:message:messages.1')).toBe('model-analysis-req:message:messages.1')
    expect(resolveAnalysisEvidenceTarget(navigation, 'req:message:messages.2')).toBe('model-analysis-req:message:messages.2')
    expect(resolveAnalysisEvidenceTarget(navigation, 'req:tool-definition:tools.0.function')).toBe('model-analysis-tools')
    expect(resolveAnalysisEvidenceTarget(navigation, 'req:tool-call:messages.2.tool_calls.0'))
      .toBe('model-analysis-req:tool-call:messages.2.tool_calls.0')
    expect(resolveAnalysisEvidenceTarget(navigation, 'req:message:messages.3')).toBe('model-analysis-req:message:messages.3')
    // 请求边界行没有证据身份；回落到第一条卡片而不是猜测顺序。
    expect(resolveAnalysisEvidenceTarget(navigation, undefined)).toBe('model-analysis-req:message:messages.0')
    // 展示文案改变不影响定位：目标来自证据身份表，不来自导航排序或标签。
    for (const item of navigation.groups.flatMap(group => group.items)) item.label = '展示文案已修改'
    expect(resolveAnalysisEvidenceTarget(navigation, 'req:tool-definition:tools.0.function')).toBe('model-analysis-tools')
  })

  it('响应正文、思考与工具事件按证据身份定位到响应卡片和工具卡片', () => {
    const request = detail()
    request.responseBodyRaw = JSON.stringify({
      choices: [{
        message: {
          content: '北京晴朗',
          tool_calls: [{ id: 'call-2', function: { name: 'weather', arguments: '{"city":"上海"}' } }],
        },
        finish_reason: 'tool_calls',
      }],
    })
    const conversation = parseModelRequestConversationDetail(request)
    const navigation = buildModelRequestAnalysisNavigation(conversation, request)

    expect(conversation.response?.cardEvidenceIds).toEqual([
      'res:content:choices.0.content',
      'res:finish-reason:choices.0.finish_reason',
    ])
    for (const evidenceId of conversation.response!.cardEvidenceIds) {
      expect(resolveAnalysisEvidenceTarget(navigation, evidenceId)).toBe('model-analysis-response')
    }
    expect(resolveAnalysisEvidenceTarget(navigation, 'res:tool-call:choices.0.tool_calls.0'))
      .toBe('model-analysis-res:tool-call:choices.0.tool_calls.0')
  })

  it('把 Gemini 组成图 System 分段定位到 systemInstruction.parts', () => {
    const request = detail()
    request.provider = 'gemini'
    request.model = 'gemini-pro'
    request.requestBody = {
      systemInstruction: {
        parts: [
          { text: 'Gemini 系统一' },
          { text: 'Gemini 系统二' },
        ],
      },
      contents: [{ role: 'user', parts: [{ text: '查询天气' }] }],
      tools: [{ functionDeclarations: [{ name: 'weather', description: '查询天气' }] }],
    }
    const navigation = buildModelRequestAnalysisNavigation(parseModelRequestConversationDetail(request), request)

    expect(navigation.groups.map(({ key, count }) => ({ key, count }))).toEqual([
      { key: 'system', count: 2 },
      { key: 'user', count: 1 },
      { key: 'response', count: 1 },
      { key: 'tool', count: 1 },
    ])
    expect(resolveAnalysisEvidenceTarget(navigation, 'req:message:systemInstruction.parts.0'))
      .toBe(modelAnalysisTargetId('req:message:systemInstruction.parts.0'))
    expect(resolveAnalysisEvidenceTarget(navigation, 'req:message:systemInstruction.parts.1'))
      .toBe(modelAnalysisTargetId('req:message:systemInstruction.parts.1'))
    expect(resolveAnalysisEvidenceTarget(navigation, 'req:message:contents.0'))
      .toBe(modelAnalysisTargetId('req:message:contents.0'))
    expect(resolveAnalysisEvidenceTarget(navigation, 'req:tool-definition:tools.0.functionDeclarations.0'))
      .toBe('model-analysis-tools')
  })

  it('搜索文本覆盖正文、工具参数、工具定义 Schema 和响应', () => {
    const request = detail()
    const navigation = buildModelRequestAnalysisNavigation(parseModelRequestConversationDetail(request), request)

    const weather = navigation.groups.flatMap(({ items }) => items).filter(({ searchText }) => searchText.includes(normalizeAnalysisQuery('北京')))
    expect(weather.map(({ label }) => label)).toEqual(['响应', 'ASSISTANT', 'TOOL CALL'])
    expect(navigation.searchText).toContain('查询天气')
    expect(navigation.searchText).toContain('北京晴朗')
    expect(navigation.searchText).toContain('weather')
  })

  it('按实际排版高度在超过 12 行时折叠，正好 12 行保持完整', () => {
    expect(exceedsAnalysisLineLimit(12 * 22.1, 22.1)).toBe(false)
    expect(exceedsAnalysisLineLimit(12 * 22.1 + 1, 22.1)).toBe(true)
    expect(shouldExpandAnalysisText(false, true, '', 'x')).toBe(true)
  })

  it('分析页、组成图、轨迹台账和响应分段共用角色色', () => {
    const styles = readFileSync(resolve('client/styles/webqq-model-requests.css'), 'utf8')
    const view = readFileSync(resolve('client/webqq/analysis-view.vue'), 'utf8')
    const trajectory = readFileSync(resolve('client/model-request-trajectory.vue'), 'utf8')

    expect(styles).toContain('--webqq-role-system: #737985')
    expect(styles).toContain('--webqq-role-user: #2f76c9')
    expect(styles).toContain('--webqq-role-assistant: #a13d76')
    expect(styles).toContain('--webqq-role-response: #0f766e')
    expect(styles).toContain('--webqq-role-response: #5eead4')
    expect(styles).toContain('--webqq-role-tool: #c46b00')
    expect(styles).toContain('--webqq-role-tool-interaction: #8f5aa8')
    expect(styles).not.toContain('--webqq-model-analysis-system')
    expect(styles).not.toContain('#087c9f')
    expect(styles).not.toContain('#0891b2')
    expect(styles).toContain('.webqq-model-analysis-card.is-response { --webqq-role: var(--webqq-role-response); }')
    expect(styles).toContain('.webqq-model-analysis-nav-group.is-response { --webqq-role: var(--webqq-role-response); }')
    expect(styles).toContain('.webqq-model-analysis-card.is-tool { --webqq-role: var(--webqq-role-tool-interaction); }')
    expect(styles).toContain('.webqq-model-analysis-tool-card { --webqq-role: var(--webqq-role-tool); }')
    expect(styles).toContain('color: var(--webqq-role);')
    expect(styles).toContain('.webqq-model-trajectory-row.is-tool-definition .webqq-model-trajectory-kind')
    expect(view).toContain('class="webqq-model-analysis-nav-group"')
    expect(view).toContain('`is-${group.key}`')
    expect(view).toContain(':class="`is-${item.kind}`"')
    expect(view).toContain('class="webqq-model-analysis-tool-call is-call"')
    expect(view).toContain('class="webqq-model-analysis-tool-call is-result"')
    expect(trajectory).toContain("row.source === 'response' ? 'is-response' : ''")
    expect(trajectory).toContain("row.toolEvent === 'definition' ? 'is-tool-definition' : ''")
  })

  it('左侧 Variables 列出预设表达式名，并定位右侧变量值卡片', () => {
    const request = detail()
    request.variables = [{
      id: 'character:0:["system"]#0',
      name: 'weather',
      presetKind: 'character',
      presetName: 'koishi',
      path: ['system'],
      occurrence: 0,
      status: 'observed',
      value: '长沙晴朗',
      evidenceId: 'req:message:messages.0',
      range: { start: 0, end: 4 },
    }]
    const navigation = buildModelRequestAnalysisNavigation(parseModelRequestConversationDetail(request), request)
    const variables = navigation.groups.find(({ key }) => key === 'variables')

    expect(variables).toMatchObject({ label: 'Variables', count: 1 })
    expect(variables?.items[0]).toMatchObject({
      kind: 'variable', label: 'VARIABLE', preview: 'weather', searchText: expect.stringContaining('长沙晴朗'),
    })

    const view = readFileSync(resolve('client/webqq/analysis-view.vue'), 'utf8')
    expect(view).toContain(':id="modelAnalysisVariableTargetId(variable.id)"')
    expect(view).toContain(':value="variable.name"')
    expect(view).toContain(':value="variable.value ?? \'\'"')
    expect(view).toContain('variablesVisible')
    expect(view).toContain("isEvidenceVisible(evidenceFilter.value, 'variable')")
  })

  it('变量卡片正文保持卡片内边距，支持头部和按钮折叠，并标注空值', () => {
    const view = readFileSync(resolve('client/webqq/analysis-view.vue'), 'utf8')
    const styles = readFileSync(resolve('client/styles/webqq-model-requests.css'), 'utf8')

    expect(view).toContain("'is-collapsed': isCardCollapsed(modelAnalysisVariableTargetId(variable.id))")
    expect(view).toContain('@click="toggleCardFromHeader($event, modelAnalysisVariableTargetId(variable.id))"')
    expect(view).toContain('@click="toggleCard(modelAnalysisVariableTargetId(variable.id))"')
    expect(view).toContain('v-show="!isCardCollapsed(modelAnalysisVariableTargetId(variable.id))"')
    expect(view).toContain("variable.status === 'observed' && !variable.value")
    expect(view).toContain('<span>空值</span>该表达式在本次模型请求中展开为空字符串')
    expect(styles).toMatch(/\.webqq-model-analysis-variable-body > \.webqq-model-analysis-section \{[^}]*padding: 14px 16px;/s)
    expect(styles).toContain('.webqq-model-analysis-variable-card.is-collapsed > header { border-bottom: 0; }')
    expect(styles).toContain('.webqq-model-analysis-variable-card:not(.is-collapsed) .webqq-model-analysis-collapse svg { transform: rotate(180deg); }')
  })

  it('工具列表图标锁死 18px，避免 flex 把扳手挤成不同大小', () => {
    const styles = readFileSync(resolve('client/styles/webqq-model-requests.css'), 'utf8')
    const view = readFileSync(resolve('client/webqq/analysis-view.vue'), 'utf8')

    expect(styles).toMatch(/\.webqq-model-analysis-tool-summary > svg \{[^}]*flex: 0 0 auto;[^}]*width: 18px;[^}]*height: 18px;/s)
    expect(view).toContain('class="webqq-model-analysis-tool-copy"')
    expect(view).toContain('class="webqq-model-analysis-tool-desc"')
    expect(view).toContain('class="webqq-model-analysis-tool-chevron"')
    expect(styles).toMatch(/\.webqq-model-analysis-tool-summary \{[^}]*grid-template-columns: 18px minmax\(0, 1fr\) 18px;/s)
    expect(styles).toMatch(/\.webqq-model-analysis-tool-copy \{[^}]*grid-template-columns: max-content minmax\(0, 1fr\) max-content;/s)
    expect(styles).toMatch(/\.webqq-model-analysis-tool-copy > strong \{[^}]*min-width: 0;[^}]*max-width: 100%;/s)
    expect(styles).toMatch(/\.webqq-model-analysis-tool-copy > \.webqq-model-analysis-tool-desc \{[^}]*container-type: inline-size/s)
    expect(styles).toMatch(/@container \(max-width: 3em\) \{[^}]*\.webqq-model-analysis-tool-desc > span \{ display: none; \}/s)
    expect(styles).toMatch(/\.webqq-model-trajectory-inspector \{[^}]*container-type: inline-size;[^}]*container-name: webqq-trajectory-inspector;/s)
    expect(styles).toMatch(/@container webqq-trajectory-inspector \(max-width: 500px\) \{[^}]*\.webqq-model-analysis-tool-desc > span \{ display: none; \}/s)
    expect(styles).toMatch(/\.webqq-model-analysis-tool-summary > \.webqq-model-analysis-tool-chevron \{[^}]*flex: 0 0 18px;[^}]*min-width: 18px;[^}]*min-height: 18px;/s)
    expect(styles).toMatch(/\.webqq-model-analysis-collapse svg \{[^}]*min-width: 16px;[^}]*min-height: 16px;/s)
  })

  it('工具列表卡片头与消息卡片头同高，不再额外垫高', () => {
    const styles = readFileSync(resolve('client/styles/webqq-model-requests.css'), 'utf8')

    expect(styles).toMatch(/\.webqq-model-analysis-tool-summary \{[^}]*min-height: 44px;[^}]*padding: 8px 12px;/s)
    expect(styles).not.toMatch(/\.webqq-model-analysis-tool-summary \{[^}]*min-height: 58px;/s)
  })

  // 定位的算术与帧时序已经进入 evidence-locator 并由行为测试覆盖；
  // 这里只保留无法进入 module 的 DOM 契约：滚动容器选择规则留在视图侧。
  it('工作台分析的导航与卡片共用外层详情滚动，检查器仍滚动 inspector-body', () => {
    const view = readFileSync(resolve('client/webqq/analysis-view.vue'), 'utf8')
    const styles = readFileSync(resolve('client/styles/webqq-model-requests.css'), 'utf8')

    expect(view).toContain("content.closest<HTMLElement>('.webqq-model-request-detail')")
    expect(view).toContain("content.closest<HTMLElement>('.webqq-model-trajectory-inspector-body')")
    expect(view).toContain('createEvidenceLocator')
    expect(view).not.toContain("scrollIntoView({ behavior: 'smooth', block: 'start' })")
    expect(styles).toMatch(/\.webqq-model-request-analysis \.webqq-model-analysis-content \{[^}]*max-height: none[^}]*overflow: visible/s)
  })

  it('单一左侧导航保持吸顶，分类默认展开且支持独立折叠', () => {
    const view = readFileSync(resolve('client/webqq/analysis-view.vue'), 'utf8')
    const styles = readFileSync(resolve('client/styles/webqq-model-requests.css'), 'utf8')

    expect(view).toContain('collapsedNavigationGroups = ref(new Set<ModelRequestAnalysisGroupKey>())')
    expect(view).toContain('@click="toggleNavigationGroup(group.key)"')
    expect(view).toContain(':aria-expanded="!collapsedNavigationGroups.has(group.key)"')
    expect(view).toContain('v-show="!collapsedNavigationGroups.has(group.key)"')
    expect(view).toContain('collapsedNavigationGroups.value = new Set()')
    expect(view).toContain('next.has(group) ? next.delete(group) : next.add(group)')
    expect(styles).toMatch(/\.webqq-model-request-analysis \.webqq-model-analysis-nav \{[^}]*position: sticky;[^}]*top: 0;[^}]*max-height: var\(--webqq-model-analysis-nav-height[^}]*overflow: auto;/s)
  })

  it('滚动阅读右侧时自动折叠已越过分类，不再渲染第二份浮动导航', () => {
    const view = readFileSync(resolve('client/webqq/analysis-view.vue'), 'utf8')
    const styles = readFileSync(resolve('client/styles/webqq-model-requests.css'), 'utf8')

    expect(view).not.toContain('webqq-model-analysis-nav-fallback')
    expect(view).not.toContain('fallbackNavigationVisible')
    expect(view).not.toContain('navigationSourceElement')
    expect(styles).not.toContain('.webqq-model-analysis-nav-fallback')
    expect(view).toContain('resolveCollapsedAnalysisGroups')
    expect(view).toContain('resolveActiveAnalysisTarget')
    expect(view).toContain(":data-target=\"item.target\"")
    expect(view).toContain("'is-current': activeNavigationTarget === item.target")
    expect(view).toContain('const NAVIGATION_TARGET_SCROLL_TOP_MARGIN = 12')
    expect(view).toContain('const NAVIGATION_TARGET_SCROLL_BOTTOM_MARGIN = 32')
    expect(view).toMatch(/const visibleBottom = navigationRect\.bottom - NAVIGATION_TARGET_SCROLL_BOTTOM_MARGIN/)
    expect(view).toMatch(/navigation\.scrollTo\(\{ top: navigation\.scrollTop \+ itemRect\.bottom - visibleBottom, behavior: 'smooth' \}\)/)
    expect(styles).toMatch(/\.webqq-model-request-analysis \.webqq-model-analysis-nav \{[^}]*padding-bottom: 44px;/s)
    expect(styles).toContain('.webqq-model-analysis-nav-item.is-current')
    expect(view).toContain('if (active && active !== activeNavigationGroup.value)')
    expect(view).toContain('collapsedNavigationGroups.value = new Set(resolveCollapsedAnalysisGroups(')
    expect(view).toContain('positions,')
    expect(view).toContain(':data-analysis-group="message.role"')
    expect(view).toContain('data-analysis-group="variables"')
    expect(view).toContain('data-analysis-group="response"')
    expect(view).toContain('data-analysis-group="tool"')
    expect(view).toContain("navigationScroller.addEventListener('scroll', scheduleNavigationTracking")
    expect(view).toContain('resolveActiveAnalysisGroup')
    expect(view).toContain("style.setProperty('--webqq-model-analysis-nav-height', `${scroller.clientHeight}px`)")
  })

  it('TOOL DEFS 强调框与消息卡片一样是圆角矩形', () => {
    const styles = readFileSync(resolve('client/styles/webqq-model-requests.css'), 'utf8')

    expect(styles).toMatch(/\.webqq-model-analysis-tools \{[^}]*overflow: hidden;[^}]*border-radius: 8px;/s)
    expect(styles).toContain('.webqq-model-analysis-tools.is-located')
  })

  it('字符数徽章保持单行，不被窄栏折成两行', () => {
    const styles = readFileSync(resolve('client/styles/webqq-model-requests.css'), 'utf8')

    expect(styles).toMatch(/\.webqq-model-analysis-chars \{[^}]*flex: 0 0 auto;[^}]*white-space: nowrap;/s)
  })

  it('工具 Schema 使用请求页 JSON 树，而不是纯文本', () => {
    const styles = readFileSync(resolve('client/styles/webqq-model-requests.css'), 'utf8')
    const view = readFileSync(resolve('client/webqq/analysis-view.vue'), 'utf8')

    expect(view).toContain('class="webqq-model-analysis-tool-schema webqq-model-request-json-viewer"')
    expect(view).toContain(':node="buildModelRequestJsonTree(tool.parameters || {}, \'parameters\')"')
    expect(view).not.toContain('formatJson(tool.parameters')
    expect(styles).toMatch(/\.webqq-model-analysis-tool-schema\.webqq-model-request-json-viewer \{[^}]*min-height: 0;[^}]*padding: 12px;/s)
  })

  it('响应工具调用参数使用请求页 JSON 树，而不是纯文本', () => {
    const view = readFileSync(resolve('client/webqq/analysis-view.vue'), 'utf8')
    const responseSection = view.slice(view.indexOf('response.toolCalls.length'))

    expect(responseSection).toContain(':node="buildModelRequestJsonTree(parseAnalysisJson(call.arguments), \'arguments\')"')
    expect(responseSection).not.toContain(':value="call.arguments || \'{}\'"')
  })

  it('去掉完整请求 JSON 入口，卡片正文不再标「内容」，头部空白可折叠', () => {
    const view = readFileSync(resolve('client/webqq/analysis-view.vue'), 'utf8')

    expect(view).not.toContain('完整请求 JSON')
    expect(view).not.toContain('返回对话')
    expect(view).not.toContain('toggleRawRequest')
    expect(view).not.toContain('label="内容"')
    expect(view).not.toContain("index === 0 ? '内容'")
    expect(view).toContain('@click="toggleCardFromHeader($event, modelAnalysisTargetId(message.evidenceId))"')
    expect(view).toContain('@click="toggleCardFromHeader($event, MODEL_ANALYSIS_RESPONSE_TARGET)"')
    expect(view).toContain('event.target.closest(\'button\')')
    expect(view).toContain("v-if=\"layout !== 'inspector'\"")
    expect(view).toContain("layout === 'inspector'")
  })

  it('折叠长文本用渐隐遮罩并居中展开按钮，避免半透明实色透出字形', () => {
    const styles = readFileSync(resolve('client/styles/webqq-model-requests.css'), 'utf8')
    const view = readFileSync(resolve('client/webqq/analysis-view.vue'), 'utf8')

    expect(view).toContain("class: 'webqq-model-analysis-expand'")
    expect(view).toContain('展开全部（${blockProps.value.length} 字符）')
    expect(view).toContain("h(IconChevronDown, { size: 12, 'aria-hidden': 'true' })")
    expect(styles).toMatch(/\.webqq-model-analysis-expand \{[^}]*display: flex;[^}]*justify-content: center;/s)
    expect(styles).toContain('.webqq-model-analysis-section:not(.is-collapsed) .webqq-model-analysis-expand svg { transform: rotate(180deg); }')
    expect(styles).toContain('-webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - 48px), transparent);')
    expect(styles).toContain('mask-image: linear-gradient(to bottom, #000 calc(100% - 48px), transparent);')
    expect(styles).not.toContain('.webqq-model-analysis-text-wrap::after')
    expect(styles).not.toContain('opacity: 0.92')
  })

  it('只允许 HTTP(S) 与非 SVG 图片 Data URL 进入图片预览', () => {
    expect(isPreviewableConversationImage('https://example.com/image.png')).toBe(true)
    expect(isPreviewableConversationImage('data:image/png;base64,aGVsbG8=')).toBe(true)
    expect(isPreviewableConversationImage('data:image/svg+xml;base64,PHN2Zz4=')).toBe(false)
    expect(isPreviewableConversationImage('data:text/html;base64,PGgxPng8L2gxPg==')).toBe(false)
    expect(isPreviewableConversationImage('javascript:alert(1)')).toBe(false)
  })
})
