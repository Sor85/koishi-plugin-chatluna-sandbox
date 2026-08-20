import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildModelRequestAnalysisNavigation,
  exceedsAnalysisLineLimit,
  isPreviewableConversationImage,
  normalizeAnalysisQuery,
  prepareModelAnalysisTarget,
  resolveAnalysisPromptTarget,
  resolveToolDefinitionLocation,
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
    responseBodyStatus: 'complete',
    responseBodyFormat: 'json',
    responseBodyRaw: JSON.stringify({ choices: [{ message: { content: '北京晴朗' }, finish_reason: 'stop' }] }),
    summary: { keys: 2, messageCount: 4, toolCount: 1, bodyAvailable: true },
  }
}

describe('模型请求分析展示模型', () => {
  it('把请求边界、角色消息、工具交互和响应映射到稳定定位目标', () => {
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
      { key: 'assistant', count: 2 },
      { key: 'tool', count: 2 },
      { key: 'response', count: 1 },
    ])
    expect(navigation.groups[2]?.items[1]).toMatchObject({
      kind: 'tool-call',
      label: 'TOOL CALL',
      preview: 'weather',
      target: 'model-analysis-message-2-tool-call-0',
    })
    expect(navigation.groups[3]?.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'TOOL RESULT', target: 'model-analysis-message-3' }),
      expect.objectContaining({ label: 'TOOL DEFS', target: 'model-analysis-tools' }),
    ]))
  })

  it('把请求组成图分段定位到对应消息、工具定义和工具交互', () => {
    const request = detail()
    const navigation = buildModelRequestAnalysisNavigation(parseModelRequestConversationDetail(request), request)

    expect(resolveAnalysisPromptTarget(navigation, 'system', 0)).toBe('model-analysis-message-0')
    expect(resolveAnalysisPromptTarget(navigation, 'user', 0)).toBe('model-analysis-message-1')
    expect(resolveAnalysisPromptTarget(navigation, 'assistant', 0)).toBe('model-analysis-message-2')
    expect(resolveAnalysisPromptTarget(navigation, 'tool-definition', 0)).toBe('model-analysis-tools')
    expect(resolveAnalysisPromptTarget(navigation, 'tool-interaction', 0)).toBe('model-analysis-message-2-tool-call-0')
    expect(resolveAnalysisPromptTarget(navigation, 'tool-interaction', 1)).toBe('model-analysis-message-3')

    for (const item of navigation.groups.flatMap(group => group.items)) item.label = '展示文案已修改'
    expect(resolveAnalysisPromptTarget(navigation, 'tool-definition', 0)).toBe('model-analysis-tools')
    expect(resolveAnalysisPromptTarget(navigation, 'tool-interaction', 0)).toBe('model-analysis-message-2-tool-call-0')
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
      { key: 'tool', count: 1 },
      { key: 'response', count: 1 },
    ])
    expect(resolveAnalysisPromptTarget(navigation, 'system', 0)).toBe('model-analysis-message-0')
    expect(resolveAnalysisPromptTarget(navigation, 'system', 1)).toBe('model-analysis-message-1')
    expect(resolveAnalysisPromptTarget(navigation, 'user', 0)).toBe('model-analysis-message-2')
    expect(resolveAnalysisPromptTarget(navigation, 'tool-definition', 0)).toBe('model-analysis-tools')
  })

  it('精确匹配两位数消息目标并把定位状态传给折叠分区', () => {
    const request = detail()
    const conversation = parseModelRequestConversationDetail(request)
    conversation.messages.push(...Array.from({ length: 18 }, (_, offset) => ({
      ...conversation.messages[0]!,
      index: offset + 4,
      content: `消息 ${offset + 4}`,
      searchText: `消息 ${offset + 4}`,
    })))

    expect(prepareModelAnalysisTarget(conversation, 'model-analysis-message-20')).toMatchObject({
      messageIndex: 20,
      expandCards: ['model-analysis-message-20'],
      expandTargets: ['model-analysis-message-20'],
    })
    expect(prepareModelAnalysisTarget(conversation, 'model-analysis-message-2-tool-call-0')).toMatchObject({
      messageIndex: 2,
      expandCards: ['model-analysis-message-2'],
      expandTargets: ['model-analysis-message-2-tool-call-0'],
    })
    expect(prepareModelAnalysisTarget(conversation, 'model-analysis-response-tool-call-0')).toMatchObject({
      response: true,
      expandCards: ['model-analysis-response'],
      expandTargets: ['model-analysis-response-tool-call-0'],
    })
    expect(shouldExpandAnalysisText(false, true, '', 'x')).toBe(true)
  })

  it('同名工具定义证据不明确时展开全部匹配项而不猜测第一项', () => {
    const request = detail()
    request.requestBody = {
      messages: [{ role: 'assistant', tool_calls: [{ function: { name: 'weather', arguments: '{}' } }] }],
      tools: [
        { type: 'function', function: { name: 'weather', description: '第一个', parameters: { type: 'object' } } },
        { type: 'function', function: { name: 'weather', description: '第二个', parameters: { type: 'object' } } },
      ],
    }
    const conversation = parseModelRequestConversationDetail(request)

    expect(resolveToolDefinitionLocation(conversation.tools, 'weather')).toEqual({
      target: 'model-analysis-tools',
      toolPaths: [['tools', '0', 'function'], ['tools', '1', 'function']],
    })
  })

  it('搜索文本覆盖正文、工具参数、工具定义 Schema 和响应', () => {
    const request = detail()
    const navigation = buildModelRequestAnalysisNavigation(parseModelRequestConversationDetail(request), request)

    const weather = navigation.groups.flatMap(({ items }) => items).filter(({ searchText }) => searchText.includes(normalizeAnalysisQuery('北京')))
    expect(weather.map(({ label }) => label)).toEqual(['ASSISTANT', 'TOOL CALL', '响应'])
    expect(navigation.searchText).toContain('查询天气')
    expect(navigation.searchText).toContain('北京晴朗')
    expect(navigation.searchText).toContain('weather')
  })

  it('按实际排版高度在超过 12 行时折叠，正好 12 行保持完整', () => {
    expect(exceedsAnalysisLineLimit(12 * 22.1, 22.1)).toBe(false)
    expect(exceedsAnalysisLineLimit(12 * 22.1 + 1, 22.1)).toBe(true)
  })

  it('工具列表图标锁死 18px，避免 flex 把扳手挤成不同大小', () => {
    const styles = readFileSync(resolve('client/styles/webqq-model-requests.css'), 'utf8')

    expect(styles).toMatch(/\.webqq-model-analysis-tool-summary > svg \{[^}]*flex: 0 0 auto;[^}]*width: 18px;[^}]*height: 18px;/s)
  })

  it('工具列表卡片头与消息卡片头同高，不再额外垫高', () => {
    const styles = readFileSync(resolve('client/styles/webqq-model-requests.css'), 'utf8')

    expect(styles).toMatch(/\.webqq-model-analysis-tool-summary \{[^}]*min-height: 44px;[^}]*padding: 8px 12px;/s)
    expect(styles).not.toMatch(/\.webqq-model-analysis-tool-summary \{[^}]*min-height: 58px;/s)
  })

  it('工具 Schema JSON 用独立底和边框与描述隔开', () => {
    const styles = readFileSync(resolve('client/styles/webqq-model-requests.css'), 'utf8')
    const view = readFileSync(resolve('client/webqq/analysis-view.vue'), 'utf8')

    expect(view).toContain('class="webqq-model-analysis-tool-schema"')
    expect(styles).toMatch(/\.webqq-model-analysis-tool-schema \{[^}]*border: 1px solid var\(--webqq-border\);[^}]*border-radius: 8px;[^}]*background: var\(--webqq-surface-muted\);/s)
  })

  it('去掉完整请求 JSON 入口，卡片正文不再标「内容」，头部空白可折叠', () => {
    const view = readFileSync(resolve('client/webqq/analysis-view.vue'), 'utf8')

    expect(view).not.toContain('完整请求 JSON')
    expect(view).not.toContain('返回对话')
    expect(view).not.toContain('toggleRawRequest')
    expect(view).not.toContain('label="内容"')
    expect(view).not.toContain("index === 0 ? '内容'")
    expect(view).toContain('@click="toggleCardFromHeader($event, modelAnalysisMessageId(message.index))"')
    expect(view).toContain('@click="toggleCardFromHeader($event, \'model-analysis-response\')"')
    expect(view).toContain('event.target.closest(\'button\')')
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
