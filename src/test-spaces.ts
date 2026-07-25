import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import type { Context } from 'koishi'
import { createEmptyScene, SandboxControlService, type SandboxRuntimeBotRegistry } from './control-service'
import type { SandboxTestSpacePersistence, SandboxTestSpacePersistenceRecord } from './persistence'
import type { SandboxSnapshot } from './types'

export type SandboxTestSpaceStatus = 'running' | 'taken-over' | 'completed' | 'failed'

export interface SandboxTestSpaceSummary {
  id: string
  name: string
  status: SandboxTestSpaceStatus
  controllerId: string
  createdAt: string
  updatedAt: string
  completedAt?: string
  snapshot: SandboxSnapshot
}

export interface CreateSandboxTestSpaceInput {
  controllerId: string
  name?: string
}

interface SandboxTestSpaceRecord extends Omit<SandboxTestSpaceSummary, 'snapshot'> {
  control: SandboxControlService
}

export class SandboxTestSpaceService {
  private spaces = new Map<string, SandboxTestSpaceRecord>()
  private spaceCreatedListeners = new Set<(spaceId: string, control: SandboxControlService) => void>()
  private persistenceQueue = Promise.resolve()

  constructor(
    private ctx: Context,
    private runtimeBots: SandboxRuntimeBotRegistry,
    private persistence?: SandboxTestSpacePersistence,
  ) {
    ctx.on('ready', async () => {
      if (!this.persistence) return
      try {
        for (const record of await this.persistence.loadAll()) this.restoreSpace(record)
      } catch (error) {
        ctx.logger('onebot-sandbox').error('AI 测试空间恢复失败。', error)
      }
    })
    ctx.on('dispose', () => this.persistenceQueue)
  }

  createSpace(input: CreateSandboxTestSpaceInput): SandboxTestSpaceSummary & { control: SandboxControlService } {
    const id = randomUUID()
    const now = new Date().toISOString()
    const control = this.createControl(id, createEmptyScene(), true)
    const record: SandboxTestSpaceRecord = {
      id,
      name: input.name?.trim() || `AI 测试空间 ${this.spaces.size + 1}`,
      status: 'running',
      controllerId: input.controllerId,
      createdAt: now,
      updatedAt: now,
      control,
    }
    this.spaces.set(id, record)
    this.attachControl(record)
    this.queuePersistence(record)
    return { ...this.toSummary(record), control }
  }

  onSpaceCreated(listener: (spaceId: string, control: SandboxControlService) => void): () => void {
    this.spaceCreatedListeners.add(listener)
    return () => this.spaceCreatedListeners.delete(listener)
  }

  waitForPersistence(): Promise<void> {
    return this.persistenceQueue
  }

  listSpaces(): SandboxTestSpaceSummary[] {
    return [...this.spaces.values()]
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map((space) => this.toSummary(space))
  }

  getSpace(spaceId: string): SandboxTestSpaceSummary {
    return this.toSummary(this.requireSpace(spaceId))
  }

  getControl(spaceId: string): SandboxControlService {
    return this.requireSpace(spaceId).control
  }

  requireReadable(spaceId: string, controllerId: string): SandboxControlService {
    const space = this.requireSpace(spaceId)
    if (space.controllerId !== controllerId) throw new Error('测试凭证无权读取此空间')
    return space.control
  }

  requireAiControl(spaceId: string, controllerId: string): SandboxControlService {
    const space = this.requireSpace(spaceId)
    if (space.controllerId !== controllerId) throw new Error('测试凭证无权控制此空间')
    if (space.status === 'taken-over') throw new Error('空间已由用户接管')
    if (space.status !== 'running') throw new Error(`空间当前不可修改：${space.status}`)
    return space.control
  }

  requireUserControl(spaceId: string): SandboxControlService {
    const space = this.requireSpace(spaceId)
    if (space.status !== 'taken-over') throw new Error('请先接管测试空间')
    return space.control
  }

  takeOver(spaceId: string): SandboxTestSpaceSummary {
    return this.setStatus(spaceId, 'taken-over')
  }

  returnControl(spaceId: string): SandboxTestSpaceSummary {
    return this.setStatus(spaceId, 'running')
  }

  completeSpace(spaceId: string, controllerId: string): SandboxTestSpaceSummary {
    const space = this.requireRunningAiSpace(spaceId, controllerId)
    space.status = 'completed'
    space.completedAt = new Date().toISOString()
    space.updatedAt = space.completedAt
    space.control.setRuntimeActive(false)
    this.queuePersistence(space)
    return this.toSummary(space)
  }

  failSpace(spaceId: string, controllerId: string): SandboxTestSpaceSummary {
    const space = this.requireRunningAiSpace(spaceId, controllerId)
    space.status = 'failed'
    space.completedAt = new Date().toISOString()
    space.updatedAt = space.completedAt
    space.control.setRuntimeActive(false)
    this.queuePersistence(space)
    return this.toSummary(space)
  }

  reactivateSpace(spaceId: string, status: 'running' | 'taken-over' = 'taken-over'): SandboxTestSpaceSummary {
    const space = this.requireSpace(spaceId)
    if (space.status !== 'completed' && space.status !== 'failed') throw new Error('只有已完成或失败的空间可以重新激活')
    space.control.setRuntimeActive(true)
    // WebUI 重新激活代表用户接管，MCP 重新激活则必须归还原 AI 控制者；两条入口不能共用隐式默认身份。
    space.status = status
    space.updatedAt = new Date().toISOString()
    delete space.completedAt
    this.queuePersistence(space)
    return this.toSummary(space)
  }

  deleteSpace(spaceId: string, controllerId?: string): void {
    const space = this.requireSpace(spaceId)
    if (controllerId && space.controllerId !== controllerId) throw new Error('测试凭证无权删除此空间')
    this.spaces.delete(spaceId)
    void space.control.dispose()
    const persistence = this.persistence
    if (persistence) this.queuePersistenceTask(() => persistence.delete(spaceId))
  }

  private setStatus(spaceId: string, status: 'running' | 'taken-over'): SandboxTestSpaceSummary {
    const space = this.requireSpace(spaceId)
    if (space.status === 'completed' || space.status === 'failed') throw new Error('请先重新激活已结束空间')
    space.status = status
    space.updatedAt = new Date().toISOString()
    this.queuePersistence(space)
    return this.toSummary(space)
  }

  private createControl(id: string, scene: SandboxSnapshot, runtimeActive: boolean): SandboxControlService {
    return new SandboxControlService(this.ctx, {
      initialScene: scene,
      runtimeActive,
      runtimeBots: this.runtimeBots,
      mediaDirectory: resolve(this.ctx.baseDir, 'data/onebot-sandbox/spaces', id, 'media'),
    })
  }

  private restoreSpace(stored: SandboxTestSpacePersistenceRecord): void {
    if (this.spaces.has(stored.id)) return
    const control = this.createControl(stored.id, stored.scene, stored.status === 'running' || stored.status === 'taken-over')
    const record: SandboxTestSpaceRecord = {
      id: stored.id,
      name: stored.name,
      status: stored.status,
      controllerId: stored.controllerId,
      createdAt: stored.createdAt,
      updatedAt: stored.updatedAt,
      completedAt: stored.completedAt,
      control,
    }
    this.spaces.set(record.id, record)
    this.attachControl(record)
  }

  private attachControl(record: SandboxTestSpaceRecord): void {
    record.control.onSceneMutation(() => {
      record.updatedAt = new Date().toISOString()
      this.queuePersistence(record)
    })
    for (const listener of this.spaceCreatedListeners) listener(record.id, record.control)
  }

  private queuePersistence(record: SandboxTestSpaceRecord): void {
    const persistence = this.persistence
    if (!persistence) return
    const stored: SandboxTestSpacePersistenceRecord = {
      id: record.id,
      name: record.name,
      status: record.status,
      controllerId: record.controllerId,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      completedAt: record.completedAt,
      scene: record.control.getSnapshot(),
    }
    this.queuePersistenceTask(() => persistence.save(stored))
  }

  private queuePersistenceTask(task: () => Promise<void>): void {
    this.persistenceQueue = this.persistenceQueue.then(task).catch((error) => {
      this.ctx.logger('onebot-sandbox').error('AI 测试空间持久化失败。', error)
    })
  }

  private requireRunningAiSpace(spaceId: string, controllerId: string): SandboxTestSpaceRecord {
    const space = this.requireSpace(spaceId)
    if (space.controllerId !== controllerId) throw new Error('测试凭证无权控制此空间')
    if (space.status === 'taken-over') throw new Error('空间已由用户接管')
    if (space.status !== 'running') throw new Error(`空间当前不可修改：${space.status}`)
    return space
  }

  private requireSpace(spaceId: string): SandboxTestSpaceRecord {
    const space = this.spaces.get(spaceId)
    if (!space) throw new Error(`AI 测试空间不存在：${spaceId}`)
    return space
  }

  private toSummary(space: SandboxTestSpaceRecord): SandboxTestSpaceSummary {
    return {
      id: space.id,
      name: space.name,
      status: space.status,
      controllerId: space.controllerId,
      createdAt: space.createdAt,
      updatedAt: space.updatedAt,
      completedAt: space.completedAt,
      snapshot: space.control.getSnapshot(),
    }
  }
}
