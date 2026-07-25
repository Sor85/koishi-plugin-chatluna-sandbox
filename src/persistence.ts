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
    onebotSandboxScene: SandboxSceneRecord
    onebotSandboxTestSpace: SandboxTestSpacePersistenceRecord
  }
}

interface SandboxSceneDatabase {
  get(table: 'onebotSandboxScene', query: { id: string }): Promise<SandboxSceneRecord[]>
  upsert(table: 'onebotSandboxScene', rows: SandboxSceneRecord[]): Promise<unknown>
}

interface SandboxTestSpaceDatabase {
  get(table: 'onebotSandboxTestSpace', query: { id?: string }): Promise<SandboxTestSpacePersistenceRecord[]>
  upsert(table: 'onebotSandboxTestSpace', rows: SandboxTestSpacePersistenceRecord[]): Promise<unknown>
  remove(table: 'onebotSandboxTestSpace', query: { id: string }): Promise<unknown>
}

const SCENE_TABLE = 'onebotSandboxScene'
const SCENE_ID = 'main'
const TEST_SPACE_TABLE = 'onebotSandboxTestSpace'

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

export class KoishiDatabaseTestSpacePersistence implements SandboxTestSpacePersistence {
  constructor(private database?: SandboxTestSpaceDatabase) {}

  async loadAll(): Promise<SandboxTestSpacePersistenceRecord[]> {
    if (!this.database) return []
    const records = await this.database.get(TEST_SPACE_TABLE, {})
    return records.map((record) => structuredClone(record))
  }

  async save(record: SandboxTestSpacePersistenceRecord): Promise<void> {
    if (!this.database) return
    await this.database.upsert(TEST_SPACE_TABLE, [structuredClone(record)])
  }

  async delete(id: string): Promise<void> {
    if (!this.database) return
    await this.database.remove(TEST_SPACE_TABLE, { id })
  }
}

export class KoishiDatabaseScenePersistence implements SandboxScenePersistence {
  private status: SandboxPersistenceStatus

  constructor(private database?: SandboxSceneDatabase) {
    this.status = database ? {
      mode: 'database',
      available: true,
      persisted: false,
    } : this.createUnavailableStatus()
  }

  getStatus(): SandboxPersistenceStatus {
    return { ...this.status }
  }

  async load(): Promise<SandboxSnapshot | undefined> {
    if (!this.database) return
    try {
      const [record] = await this.database.get(SCENE_TABLE, { id: SCENE_ID })
      if (!record) return
      this.status = { mode: 'database', available: true, persisted: true }
      return structuredClone(record.scene)
    } catch (error) {
      this.status = this.createUnavailableStatus(error)
    }
  }

  async save(scene: SandboxSnapshot): Promise<void> {
    if (!this.database) return
    try {
      await this.database.upsert(SCENE_TABLE, [{
        id: SCENE_ID,
        scene: structuredClone(scene),
        updatedAt: new Date(),
      }])
      this.status = { mode: 'database', available: true, persisted: true }
    } catch (error) {
      this.status = this.createUnavailableStatus(error)
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
