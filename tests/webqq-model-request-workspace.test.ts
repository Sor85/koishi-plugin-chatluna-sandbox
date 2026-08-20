import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { formatDuration } from '../client/webqq/format-duration'
import { extractModelResponseContent, normalizeModelResponseUsage } from '../client/webqq/model-response-content'
import {
  buildModelRequestJsonTree,
  findModelRequestJsonPath,
  parseModelRequestImageSource,
  parseModelResponseBody,
} from '../client/webqq/model-request-json'
import { createModelRequestEnterRefresh, createModelRequestLiveRefresh, MODEL_REQUEST_LIVE_REFRESH_INTERVAL_MS } from '../client/webqq/model-request-live-refresh'

describe('WebQQ 模型请求工作台', () => {
  it('从最左侧导航进入独立视图，并提供分类、分页摘要、详情和未归属二次确认', () => {
    const pageSource = readFileSync(resolve('client/page.vue'), 'utf8')
    const sidebarSource = readFileSync(resolve('client/webqq-sidebar.vue'), 'utf8')
    const shellSource = readFileSync(resolve('client/webqq/workspace-shell.ts'), 'utf8')
    const workspaceSource = readFileSync(resolve('client/model-request-workspace.vue'), 'utf8')
    const trajectorySource = readFileSync(resolve('client/model-request-trajectory.vue'), 'utf8')
    const jsonSource = readFileSync(resolve('client/model-request-json-tree.vue'), 'utf8')
    const responsePreviewSource = readFileSync(resolve('client/model-response-content-preview.vue'), 'utf8')
    const styles = readFileSync(resolve('client/styles/webqq-model-requests.css'), 'utf8')
    const detailHeader = workspaceSource.match(/<article v-else[\s\S]*?<header>([\s\S]*?)<\/header>/)?.[1] ?? ''

    expect(sidebarSource).toMatch(/label:\s*['"]模型请求['"]/)
    expect(sidebarSource).toContain('IconBrain')
    expect(pageSource).toContain("currentView === 'model-requests'")
    expect(pageSource).toContain('<ModelRequestWorkspace')
    expect(pageSource).toContain(':bots="modelRequestBots"')
    expect(pageSource).toContain(':visit-key="modelRequestVisitKey"')
    expect(pageSource).toContain('modelRequestVisitKey')
    expect(shellSource).toContain("if (view === 'model-requests') modelRequestVisitKey.value += 1")
    expect(pageSource).not.toContain(':capacity=')
    expect(workspaceSource).not.toContain('capacityText')
    expect(workspaceSource).not.toContain('maxRecords')
    expect(pageSource).toContain('const debugBots = modelRequestBots')
    expect(pageSource).toContain("{ id: 'main', name: '主环境' }")
    expect(workspaceSource).toContain("from './components/ui/select'")
    expect(workspaceSource).toContain("from './components/ui/checkbox'")
    expect(workspaceSource).toContain("from './components/ui/switch'")
    expect(workspaceSource).toContain("from './components/ui/button'")
    expect(workspaceSource).toContain('自动刷新')
    expect(workspaceSource).not.toContain('实时刷新')
    expect(workspaceSource).toContain("from './components/ui/dialog'")
    expect(workspaceSource).toContain("from './components/ui/popover'")
    expect(workspaceSource).toContain('清理未归属记录')
    expect(workspaceSource).toContain("value=\"unattributed\"")
    expect(workspaceSource).toContain("value=\"all\"")
    expect(workspaceSource).toContain("category = ref<'all' | 'space' | 'unattributed'>('all')")
    expect(workspaceSource).toContain('加载更多')
    expect(workspaceSource).toMatch(/webqq-model-request-list-pane[\s\S]*webqq-model-request-list-toolbar[\s\S]*webqq-model-request-list/)
    expect(workspaceSource).toContain('筛选模型请求')
    expect(workspaceSource).toContain('请求列表')
    expect(workspaceSource).toContain('按时间倒序')
    expect(workspaceSource).toContain('按时间正序')
    expect(workspaceSource).toContain('全部空间')
    expect(workspaceSource).toContain('beforeCreatedAt')
    expect(workspaceSource).toContain("sortOrder = ref<'asc' | 'desc'>('desc')")
    expect(workspaceSource).toContain('toggleSortOrder')
    expect(workspaceSource).not.toContain('sortOpen')
    expect(workspaceSource).not.toContain('webqq-model-request-sort-popover')
    expect(workspaceSource.indexOf('webqq-model-request-list-toolbar')).toBeGreaterThan(workspaceSource.indexOf('webqq-model-request-list-pane'))
    expect(styles).toMatch(/\.webqq-model-request-list-toolbar\s*\{[^}]*justify-content:\s*space-between/s)
    expect(workspaceSource).toContain('buildModelRequestJsonTree')
    expect(workspaceSource).toContain('<WebqqAvatar')
    expect(workspaceSource).toContain('resolveRequestBot(record).name')
    expect(workspaceSource).toMatch(/webqq-model-request-bot-copy[\s\S]*webqq-model-request-bot-name[\s\S]*resolveRequestBot\(record\)\.name[\s\S]*statusLabel\(record\.status\)[\s\S]*record\.provider[\s\S]*formatTime\(record\.createdAt\)[\s\S]*formatDuration\(record\.durationMs\)/)
    expect(workspaceSource).not.toMatch(/class="webqq-model-request-item"[\s\S]*record\.error\.message/)
    expect(workspaceSource).toContain('detail.error.message')
    expect(workspaceSource).toMatch(/webqq-model-request-bot-copy[\s\S]*webqq-model-request-bot-name[\s\S]*resolveRequestBot\(detail\)\.name[\s\S]*formatTime\(detail\.createdAt\)/)
    expect(workspaceSource).toMatch(/date\.getFullYear\(\)[\s\S]*date\.getMonth\(\)[\s\S]*date\.getDate\(\)[\s\S]*date\.getHours\(\)/)
    expect(detailHeader).not.toContain('detail.durationMs')
    expect(detailHeader).toContain('webqq-model-request-detail-nav')
    expect(detailHeader).toContain('webqq-model-request-view-switch')
    expect(detailHeader).toContain('IconArrowLeft')
    expect(detailHeader).toContain('返回轨迹')
    expect(detailHeader).toContain('IconFileCode')
    expect(detailHeader).toContain('IconTimelineEvent')
    expect(detailHeader.indexOf('返回轨迹')).toBeLessThan(detailHeader.indexOf('IconFileCode'))
    expect(detailHeader.indexOf('IconFileCode')).toBeLessThan(detailHeader.indexOf('IconTimelineEvent'))
    expect(styles).toMatch(/\.webqq-model-request-detail-nav\s*\{[^}]*margin-left:\s*auto/s)
    expect(workspaceSource).not.toContain('原始证据')
    expect(workspaceSource).toContain('IconCalendarTime')
    expect(workspaceSource).toContain('IconFileCode')
    expect(styles).toMatch(/\.webqq-model-request-detail > header\s*\{[^}]*justify-content:\s*space-between/s)
    expect(workspaceSource).toContain('IconClock')
    expect(workspaceSource).toContain('IconWorld')
    expect(workspaceSource).toContain('IconTopologyStar3')
    expect(workspaceSource).toContain("return '已完成'")
    expect(workspaceSource).not.toContain("return '成功'")
    expect(workspaceSource).toContain('formatDuration(detail.durationMs)')
    expect(workspaceSource).not.toContain('durationMs }} ms')
    expect(workspaceSource).toMatch(/webqq-model-request-overview[\s\S]*statusLabel\(detail\.status\)[\s\S]*渠道[\s\S]*模型 ID[\s\S]*耗时[\s\S]*字段[\s\S]*消息[\s\S]*工具/)
    expect(workspaceSource).not.toContain('API 密钥名称')
    expect(workspaceSource).toMatch(/webqq-model-request-usage[\s\S]*输入[\s\S]*输出[\s\S]*推理[\s\S]*缓存[\s\S]*总 Token[\s\S]*TTFT[\s\S]*TPS[\s\S]*总耗时/)
    expect(workspaceSource).not.toContain('usageStateLabel')
    expect(workspaceSource).not.toContain('字段 {{ record.summary.keys }}')
    expect(workspaceSource).toMatch(/webqq-model-request-meta-list[\s\S]*请求地址[\s\S]*关联实体/)
    expect(workspaceSource).toContain('headersExpanded')
    expect(workspaceSource).toContain('headersTree')
    expect(workspaceSource).toMatch(/<div v-if="headersExpanded" class="webqq-model-request-header-json">[\s\S]*<div class="webqq-model-request-json-viewer">[\s\S]*:node="headersTree"/)
    expect(workspaceSource).toContain(':strings-expanded="true"')
    expect(styles).toContain('.webqq-model-request-header-toggle')
    expect(styles).toMatch(/\.webqq-model-request-header-json \.webqq-model-request-json-viewer\s*\{[^}]*min-height:\s*0[^}]*max-height:\s*320px/s)
    expect(styles).toMatch(/\.webqq-model-request-overview-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/s)
    expect(styles).toMatch(/\.webqq-model-request-usage-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/s)
    expect(styles).toMatch(/\.webqq-workspace \.sandbox-badge\.webqq-model-request-complete(?:,\s*\.webqq-workspace \.sandbox-badge\.webqq-model-request-status-success)?\s*\{[^}]*color:\s*#047857[^}]*background:\s*#d1fae5/s)
    expect(styles).toMatch(/\.webqq-model-request-meta-list\s*\{[^}]*display:\s*grid[^}]*border:\s*1px solid var\(--webqq-border\)/s)
    expect(styles).toMatch(/\.webqq-model-request-meta-list \.webqq-model-request-meta\s*\{[^}]*grid-template-columns:\s*17px minmax\(64px, auto\) minmax\(0, 1fr\)/s)
    expect(styles).toMatch(/\.webqq-model-request-bot-copy\s*\{[^}]*display:\s*grid[^}]*gap:\s*2px/s)
    expect(styles).toMatch(/\.webqq-model-request-bot-name\s*\{[^}]*flex-wrap:\s*wrap/s)
    expect(workspaceSource).toContain("'未归属机器人'")
    expect(workspaceSource).not.toContain("record.model || '未知模型'")
    expect(workspaceSource).toContain('detailModel')
    expect(workspaceSource).toMatch(/<Badge v-if="record\.provider" variant="outline" class="webqq-model-request-provider">/)
    expect(workspaceSource).not.toMatch(/<Badge v-if="detail\.provider" variant="outline" class="webqq-model-request-provider">/)
    expect(styles).toMatch(/\.sandbox-badge\.webqq-model-request-provider\s*\{[^}]*border-color:\s*#c4b5fd[^}]*color:\s*#6d28d9[^}]*background:\s*#ede9fe/s)
    expect(styles).toMatch(/\.webqq-workspace\[data-color-mode="dark"\] \.sandbox-badge\.webqq-model-request-provider\s*\{[^}]*border-color:\s*#6d28d9[^}]*color:\s*#ddd6fe[^}]*background:\s*#4c1d95/s)
    expect(workspaceSource).toContain('createModelRequestLiveRefresh')
    expect(workspaceSource).toContain('hasPendingRequest')
    expect(workspaceSource).toContain('isEnabled: () => liveRefresh.value || hasPendingRequest.value')
    expect(workspaceSource).toMatch(/function refresh\([\s\S]*emit\('trajectory', \{ \.\.\.scope, recordId: selectedRecordId\.value, mode: currentTrajectoryMode\(\) \}\)/)
    expect(workspaceSource).toContain('createModelRequestEnterRefresh')
    expect(workspaceSource).toContain('onActivated')
    expect(workspaceSource).toContain('enterRefresh.schedule()')
    expect(workspaceSource).toContain("liveRefresh = ref(false)")
    expect(workspaceSource).toContain("clearStep === 1")
    expect(workspaceSource).toContain('确认清理')
    expect(workspaceSource).toContain("visibilitychange")
    expect(workspaceSource).toContain('navigator.clipboard?.writeText')
    expect(workspaceSource).toContain("document.execCommand('copy')")
    expect(workspaceSource).toContain('copyCurrentBody')
    expect(workspaceSource).toContain('downloadCurrentBody')
    expect(workspaceSource).toContain('<IconCopy')
    expect(workspaceSource).toContain('<IconDownload')
    expect(workspaceSource).not.toContain('展开长字符串')
    expect(workspaceSource).not.toContain('收起长字符串')
    expect(workspaceSource).toContain("bodyView = ref<'request' | 'response' | 'analysis'>('request')")
    expect(workspaceSource).toContain("responseView = ref<'content' | 'json'>('content')")
    expect(workspaceSource).toMatch(/role="tab"[\s\S]*请求[\s\S]*role="tab"[\s\S]*响应[\s\S]*role="tab"[\s\S]*分析/)
    expect(workspaceSource).toContain('bodyView === \'analysis\'')
    expect(workspaceSource).toContain('requestTrajectory')
    expect(workspaceSource).toContain('conversationTrajectory')
    expect(workspaceSource).toContain('mode="conversation"')
    expect(workspaceSource).toContain('mode="request"')
    expect(workspaceSource).toContain(':show-mode-switch="false"')
    expect(workspaceSource).toContain('正在采集响应体…')
    expect(workspaceSource).toContain('响应体采集失败')
    expect(workspaceSource).toContain('detail.responseBodyRaw')
    expect(workspaceSource).toContain('parseModelResponseBody')
    expect(workspaceSource).toContain('extractModelResponseContent')
    expect(workspaceSource).toContain('<ModelResponseContentPreview')
    expect(workspaceSource).toContain('内容预览')
    expect(workspaceSource).toContain('JSON 原文')
    expect(workspaceSource).toContain('<ModelRequestTrajectory')
    expect(workspaceSource).toContain("detailView = ref<'trajectory' | 'evidence'>('evidence')")
    expect(workspaceSource).toContain("detailView.value = 'evidence'")
    expect(workspaceSource).toContain("return detailView.value === 'trajectory' ? 'conversation' : 'request'")
    expect(trajectorySource).toContain('单请求')
    expect(trajectorySource).toContain('完整会话')
    expect(trajectorySource).toContain('showModeSwitch')
    expect(trajectorySource).not.toContain('上下文')
    expect(trajectorySource).not.toContain('contextMarkers')
    expect(trajectorySource).not.toContain('toolMarkers')
    expect(trajectorySource).toContain('请求体提示词内容占比')
    expect(trajectorySource).toContain('compositionTracks')
    expect(trajectorySource).toContain('conversationCompositionTracks')
    expect(trajectorySource).toContain('resolveConversationCompositionItems')
    expect(trajectorySource).toContain("['system', 'user', 'tool-definition']")
    expect(trajectorySource).toContain('promptComposition')
    expect(trajectorySource).toContain('当前会话没有可投影的请求组成')
    expect(trajectorySource).toContain("mode === 'request'")
    expect(trajectorySource).toContain("mode === 'conversation'")
    expect(trajectorySource).toContain('TTFT 与解码阶段')
    expect(trajectorySource).toContain('轨迹事件账本')
    expect(trajectorySource).toContain('打开原始请求')
    expect(trajectorySource).toMatch(/<header>[\s\S]*打开原始请求[\s\S]*<\/header>/)
    expect(trajectorySource).toContain("'open-request': [payload:")
    expect(trajectorySource).toContain(`emit('open-request', {
    recordId: request.id,
    kind: 'request',
    returnState: {
      rowId: row.id,
      scrollTop: ledgerElement.value?.scrollTop ?? 0,
    },
  })`)
    expect(trajectorySource).not.toContain('row.detail !== undefined')
    expect(trajectorySource).toContain("'inspect-request': [payload: { recordId: string }]")
    expect(trajectorySource).toContain('layout="inspector"')
    expect(trajectorySource).toContain('v-webqq-scrollbar="{ showOverlay: false }"')
    expect(trajectorySource).toContain(':focus-row="inspectorFocusRow"')
    expect(trajectorySource).toContain('正在加载分析…')
    expect(trajectorySource).not.toContain('selectedTree')
    expect(trajectorySource).not.toContain('webqq-model-trajectory-facts')
    expect(workspaceSource).toContain(':detail="detail"')
    expect(workspaceSource).toContain('@inspect-request="inspectRelatedRequest"')
    expect(workspaceSource).toContain('inspectRecordId && props.detail?.id === inspectRecordId')
    expect(workspaceSource).toMatch(/v-else-if="bodyView === 'analysis'"[\s\S]*@open-request="openRelatedRequest"/)
    expect(workspaceSource).toContain("detailView.value = 'evidence'")
    expect(workspaceSource).toContain("bodyView.value = 'request'")
    expect(workspaceSource).toContain("responseView.value = 'content'")
    expect(workspaceSource).toContain('canReturnToTrajectory.value = true')
    expect(workspaceSource).not.toContain("bodyView.value = pending.source === 'response' ? 'response' : 'request'")
    expect(workspaceSource).not.toContain(':highlight-path="requestHighlightPath"')
    expect(workspaceSource).not.toContain('highlight-action-label="返回"')
    expect(workspaceSource).toContain('detailView.value = state.detailView')
    expect(workspaceSource.match(/detailView\.value = state\.detailView/g)).toHaveLength(2)
    expect(workspaceSource).toContain('detailElement.value.scrollTop = state.detailScrollTop')
    expect(workspaceSource).toContain(':restore-state="trajectoryReturnState"')
    expect(trajectorySource).toContain('ledgerElement.value.scrollTop = state.scrollTop')
    expect(trajectorySource).toContain('selectedRowId.value = state.rowId')
    expect(workspaceSource).toContain("mode: 'request'")
    expect(jsonSource).toContain('highlightActionLabel')
    expect(jsonSource).toContain("$emit('highlight-action')")
    expect(jsonSource).toContain('scrollIntoView')
    expect(jsonSource).toContain('data-json-path')
    expect(styles).toContain('.webqq-model-request-json-node.is-highlighted')
    expect(responsePreviewSource).toContain('模型输出')
    expect(responsePreviewSource).toContain('思考内容')
    expect(responsePreviewSource).toContain('工具调用')
    expect(responsePreviewSource).toContain('结束原因')
    expect(workspaceSource).toContain(':strings-expanded="true"')
    expect(workspaceSource).toMatch(/:node="requestTree"[\s\S]*:images-preview="true"/)
    expect(workspaceSource).not.toMatch(/:node="headersTree"[\s\S]{0,180}:images-preview="true"/)
    expect(workspaceSource).not.toMatch(/:node="responseTree"[\s\S]{0,180}:images-preview="true"/)
    expect(workspaceSource).not.toContain('stringsExpanded')
    expect(workspaceSource).not.toContain('canExpandBodyStrings')
    expect(workspaceSource).toContain(':root="true"')
    expect(jsonSource).toContain('IconChevronDown')
    expect(jsonSource).toContain('IconChevronRight')
    expect(jsonSource).toContain("parentKind !== 'array'")
    expect(jsonSource).toContain('normalizeModelRequestJsonString')
    expect(jsonSource).toContain('imageSource')
    expect(jsonSource).toContain('webqq-model-request-json-image')
    expect(jsonSource).toContain('图片预览')
    expect(jsonSource).toContain('imageView')
    expect(jsonSource).toContain('image - {{ formatImageSize(imageSource.source) }}')
    expect(jsonSource).toContain('>raw<')
    expect(jsonSource).toContain('>image<')
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
    expect(styles).toMatch(/\.webqq-model-request-json-image\s*\{[^}]*max-width:\s*100%[^}]*max-height:\s*360px/s)
    expect(styles).toMatch(/\.webqq-model-request-json-image-preview\s*\{[^}]*display:\s*grid/s)
    expect(styles).toMatch(/\.webqq-model-request-json-image-summary\s*\{[^}]*font-style:\s*italic/s)
    expect(styles).toMatch(/\.webqq-model-request-json-image-mode\s*\{[^}]*text-decoration:\s*underline/s)
    expect(styles).toMatch(/\.webqq-model-request-response-raw\s*\{[^}]*overflow:\s*auto[^}]*white-space:\s*pre-wrap[^}]*user-select:\s*text/s)
    expect(styles).toMatch(/\.webqq-model-response-preview\s*\{[^}]*display:\s*grid[^}]*overflow:\s*auto/s)
    expect(styles).toMatch(/\.webqq-model-response-section\.is-content,\s*\n\s*\.webqq-model-response-section\.is-reasoning\s*\{[^}]*border-left-color:\s*var\(--webqq-role-assistant\)/s)
    expect(styles).toMatch(/\.webqq-model-response-section\.is-tools\s*\{[^}]*border-left-color:\s*var\(--webqq-role-tool-interaction\)/s)
    expect(styles).toMatch(/\.chatluna-sandbox-chat\.webqq-model-request-workspace\s*\{[^}]*grid-template-rows:\s*auto auto minmax\(0, 1fr\)/s)
    expect(styles).toMatch(/\.webqq-model-request-split\s*\{[^}]*grid-row:\s*3/s)
    expect(styles).toMatch(/\.webqq-model-request-list-pane\s*\{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\)/s)
    expect(styles).toMatch(/\.webqq-model-request-list-toolbar\s*\{[^}]*border-bottom:\s*1px solid var\(--webqq-border\)/s)
    expect(styles).not.toContain('.webqq-model-request-filters {')
    expect(styles).toMatch(/\.webqq-model-trajectory-ledger\.has-inspector\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(320px, 38%\)/s)
    expect(styles).toMatch(/\.webqq-model-analysis\.is-inspector \.webqq-model-analysis-main \{[^}]*display: block/s)
    expect(styles).toMatch(/\.webqq-model-analysis\.is-inspector \.webqq-model-analysis-content \{[^}]*max-height: none/s)
    expect(styles).toContain('--webqq-trajectory-request: #2f76c9')
    expect(styles).toContain('--webqq-trajectory-request: #4d8ed3')
    expect(styles).toMatch(/\.webqq-model-trajectory-row\s*\{[^}]*grid-template-columns:\s*122px minmax\(0, 1fr\)/s)
    expect(styles).toMatch(/\.webqq-model-trajectory-span\.is-request\s*\{[^}]*top:\s*10px/s)
    expect(styles).not.toContain('.webqq-model-trajectory-span.is-context')
    expect(styles).not.toContain('.webqq-model-trajectory-span.is-tools')
    expect(styles).toMatch(/\.webqq-model-trajectory-composition-bar\s*\{[^}]*position:\s*absolute/s)
    expect(styles).toMatch(/\.webqq-model-trajectory-composition-bar\.is-selected\s*\{[^}]*z-index:\s*1[^}]*0 0 0 1px var\(--webqq-trajectory-layer\)[^}]*0 0 0 2px var\(--webqq-accent\)/s)
    expect(styles).not.toMatch(/\.webqq-model-trajectory-composition-bar\.is-selected\s*\{[^}]*outline:/s)
    expect(trajectorySource).toContain('耗时')
    expect(trajectorySource).toContain('请求')
    expect(trajectorySource).toContain('工具')
    expect(trajectorySource).toContain('placeholder="搜索"')
    expect(trajectorySource).toContain('v-for="row in ledgerRows"')
    expect(trajectorySource).toContain("if (requestsCollapsed.value && row.kind !== 'request') return false")
    expect(trajectorySource).toContain("if (toolsCollapsed.value && row.kind === 'tool') return false")
    expect(styles).toMatch(/\.webqq-model-trajectory-controls\s*\{[^}]*min-height:\s*32px/s)
    expect(styles).not.toContain('cursor:')
  })

  it('按结构把轨迹片段定位到 OpenAI 与 Gemini 请求体节点', () => {
    const openAiUser = { role: 'user', content: '第二条用户消息' }
    const openAiBody = {
      model: 'gpt-4.1',
      messages: [
        { role: 'system', content: '系统提示' },
        { role: 'user', content: '第一条用户消息' },
        openAiUser,
      ],
    }
    expect(findModelRequestJsonPath(openAiBody, structuredClone(openAiUser))).toEqual(['messages', '2'])

    const geminiUser = { role: 'user', parts: [{ text: 'Gemini 用户消息' }] }
    const geminiBody = { contents: [{ role: 'model', parts: [{ text: '模型回复' }] }, geminiUser] }
    expect(findModelRequestJsonPath(geminiBody, structuredClone(geminiUser))).toEqual(['contents', '1'])
    expect(findModelRequestJsonPath(openAiBody, { role: 'user', content: '不存在' })).toBeUndefined()
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

  it('识别 Data URL、Anthropic 裸 Base64 和 b64_json 图片，并拒绝普通 Base64', () => {
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB'
    const dataUrl = `data:image/png;base64,${png}`
    const anthropic = { media_type: 'image/png', data: png }

    expect(parseModelRequestImageSource(dataUrl)).toEqual({
      source: dataUrl,
      mimeType: 'image/png',
    })
    expect(parseModelRequestImageSource(anthropic.data, 'data', anthropic)).toEqual({
      source: dataUrl,
      mimeType: 'image/png',
    })
    expect(parseModelRequestImageSource(png, 'b64_json', {})).toEqual({
      source: dataUrl,
      mimeType: 'image/png',
    })
    expect(parseModelRequestImageSource(png, 'data', {})).toBeUndefined()
    expect(parseModelRequestImageSource(png, 'image', { mime_type: 'text/plain' })).toBeUndefined()
    expect(parseModelRequestImageSource('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')).toBeUndefined()
    expect(parseModelRequestImageSource('data:text/html;base64,PGgxPng8L2gxPg==')).toBeUndefined()
    expect(parseModelRequestImageSource('https://example.com/image.png')).toBeUndefined()

    expect(buildModelRequestJsonTree({ image: anthropic }).children[0]?.children[1]).toMatchObject({
      imageSource: { source: dataUrl, mimeType: 'image/png' },
    })
  })

  it('将 JSON 与 SSE 原始响应派生为结构化预览', () => {
    expect(parseModelResponseBody('{"content":"你好"}', 'json')).toEqual({
      kind: 'json',
      value: { content: '你好' },
    })
    expect(extractModelResponseContent(parseModelResponseBody(JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'Gemini 回复' }] } }],
      usageMetadata: { promptTokenCount: 8 },
    }), 'json').value)).toMatchObject({
      content: ['Gemini 回复'],
      usage: { promptTokenCount: 8 },
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

  it('按数量级将耗时切换为 ms、s、min、h', () => {
    expect(formatDuration(0)).toBe('0 ms')
    expect(formatDuration(842)).toBe('842 ms')
    expect(formatDuration(1000)).toBe('1 s')
    expect(formatDuration(1240)).toBe('1.24 s')
    expect(formatDuration(12400)).toBe('12.4 s')
    expect(formatDuration(60_000)).toBe('1 min')
    expect(formatDuration(83_400)).toBe('1 min 23 s')
    expect(formatDuration(3_600_000)).toBe('1 h')
    expect(formatDuration(3_723_000)).toBe('1 h 2 min 3 s')
  })

  it('将 OpenAI、Anthropic 和 Gemini 用量统一为顶部统计', () => {
    expect(normalizeModelResponseUsage({
      prompt_tokens: 26512,
      completion_tokens: 705,
      total_tokens: 27217,
      prompt_tokens_details: { cached_tokens: 20607 },
      completion_tokens_details: { reasoning_tokens: 483 },
    })).toEqual({
      inputTokens: 26512,
      outputTokens: 222,
      reasoningTokens: 483,
      cachedTokens: 20607,
      totalTokens: 27217,
    })

    expect(normalizeModelResponseUsage({
      input_tokens: 100,
      output_tokens: 40,
      cache_read_input_tokens: 80,
      cache_creation_input_tokens: 20,
    })).toEqual({
      inputTokens: 200,
      outputTokens: 40,
      reasoningTokens: undefined,
      cachedTokens: 100,
      totalTokens: 240,
    })

    expect(normalizeModelResponseUsage({
      promptTokenCount: 1000,
      candidatesTokenCount: 200,
      thoughtsTokenCount: 50,
      cachedContentTokenCount: 700,
      totalTokenCount: 1250,
    })).toEqual({
      inputTokens: 1000,
      outputTokens: 200,
      reasoningTokens: 50,
      cachedTokens: 700,
      totalTokens: 1250,
    })

    expect(normalizeModelResponseUsage({
      promptTokenCount: 10664,
      candidatesTokenCount: 125,
      totalTokenCount: 11511,
      cachedContentTokenCount: 8051,
      thoughtsTokenCount: 722,
    })).toEqual({
      inputTokens: 10664,
      outputTokens: 125,
      reasoningTokens: 722,
      cachedTokens: 8051,
      totalTokens: 11511,
    })

    expect(normalizeModelResponseUsage({
      prompt_tokens: 14228,
      completion_tokens: 406,
      total_tokens: 14852,
      completion_tokens_details: { reasoning_tokens: 406 },
    })).toEqual({
      inputTokens: 14228,
      outputTokens: 218,
      reasoningTokens: 406,
      cachedTokens: undefined,
      totalTokens: 14852,
    })

    expect(normalizeModelResponseUsage({
      prompt_tokens: 100,
      completion_tokens: 40,
      total_tokens: 140,
      completion_tokens_details: { reasoning_tokens: 40 },
    })).toEqual({
      inputTokens: 100,
      outputTokens: 0,
      reasoningTokens: 40,
      cachedTokens: undefined,
      totalTokens: 140,
    })
  })

  it('合并流式 usage，避免后到的残缺片段把输出覆盖成 0', () => {
    const preview = extractModelResponseContent([
      {
        event: 'chunk',
        data: {
          choices: [{ delta: { content: '你好' } }],
          usage: {
            prompt_tokens: 14228,
            completion_tokens: 624,
            total_tokens: 14852,
            completion_tokens_details: { reasoning_tokens: 406 },
          },
        },
      },
      {
        event: 'chunk',
        data: {
          choices: [{ delta: { content: '' } }],
          usage: {
            prompt_tokens: 14228,
            completion_tokens: 406,
            total_tokens: 14852,
            completion_tokens_details: { reasoning_tokens: 406 },
          },
        },
      },
    ])
    expect(preview.content).toEqual(['你好'])
    expect(normalizeModelResponseUsage(preview.usage)).toEqual({
      inputTokens: 14228,
      outputTokens: 218,
      reasoningTokens: 406,
      cachedTokens: undefined,
      totalTokens: 14852,
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

  it('进入页面时把 onMounted 与 onActivated 合并为一次刷新', async () => {
    let refreshCount = 0
    const enter = createModelRequestEnterRefresh(() => {
      refreshCount += 1
    })

    enter.schedule()
    enter.schedule()
    expect(refreshCount).toBe(0)

    await Promise.resolve()
    expect(refreshCount).toBe(1)

    enter.schedule()
    await Promise.resolve()
    expect(refreshCount).toBe(2)
  })
})
