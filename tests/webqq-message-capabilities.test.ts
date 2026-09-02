import { ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { createFakeWorkspacePort } from '../client/workspace/fake-port'
import { createTestWorkspaceController } from './helpers/workspace-controller'
import { createWorkspaceLayout } from '../client/workspace/layout'
import { createWebqqWorkspaceShell } from '../client/workspace/shell'
import type { MessageCapabilities } from '../src/message-capabilities'
import type { SandboxMessage, SandboxSnapshot, SandboxWorkspaceState } from '../src/types'

const GROUP_CONVERSATION = 'group:30001'
const BRANCH = 'instance-1'

function message(id: string, authorId: string, conversationId: string, extra: Partial<SandboxMessage> = {}): SandboxMessage {
  return {
    id,
    authorId,
    conversationId,
    content: id,
    createdAt: '2026-08-30T02:00:00.000Z',
    ...extra,
  } as SandboxMessage
}

/**
 * 一个群会话加一条从它分叉出来的分支。分支行的 `messageIds` 是物化后的拼接结果、且不带
 * `forkPoint`——那正是快照投影的形状，客户端不会再沿来源链拼第二次。
 */
function createSnapshot(): SandboxSnapshot {
  return {
    revision: 7,
    participants: [
      { kind: 'user', id: '10001', name: '群主' },
      { kind: 'user', id: '10002', name: '管理员' },
      { kind: 'user', id: '10003', name: '普通成员' },
      { kind: 'bot', id: '20001', name: 'Koishi', implementation: 'napcat', enabled: true },
    ],
    groups: [{
      id: '30001',
      name: '测试群',
      announcements: [],
      members: [
        { participantId: '10001', role: 'owner' },
        { participantId: '10002', role: 'admin' },
        { participantId: '10003', role: 'member' },
        { participantId: '20001', role: 'admin' },
      ],
    }],
    conversations: [
      { id: GROUP_CONVERSATION, type: 'group', groupId: '30001', messageIds: ['own', 'others', 'recalled', 'poke'] },
    ],
    conversationInstances: [
      { id: BRANCH, rootConversationId: GROUP_CONVERSATION, title: '换一种问法', messageIds: ['own', 'branch-own'] },
    ],
    messages: [
      message('own', '10001', GROUP_CONVERSATION),
      message('others', '10003', GROUP_CONVERSATION),
      message('recalled', '10001', GROUP_CONVERSATION, {
        lifecycle: { status: 'recalled', operatorId: '10001', recalledAt: '2026-08-30T02:01:00.000Z' },
      }),
      message('poke', '10001', GROUP_CONVERSATION, { event: { type: 'poke', targetId: '10003' } }),
      message('branch-own', '10001', BRANCH),
    ],
    forwards: [],
    friendships: [],
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

async function createShell(snapshot: SandboxSnapshot) {
  const controller = createTestWorkspaceController({ workspace: createFakeWorkspacePort(createWorkspace(snapshot)) }, createStorage())
  await controller.load()
  // 外壳在 setup 里注册 onMounted 做首屏加载；测试直接调用工厂时该钩子是空操作，
  // Vue 会为此打一条 warn。这里只吞掉这一条预期噪声，其余告警照常输出。
  const warn = console.warn
  console.warn = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].includes('onMounted is called when there is no active component')) return
    warn(...args)
  }
  try {
    const shell = createWebqqWorkspaceShell(
      controller,
      createWorkspaceLayout(ref(true)),
      () => ({
        openEntity() {},
        openGroupAction() {},
        openRemark() {},
        openConversationRename() {},
        openProfile() {},
      }),
    )
    return { controller, shell }
  } finally {
    console.warn = warn
  }
}

/** 投影里某条消息的能力位。没有这条消息时报 undefined，而不是静默读成一组假的位。 */
function capabilitiesOf(
  capabilities: Record<string, MessageCapabilities>,
  messageId: string,
): MessageCapabilities | undefined {
  return capabilities[messageId]
}

describe('消息能力位投影', () => {
  it('messageList 为当前会话的每条消息给出五项能力位', async () => {
    const { controller, shell } = await createShell(createSnapshot())
    await controller.selectOperator('10001')
    controller.selectConversation(GROUP_CONVERSATION)

    const { messageCapabilities, messages } = shell.chatPaneModel.value.messageList
    // 只覆盖当前会话读得到的那些消息，分支自有的那条不在其中。
    expect(Object.keys(messageCapabilities).sort()).toEqual(messages.map(({ id }) => id).sort())
    expect(messageCapabilities['branch-own']).toBeUndefined()
    // 群主自己的普通消息：五项全开。
    expect(capabilitiesOf(messageCapabilities, 'own'))
      .toEqual({ recall: true, react: true, reply: true, branch: true, forward: true })
    // 戳一戳事件是系统提示，五项一条都做不到。
    expect(capabilitiesOf(messageCapabilities, 'poke'))
      .toEqual({ recall: false, react: false, reply: false, branch: false, forward: false })
    // 已撤回消息不可回复、不可再贴表情、不可多选。
    expect(capabilitiesOf(messageCapabilities, 'recalled'))
      .toEqual({ recall: false, react: false, reply: false, branch: true, forward: false })
  })

  it('继承前缀的能力位与分支自有消息不同：只读那两项关掉，引用与分叉仍在', async () => {
    const { controller, shell } = await createShell(createSnapshot())
    await controller.selectOperator('10001')
    controller.selectConversation(BRANCH)

    const { messageCapabilities } = shell.chatPaneModel.value.messageList
    expect(capabilitiesOf(messageCapabilities, 'own'))
      .toEqual({ recall: false, react: false, reply: true, branch: true, forward: true })
    expect(capabilitiesOf(messageCapabilities, 'branch-own'))
      .toEqual({ recall: true, react: true, reply: true, branch: true, forward: true })

    // 同一条消息回到它自己的会话里照旧可撤可贴：只读约束的是分支视图里的入口。
    controller.selectConversation(GROUP_CONVERSATION)
    expect(capabilitiesOf(shell.chatPaneModel.value.messageList.messageCapabilities, 'own'))
      .toMatchObject({ recall: true, react: true })
  })

  it('切换当前操作者后能力位随群角色变化', async () => {
    const { controller, shell } = await createShell(createSnapshot())
    const askRecall = async (operatorId: string) => {
      await controller.selectOperator(operatorId)
      controller.selectConversation(GROUP_CONVERSATION)
      const { messageCapabilities } = shell.chatPaneModel.value.messageList
      return [
        capabilitiesOf(messageCapabilities, 'own')?.recall,
        capabilitiesOf(messageCapabilities, 'others')?.recall,
      ]
    }

    // 群主可撤自己的与成员的。
    expect(await askRecall('10001')).toEqual([true, true])
    // 管理员可撤成员的，但撤不了群主那条。
    expect(await askRecall('10002')).toEqual([false, true])
    // 普通成员只能撤自己那条，也就是这里的 others。
    expect(await askRecall('10003')).toEqual([false, true])
    // 同级管理员之间也撤不动：机器人与 10002 都是管理员。
    expect(await askRecall('20001')).toEqual([false, true])
  })

  it('群角色只影响撤回位，其余四项不随操作者摆动', async () => {
    const { controller, shell } = await createShell(createSnapshot())
    const askOwn = async (operatorId: string) => {
      await controller.selectOperator(operatorId)
      controller.selectConversation(GROUP_CONVERSATION)
      return capabilitiesOf(shell.chatPaneModel.value.messageList.messageCapabilities, 'own')
    }

    // 群主自己的那条：换成管理员来看只有 recall 翻面，贴表情、回复、分叉、多选都还在——
    // 「谁能撤谁」是角色阶梯的事，其余四项与角色无关。
    expect(await askOwn('10001')).toEqual({ recall: true, react: true, reply: true, branch: true, forward: true })
    expect(await askOwn('10002')).toEqual({ recall: false, react: true, reply: true, branch: true, forward: true })
  })
})
