import { randomUUID } from 'node:crypto'
import { basename, resolve } from 'node:path'
import { existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import type { SandboxMedia, SandboxMediaContent, SandboxMediaType } from './types'

export const MAX_MEDIA_SIZE = 10 * 1024 * 1024

const MEDIA_TYPES = new Map<string, SandboxMediaType>([
  ['image/gif', 'image'],
  ['image/jpeg', 'image'],
  ['image/png', 'image'],
  ['image/webp', 'image'],
  ['audio/aac', 'audio'],
  ['audio/m4a', 'audio'],
  ['audio/mpeg', 'audio'],
  ['audio/mp4', 'audio'],
  ['audio/ogg', 'audio'],
  ['audio/wav', 'audio'],
  ['audio/webm', 'audio'],
  ['video/mp4', 'video'],
  ['video/quicktime', 'video'],
  ['video/webm', 'video'],
  ['application/json', 'file'],
  ['application/msword', 'file'],
  ['application/pdf', 'file'],
  ['application/vnd.ms-excel', 'file'],
  ['application/vnd.ms-powerpoint', 'file'],
  ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'file'],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'file'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'file'],
  ['application/zip', 'file'],
  ['text/csv', 'file'],
  ['text/plain', 'file'],
])

export class SandboxMediaStorage {
  constructor(private directory: string) {
    mkdirSync(directory, { recursive: true })
  }

  clear(): void {
    rmSync(this.directory, { recursive: true, force: true })
    mkdirSync(this.directory, { recursive: true })
  }

  save(input: { fileName: string; mimeType: string; dataBase64: string }): SandboxMedia {
    const mimeType = input.mimeType.trim().toLowerCase()
    const type = MEDIA_TYPES.get(mimeType)
    if (!type) throw new Error(`不支持的媒体类型：${input.mimeType || '未知'}`)
    const name = basename(input.fileName.replaceAll('\\', '/')).trim()
    if (!name) throw new Error('媒体文件名不能为空')
    // 先按 Base64 理论长度拒绝超限输入，避免巨型字符串进入正则后耗尽调用栈或 CPU。
    const dataBase64 = input.dataBase64.trim()
    const paddingSize = dataBase64.endsWith('==') ? 2 : dataBase64.endsWith('=') ? 1 : 0
    if (Math.floor(dataBase64.length * 3 / 4) - paddingSize > MAX_MEDIA_SIZE) {
      throw new Error('媒体大小不能超过 10 MB')
    }
    if (!dataBase64 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(dataBase64)) {
      throw new Error('媒体内容不是有效的 Base64')
    }
    const content = Buffer.from(dataBase64, 'base64')
    if (!content.length) throw new Error('媒体内容不能为空')
    if (content.length > MAX_MEDIA_SIZE) throw new Error('媒体大小不能超过 10 MB')

    const id = randomUUID().replaceAll('-', '')
    const media: SandboxMedia = {
      id,
      type,
      name,
      mimeType,
      size: content.length,
      reference: `sandbox-media://${id}`,
    }
    writeFileSync(this.getPath(id), content, { flag: 'wx' })
    writeFileSync(this.getMetadataPath(id), `${JSON.stringify(media)}\n`, { flag: 'wx' })
    return media
  }

  read(media: SandboxMedia): SandboxMediaContent {
    this.validateReference(media)
    try {
      return {
        ...media,
        dataBase64: readFileSync(this.getPath(media.id)).toString('base64'),
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error(`媒体文件不存在：${media.id}`)
      throw error
    }
  }

  readById(id: string): SandboxMediaContent {
    let media: SandboxMedia
    try {
      media = JSON.parse(readFileSync(this.getMetadataPath(id), 'utf8')) as SandboxMedia
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error(`媒体文件不存在：${id}`)
      throw error
    }
    return this.read(media)
  }

  exists(id: string): boolean {
    return existsSync(this.getPath(id)) && existsSync(this.getMetadataPath(id))
  }

  remove(media: SandboxMedia): void {
    this.validateReference(media)
    try {
      unlinkSync(this.getPath(media.id))
      rmSync(this.getMetadataPath(media.id), { force: true })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }

  private getPath(id: string): string {
    if (!/^[a-f0-9]{32}$/.test(id)) throw new Error(`无效媒体标识：${id}`)
    return resolve(this.directory, id)
  }

  private getMetadataPath(id: string): string {
    return `${this.getPath(id)}.meta.json`
  }

  private validateReference(media: SandboxMedia): void {
    if (media.reference !== `sandbox-media://${media.id}`) throw new Error(`无效媒体引用：${media.id}`)
  }
}
