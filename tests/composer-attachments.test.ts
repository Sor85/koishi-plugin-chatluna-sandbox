import { describe, expect, it } from 'vitest'
import {
  createComposerAttachments,
  extractComposerBase64,
  MAX_COMPOSER_ATTACHMENT_SIZE,
  splitComposerFileName,
  type ComposerAttachmentAdapter,
  type ComposerFileLike,
} from '../client/webqq/composer-attachments'

function file(name: string, overrides: Partial<ComposerFileLike> = {}): ComposerFileLike {
  return { name, size: 1024, type: 'text/plain', lastModified: 1_700_000_000_000, ...overrides }
}

function image(name = 'shot.png'): ComposerFileLike {
  return file(name, { type: 'image/png' })
}

/** 造假宿主：临时预览地址与文件读取都按注入取得，因此粘贴图片与读取失败都能不开界面驱动。 */
function createFakeHost(dataUrls: Record<string, string | Error> = {}) {
  const created: string[] = []
  const revoked: string[] = []
  let serial = 0

  const adapter: ComposerAttachmentAdapter = {
    createObjectUrl: (target) => {
      serial += 1
      const url = `blob:${target.name}#${serial}`
      created.push(url)
      return url
    },
    revokeObjectUrl: (url) => revoked.push(url),
    readDataUrl: async (target) => {
      const result = dataUrls[target.name]
      if (result instanceof Error) throw result
      return result ?? `data:${target.type};base64,${target.name}-payload`
    },
  }

  return { adapter, created, revoked }
}

describe('WebQQ 发送控件附件采集', () => {
  describe('文件名与扩展名拆分', () => {
    it('按最后一个点拆开', () => {
      expect(splitComposerFileName('report.pdf')).toEqual({ baseName: 'report', extension: '.pdf' })
    })

    /** 附件名很长时前半段省略、扩展名保留，因此拆分必须按最后一个点而不是第一个。 */
    it('名字里有多个点时只认最后一个', () => {
      expect(splitComposerFileName('2026.07.23-回归.tar.gz'))
        .toEqual({ baseName: '2026.07.23-回归.tar', extension: '.gz' })
    })

    it('没有扩展名时扩展名为空', () => {
      expect(splitComposerFileName('README')).toEqual({ baseName: 'README', extension: '' })
    })

    /** 以点开头的名字整体是文件名，不是「空文件名 + 扩展名」。 */
    it('以点开头的名字不拆', () => {
      expect(splitComposerFileName('.gitignore')).toEqual({ baseName: '.gitignore', extension: '' })
    })
  })

  describe('两条入口', () => {
    it('选择文件与粘贴得到同一种附件形态', () => {
      const selected = createComposerAttachments(createFakeHost().adapter)
      const pasted = createComposerAttachments(createFakeHost().adapter)

      selected.add([image('shot.png')])
      pasted.addFromPaste([image('shot.png')])

      const strip = (list: readonly { id: string, previewUrl?: string, baseName: string, extension: string }[]) =>
        list.map(({ baseName, extension, previewUrl }) => ({ baseName, extension, hasPreview: !!previewUrl }))
      expect(strip(selected.attachments.value)).toEqual([{ baseName: 'shot', extension: '.png', hasPreview: true }])
      expect(strip(pasted.attachments.value)).toEqual(strip(selected.attachments.value))
    })

    /** 剪贴板里没有文件时不吞这次粘贴：正文照常粘进输入框，而不是被当成附件。 */
    it('粘贴的不是文件时不进附件，也不吞掉这次粘贴', () => {
      const attachments = createComposerAttachments(createFakeHost().adapter)

      expect(attachments.addFromPaste([])).toEqual({ added: 0, error: '', consumed: false })
      expect(attachments.attachments.value).toEqual([])
    })

    it('粘贴到文件时吞掉这次粘贴', () => {
      const attachments = createComposerAttachments(createFakeHost().adapter)

      expect(attachments.addFromPaste([image()])).toEqual({ added: 1, error: '', consumed: true })
    })

    /** 只有图片有缩略图；其他文件走文件名胶囊，两条入口都一样。 */
    it('图片有缩略图，其他文件没有', () => {
      const host = createFakeHost()
      const attachments = createComposerAttachments(host.adapter)

      attachments.add([image('shot.png'), file('note.txt')])

      expect(attachments.attachments.value.map(({ previewUrl }) => !!previewUrl)).toEqual([true, false])
      expect(host.created).toHaveLength(1)
    })
  })

  describe('超限的文件', () => {
    /** 服务端硬校验 10 MB，前端预检避免白传一遍大文件后才报错。 */
    it('超过上限的文件被跳过并给出错误文案', () => {
      const attachments = createComposerAttachments(createFakeHost().adapter)

      const result = attachments.add([file('huge.zip', { size: MAX_COMPOSER_ATTACHMENT_SIZE + 1 })])

      expect(result).toEqual({ added: 0, error: '媒体大小不能超过 10 MB' })
      expect(attachments.attachments.value).toEqual([])
    })

    it('恰好等于上限的文件可以加入', () => {
      const attachments = createComposerAttachments(createFakeHost().adapter)

      expect(attachments.add([file('exact.zip', { size: MAX_COMPOSER_ATTACHMENT_SIZE })]).added).toBe(1)
    })

    /** 一批文件里只有一个超限时，其余的照常加入。 */
    it('同一批里合规的文件不受超限文件影响', () => {
      const attachments = createComposerAttachments(createFakeHost().adapter)

      const result = attachments.add([
        file('ok.txt'),
        file('huge.zip', { size: MAX_COMPOSER_ATTACHMENT_SIZE + 1 }),
        file('ok2.txt'),
      ])

      expect(result.added).toBe(2)
      expect(result.error).toBe('媒体大小不能超过 10 MB')
      expect(attachments.attachments.value.map(({ file: target }) => target.name)).toEqual(['ok.txt', 'ok2.txt'])
    })
  })

  describe('增、删、清空', () => {
    it('移除一个附件时释放它的临时地址，其余不动', () => {
      const host = createFakeHost()
      const attachments = createComposerAttachments(host.adapter)
      attachments.add([image('a.png'), image('b.png')])
      const [first] = attachments.attachments.value

      attachments.remove(first!.id)

      expect(attachments.attachments.value.map(({ file: target }) => target.name)).toEqual(['b.png'])
      expect(host.revoked).toEqual([first!.previewUrl])
    })

    it('移除不存在的附件什么都不做', () => {
      const host = createFakeHost()
      const attachments = createComposerAttachments(host.adapter)
      attachments.add([image('a.png')])

      attachments.remove('不存在')

      expect(attachments.attachments.value).toHaveLength(1)
      expect(host.revoked).toEqual([])
    })

    /** 清空要把每个图片的临时地址都释放掉，漏一个就留下一份 blob 引用。 */
    it('清空释放全部临时地址', () => {
      const host = createFakeHost()
      const attachments = createComposerAttachments(host.adapter)
      attachments.add([image('a.png'), file('note.txt'), image('b.png')])

      attachments.clear()

      expect(attachments.attachments.value).toEqual([])
      expect(host.revoked).toEqual(host.created)
    })

    /**
     * 同一个文件可以加入两次，两条各有自己的标识。
     *
     * 标识里带上加入时的序号：不带的话两条的标识会撞在一起，移除其中一条会把两条一起移掉。
     */
    it('同一个文件加入两次得到两条可独立移除的附件', () => {
      const attachments = createComposerAttachments(createFakeHost().adapter)
      attachments.add([image('same.png')])
      attachments.add([image('same.png')])

      const ids = attachments.attachments.value.map(({ id }) => id)
      expect(new Set(ids).size).toBe(2)

      attachments.remove(ids[0]!)
      expect(attachments.attachments.value).toHaveLength(1)
    })
  })

  describe('读成 base64', () => {
    it('data URL 的逗号之后才是内容', () => {
      expect(extractComposerBase64('data:image/png;base64,QUJD')).toBe('QUJD')
    })

    /** 读不出 data URL 前缀就说明这不是一份可用的读数，不能把整段当成内容发出去。 */
    it('没有逗号时如实报错', () => {
      expect(() => extractComposerBase64('QUJD')).toThrow('无法读取媒体内容')
      expect(() => extractComposerBase64('')).toThrow('无法读取媒体内容')
    })

    it('没有附件时不给媒体载荷', async () => {
      const attachments = createComposerAttachments(createFakeHost().adapter)
      await expect(attachments.readMedia()).resolves.toBeUndefined()
    })

    it('每个附件读成一条媒体载荷', async () => {
      const attachments = createComposerAttachments(createFakeHost({
        'shot.png': 'data:image/png;base64,SHOT',
        'note.txt': 'data:text/plain;base64,NOTE',
      }).adapter)
      attachments.add([image('shot.png'), file('note.txt')])

      await expect(attachments.readMedia()).resolves.toEqual([
        { fileName: 'shot.png', mimeType: 'image/png', dataBase64: 'SHOT' },
        { fileName: 'note.txt', mimeType: 'text/plain', dataBase64: 'NOTE' },
      ])
    })

    /** 读取失败要如实抛出：发送编排据此显示错误文案，并且不清空草稿。 */
    it('读取失败时如实抛出', async () => {
      const attachments = createComposerAttachments(createFakeHost({
        'broken.png': new Error('无法读取媒体内容'),
      }).adapter)
      attachments.add([image('broken.png')])

      await expect(attachments.readMedia()).rejects.toThrow('无法读取媒体内容')
    })
  })
})
