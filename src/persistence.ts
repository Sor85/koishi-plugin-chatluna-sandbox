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

declare module '@koishijs/core' {
  interface Tables {
    onebotSandboxScene: SandboxSceneRecord
  }
}

interface SandboxSceneDatabase {
  get(table: 'onebotSandboxScene', query: { id: string }): Promise<SandboxSceneRecord[]>
  upsert(table: 'onebotSandboxScene', rows: SandboxSceneRecord[]): Promise<unknown>
}

const SCENE_TABLE = 'onebotSandboxScene'
const SCENE_ID = 'main'

export function registerSandboxSceneModel(ctx: Context): void {
  ctx.model.extend(SCENE_TABLE, {
    id: 'string(64)',
    scene: 'json',
    updatedAt: 'timestamp',
  }, { primary: 'id' })
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
