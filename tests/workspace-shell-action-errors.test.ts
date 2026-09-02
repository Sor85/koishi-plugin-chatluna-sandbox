import { ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { createFakeWorkspacePort } from '../client/workspace/fake-port'
import { createTestWorkspaceController } from './helpers/workspace-controller'
import { createWorkspaceLayout } from '../client/workspace/layout'
import { createWebqqWorkspaceShell } from '../client/workspace/shell'
import type { SandboxSnapshot, SandboxWorkspaceState } from '../src/types'

/**
 * 操作那一族共用一个全局错误位，唯一的消费方是发送控件上的外部错误字段。因此这里断言的是
 * 发送控件模型上那一个字段，以及「每次操作前先清掉上一次的错误」这条今天只体现在
 * 「大家都这么抄」上的规则。
 */
const conversationId = 'private:10001:20001'

function createSnapshot(withConversation: boolean): SandboxSnapshot {
  return {
    revision: 1,
    participants: [
      { kind: 'user', id: '10001', name: '测试用户1' },
      { kind: 'bot', id: '20001', name: 'Koishi', implementation: 'napcat', enabled: true },
    ],
    groups: [],
    conversations: withConversation
      ? [{ id: conversationId, type: 'direct', participantIds: ['10001', '20001'], messageIds: ['message-1'] }]
      : [],
    conversationInstances: [],
    messages: withConversation
      ? [{
          id: 'message-1',
          authorId: '10001',
          conversationId,
          content: '根会话消息',
          createdAt: '2026-08-29T02:00:00.000Z',
        }]
      : [],
    forwards: [],
    friendships: [{ id: 'friend:10001:20001', participantIds: ['10001', '20001'], remarks: {}, createdAt: '' }],
    requests: [],
  }
}

function createWorkspace(snapshot: SandboxSnapshot): SandboxWorkspaceState {
  return {
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
}

function createStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  }
}

async function createShell(withConversation = true) {
  const port = createFakeWorkspacePort(createWorkspace(createSnapshot(withConversation)))
  const controller = createTestWorkspaceController({ workspace: port }, createStorage())
  await controller.load()
  const warn = console.warn
  console.warn = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].includes('onMounted is called when there is no active component')) return
    warn(...args)
  }
  try {
    const shell = createWebqqWorkspaceShell(controller, createWorkspaceLayout(ref(true)), () => undefined)
    return { port, controller, shell }
  } finally {
    console.warn = warn
  }
}

type Shell = Awaited<ReturnType<typeof createShell>>['shell']

function externalError(shell: Shell) {
  return shell.chatPaneModel.value.composer.externalError ?? ''
}

function regionErrors(shell: Shell) {
  return [
    shell.debugWorkspaceModel.value.error,
    shell.testCallWorkspaceModel.value.error,
    shell.modelRequestWorkspaceModel.value.error,
    shell.presetWorkspaceModel.value.error,
  ]
}

describe('操作那一族的错误位', () => {
  it('操作失败的原因出现在发送控件上，不写进四个区域的错误位', async () => {
    const { port, shell } = await createShell()
    port.rejectNext('recallMessage', new Error('消息不存在：message-1'))

    await shell.recallMessage('message-1')

    expect(externalError(shell)).toBe('消息不存在：message-1')
    expect(regionErrors(shell)).toEqual(['', '', '', ''])
  })

  /**
   * 本族守的唯一一条不变量。漏掉这一步不会报错，用户会对着一条早已不成立的报错发愁，
   * 因此断言的是**调用途中**的值：清错误发生在第一个 await 之前，写在别处都会在这里变红。
   */
  it('每次操作前先清掉上一次的错误，且清在调用之前', async () => {
    const { port, shell } = await createShell()
    port.rejectNext('recallMessage', new Error('上一次的错误'))
    await shell.recallMessage('message-1')
    expect(externalError(shell)).toBe('上一次的错误')

    const running = shell.setMessageReaction('message-1', '76', true)
    expect(externalError(shell)).toBe('')
    await running

    expect(externalError(shell)).toBe('')
  })

  it('成功的操作把上一条过期错误清掉，包括读取合并转发那一处', async () => {
    const { port, shell } = await createShell()

    port.rejectNext('getForwardMessage', new Error('合并转发不存在'))
    await shell.getForwardMessage({ forwardId: 'forward-9' }, () => {}, () => {})
    expect(externalError(shell)).toBe('合并转发不存在')

    await shell.getForwardMessage({ forwardId: 'forward-1' }, () => {}, () => {})
    expect(externalError(shell)).toBe('')
  })

  /** 单错误位只有一个消费方，因此「后一次操作的错误覆盖前一次」是它今天的可观察语义。 */
  it('后一次操作的错误覆盖前一次，不叠加也不保留更早的那条', async () => {
    const { port, shell } = await createShell()

    port.rejectNext('performFriendAction', new Error('好友不存在'))
    await shell.performFriendAction({ action: 'delete', targetId: '10002' })
    expect(externalError(shell)).toBe('好友不存在')

    port.rejectNext('performGroupAction', new Error('群组不存在'))
    await shell.performGroupAction({ action: 'kick', groupId: '30001', targetId: '10002' })
    expect(externalError(shell)).toBe('群组不存在')
  })

  it('每个操作的失败都写进同一个错误位，并把失败继续交给调用方 reject', async () => {
    const { port, shell } = await createShell()
    const failures: Array<{ label: string, error: string, rejected: string | null }> = []
    const record = async (
      label: string,
      operation: Parameters<typeof port.rejectNext>[0],
      message: string,
      call: (reject: (error: unknown) => void) => Promise<unknown>,
    ) => {
      port.rejectNext(operation, new Error(message))
      let rejected: unknown
      await call((error) => { rejected = error }).catch((error) => { rejected = error })
      failures.push({ label, error: externalError(shell), rejected: (rejected as Error | undefined)?.message ?? null })
    }

    await record('创建会话实例', 'createConversationInstance', '会话不存在', () => shell.createConversationInstance('missing'))
    await record('分叉会话实例', 'branchConversationInstance', '分叉点不存在', () => shell.branchConversationInstance('message-1'))
    await record('重命名会话', 'renameConversationInstance', '会话名称不能为空', (reject) => shell.saveConversationRename({ conversationId: 'instance-1', title: ' ' }, () => {}, reject))
    await record('删除会话', 'deleteConversationInstance', '会话实例不存在', () => shell.deleteConversationInstance('instance-1'))
    await record('好友操作', 'performFriendAction', '好友不存在', () => shell.performFriendAction({ action: 'delete', targetId: '10002' }))
    await record('好友备注', 'performFriendAction', '备注过长', (reject) => shell.saveFriendRemark({ targetId: '10002', remark: 'x' }, () => {}, reject))
    await record('群组操作', 'performGroupAction', '群组不存在', () => shell.performGroupAction({ action: 'kick', groupId: '30001', targetId: '10002' }))
    await record('群名片保存', 'performGroupAction', '群名片过长', (reject) => shell.saveGroupAction({ mode: 'card', targetId: '10002', groupId: '30001', value: 'x' }, () => {}, reject))
    await record('撤回', 'recallMessage', '消息不存在', () => shell.recallMessage('message-1'))
    await record('清空会话记录', 'clearConversationMessages', '会话不存在', () => shell.clearConversationMessages())
    await record('贴表情', 'setMessageReaction', '消息不存在', () => shell.setMessageReaction('message-1', '76', true))
    await record('合并转发', 'sendForwardMessage', '转发目标不存在', (reject) => shell.sendForwardMessage({ conversationId }, () => {}, reject))
    await record('读取合并转发', 'getForwardMessage', '合并转发不存在', (reject) => shell.getForwardMessage({ forwardId: 'forward-9' }, () => {}, reject))
    await record('读取历史消息', 'getMessageHistory', '历史消息读取失败', (reject) => shell.loadEarlierMessages(() => {}, reject))
    await record('搜索会话消息', 'searchConversationMessages', '搜索失败', (reject) => shell.searchConversationMessages({ conversationId, query: 'x' }, () => {}, reject))

    expect(failures).toEqual([
      { label: '创建会话实例', error: '会话不存在', rejected: null },
      { label: '分叉会话实例', error: '分叉点不存在', rejected: null },
      { label: '重命名会话', error: '会话名称不能为空', rejected: '会话名称不能为空' },
      { label: '删除会话', error: '会话实例不存在', rejected: null },
      { label: '好友操作', error: '好友不存在', rejected: null },
      { label: '好友备注', error: '备注过长', rejected: '备注过长' },
      { label: '群组操作', error: '群组不存在', rejected: null },
      { label: '群名片保存', error: '群名片过长', rejected: '群名片过长' },
      { label: '撤回', error: '消息不存在', rejected: null },
      { label: '清空会话记录', error: '会话不存在', rejected: null },
      { label: '贴表情', error: '消息不存在', rejected: null },
      { label: '合并转发', error: '转发目标不存在', rejected: '转发目标不存在' },
      { label: '读取合并转发', error: '合并转发不存在', rejected: '合并转发不存在' },
      { label: '读取历史消息', error: '历史消息读取失败', rejected: '历史消息读取失败' },
      { label: '搜索会话消息', error: '搜索失败', rejected: '搜索失败' },
    ])
  })
})

describe('前置判定留在外壳', () => {
  /**
   * 「取当前会话标识、取不到就直接返回」这几处判定各不相同且都依赖外壳自己的状态，因此没有被
   * 吸收进错误位模块。少了它们，这些动作会在没有会话时照样发起一次注定失败的调用。
   */
  it('没有当前会话时四个动作一次调用都不发起，也不写错误位', async () => {
    const { port, shell } = await createShell(false)
    const before = port.calls.length

    await shell.branchConversationInstance('message-1')
    await shell.recallMessage('message-1')
    await shell.clearConversationMessages()
    await shell.setMessageReaction('message-1', '76', true)

    expect(port.calls.length).toBe(before)
    expect(externalError(shell)).toBe('')
  })

  it('预设有未保存修改时切换会话先问脏值守卫，不发起会话切换', async () => {
    const { shell } = await createShell()
    shell.selectNavigation('presets')
    shell.updatePresetDirty(true)

    shell.selectConversation(conversationId)

    expect(shell.currentView.value).toBe('presets')
    expect(shell.presetDiscardGuard.value.pending).toEqual({ action: 'leave', targetView: 'messages', conversationId })
  })
})
