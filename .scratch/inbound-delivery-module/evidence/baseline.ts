/**
 * 三条发送路径上「被测插件收到的事件」的确定性基线。
 *
 * 只驱动控制服务的公开发送入口与 Koishi 的 `message` 事件——两者在本轮收拢前后都存在，
 * 因此同一份脚本既能跑 HEAD 也能跑工作区，输出可以逐字节比对。投递的产物就是那个事件，
 * 因此这里导出的是会话字段与 OneBot 载荷的完整 JSON，外加投递记录与事件方向的调试记录。
 *
 * 标识与时间按首次出现顺序归一化，时钟用单调假时钟固定：耗时与时间戳因此也参与比对，
 * 一次调用顺序的改变会立刻表现为数字不同。
 *
 * 用法：npx tsx .scratch/inbound-delivery-module/evidence/baseline.ts
 */
import { App } from '@koishijs/core'
import { SandboxControlService } from '../../../src/control-service'
import { getOneBotMessageSequence } from '../../../src/onebot-profiles'

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

/** 1×1 PNG，固定正文，保证 Data URL 与文件哈希在两次运行之间一致。 */
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=='

/** 归一化不稳定的标识与时间，保留它们的相等关系。 */
function normalize(value: unknown, tokens: Map<string, string>, numbers: Map<number, string>): unknown {
  if (typeof value === 'number') return numbers.get(value) ?? value
  if (typeof value === 'string') {
    let text = value
    for (const [raw, token] of tokens) text = text.split(raw).join(token)
    // 调试记录把正文脱敏成字符数，而 raw message 里的 OneBot 消息序号是随机消息标识的哈希，
    // 十进制位数随之浮动。计数本身不是本轮要比对的事实——正文在 captured 里已经逐字对过。
    return text.replace(/^\[文本已省略，\d+ 字符\]$/, '[文本已省略，<字符数> 字符]')
  }
  if (Array.isArray(value)) return value.map((item) => normalize(item, tokens, numbers))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => [key, normalize(item, tokens, numbers)]))
  }
  return value
}

function reserve(tokens: Map<string, string>, raw: string, prefix: string): string {
  const existing = tokens.get(raw)
  if (existing) return existing
  const token = `<${prefix}-${[...tokens.values()].filter((value) => value.startsWith(`<${prefix}-`)).length + 1}>`
  tokens.set(raw, token)
  return token
}

interface CapturedEvent {
  event: unknown
  onebot: unknown
}

async function main() {
  const app = new App()
  const captured: CapturedEvent[] = []
  let control: SandboxControlService | undefined
  app.plugin((ctx) => {
    control = new SandboxControlService(ctx)
    // 被测插件看到的就是这个 session：完整事件加上沙盒挂在它上面的原始 OneBot 载荷。
    ctx.on('message', (session) => {
      captured.push({
        event: JSON.parse(JSON.stringify(session.toJSON())),
        onebot: JSON.parse(JSON.stringify(Reflect.get(session, 'onebot') ?? null)),
      })
    })
  })
  await app.start()
  if (!control) throw new Error('沙盒控制服务未注册')

  const first = await control.sendMessage({
    operatorId: '10001',
    conversationId: 'private:10001:20001',
    content: '基线私聊文本',
  })
  const replied = await control.sendMessage({
    operatorId: '10001',
    conversationId: 'private:10001:20001',
    content: '基线私聊引用回复',
    replyToMessageId: first.messageId,
  })
  const grouped = await control.sendMessage({
    operatorId: '10001',
    conversationId: 'group:30001',
    content: '基线群文本 [CQ:at,qq=20001]',
  })
  const media = await control.sendMediaMessage({
    operatorId: '10001',
    conversationId: 'group:30001',
    media: [{ fileName: '基线图片.png', mimeType: 'image/png', dataBase64: PNG_BASE64 }],
    content: '基线群图片说明',
    replyToMessageId: grouped.messageId,
  })
  const mediaOnly = await control.sendMediaMessage({
    operatorId: '10001',
    conversationId: 'private:10001:20001',
    media: [
      { fileName: '基线语音.ogg', mimeType: 'audio/ogg', dataBase64: Buffer.from('基线语音正文').toString('base64') },
      { fileName: '基线附件.pdf', mimeType: 'application/pdf', dataBase64: Buffer.from('基线附件正文').toString('base64') },
    ],
  })
  const forward = control.startForwardMessage({
    operatorId: '10001',
    conversationId: 'private:10001:20001',
    nodes: [
      { type: 'reference', messageId: first.messageId },
      { type: 'custom', userId: '10002', nickname: '测试用户2', content: '基线转发自定义节点' },
    ],
  })
  await forward.delivery

  const deliveries = control.getBotDeliveries()
  const debugRecords = await control.getOneBotDebugStore().getRecords({ limit: 100, order: 'asc' })
  const output = {
    captured,
    deliveries,
    debugEvents: debugRecords.records.filter(({ direction }) => direction === 'event'),
    snapshotMessages: control.getSnapshot().messages,
  }

  const tokens = new Map<string, string>()
  const numbers = new Map<number, string>()
  const snapshot = control.getSnapshot()
  const messageIds = [first.messageId, replied.messageId, grouped.messageId, media.messageId, mediaOnly.messageId, forward.result.messageId]
  for (const messageId of messageIds) {
    const token = reserve(tokens, messageId, 'message')
    // OneBot 消息序号由消息标识哈希而来，同样随机；数字与它的十进制字符串都要归一化。
    const sequence = getOneBotMessageSequence(messageId)
    numbers.set(sequence, token.replace('message', 'sequence'))
    tokens.set(String(sequence), token.replace('message', 'sequence'))
  }
  reserve(tokens, forward.result.forwardId, 'forward')
  for (const message of snapshot.messages) {
    for (const item of message.media ?? []) reserve(tokens, item.id, 'media')
  }
  // 内置头像按未占用集合随机挑选，引用因此每次不同。
  for (const reference of [...snapshot.participants.map(({ avatar }) => avatar), ...snapshot.groups.map(({ avatar }) => avatar)]) {
    if (reference) reserve(tokens, reference, 'avatar')
  }
  for (const delivery of deliveries) reserve(tokens, delivery.id, 'delivery')
  for (const record of debugRecords.records) reserve(tokens, record.id, 'debug')

  process.stdout.write(`${JSON.stringify(normalize(output, tokens, numbers), null, 2)}\n`)
  await app.stop()
}

void main()
