import type { Context } from 'koishi'
import type { SandboxOneBotDebugRecord, SandboxModelRequestRecord, SandboxPersistenceStatus, SandboxSnapshot } from './types'
import type { SandboxOneBotDebugPersistence } from './onebot-debug'
import type { SandboxModelRequestPersistence } from './model-request'

export type SandboxSceneLoadResult =
  | { kind: 'loaded', scene: SandboxSnapshot }
  | { kind: 'missing' }
  | { kind: 'unavailable', reason: 'missing-service' | 'query-failed', error?: unknown }

export interface SandboxScenePersistence {
  getStatus(): SandboxPersistenceStatus
  load(): Promise<SandboxSceneLoadResult>
  save(scene: SandboxSnapshot): Promise<void>
}

export interface SandboxSceneRecord {
  id: string
  scene: SandboxSnapshot
  updatedAt: Date
}

export interface SandboxTestSpacePersistenceRecord {
  id: string
  name: string
  status: 'running' | 'taken-over' | 'completed' | 'failed'
  createdAt: string
  updatedAt: string
  completedAt?: string
  scene: SandboxSnapshot
}

export interface SandboxTestSpacePersistence {
  loadAll(): Promise<SandboxTestSpacePersistenceRecord[]>
  save(record: SandboxTestSpacePersistenceRecord): Promise<void>
  delete(id: string): Promise<void>
}

export interface SandboxOneBotDebugPersistenceRecord {
  scopeId: string
  nextSequence: number
  records: SandboxOneBotDebugRecord[]
  updatedAt: Date
}

export interface SandboxModelRequestPersistenceRecord {
  scopeId: string
  nextSequence: number
  records: SandboxModelRequestRecord[]
  updatedAt: Date
}

declare module '@koishijs/core' {
  interface Tables {
    'onebot-sandbox.scene': SandboxSceneRecord
    'onebot-sandbox.test-space': SandboxTestSpacePersistenceRecord
    'onebot-sandbox.debug-records': SandboxOneBotDebugPersistenceRecord
    'onebot-sandbox.model-requests': SandboxModelRequestPersistenceRecord
  }
}

interface SandboxSceneDatabase {
  get(table: 'onebot-sandbox.scene', query: { id: string }): Promise<SandboxSceneRecord[]>
  upsert(table: 'onebot-sandbox.scene', rows: SandboxSceneRecord[]): Promise<unknown>
}

interface SandboxTestSpaceDatabase {
  get(table: 'onebot-sandbox.test-space', query: { id?: string }): Promise<SandboxTestSpacePersistenceRecord[]>
  upsert(table: 'onebot-sandbox.test-space', rows: SandboxTestSpacePersistenceRecord[]): Promise<unknown>
  remove(table: 'onebot-sandbox.test-space', query: { id: string }): Promise<unknown>
}

interface SandboxOneBotDebugDatabase {
  get(table: 'onebot-sandbox.debug-records', query: { scopeId: string }): Promise<SandboxOneBotDebugPersistenceRecord[]>
  upsert(table: 'onebot-sandbox.debug-records', rows: SandboxOneBotDebugPersistenceRecord[]): Promise<unknown>
  remove(table: 'onebot-sandbox.debug-records', query: { scopeId: string }): Promise<unknown>
}

interface SandboxModelRequestDatabase {
  get(table: 'onebot-sandbox.model-requests', query: { scopeId: string }): Promise<SandboxModelRequestPersistenceRecord[]>
  upsert(table: 'onebot-sandbox.model-requests', rows: SandboxModelRequestPersistenceRecord[]): Promise<unknown>
  remove(table: 'onebot-sandbox.model-requests', query: { scopeId: string }): Promise<unknown>
}

// 表名使用 "onebot-sandbox." 前缀：dataview-next 等工具按点号前缀归属插件；
// ctx.inject 回调里的 model.extend 拿不到插件运行时名称，仅靠上下文会被归为未知来源。
const SCENE_TABLE = 'onebot-sandbox.scene'
const SCENE_ID = 'main'
const TEST_SPACE_TABLE = 'onebot-sandbox.test-space'
const DEBUG_TABLE = 'onebot-sandbox.debug-records'
const MODEL_REQUEST_TABLE = 'onebot-sandbox.model-requests'

export function registerSandboxSceneModel(ctx: Context): void {
  ctx.model.extend(SCENE_TABLE, {
    id: 'string(64)',
    scene: 'json',
    updatedAt: 'timestamp',
  }, { primary: 'id' })
}

export function registerSandboxTestSpaceModel(ctx: Context): void {
  ctx.model.extend(TEST_SPACE_TABLE, {
    id: 'string(64)',
    name: 'string(255)',
    status: 'string(32)',
    createdAt: 'string(64)',
    updatedAt: 'string(64)',
    completedAt: 'string(64)',
    scene: 'json',
  }, { primary: 'id' })
}

export function registerSandboxModelRequestModel(ctx: Context): void {
  ctx.model.extend(MODEL_REQUEST_TABLE, {
    scopeId: 'string(64)',
    nextSequence: 'unsigned',
    records: 'json',
    updatedAt: 'timestamp',
  }, { primary: 'scopeId' })
}

export function registerSandboxOneBotDebugModel(ctx: Context): void {
  ctx.model.extend(DEBUG_TABLE, {
    scopeId: 'string(64)',
    nextSequence: 'unsigned',
    records: 'json',
    updatedAt: 'timestamp',
  }, { primary: 'scopeId' })
}

export class MemoryOneBotDebugPersistence implements SandboxOneBotDebugPersistence {
  private store = new Map<string, { nextSequence: number, records: SandboxOneBotDebugRecord[] }>()

  constructor(private scopeId: string) {}

  async load() {
    const current = this.store.get(this.scopeId)
    return current
      ? { nextSequence: current.nextSequence, records: structuredClone(current.records) }
      : { nextSequence: 1, records: [] }
  }

  async replaceAll(nextSequence: number, records: SandboxOneBotDebugRecord[]) {
    this.store.set(this.scopeId, {
      nextSequence,
      records: structuredClone(records),
    })
  }

  async clear() {
    this.store.delete(this.scopeId)
  }
}

export class KoishiDatabaseOneBotDebugPersistence implements SandboxOneBotDebugPersistence {
  constructor(
    private scopeId: string,
    private getDatabase: () => SandboxOneBotDebugDatabase | undefined,
  ) {}

  async load() {
    const database = this.getDatabase()
    if (!database) return { nextSequence: 1, records: [] }
    const [record] = await database.get(DEBUG_TABLE, { scopeId: this.scopeId })
    if (!record) return { nextSequence: 1, records: [] }
    return {
      nextSequence: Math.max(1, Number(record.nextSequence) || 1),
      records: structuredClone(record.records ?? []),
    }
  }

  async replaceAll(nextSequence: number, records: SandboxOneBotDebugRecord[]) {
    const database = this.getDatabase()
    if (!database) return
    await database.upsert(DEBUG_TABLE, [{
      scopeId: this.scopeId,
      nextSequence,
      records: structuredClone(records),
      updatedAt: new Date(),
    }])
  }

  async clear() {
    const database = this.getDatabase()
    if (!database) return
    await database.remove(DEBUG_TABLE, { scopeId: this.scopeId })
  }
}

export class MemoryModelRequestPersistence implements SandboxModelRequestPersistence {
  private store = new Map<string, { nextSequence: number, records: SandboxModelRequestRecord[] }>()
  constructor(private scopeId: string) {}
  async load() {
    const current = this.store.get(this.scopeId)
    return current ? { nextSequence: current.nextSequence, records: structuredClone(current.records) } : { nextSequence: 1, records: [] }
  }
  async replaceAll(nextSequence: number, records: SandboxModelRequestRecord[]) {
    this.store.set(this.scopeId, { nextSequence, records: structuredClone(records) })
  }
  async clear() { this.store.delete(this.scopeId) }
}

export class KoishiDatabaseModelRequestPersistence implements SandboxModelRequestPersistence {
  constructor(private scopeId: string, private getDatabase: () => SandboxModelRequestDatabase | undefined) {}
  async load() {
    // database 是可选服务，Minato 可能在本插件构造 Store 后才完成注册。这里等待服务，
    // 不能把“尚未可用”伪装成空库，否则重启后的首次请求会覆盖全部历史记录。
    const deadline = Date.now() + 10_000
    let database = this.getDatabase()
    while (!database && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(25, Math.max(1, deadline - Date.now()))))
      database = this.getDatabase()
    }
    if (!database) throw new Error('等待 Koishi Database 服务 10000ms 后仍不可用')
    const [record] = await database.get(MODEL_REQUEST_TABLE, { scopeId: this.scopeId })
    return record ? { nextSequence: Math.max(1, Number(record.nextSequence) || 1), records: structuredClone(record.records ?? []) } : { nextSequence: 1, records: [] }
  }
  async replaceAll(nextSequence: number, records: SandboxModelRequestRecord[]) {
    const database = this.getDatabase()
    if (!database) return
    await database.upsert(MODEL_REQUEST_TABLE, [{ scopeId: this.scopeId, nextSequence, records: structuredClone(records), updatedAt: new Date() }])
  }
  async clear() {
    const database = this.getDatabase()
    if (!database) return
    await database.remove(MODEL_REQUEST_TABLE, { scopeId: this.scopeId })
  }
}

// database 是可选服务，可能在本插件之后才加载；构造时缓存服务实例会让持久化永远不可用，
// 必须通过 getter 在每次调用时解析当前服务。
export class KoishiDatabaseTestSpacePersistence implements SandboxTestSpacePersistence {
  constructor(private getDatabase: () => SandboxTestSpaceDatabase | undefined) {}

  async loadAll(): Promise<SandboxTestSpacePersistenceRecord[]> {
    const database = this.getDatabase()
    if (!database) return []
    const records = await database.get(TEST_SPACE_TABLE, {})
    return records.map((record) => structuredClone(record))
  }

  async save(record: SandboxTestSpacePersistenceRecord): Promise<void> {
    const database = this.getDatabase()
    if (!database) return
    await database.upsert(TEST_SPACE_TABLE, [structuredClone(record)])
  }

  async delete(id: string): Promise<void> {
    const database = this.getDatabase()
    if (!database) return
    await database.remove(TEST_SPACE_TABLE, { id })
  }
}

export class KoishiDatabaseScenePersistence implements SandboxScenePersistence {
  private persisted = false
  private lastError?: unknown

  constructor(private getDatabase: () => SandboxSceneDatabase | undefined) {}

  getStatus(): SandboxPersistenceStatus {
    if (!this.getDatabase()) return this.createUnavailableStatus()
    if (this.lastError !== undefined) return this.createUnavailableStatus(this.lastError)
    return { mode: 'database', available: true, persisted: this.persisted }
  }

  async load(): Promise<SandboxSceneLoadResult> {
    const database = this.getDatabase()
    if (!database) return { kind: 'unavailable', reason: 'missing-service' }
    try {
      const [record] = await database.get(SCENE_TABLE, { id: SCENE_ID })
      this.lastError = undefined
      if (!record) return { kind: 'missing' }
      this.persisted = true
      return { kind: 'loaded', scene: structuredClone(record.scene) }
    } catch (error) {
      this.lastError = error
      // 查询失败不能伪装成首次启动，否则控制服务会用默认场景覆盖仍在数据库中的旧记录。
      return { kind: 'unavailable', reason: 'query-failed', error }
    }
  }

  async save(scene: SandboxSnapshot): Promise<void> {
    const database = this.getDatabase()
    if (!database) return
    try {
      await database.upsert(SCENE_TABLE, [{
        id: SCENE_ID,
        scene: structuredClone(scene),
        updatedAt: new Date(),
      }])
      this.lastError = undefined
      this.persisted = true
    } catch (error) {
      this.lastError = error
    }
  }

  private createUnavailableStatus(error?: unknown): SandboxPersistenceStatus {
    const detail = error instanceof Error && error.message ? `：${error.message}` : ''
    return {
      mode: 'database',
      available: false,
      persisted: false,
      message: `Koishi Database 服务未安装或不可用${detail}`,
    }
  }
}
