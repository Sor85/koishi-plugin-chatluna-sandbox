import { App } from '@koishijs/core'
import { describe, expect, it, vi } from 'vitest'
import { KoishiDatabaseScenePersistence, registerSandboxSceneModel } from '../src/persistence'
import type { SandboxSnapshot } from '../src/types'

const snapshot: SandboxSnapshot = {
  revision: 7,
  participants: [{ kind: 'user', id: '10001', name: '测试用户' }],
  groups: [],
  conversations: [{
    id: 'private:10001:20001',
    type: 'direct',
    participantIds: ['10001', '20001'],
    messageIds: ['message-1'],
  }],
  messages: [{
    id: 'message-1',
    authorId: '10001',
    conversationId: 'private:10001:20001',
    content: '[图片]',
    createdAt: '2026-07-25T00:00:00.000Z',
    media: [{
      id: '0123456789abcdef0123456789abcdef',
      type: 'image',
      name: 'image.png',
      mimeType: 'image/png',
      size: 4,
      reference: 'sandbox-media://0123456789abcdef0123456789abcdef',
    }],
  }],
  friendships: [],
  requests: [],
}

function createDatabaseContext() {
  const records = new Map<string, { id: string, scene: SandboxSnapshot, updatedAt: Date }>()
  const database = {
    get: vi.fn(async (_table: string, query: { id: string }) => {
      const record = records.get(query.id)
      return record ? [structuredClone(record)] : []
    }),
    upsert: vi.fn(async (_table: string, rows: Array<{ id: string, scene: SandboxSnapshot, updatedAt: Date }>) => {
      for (const row of rows) records.set(row.id, structuredClone(row))
      return {}
    }),
  }
  return { database, records }
}

describe('Koishi Database 场景仓库', () => {
  it('注册场景表并只用 JSON 场景读写业务状态和媒体元数据', async () => {
    const context = createDatabaseContext()
    const app = new App()
    const extend = vi.spyOn(app.model, 'extend')
    registerSandboxSceneModel(app)
    const persistence = new KoishiDatabaseScenePersistence(context.database)

    expect(extend).toHaveBeenCalledWith('onebotSandboxScene', expect.objectContaining({
      id: expect.anything(),
      scene: 'json',
      updatedAt: 'timestamp',
    }), { primary: 'id' })
    expect(await persistence.load()).toBeUndefined()

    await persistence.save(snapshot)
    expect(await persistence.load()).toEqual(snapshot)
    expect(context.database.upsert).toHaveBeenCalledWith('onebotSandboxScene', [expect.objectContaining({
      id: 'main',
      scene: snapshot,
    })])
    expect(JSON.stringify(context.records.get('main'))).not.toContain('dataBase64')
    expect(persistence.getStatus()).toEqual({
      mode: 'database',
      available: true,
      persisted: true,
    })
  })

  it('数据库服务缺失时明确报告不可用且不误报已持久化', async () => {
    const persistence = new KoishiDatabaseScenePersistence()

    expect(await persistence.load()).toBeUndefined()
    await persistence.save(snapshot)
    expect(persistence.getStatus()).toEqual({
      mode: 'database',
      available: false,
      persisted: false,
      message: 'Koishi Database 服务未安装或不可用',
    })
  })
})
