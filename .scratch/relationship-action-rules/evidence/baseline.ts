/**
 * 关系操作在两条通道上的确定性基线。
 *
 * 只驱动两条**真实通道**——控制服务的 `performGroupAction`／`performFriendAction`（用户通道）与
 * 虚拟 OneBot 机器人自身的 action（机器人通道）——两者在本轮收拢前后都存在，因此同一份脚本既能
 * 跑 HEAD 也能跑工作区，输出可以逐字节比对。
 *
 * 每个用例记录：执行前后完整场景快照的摘要、两份快照之间逐叶子的差异、这次操作派发出去的全部
 * 事件（标准 Koishi 事件与沙盒挂在会话上的原始 OneBot 载荷各一份，按派发顺序）、返回值或错误文案。
 * 摘要覆盖整份快照，因此任何一处场景差异都会让它变；差异清单只是让「变了什么」可读。
 *
 * 标识与时间按首次出现顺序归一化，时钟用单调假时钟固定：禁言到期时间、事件时间戳与派发顺序因此
 * 也参与比对，一次调用顺序的改变会立刻表现为数字不同。
 *
 * 用法：npx tsx .scratch/relationship-action-rules/evidence/baseline.ts <输出文件>
 *
 * 输出写文件而不是 stdout：拒绝分支会让 Koishi 的 logger 往 stdout 打一批 action 失败日志，
 * 那是本轮要比对的事实之一（拒绝真的发生了），但混进 JSON 里就没法解析了。
 */
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { App } from '@koishijs/core'
import { SandboxControlService } from '../../../src/control-service'
import type { SandboxGroupMember } from '../../../src/types'

const BASE_TIME = Date.UTC(2026, 0, 1, 0, 0, 0)
let tick = 0
const RealDate = Date
class MonotonicDate extends RealDate {
  constructor(...args: unknown[]) {
    if (args.length === 0) super(BASE_TIME + tick++ * 1000)
    else super(...(args as [never]))
  }

  static now(): number {
    return BASE_TIME + tick++ * 1000
  }
}
globalThis.Date = MonotonicDate as unknown as DateConstructor

/** 每次操作派发出去的一个事件：标准事件名、会话本体与原始 OneBot 载荷。 */
interface CapturedEvent {
  name: string
  session: unknown
  onebot: unknown
}

interface CaseRecord {
  label: string
  /** 执行前后完整场景快照的摘要，归一化之后求；任何一处场景差异都会让它变。 */
  sceneDigest: { before: string, after: string }
  /** 两份快照之间逐叶子的差异，路径 → [执行前, 执行后]。 */
  sceneChanges: Record<string, [unknown, unknown]>
  events: CapturedEvent[]
  result?: unknown
  error?: string
}

/** 群通知与请求事件在 Koishi 侧的标准事件名，加上被测插件仍在监听的原始 notice。 */
const EVENT_NAMES = [
  'notice',
  'friend-request',
  'guild-request',
  'guild-added',
  'guild-removed',
  'guild-updated',
  'guild-member-added',
  'guild-member-removed',
  'guild-member-updated',
  'message-deleted',
] as const

function reserve(tokens: Map<string, string>, raw: string, prefix: string): string {
  const existing = tokens.get(raw)
  if (existing) return existing
  const token = `<${prefix}-${[...tokens.values()].filter((value) => value.startsWith(`<${prefix}-`)).length + 1}>`
  tokens.set(raw, token)
  return token
}

/**
 * 归一化随机标识，保留它们的相等关系。
 *
 * 头像单独处理：内置头像按未占用集合随机挑选，池子用完后还会重复，因此引用值本身在两次运行之间
 * 既不稳定也不能靠出现顺序配对。头像与关系规则无关，只保留「有没有头像」这一位。
 */
function normalize(value: unknown, tokens: Map<string, string>): unknown {
  if (typeof value === 'string') {
    let text = value
    for (const [raw, token] of tokens) text = text.split(raw).join(token)
    return text
  }
  if (Array.isArray(value)) return value.map((item) => normalize(item, tokens))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => [key, key === 'avatar' && typeof item === 'string' ? '<avatar>' : normalize(item, tokens)]))
  }
  return value
}

const TITLE_TOO_LONG = '头'.repeat(65)

/** 逐叶子求两份快照的差异；数组按下标比对，长度不同的部分按下标报出增减。 */
function diffValues(before: unknown, after: unknown, path: string, into: Record<string, [unknown, unknown]>): void {
  if (before === after) return
  const bothArrays = Array.isArray(before) && Array.isArray(after)
  const bothRecords = !bothArrays
    && !!before && !!after
    && typeof before === 'object' && typeof after === 'object'
  if (bothArrays) {
    const length = Math.max(before.length, after.length)
    for (let index = 0; index < length; index += 1) diffValues(before[index], after[index], `${path}[${index}]`, into)
    return
  }
  if (bothRecords) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)])
    for (const key of keys) {
      diffValues(
        (before as Record<string, unknown>)[key],
        (after as Record<string, unknown>)[key],
        path ? `${path}.${key}` : key,
        into,
      )
    }
    return
  }
  if (JSON.stringify(before ?? null) === JSON.stringify(after ?? null)) return
  into[path] = [before ?? null, after ?? null]
}

async function main() {
  const app = new App()
  let capturing: CapturedEvent[] = []
  let control: SandboxControlService | undefined
  app.plugin((ctx) => {
    control = new SandboxControlService(ctx)
    for (const name of EVENT_NAMES) {
      ;(ctx.on as unknown as (event: string, listener: (session: unknown) => void) => void)(name, (session) => {
        const value = session as { toJSON?: () => unknown }
        capturing.push({
          name,
          session: JSON.parse(JSON.stringify(value.toJSON?.() ?? value)),
          onebot: JSON.parse(JSON.stringify(Reflect.get(session as object, 'onebot') ?? null)),
        })
      })
    }
  })
  await app.start()
  if (!control) throw new Error('沙盒控制服务未注册')
  const sandbox = control
  interface RawCase {
    label: string
    before: unknown
    after: unknown
    events: CapturedEvent[]
    result?: unknown
    error?: string
  }
  const rawCases: RawCase[] = []
  const requestIds: string[] = []

  /** 每个用例围着一次操作取前后快照；准备工作（建群、建申请）在窗口之外。 */
  async function runCase(label: string, action: () => Promise<unknown>): Promise<void> {
    const before = sandbox.getSnapshot()
    capturing = []
    const record: RawCase = { label, before, after: before, events: [] }
    try {
      record.result = (await action()) ?? null
    } catch (error) {
      record.error = error instanceof Error ? error.message : String(error)
    }
    // 复制而不是交出引用：窗口关闭之后的准备工作还会往同一个数组里追加事件。
    record.events = [...capturing]
    record.after = sandbox.getSnapshot()
    rawCases.push(record)
  }

  let nextGroupId = 40001
  function createGroup(members: SandboxGroupMember[]): string {
    const id = String(nextGroupId++)
    sandbox.createGroup({ id, name: `基线群 ${id}`, members })
    return id
  }

  /** 造一条入群申请并记下它的标识。 */
  async function requestJoin(operatorId: string, groupId: string): Promise<string> {
    const result = await sandbox.performGroupAction({ action: 'request-join', operatorId, groupId })
    if (!result.requestId) throw new Error(`入群申请未创建：${groupId}`)
    requestIds.push(result.requestId)
    return result.requestId
  }

  async function requestFriend(operatorId: string, targetId: string): Promise<string> {
    const result = await sandbox.performFriendAction({ action: 'request', operatorId, targetId, comment: '基线申请' })
    if (!result.requestId) throw new Error(`好友申请未创建：${targetId}`)
    requestIds.push(result.requestId)
    return result.requestId
  }

  async function inviteToGroup(operatorId: string, groupId: string, targetId: string): Promise<string> {
    const result = await sandbox.performGroupAction({ action: 'invite', operatorId, groupId, targetId })
    if (!result.requestId) throw new Error(`群邀请未创建：${targetId}`)
    requestIds.push(result.requestId)
    return result.requestId
  }

  sandbox.createBot({ id: '20002', name: '第二个机器人', implementation: 'llbot', enabled: true })
  for (const [id, name] of [['10004', '基线用户4'], ['10005', '基线用户5'], ['10006', '基线用户6'], ['10007', '基线用户7']]) {
    sandbox.createUser({ id: id!, name: name! })
  }
  const koishi = sandbox.getRuntimeBot('20001')
  const second = sandbox.getRuntimeBot('20002')

  // ── 用户通道：八个群动作，含全部拒绝分支 ────────────────────────────────
  const userGroup = () => createGroup([
    { participantId: '10001', card: '群主', role: 'owner' },
    { participantId: '10002', card: '管理员', role: 'admin' },
    { participantId: '10003', card: '成员', role: 'member' },
    { participantId: '20001', card: 'Koishi', role: 'admin' },
    { participantId: '20002', card: '第二个机器人', role: 'member' },
  ])

  const leaveGroupId = userGroup()
  await runCase('用户通道 退群 拒绝：群主', () => sandbox.performGroupAction({ action: 'leave', operatorId: '10001', groupId: leaveGroupId }))
  await runCase('用户通道 退群 成员', () => sandbox.performGroupAction({ action: 'leave', operatorId: '10003', groupId: leaveGroupId }))
  await runCase('用户通道 退群 机器人成员', () => sandbox.performGroupAction({ action: 'leave', operatorId: '20002', groupId: leaveGroupId }))

  const nameGroupId = userGroup()
  await runCase('用户通道 改群名 拒绝：普通成员', () => sandbox.performGroupAction({ action: 'set-name', operatorId: '10003', groupId: nameGroupId, name: '成员改名' }))
  await runCase('用户通道 改群名 拒绝：空名', () => sandbox.performGroupAction({ action: 'set-name', operatorId: '10002', groupId: nameGroupId, name: '   ' }))
  await runCase('用户通道 改群名 管理员', () => sandbox.performGroupAction({ action: 'set-name', operatorId: '10002', groupId: nameGroupId, name: '  改过的群名  ' }))

  const cardGroupId = userGroup()
  await runCase('用户通道 改群名片 自己', () => sandbox.performGroupAction({ action: 'set-card', operatorId: '10003', groupId: cardGroupId, targetId: '10003', card: ' 我的新名片 ' }))
  await runCase('用户通道 改群名片 清空自己', () => sandbox.performGroupAction({ action: 'set-card', operatorId: '10003', groupId: cardGroupId, targetId: '10003', card: '  ' }))
  await runCase('用户通道 改群名片 管理员改他人', () => sandbox.performGroupAction({ action: 'set-card', operatorId: '10002', groupId: cardGroupId, targetId: '10003', card: '管理员设置' }))
  await runCase('用户通道 改群名片 拒绝：普通成员改他人', () => sandbox.performGroupAction({ action: 'set-card', operatorId: '10003', groupId: cardGroupId, targetId: '10002', card: '越权' }))
  await runCase('用户通道 改群名片 拒绝：管理员改管理员', () => sandbox.performGroupAction({ action: 'set-card', operatorId: '10002', groupId: cardGroupId, targetId: '20001', card: '越权' }))
  await runCase('用户通道 改群名片 拒绝：管理员改群主', () => sandbox.performGroupAction({ action: 'set-card', operatorId: '10002', groupId: cardGroupId, targetId: '10001', card: '越权' }))

  const adminGroupId = userGroup()
  await runCase('用户通道 设管理员 拒绝：非群主', () => sandbox.performGroupAction({ action: 'set-admin', operatorId: '10002', groupId: adminGroupId, targetId: '10003', enabled: true }))
  await runCase('用户通道 设管理员 拒绝：目标是群主', () => sandbox.performGroupAction({ action: 'set-admin', operatorId: '10001', groupId: adminGroupId, targetId: '10001', enabled: true }))
  await runCase('用户通道 设管理员 授予', () => sandbox.performGroupAction({ action: 'set-admin', operatorId: '10001', groupId: adminGroupId, targetId: '10003', enabled: true }))
  await runCase('用户通道 设管理员 撤销', () => sandbox.performGroupAction({ action: 'set-admin', operatorId: '10001', groupId: adminGroupId, targetId: '10003', enabled: false }))

  const titleGroupId = userGroup()
  await runCase('用户通道 设专属头衔 拒绝：非群主', () => sandbox.performGroupAction({ action: 'set-title', operatorId: '10002', groupId: titleGroupId, targetId: '10003', title: '头衔' }))
  await runCase('用户通道 设专属头衔 拒绝：超长', () => sandbox.performGroupAction({ action: 'set-title', operatorId: '10001', groupId: titleGroupId, targetId: '10003', title: TITLE_TOO_LONG }))
  await runCase('用户通道 设专属头衔 群主授予', () => sandbox.performGroupAction({ action: 'set-title', operatorId: '10001', groupId: titleGroupId, targetId: '10003', title: ' 元老 ' }))
  await runCase('用户通道 设专属头衔 清除', () => sandbox.performGroupAction({ action: 'set-title', operatorId: '10001', groupId: titleGroupId, targetId: '10003', title: '' }))
  await runCase('用户通道 设专属头衔 群主给自己', () => sandbox.performGroupAction({ action: 'set-title', operatorId: '10001', groupId: titleGroupId, targetId: '10001', title: '创群者' }))

  const kickGroupId = userGroup()
  await runCase('用户通道 踢人 拒绝：普通成员', () => sandbox.performGroupAction({ action: 'kick', operatorId: '10003', groupId: kickGroupId, targetId: '10002' }))
  await runCase('用户通道 踢人 拒绝：管理员踢群主', () => sandbox.performGroupAction({ action: 'kick', operatorId: '10002', groupId: kickGroupId, targetId: '10001' }))
  await runCase('用户通道 踢人 拒绝：管理员踢管理员', () => sandbox.performGroupAction({ action: 'kick', operatorId: '10002', groupId: kickGroupId, targetId: '20001' }))
  await runCase('用户通道 踢人 拒绝：管理员踢自己', () => sandbox.performGroupAction({ action: 'kick', operatorId: '10002', groupId: kickGroupId, targetId: '10002' }))
  await runCase('用户通道 踢人 拒绝：不在群里', () => sandbox.performGroupAction({ action: 'kick', operatorId: '10001', groupId: kickGroupId, targetId: '10007' }))
  await runCase('用户通道 踢人 管理员踢成员', () => sandbox.performGroupAction({ action: 'kick', operatorId: '10002', groupId: kickGroupId, targetId: '10003' }))
  await runCase('用户通道 踢人 群主踢机器人', () => sandbox.performGroupAction({ action: 'kick', operatorId: '10001', groupId: kickGroupId, targetId: '20002' }))

  const transferGroupId = userGroup()
  await runCase('用户通道 转让群主 拒绝：非群主', () => sandbox.performGroupAction({ action: 'transfer-owner', operatorId: '10002', groupId: transferGroupId, targetId: '10003' }))
  await runCase('用户通道 转让群主 拒绝：给自己', () => sandbox.performGroupAction({ action: 'transfer-owner', operatorId: '10001', groupId: transferGroupId, targetId: '10001' }))
  await runCase('用户通道 转让群主 给机器人', () => sandbox.performGroupAction({ action: 'transfer-owner', operatorId: '10001', groupId: transferGroupId, targetId: '20001' }))
  await runCase('用户通道 群内戳一戳', () => sandbox.performGroupAction({ action: 'poke', operatorId: '10003', groupId: transferGroupId, targetId: '10001' }))

  // ── 机器人通道：同样八个动作加禁言，经自身 OneBot action ────────────────
  const botOwnerGroup = () => createGroup([
    { participantId: '20001', card: 'Koishi', role: 'owner' },
    { participantId: '10001', card: '管理员', role: 'admin' },
    { participantId: '10003', card: '成员', role: 'member' },
    { participantId: '20002', card: '第二个机器人', role: 'member' },
  ])
  const botMemberGroup = () => createGroup([
    { participantId: '10001', card: '群主', role: 'owner' },
    { participantId: '10002', card: '管理员', role: 'admin' },
    { participantId: '20001', card: 'Koishi', role: 'member' },
    { participantId: '10003', card: '成员', role: 'member' },
  ])

  const botLeaveGroupId = botOwnerGroup()
  await runCase('机器人通道 退群 拒绝：群主', () => koishi.internal._request('set_group_leave', { group_id: Number(botLeaveGroupId) }))
  const botMemberLeaveId = botMemberGroup()
  await runCase('机器人通道 退群 成员', () => koishi.internal._request('set_group_leave', { group_id: Number(botMemberLeaveId) }))

  const botNameGroupId = botMemberGroup()
  await runCase('机器人通道 改群名 拒绝：普通成员', () => koishi.internal._request('set_group_name', { group_id: Number(botNameGroupId), group_name: '机器人改名' }))
  const botNameOwnerId = botOwnerGroup()
  await runCase('机器人通道 改群名 拒绝：空名', () => koishi.internal._request('set_group_name', { group_id: Number(botNameOwnerId), group_name: '  ' }))
  await runCase('机器人通道 改群名 群主', () => koishi.internal._request('set_group_name', { group_id: Number(botNameOwnerId), group_name: '  机器人改过的群名  ' }))

  const botCardGroupId = botOwnerGroup()
  await runCase('机器人通道 改群名片 自己', () => koishi.internal._request('set_group_card', { group_id: Number(botCardGroupId), user_id: 20001, card: ' 机器人自己 ' }))
  await runCase('机器人通道 改群名片 他人', () => koishi.internal._request('set_group_card', { group_id: Number(botCardGroupId), user_id: 10003, card: '机器人设置' }))
  const botCardMemberId = botMemberGroup()
  await runCase('机器人通道 改群名片 拒绝：普通成员改他人', () => koishi.internal._request('set_group_card', { group_id: Number(botCardMemberId), user_id: 10003, card: '越权' }))

  const botAdminGroupId = botOwnerGroup()
  await runCase('机器人通道 设管理员 拒绝：目标是群主', () => koishi.internal._request('set_group_admin', { group_id: Number(botAdminGroupId), user_id: 20001, enable: true }))
  await runCase('机器人通道 设管理员 授予', () => koishi.internal._request('set_group_admin', { group_id: Number(botAdminGroupId), user_id: 10003, enable: true }))
  await runCase('机器人通道 设管理员 撤销', () => koishi.internal._request('set_group_admin', { group_id: Number(botAdminGroupId), user_id: 10003, enable: false }))
  const botAdminMemberId = botMemberGroup()
  await runCase('机器人通道 设管理员 拒绝：非群主', () => koishi.internal._request('set_group_admin', { group_id: Number(botAdminMemberId), user_id: 10003, enable: true }))

  const botTitleGroupId = botOwnerGroup()
  await runCase('机器人通道 设专属头衔 拒绝：超长', () => koishi.internal._request('set_group_special_title', { group_id: Number(botTitleGroupId), user_id: 10003, special_title: TITLE_TOO_LONG }))
  await runCase('机器人通道 设专属头衔 群主授予', () => koishi.internal._request('set_group_special_title', { group_id: Number(botTitleGroupId), user_id: 10003, special_title: ' 荣誉成员 ' }))
  await runCase('机器人通道 设专属头衔 清除', () => koishi.internal._request('set_group_special_title', { group_id: Number(botTitleGroupId), user_id: 10003, special_title: '' }))
  const botTitleMemberId = botMemberGroup()
  await runCase('机器人通道 设专属头衔 拒绝：非群主', () => koishi.internal._request('set_group_special_title', { group_id: Number(botTitleMemberId), user_id: 10003, special_title: '头衔' }))

  const botBanGroupId = botOwnerGroup()
  await runCase('机器人通道 禁言 拒绝：负数时长', () => koishi.internal._request('set_group_ban', { group_id: Number(botBanGroupId), user_id: 10003, duration: -1 }))
  await runCase('机器人通道 禁言 拒绝：超过上限', () => koishi.internal._request('set_group_ban', { group_id: Number(botBanGroupId), user_id: 10003, duration: 30 * 24 * 60 * 60 + 1 }))
  await runCase('机器人通道 禁言 群主禁管理员', () => koishi.internal._request('set_group_ban', { group_id: Number(botBanGroupId), user_id: 10001, duration: 600 }))
  await runCase('机器人通道 禁言 成员', () => koishi.internal._request('set_group_ban', { group_id: Number(botBanGroupId), user_id: 10003, duration: 600 }))
  await runCase('机器人通道 解除禁言', () => koishi.internal._request('set_group_ban', { group_id: Number(botBanGroupId), user_id: 10003, duration: 0 }))
  const botBanMemberId = botMemberGroup()
  await runCase('机器人通道 禁言 拒绝：普通成员', () => koishi.internal._request('set_group_ban', { group_id: Number(botBanMemberId), user_id: 10003, duration: 600 }))

  const botKickGroupId = botOwnerGroup()
  await runCase('机器人通道 踢人 群主踢管理员', () => koishi.internal._request('set_group_kick', { group_id: Number(botKickGroupId), user_id: 10001 }))
  await runCase('机器人通道 踢人 成员', () => koishi.internal._request('set_group_kick', { group_id: Number(botKickGroupId), user_id: 10003 }))
  await runCase('机器人通道 踢人 另一个机器人', () => koishi.internal._request('set_group_kick', { group_id: Number(botKickGroupId), user_id: 20002 }))
  const botKickMemberId = botMemberGroup()
  await runCase('机器人通道 踢人 拒绝：普通成员', () => koishi.internal._request('set_group_kick', { group_id: Number(botKickMemberId), user_id: 10003 }))

  const botTransferGroupId = botOwnerGroup()
  await runCase('机器人通道 转让群主 拒绝：给自己', () => koishi.setGuildMemberRole(botTransferGroupId, '20001', 'owner'))
  await runCase('机器人通道 转让群主 给用户', () => koishi.setGuildMemberRole(botTransferGroupId, '10001', 'owner'))
  const botTransferMemberId = botMemberGroup()
  await runCase('机器人通道 转让群主 拒绝：非群主', () => koishi.setGuildMemberRole(botTransferMemberId, '10003', 'owner'))

  // ── 好友申请审批：两条通道 ──────────────────────────────────────────────
  const approvedFriend = await requestFriend('10004', '10005')
  await runCase('用户通道 好友申请 拒绝：不是发给自己', () => sandbox.performFriendAction({ action: 'handle-request', operatorId: '10006', requestId: approvedFriend, approve: true }))
  await runCase('用户通道 好友申请 批准', () => sandbox.performFriendAction({ action: 'handle-request', operatorId: '10005', requestId: approvedFriend, approve: true }))
  const rejectedFriend = await requestFriend('10004', '10006')
  await runCase('用户通道 好友申请 拒绝审批', () => sandbox.performFriendAction({ action: 'handle-request', operatorId: '10006', requestId: rejectedFriend, approve: false }))
  await runCase('用户通道 好友申请 拒绝：申请不存在', () => sandbox.performFriendAction({ action: 'handle-request', operatorId: '10006', requestId: 'request:friend:missing', approve: true }))

  const botFriendRequest = await (async () => {
    // 新建用户与已有机器人默认互为好友，先解除关系才能造出一条发给机器人的申请。
    await sandbox.performFriendAction({ action: 'delete', operatorId: '10004', targetId: '20001' })
    return requestFriend('10004', '20001')
  })()
  await runCase('用户通道 好友申请 拒绝：机器人申请必须由机器人处理', () => sandbox.performFriendAction({ action: 'handle-request', operatorId: '10004', requestId: botFriendRequest, approve: true }))
  await runCase('机器人通道 好友申请 批准并设置备注', () => koishi.internal.set_friend_add_request({ flag: botFriendRequest, approve: true, remark: ' 基线备注 ' }))
  const botFriendRejected = await (async () => {
    await sandbox.performFriendAction({ action: 'delete', operatorId: '10005', targetId: '20001' })
    return requestFriend('10005', '20001')
  })()
  await runCase('机器人通道 好友申请 拒绝审批', () => koishi.internal.set_friend_add_request({ flag: botFriendRejected, approve: false }))
  await runCase('机器人通道 好友申请 拒绝：申请不存在', () => koishi.internal.set_friend_add_request({ flag: 'request:friend:missing', approve: true }))
  const otherBotFriendRequest = await (async () => {
    await sandbox.performFriendAction({ action: 'delete', operatorId: '10006', targetId: '20002' })
    return requestFriend('10006', '20002')
  })()
  await runCase('机器人通道 好友申请 拒绝：不是发给自己', () => koishi.internal.set_friend_add_request({ flag: otherBotFriendRequest, approve: true }))

  // ── 入群申请审批：两条通道 ──────────────────────────────────────────────
  const joinGroupId = createGroup([
    { participantId: '10001', card: '群主', role: 'owner' },
    { participantId: '10003', card: '成员', role: 'member' },
    { participantId: '20001', card: 'Koishi', role: 'admin' },
  ])
  const approvedJoin = await requestJoin('10004', joinGroupId)
  await runCase('用户通道 入群申请 拒绝：普通成员审批', () => sandbox.performGroupAction({ action: 'handle-request', operatorId: '10003', requestId: approvedJoin, approve: true }))
  await runCase('用户通道 入群申请 群主批准', () => sandbox.performGroupAction({ action: 'handle-request', operatorId: '10001', requestId: approvedJoin, approve: true }))
  const rejectedJoin = await requestJoin('10005', joinGroupId)
  await runCase('用户通道 入群申请 群主拒绝', () => sandbox.performGroupAction({ action: 'handle-request', operatorId: '10001', requestId: rejectedJoin, approve: false }))
  const friendEntryJoin = await requestJoin('10006', joinGroupId)
  await runCase('用户通道 入群申请 经好友操作入口批准', () => sandbox.performFriendAction({ action: 'handle-request', operatorId: '10001', requestId: friendEntryJoin, approve: true }))

  const botJoinGroupId = createGroup([
    { participantId: '10001', card: '群主', role: 'owner' },
    { participantId: '20001', card: 'Koishi', role: 'admin' },
  ])
  const botApprovedJoin = await requestJoin('10004', botJoinGroupId)
  await runCase('机器人通道 入群申请 管理员机器人批准', () => koishi.internal.set_group_add_request({ flag: botApprovedJoin, sub_type: 'add', approve: true }))
  const botRejectedJoin = await requestJoin('10005', botJoinGroupId)
  await runCase('机器人通道 入群申请 拒绝审批', () => koishi.internal.set_group_add_request({ flag: botRejectedJoin, sub_type: 'add', approve: false }))
  const botWrongSubType = await requestJoin('10006', botJoinGroupId)
  await runCase('机器人通道 入群申请 拒绝：子类型传错', () => koishi.internal.set_group_add_request({ flag: botWrongSubType, sub_type: 'invite', approve: true }))

  const botMemberJoinGroupId = createGroup([
    { participantId: '10001', card: '群主', role: 'owner' },
    { participantId: '20001', card: 'Koishi', role: 'member' },
  ])
  const memberBotJoin = await requestJoin('10007', botMemberJoinGroupId)
  await runCase('机器人通道 入群申请 拒绝：机器人不是管理员', () => koishi.internal.set_group_add_request({ flag: memberBotJoin, sub_type: 'add', approve: true }))

  // ── 群邀请审批：两条通道 ────────────────────────────────────────────────
  const inviteGroupId = createGroup([
    { participantId: '10001', card: '群主', role: 'owner' },
    { participantId: '10002', card: '管理员', role: 'admin' },
    { participantId: '20001', card: 'Koishi', role: 'admin' },
  ])
  const userInvite = await inviteToGroup('10002', inviteGroupId, '10005')
  await runCase('用户通道 群邀请 拒绝：不是发给自己', () => sandbox.performGroupAction({ action: 'handle-request', operatorId: '10001', requestId: userInvite, approve: true }))
  await runCase('用户通道 群邀请 受邀人批准', () => sandbox.performGroupAction({ action: 'handle-request', operatorId: '10005', requestId: userInvite, approve: true }))
  const rejectedInvite = await inviteToGroup('10002', inviteGroupId, '10006')
  await runCase('用户通道 群邀请 受邀人拒绝', () => sandbox.performGroupAction({ action: 'handle-request', operatorId: '10006', requestId: rejectedInvite, approve: false }))

  const botInvite = await inviteToGroup('10002', inviteGroupId, '20002')
  await runCase('用户通道 群邀请 拒绝：机器人邀请必须由机器人处理', () => sandbox.performGroupAction({ action: 'handle-request', operatorId: '10002', requestId: botInvite, approve: true }))
  await runCase('机器人通道 群邀请 受邀机器人批准', () => second.internal.set_group_add_request({ flag: botInvite, sub_type: 'invite', approve: true }))
  const otherBotInvite = await inviteToGroup('10002', inviteGroupId, '10007')
  await runCase('机器人通道 群邀请 拒绝：不是发给自己', () => koishi.internal.set_group_add_request({ flag: otherBotInvite, sub_type: 'invite', approve: true }))

  // ── 只有用户通道有的动作 ────────────────────────────────────────────────
  await runCase('用户通道 私聊戳一戳', () => sandbox.performFriendAction({ action: 'poke', operatorId: '10004', targetId: '10005' }))
  await runCase('用户通道 设置好友备注', () => sandbox.performFriendAction({ action: 'set-remark', operatorId: '10004', targetId: '10005', remark: '基线好友' }))
  await runCase('用户通道 删除好友', () => sandbox.performFriendAction({ action: 'delete', operatorId: '10004', targetId: '10005' }))

  const tokens = new Map<string, string>()
  const snapshot = sandbox.getSnapshot()
  for (const requestId of requestIds) reserve(tokens, requestId, 'request')
  for (const message of snapshot.messages) reserve(tokens, message.id, 'message')
  for (const delivery of sandbox.getBotDeliveries()) reserve(tokens, delivery.id, 'delivery')

  const output = process.argv[2]
  if (!output) throw new Error('缺少输出文件路径')
  const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
  const cases: CaseRecord[] = rawCases.map(({ label, before, after, events, result, error }) => {
    const normalizedBefore = normalize(before, tokens)
    const normalizedAfter = normalize(after, tokens)
    const sceneChanges: Record<string, [unknown, unknown]> = {}
    diffValues(normalizedBefore, normalizedAfter, '', sceneChanges)
    return {
      label,
      sceneDigest: { before: digest(normalizedBefore), after: digest(normalizedAfter) },
      sceneChanges,
      events: normalize(events, tokens) as CapturedEvent[],
      ...(result === undefined ? {} : { result: normalize(result, tokens) }),
      ...(error === undefined ? {} : { error: normalize(error, tokens) as string }),
    }
  })
  writeFileSync(output, `${JSON.stringify({ cases, finalSnapshot: normalize(snapshot, tokens) }, null, 2)}\n`)
  await app.stop()
}

void main()
