import type { SandboxMessage } from '../../src/types'

export function isImageOnlyMessage(message: SandboxMessage | undefined) {
  const media = message?.media
  return !!message
    && media?.length === 1
    && media[0].type === 'image'
    && message.content === `[图片] ${media[0].name}`
}

function getDirection(message: SandboxMessage | undefined, currentOperatorId: string | undefined) {
  if (!message) return
  return message.authorId === currentOperatorId ? 'outgoing' : 'incoming'
}

function isSameClusterSender(
  left: SandboxMessage | undefined,
  right: SandboxMessage | undefined,
  currentOperatorId: string | undefined,
) {
  return !!left
    && !!right
    && !left.event
    && !right.event
    // 撤回只改变呈现状态，不改变发送者连续性；继续合并可避免同一发送者重复头像。
    && left.authorId === right.authorId
    && getDirection(left, currentOperatorId) === getDirection(right, currentOperatorId)
}

function getClusterBubbleMessage(
  messages: SandboxMessage[],
  index: number,
  step: 1 | -1,
  currentOperatorId: string | undefined,
) {
  const message = messages[index]
  if (!message) return
  for (let cursor = index + step; cursor >= 0 && cursor < messages.length; cursor += step) {
    const candidate = messages[cursor]
    if (!isSameClusterSender(message, candidate, currentOperatorId)) return
    if (!isImageOnlyMessage(candidate)) return candidate
  }
}

export function isMergedMessage(
  messages: SandboxMessage[],
  index: number,
  currentOperatorId: string | undefined,
) {
  return isSameClusterSender(messages[index - 1], messages[index], currentOperatorId)
}

export function getMessageClusterClass(
  messages: SandboxMessage[],
  index: number,
  currentOperatorId: string | undefined,
) {
  if (!messages[index]) return ''
  const hasPrevious = !!getClusterBubbleMessage(messages, index, -1, currentOperatorId)
  const hasNext = !!getClusterBubbleMessage(messages, index, 1, currentOperatorId)
  if (hasPrevious && hasNext) return 'is-cluster-middle'
  if (hasNext) return 'is-cluster-first'
  if (hasPrevious) return 'is-cluster-last'
  return ''
}
