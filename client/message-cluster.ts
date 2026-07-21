import type { SandboxMessage } from '../src/types'

type ChatStyle = 'tim' | 'qq'

export function isImageOnlyMessage(message: SandboxMessage | undefined) {
  const media = message?.media
  return !!message
    && media?.length === 1
    && media[0].type === 'image'
    && message.content === `[图片] ${media[0].name}`
}

function getDirection(message: SandboxMessage | undefined, currentUserId: string | undefined) {
  if (!message) return
  return message.authorId === currentUserId ? 'outgoing' : 'incoming'
}

function isSameClusterSender(
  left: SandboxMessage | undefined,
  right: SandboxMessage | undefined,
  currentUserId: string | undefined,
) {
  return !!left
    && !!right
    && left.authorId === right.authorId
    && getDirection(left, currentUserId) === getDirection(right, currentUserId)
}

function getClusterBubbleMessage(
  messages: SandboxMessage[],
  index: number,
  step: 1 | -1,
  currentUserId: string | undefined,
) {
  const message = messages[index]
  if (!message) return
  for (let cursor = index + step; cursor >= 0 && cursor < messages.length; cursor += step) {
    const candidate = messages[cursor]
    if (!isSameClusterSender(message, candidate, currentUserId)) return
    if (!isImageOnlyMessage(candidate)) return candidate
  }
}

export function isMergedMessage(
  messages: SandboxMessage[],
  index: number,
  chatStyle: ChatStyle,
  currentUserId: string | undefined,
) {
  return chatStyle === 'tim'
    && isSameClusterSender(messages[index - 1], messages[index], currentUserId)
}

export function getMessageClusterClass(
  messages: SandboxMessage[],
  index: number,
  chatStyle: ChatStyle,
  currentUserId: string | undefined,
) {
  if (chatStyle !== 'tim' || !messages[index]) return ''
  const hasPrevious = !!getClusterBubbleMessage(messages, index, -1, currentUserId)
  const hasNext = !!getClusterBubbleMessage(messages, index, 1, currentUserId)
  if (hasPrevious && hasNext) return 'is-cluster-middle'
  if (hasNext) return 'is-cluster-first'
  if (hasPrevious) return 'is-cluster-last'
  return ''
}
