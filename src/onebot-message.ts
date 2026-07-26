import { h } from 'koishi'
import type { SandboxMedia } from './types'

export interface SandboxOneBotMessageSegment {
  type: string
  data: Record<string, string>
}

export function toOneBotMessageSegments(content: string, media?: SandboxMedia[]): SandboxOneBotMessageSegment[] {
  if (media?.length) {
    const segments: SandboxOneBotMessageSegment[] = media.map((item) => ({
      type: item.type === 'audio' ? 'record' : item.type,
      data: { file: item.reference, url: item.reference, name: item.name },
    }))
    const generatedLabel = media.length === 1 ? `[${getMediaLabel(media[0])}] ${media[0].name}` : ''
    if (content && content !== generatedLabel) segments.push({ type: 'text', data: { text: content } })
    return segments
  }
  return h.parse(content).flatMap(toOneBotElementSegments)
}

export function toOneBotRawMessage(segments: SandboxOneBotMessageSegment[]): string {
  return segments.map(({ type, data }) => {
    if (type === 'text') return data.text ?? ''
    const attributes = Object.entries(data).map(([key, value]) => `${key}=${value}`).join(',')
    return `[CQ:${type}${attributes ? `,${attributes}` : ''}]`
  }).join('')
}

function toOneBotElementSegments(element: ReturnType<typeof h>): SandboxOneBotMessageSegment[] {
  if (element.type === 'text') return [{ type: 'text', data: { text: String(element.attrs.content ?? '') } }]
  if (element.type === 'br') return [{ type: 'text', data: { text: '\n' } }]
  if (element.type === 'img' || element.type === 'image') {
    const source = readAttribute(element.attrs, 'src', 'url', 'file')
    return source ? [{ type: 'image', data: { file: source, url: source } }] : []
  }
  if (element.type === 'audio' || element.type === 'record') {
    const source = readAttribute(element.attrs, 'src', 'url', 'file')
    return source ? [{ type: 'record', data: { file: source, url: source } }] : []
  }
  if (element.type === 'video' || element.type === 'file') {
    const source = readAttribute(element.attrs, 'src', 'url', 'file')
    if (!source) return []
    const name = readAttribute(element.attrs, 'title', 'name')
    return [{ type: element.type, data: { file: source, url: source, ...(name ? { name } : {}) } }]
  }
  if (element.type === 'at') {
    const id = readAttribute(element.attrs, 'id')
    return id ? [{ type: 'at', data: { qq: id } }] : []
  }
  if (element.type === 'quote') {
    const id = readAttribute(element.attrs, 'id')
    return id ? [{ type: 'reply', data: { id } }] : []
  }
  if (element.children.length) return element.children.flatMap(toOneBotElementSegments)
  return [{ type: 'text', data: { text: element.toString() } }]
}

function readAttribute(attributes: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = attributes[key]
    if (typeof value === 'string' && value) return value
  }
  return ''
}

function getMediaLabel(media: SandboxMedia): string {
  return media.type === 'image' ? '图片' : media.type === 'audio' ? '语音' : media.type === 'video' ? '视频' : '文件'
}
