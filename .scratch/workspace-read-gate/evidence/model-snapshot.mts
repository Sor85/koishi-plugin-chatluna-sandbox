import { writeFileSync } from 'node:fs'
import { ref } from 'vue'
import { createFakeWorkspacePort } from '../../../client/webqq/fake-workspace-port'
import { createWorkspaceController } from '../../../client/webqq/workspace-controller'
import { createWorkspaceLayout } from '../../../client/webqq/workspace-layout'
import { createWebqqWorkspaceShell } from '../../../client/webqq/workspace-shell'
import type { SandboxSnapshot, SandboxWorkspaceState } from '../../../src/types'

/**
 * 四个工作台模型 ＋ 发送控件模型的完整输出快照。
 *
 * 进行中与错误本来就是外壳 interface 上的字段，因此这一轮的纯结构性证明不必开浏览器：
 * 固定场景、固定操作序列、每步之后把五个模型整体序列化，收拢前后逐字节比对即可。
 *
 * 「调用途中」的采样点靠**先发起、不 await、立刻读模型**取得：置进行中与清错误都发生在第一个
 * await 之前，因此这一读一定落在调用途中，且与端口是否立即结算无关，可反复运行。
 */
const snapshot: SandboxSnapshot = {
  revision: 3,
  participants: [
    { kind: 'user', id: '10001', name: '测试用户1' },
    { kind: 'bot', id: '20001', name: 'Koishi', implementation: 'napcat', enabled: true },
  ],
  groups: [{
    id: '30001',
    name: '测试群',
    announcements: [],
    members: [
      { participantId: '10001', role: 'owner' },
      { participantId: '20001', role: 'admin' },
    ],
  }],
  conversations: [
    { id: 'private:10001:20001', type: 'direct', participantIds: ['10001', '20001'], messageIds: ['message-1'] },
    { id: 'group:30001', type: 'group', groupId: '30001', messageIds: [] },
  ],
  conversationInstances: [],
  messages: [{
    id: 'message-1',
    authorId: '10001',
    conversationId: 'private:10001:20001',
    content: '根会话消息',
    createdAt: '2026-08-29T02:00:00.000Z',
  }],
  forwards: [],
  friendships: [{ id: 'friend:10001:20001', participantIds: ['10001', '20001'], remarks: {}, createdAt: '' }],
  requests: [],
}

const workspace: SandboxWorkspaceState = {
  snapshot,
  chatLunaStates: [],
  persistence: { mode: 'memory', available: true, persisted: false },
  appearance: {
    enableSandboxFrostedGlass: true,
    sandboxTimBubbleTail: true,
    sandboxColorMode: 'auto',
    sandboxAccentColor: '#2563eb',
    sandboxMarkRecalledMessages: true,
  },
}

function createStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  }
}

const port = createFakeWorkspacePort(workspace)
const controller = createWorkspaceController(port, createStorage())
await controller.load()

const warn = console.warn
console.warn = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].includes('onMounted is called when there is no active component')) return
  warn(...args)
}
const shell = createWebqqWorkspaceShell(controller, createWorkspaceLayout(ref(true)), () => ({
  openEntity() {},
  openGroupAction() {},
  openRemark() {},
  openConversationRename() {},
  openProfile() {},
}))
console.warn = warn

const samples: Array<{ label: string, models: unknown }> = []

function sample(label: string) {
  samples.push({
    label,
    models: JSON.parse(JSON.stringify({
      debug: shell.debugWorkspaceModel.value,
      mcpCall: shell.mcpCallWorkspaceModel.value,
      modelRequest: shell.modelRequestWorkspaceModel.value,
      preset: shell.presetWorkspaceModel.value,
      composer: shell.chatPaneModel.value.composer,
    })),
  })
}

/** 发起一次读取但不等待它，先在调用途中采样，再等它结束后采样。 */
async function sampleAcross(label: string, start: () => Promise<unknown>) {
  const running = start().catch(() => undefined)
  sample(`${label} · 调用途中`)
  await running
  sample(`${label} · 调用结束`)
}

sample('初始')

// —— OneBot 调试记录区域 ——
await sampleAcross('调试记录列表读取', () => shell.loadOneBotDebugRecords())
port.rejectNext('getOneBotDebugRecords', new Error('调试记录读取失败：上游拒绝'))
await sampleAcross('调试记录列表读取失败', () => shell.loadOneBotDebugRecords())
await sampleAcross('调试记录列表重试', () => shell.loadOneBotDebugRecords())
await sampleAcross('调试记录详情读取失败', () => shell.loadOneBotDebugRecord({ recordId: 'missing' }))
port.rejectNext('clearOneBotDebugRecords', new Error('调试记录清理失败：上游拒绝'))
await sampleAcross('调试记录清理失败', () => shell.clearOneBotDebugRecords())

// —— MCP 调用记录区域 ——
await sampleAcross('MCP 调用列表读取', () => shell.loadMcpCallRecords())
port.rejectNext('getMcpCallRecords', new Error('MCP 调用读取失败：上游拒绝'))
await sampleAcross('MCP 调用列表读取失败', () => shell.loadMcpCallRecords())
await sampleAcross('MCP 调用详情读取失败', () => shell.loadMcpCallRecord({ recordId: 'missing' }))
port.rejectNext('clearMcpCallRecords', new Error('MCP 调用清理失败：上游拒绝'))
await sampleAcross('MCP 调用清理失败', () => shell.clearMcpCallRecords())

// —— 模型请求区域 ——
await sampleAcross('模型请求列表读取', () => shell.loadModelRequestRecords({ scope: 'main' }))
port.rejectNext('getModelRequestRecords', new Error('模型请求读取失败：上游拒绝'))
await sampleAcross('模型请求列表读取失败', () => shell.loadModelRequestRecords({ scope: 'main' }))
await sampleAcross('模型请求追加读取', () => shell.loadMoreModelRequestRecords({ scope: 'main' }))
await sampleAcross('模型请求详情读取失败', () => shell.loadModelRequestRecord({ scope: 'main', recordId: 'missing' }))
await sampleAcross('模型请求轨迹读取', () => shell.loadModelRequestTrajectory({ scope: 'main', recordId: 'record-1', mode: 'request' }))
port.rejectNext('clearModelRequestRecords', new Error('模型请求清理失败：上游拒绝'))
await sampleAcross('模型请求清理失败', () => shell.clearModelRequestRecords({ scope: 'main' }))
shell.reportEvidenceNavigationFailure('证据导航失败：目标记录不在轨迹里')
sample('证据导航失败直接报到模型请求错误位')

// —— 预设区域 ——
await sampleAcross('预设目录读取', () => shell.loadPresetCatalog())
port.rejectNext('getPresetCatalog', new Error('预设目录读取失败：上游拒绝'))
await sampleAcross('预设目录读取失败', () => shell.loadPresetCatalog())
await sampleAcross('预设读取失败', () => shell.readPreset({ kind: 'core', fileName: 'missing.yml' }))
port.rejectNext('savePreset', new Error('预设保存失败：上游拒绝'))
await sampleAcross('预设保存失败', () => shell.savePreset({ kind: 'core', fileName: 'a.yml', source: 'x', expectedRevision: 'r' }))
await sampleAcross('预设保存成功', () => shell.savePreset({ kind: 'core', fileName: 'a.yml', source: 'x', expectedRevision: 'r' }))
port.rejectNext('locatePresetExpression', new Error('定位失败：上游拒绝'))
await sampleAcross('预设表达式定位失败', () => shell.locatePresetExpression({
  document: { kind: 'core' as const, fileName: 'a.yml', revision: 'r' },
  expression: { stableId: 'expression-1' },
  scope: { scope: 'main' as const },
}))

// —— 操作那一族：共用一个全局错误位，只有发送控件消费 ——
port.rejectNext('createConversationInstance', new Error('会话不存在：private:10002:20001'))
await sampleAcross('新建会话实例失败', () => shell.createConversationInstance('private:10002:20001'))
port.rejectNext('performFriendAction', new Error('好友不存在'))
await sampleAcross('好友操作失败', () => shell.performFriendAction({ action: 'delete', targetId: '10002' }))
port.rejectNext('performGroupAction', new Error('群组不存在'))
await sampleAcross('群组操作覆盖前一条错误', () => shell.performGroupAction({ action: 'kick', groupId: '30001', targetId: '10002' }))
port.rejectNext('recallMessage', new Error('消息不存在：message-9'))
await sampleAcross('撤回失败', () => shell.recallMessage('message-9'))
port.rejectNext('setMessageReaction', new Error('消息不存在：message-9'))
await sampleAcross('贴表情失败', () => shell.setMessageReaction('message-9', '76', true))
port.rejectNext('clearConversationMessages', new Error('会话不存在'))
await sampleAcross('清空会话记录失败', () => shell.clearConversationMessages())
port.rejectNext('sendForwardMessage', new Error('转发目标不存在'))
await sampleAcross('合并转发失败', () => shell.sendForwardMessage({ conversationId: 'group:30001' }, () => {}, () => {}))
port.rejectNext('getForwardMessage', new Error('合并转发不存在'))
await sampleAcross('读取合并转发失败', () => shell.getForwardMessage({ forwardId: 'forward-9' }, () => {}, () => {}))
await sampleAcross('读取合并转发成功', () => shell.getForwardMessage({ forwardId: 'forward-1' }, () => {}, () => {}))
port.rejectNext('renameConversationInstance', new Error('会话名称不能为空'))
await sampleAcross('重命名会话失败', () => shell.saveConversationRename({ conversationId: 'instance-1', title: ' ' }, () => {}, () => {}))
port.rejectNext('deleteConversationInstance', new Error('会话实例不存在：instance-1'))
await sampleAcross('删除会话失败', () => shell.deleteConversationInstance('instance-1'))
port.rejectNext('getMessageHistory', new Error('历史消息读取失败'))
await sampleAcross('读取历史消息失败', () => shell.loadEarlierMessages(() => {}, () => {}))
port.rejectNext('searchConversationMessages', new Error('搜索失败'))
await sampleAcross('搜索会话消息失败', () => shell.searchConversationMessages({ conversationId: 'private:10001:20001', keyword: 'x' }, () => {}, () => {}))
await sampleAcross('搜索会话消息成功', () => shell.searchConversationMessages({ conversationId: 'private:10001:20001', keyword: 'x' }, () => {}, () => {}))

const [output] = process.argv.slice(2)
if (!output) throw new Error('用法：tsx model-snapshot.ts <输出路径>')
writeFileSync(output, `${JSON.stringify({ samples }, null, 2)}\n`)
console.log(`采样点 ${samples.length} 个 → ${output}`)
