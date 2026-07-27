import type { Context } from 'koishi'
import type { SandboxPersistenceStatus, SandboxSnapshot } from './types'

export interface SandboxScenePersistence {
  getStatus(): SandboxPersistenceStatus
  load(): Promise<SandboxSnapshot | undefined>
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
  controllerId: string
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

declare module '@koishijs/core' {
  interface Tables {
    'onebot-sandbox.scene': SandboxSceneRecord
    'onebot-sandbox.test-space': SandboxTestSpacePersistenceRecord
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

// 表名使用 "onebot-sandbox." 前缀：dataview-next 等工具按点号前缀归属插件；
// ctx.inject 回调里的 model.extend 拿不到插件运行时名称，仅靠上下文会被归为未知来源。
const SCENE_TABLE = 'onebot-sandbox.scene'
const SCENE_ID = 'main'
const TEST_SPACE_TABLE = 'onebot-sandbox.test-space'

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
    controllerId: 'string(64)',
    createdAt: 'string(64)',
    updatedAt: 'string(64)',
    completedAt: 'string(64)',
    scene: 'json',
  }, { primary: 'id' })
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

  async load(): Promise<SandboxSnapshot | undefined> {
    const database = this.getDatabase()
    if (!database) return
    try {
      const [record] = await database.get(SCENE_TABLE, { id: SCENE_ID })
      this.lastError = undefined
      if (!record) return
      this.persisted = true
      return structuredClone(record.scene)
    } catch (error) {
      this.lastError = error
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
