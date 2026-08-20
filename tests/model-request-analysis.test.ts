import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildModelRequestAnalysisNavigation,
  collapseAnalysisText,
  isPreviewableConversationImage,
  normalizeAnalysisQuery,
  resolveAnalysisPromptTarget,
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

  it('内容超过 1200 字符时只预览前 600 字符，边界值不折叠', () => {
    expect(collapseAnalysisText('a'.repeat(1200), false)).toEqual({
      text: 'a'.repeat(1200),
      collapsible: false,
    })
    expect(collapseAnalysisText('b'.repeat(1201), false)).toEqual({
      text: 'b'.repeat(600),
      collapsible: true,
    })
    expect(collapseAnalysisText('b'.repeat(1201), true)).toEqual({
      text: 'b'.repeat(1201),
      collapsible: true,
    })
  })

  it('分析模式保留轨迹控制，并用导航定位取代独立轨迹检查器', () => {
    const analysisSource = readFileSync(resolve('client/webqq/analysis-view.vue'), 'utf8')
    const trajectorySource = readFileSync(resolve('client/model-request-trajectory.vue'), 'utf8')
    const styles = readFileSync(resolve('client/styles/webqq-model-requests.css'), 'utf8')

    expect(trajectorySource).toMatch(/ModelRequestConversationAnalysis[\s\S]*:search-query="searchQuery"[\s\S]*:focus-request="analysisFocusRequest"/)
    expect(trajectorySource).toMatch(/v-else class="webqq-model-trajectory-ledger"[\s\S]*webqq-model-trajectory-inspector/)
    expect(trajectorySource).toContain('if (props.analysis)')
    expect(analysisSource).toContain('visibleNavigationGroups')
    expect(analysisSource).toContain('resolveAnalysisPromptTarget')
    expect(analysisSource).toContain("scrollIntoView({ behavior: 'smooth', block: 'start' })")
    expect(analysisSource).toContain('}, 1500)')
    expect(analysisSource).toContain('response.toolResults')
    expect(analysisSource).toContain("response.format === 'text'")
    expect(analysisSource).toContain('conversationScrollTop')
    expect(analysisSource).toContain('window.getSelection()')
    expect(styles).toMatch(/\.webqq-model-analysis-main\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*260px minmax\(0, 1fr\)/s)
    expect(styles).toMatch(/@container \(max-width: 760px\)[\s\S]*\.webqq-model-analysis-main\s*\{\s*grid-template-columns:\s*1fr/s)
    expect(styles).not.toContain('cursor:')
  })

  it('只允许 HTTP(S) 与非 SVG 图片 Data URL 进入图片预览', () => {
    expect(isPreviewableConversationImage('https://example.com/image.png')).toBe(true)
    expect(isPreviewableConversationImage('data:image/png;base64,aGVsbG8=')).toBe(true)
    expect(isPreviewableConversationImage('data:image/svg+xml;base64,PHN2Zz4=')).toBe(false)
    expect(isPreviewableConversationImage('data:text/html;base64,PGgxPng8L2gxPg==')).toBe(false)
    expect(isPreviewableConversationImage('javascript:alert(1)')).toBe(false)
  })
})
