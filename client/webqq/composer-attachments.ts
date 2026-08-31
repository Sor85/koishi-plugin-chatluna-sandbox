import { ref, type Ref } from 'vue'
import type { SendMediaFileInput } from '../../src/types'

/**
 * 附件采集：选择文件与粘贴两条入口、文件名与扩展名的拆分、附件列表的增删清空、
 * 以及把文件读成 base64。
 *
 * 这几块此前全留在发送控件里，一条断言都没有。它们与草稿无关，与发送编排只有「发送时取文件
 * 列表」一条边。临时预览地址与文件读取带副作用，按最小结构接口注入（ADR 0075）：不注入
 * `File` 与 `FileReader`，因此「粘贴的是图片就当附件」「读取失败怎么办」都能不开界面驱动。
 */

/** 一个待发送文件需要被读到的那几项。浏览器的 `File` 天然满足。 */
export interface ComposerFileLike {
  readonly name: string
  readonly size: number
  readonly type: string
  readonly lastModified: number
}

export interface ComposerAttachment<TFile extends ComposerFileLike = ComposerFileLike> {
  readonly id: string
  readonly file: TFile
  /** 图片才有缩略图；其他文件走文件名胶囊。 */
  readonly previewUrl?: string
  readonly baseName: string
  readonly extension: string
}

/** 服务端 `MAX_MEDIA_SIZE` 硬校验 10 MB，前端预检避免白传一遍大文件后才报错。 */
export const MAX_COMPOSER_ATTACHMENT_SIZE = 10 * 1024 * 1024
const OVERSIZE_MESSAGE = '媒体大小不能超过 10 MB'
const UNREADABLE_MESSAGE = '无法读取媒体内容'

/**
 * 按最后一个点拆开文件名。
 *
 * 附件名很长时前半段省略、扩展名保留，因此必须按最后一个点拆；以点开头的名字整体是文件名，
 * 不是「空文件名 ＋ 扩展名」。
 */
export function splitComposerFileName(name: string): { baseName: string, extension: string } {
  const dotIndex = name.lastIndexOf('.')
  if (dotIndex <= 0) return { baseName: name, extension: '' }
  return { baseName: name.slice(0, dotIndex), extension: name.slice(dotIndex) }
}

/** data URL 的逗号之后才是内容。读不出前缀说明这不是一份可用的读数，不能把整段当成内容发出去。 */
export function extractComposerBase64(dataUrl: string): string {
  const separator = dataUrl.indexOf(',')
  if (separator < 0) throw new Error(UNREADABLE_MESSAGE)
  return dataUrl.slice(separator + 1)
}

export interface ComposerAttachmentAdapter<TFile extends ComposerFileLike = ComposerFileLike> {
  /** 为一个文件造临时预览地址。 */
  createObjectUrl(file: TFile): string
  /** 释放临时预览地址。漏掉会留下一份 blob 引用。 */
  revokeObjectUrl(url: string): void
  /** 把文件读成 data URL。真实宿主用 `FileReader`。 */
  readDataUrl(file: TFile): Promise<string>
}

export interface ComposerAttachmentAddResult {
  readonly added: number
  /** 有文件被跳过时的错误文案；没有则为空串。 */
  readonly error: string
}

export function createComposerAttachments<TFile extends ComposerFileLike = ComposerFileLike>(
  adapter: ComposerAttachmentAdapter<TFile>,
) {
  const attachments = ref<ComposerAttachment<TFile>[]>([]) as Ref<ComposerAttachment<TFile>[]>

  function add(files: Iterable<TFile>): ComposerAttachmentAddResult {
    let added = 0
    let error = ''
    for (const file of files) {
      if (file.size > MAX_COMPOSER_ATTACHMENT_SIZE) {
        error = OVERSIZE_MESSAGE
        continue
      }
      attachments.value.push({
        // 标识里带上加入时的序号：不带的话同一个文件加入两次会撞标识，移除一条会把两条一起移掉。
        id: `${file.name}:${file.size}:${file.lastModified}:${attachments.value.length}`,
        file,
        previewUrl: file.type.startsWith('image/') ? adapter.createObjectUrl(file) : undefined,
        ...splitComposerFileName(file.name),
      })
      added += 1
    }
    return { added, error }
  }

  /**
   * 粘贴入口。
   *
   * 剪贴板里没有文件时不吞这次粘贴：正文照常粘进输入框，而不是被当成附件。
   */
  function addFromPaste(files: Iterable<TFile>): ComposerAttachmentAddResult & { consumed: boolean } {
    const list = [...files]
    if (!list.length) return { added: 0, error: '', consumed: false }
    return { ...add(list), consumed: true }
  }

  function remove(id: string) {
    const target = attachments.value.find((attachment) => attachment.id === id)
    if (!target) return
    if (target.previewUrl) adapter.revokeObjectUrl(target.previewUrl)
    attachments.value = attachments.value.filter((attachment) => attachment.id !== id)
  }

  function clear() {
    for (const attachment of attachments.value) {
      if (attachment.previewUrl) adapter.revokeObjectUrl(attachment.previewUrl)
    }
    attachments.value = []
  }

  /** 发送时取媒体载荷。没有附件时不给载荷，而不是给一个空数组。 */
  async function readMedia(): Promise<SendMediaFileInput[] | undefined> {
    if (!attachments.value.length) return
    return Promise.all(attachments.value.map(async ({ file }) => ({
      fileName: file.name,
      mimeType: file.type,
      dataBase64: extractComposerBase64(await adapter.readDataUrl(file)),
    })))
  }

  return { attachments, add, addFromPaste, remove, clear, readMedia }
}

export type ComposerAttachments<TFile extends ComposerFileLike = ComposerFileLike> =
  ReturnType<typeof createComposerAttachments<TFile>>
