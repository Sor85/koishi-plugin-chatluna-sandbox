import { App } from '@koishijs/core'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SandboxControlService } from '../src/control-service'
import { KoishiDatabaseScenePersistence, type SandboxScenePersistence } from '../src/persistence'
import type { SandboxPersistenceStatus, SandboxSnapshot } from '../src/types'

const runningApps: App[] = []
const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(runningApps.splice(0).map((app) => app.stop()))
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

class TestScenePersistence implements SandboxScenePersistence {
  private scene?: SandboxSnapshot
  private status: SandboxPersistenceStatus = {
    mode: 'database',
    available: true,
    persisted: false,
  }

  getStatus() {
    return { ...this.status }
  }

  async load() {
    return this.scene ? structuredClone(this.scene) : undefined
  }

  async save(scene: SandboxSnapshot) {
    this.scene = structuredClone(scene)
    this.status.persisted = true
  }
}

async function createControl(persistence?: SandboxScenePersistence, mediaDirectory?: string) {
  const app = new App()
  let control: SandboxControlService | undefined
  app.plugin((ctx) => {
    control = new SandboxControlService(ctx, { persistence, mediaDirectory })
  })
  runningApps.push(app)
  await app.start()
  if (!control) throw new Error('沙盒控制服务未注册')
  return { app, control }
}

describe('沙盒场景持久化', () => {
  it('默认使用服务端内存且重启后恢复默认场景', async () => {
    const mediaDirectory = await mkdtemp(join(tmpdir(), 'onebot-sandbox-memory-media-'))
    temporaryDirectories.push(mediaDirectory)
    const { app: firstApp, control: first } = await createControl(undefined, mediaDirectory)
    first.createUser({ id: '10099', name: '临时用户' })
    await first.sendMediaMessage({
      operatorId: '10001',
      conversationId: 'private:10001:20001',
      fileName: 'memory.png',
      mimeType: 'image/png',
      dataBase64: Buffer.from('memory').toString('base64'),
    })
    expect(await readdir(mediaDirectory)).toHaveLength(1)
    expect(first.getSnapshot().participants.some(({ id }) => id === '10099')).toBe(true)
    expect(first.getPersistenceStatus()).toEqual({
      mode: 'memory',
      available: true,
      persisted: false,
    })

    await firstApp.stop()
    const { control: second } = await createControl(undefined, mediaDirectory)
    expect(second.getSnapshot().participants.some(({ id }) => id === '10099')).toBe(false)
    expect(second.getSnapshot().participants.map(({ id }) => id)).toEqual(['10001', '10002', '10003', '20001'])
    expect(await readdir(mediaDirectory)).toEqual([])
  })

  it('Database 模式在控制服务重启后恢复场景', async () => {
    const persistence = new TestScenePersistence()
    const mediaDirectory = await mkdtemp(join(tmpdir(), 'onebot-sandbox-database-media-'))
    temporaryDirectories.push(mediaDirectory)
    const { app: firstApp, control: first } = await createControl(persistence, mediaDirectory)
    first.createUser({ id: '10099', name: '持久用户' })
    first.createBot({
      id: '20099',
      name: '持久机器人',
      implementation: 'llbot',
      enabled: true,
      disabledCapabilities: ['set_group_kick'],
    })
    first.createGroup({
      id: '30099',
      name: '持久群组',
      members: [
        { participantId: '10099', role: 'owner' },
        { participantId: '20099', role: 'admin' },
      ],
    })
    await first.sendMessage({
      operatorId: '10099',
      conversationId: 'group:30099',
      content: '跨重启消息',
    })
    await first.sendMediaMessage({
      operatorId: '10099',
      conversationId: 'group:30099',
      fileName: 'database.png',
      mimeType: 'image/png',
      dataBase64: Buffer.from('database').toString('base64'),
    })
    await first.bot.internal._request('get_status', {})
    expect(first.getOneBotDebugRecords()).not.toEqual([])
    await first.waitForPersistence()
    expect(first.getBotDeliveries()).not.toEqual([])
    await firstApp.stop()

    const { control: second } = await createControl(persistence, mediaDirectory)
    expect(second.getSnapshot().participants).toContainEqual({ kind: 'user', id: '10099', name: '持久用户' })
    expect(second.getSnapshot().participants).toContainEqual({
      kind: 'bot',
      id: '20099',
      name: '持久机器人',
      implementation: 'llbot',
      enabled: true,
      disabledCapabilities: ['set_group_kick'],
    })
    expect(second.getSnapshot().groups).toContainEqual(expect.objectContaining({
      id: '30099',
      name: '持久群组',
      members: [
        expect.objectContaining({ participantId: '10099', role: 'owner' }),
        expect.objectContaining({ participantId: '20099', role: 'admin' }),
      ],
    }))
    expect(second.getSnapshot().friendships.some(({ participantIds }) => participantIds.includes('10099') && participantIds.includes('20099'))).toBe(true)
    expect(second.getSnapshot().messages).toContainEqual(expect.objectContaining({
      authorId: '10099',
      conversationId: 'group:30099',
      content: '跨重启消息',
    }))
    const mediaMessage = second.getSnapshot().messages.find(({ media }) => media?.length)
    expect(mediaMessage?.media?.[0]).toEqual(expect.objectContaining({
      name: 'database.png',
      reference: expect.stringMatching(/^sandbox-media:\/\//),
    }))
    expect(second.getMediaContent({
      operatorId: '10099',
      mediaId: mediaMessage!.media![0].id,
    }).dataBase64).toBe(Buffer.from('database').toString('base64'))
    expect(second.getRuntimeBot('20099').selfId).toBe('20099')
    expect(second.getBotDeliveries()).toEqual([])
    expect(second.getChatLunaStates()).toEqual([])
    expect(second.getOneBotDebugRecords()).toEqual([])
    expect(second.getPersistenceStatus()).toEqual({
      mode: 'database',
      available: true,
      persisted: true,
    })
  })

  it('Database 模式重置后持久化新的默认场景', async () => {
    const persistence = new TestScenePersistence()
    const { app: firstApp, control: first } = await createControl(persistence)
    first.createUser({ id: '10099', name: '待重置用户' })
    await first.waitForPersistence()

    first.resetScene()
    await first.waitForPersistence()
    await firstApp.stop()

    const { control: second } = await createControl(persistence)
    expect(second.getSnapshot().participants.map(({ id }) => id)).toEqual(['10001', '10002', '10003', '20001'])
    expect(second.getSnapshot().revision).toBe(0)
  })

  it('切换到内存模式时忽略数据库场景，再切回 Database 模式后继续恢复', async () => {
    const persistence = new TestScenePersistence()
    const { app: databaseApp, control: databaseControl } = await createControl(persistence)
    databaseControl.createUser({ id: '10099', name: '数据库用户' })
    await databaseControl.waitForPersistence()
    await databaseApp.stop()

    const { app: memoryApp, control: memoryControl } = await createControl()
    expect(memoryControl.getSnapshot().participants.some(({ id }) => id === '10099')).toBe(false)
    memoryControl.createUser({ id: '10098', name: '内存用户' })
    await memoryApp.stop()

    const { control: restoredControl } = await createControl(persistence)
    expect(restoredControl.getSnapshot().participants.some(({ id }) => id === '10099')).toBe(true)
    expect(restoredControl.getSnapshot().participants.some(({ id }) => id === '10098')).toBe(false)
  })

  it('Database 服务不可用时明确报告状态并清理失去场景引用的媒体', async () => {
    const mediaDirectory = await mkdtemp(join(tmpdir(), 'onebot-sandbox-unavailable-media-'))
    temporaryDirectories.push(mediaDirectory)
    await writeFile(join(mediaDirectory, 'orphan'), 'orphan')

    const persistence = new KoishiDatabaseScenePersistence()
    const { control } = await createControl(persistence, mediaDirectory)

    expect(control.getPersistenceStatus()).toEqual({
      mode: 'database',
      available: false,
      persisted: false,
      message: 'Koishi Database 服务未安装或不可用',
    })
    expect(await readdir(mediaDirectory)).toEqual([])
  })
})
