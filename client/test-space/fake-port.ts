import type { SandboxTestSpaceSummary } from '../../src/test-spaces'
import { FakePortRecorder } from '#client/shared/fake-port-recorder'
import type { TestSpacePort, TestSpacePortOperation } from './port'

/**
 * 内存测试空间端口。空间列表可写，动作调用被记录下来供断言，不模拟服务端的状态机——
 * 状态迁移规则由服务端测试覆盖，这里只证明界面按什么顺序调了什么。
 */
export class FakeTestSpacePort implements TestSpacePort {
  spaces: SandboxTestSpaceSummary[] = []
  private readonly recorder = new FakePortRecorder<TestSpacePortOperation>()
  private createdCount = 0

  get calls() {
    return this.recorder.calls
  }

  rejectNext(operation: TestSpacePortOperation, error: unknown) {
    this.recorder.rejectNext(operation, error)
  }

  private invoke<T>(operation: TestSpacePortOperation, input: unknown, result: () => T): Promise<T> {
    return this.recorder.invokeDeferred(operation, input, result)
  }

  private find(spaceId: string): SandboxTestSpaceSummary {
    const space = this.spaces.find(({ id }) => id === spaceId)
    if (!space) throw new Error(`测试空间不存在：${spaceId}`)
    return space
  }

  listTestSpaces() {
    return this.invoke('listTestSpaces', undefined, () => this.spaces)
  }

  createTestSpace(input: { name?: string } = {}) {
    return this.invoke('createTestSpace', input, () => {
      this.createdCount += 1
      const space = this.spaces[0]
      if (!space) throw new Error('假端口需要先设置 spaces 才能创建测试空间')
      const created = { ...space, id: `space-${this.createdCount}`, name: input.name ?? `测试空间 ${this.createdCount}` }
      this.spaces = [...this.spaces, created]
      return created
    })
  }

  takeOverTestSpace(input: { spaceId: string }) {
    return this.invoke('takeOverTestSpace', input, () => this.find(input.spaceId))
  }

  returnTestSpace(input: { spaceId: string }) {
    return this.invoke('returnTestSpace', input, () => this.find(input.spaceId))
  }

  terminateTestSpace(input: { spaceId: string }) {
    return this.invoke('terminateTestSpace', input, () => this.find(input.spaceId))
  }

  reactivateTestSpace(input: { spaceId: string }) {
    return this.invoke('reactivateTestSpace', input, () => this.find(input.spaceId))
  }

  deleteTestSpace(input: { spaceId: string }) {
    return this.invoke('deleteTestSpace', input, () => {
      this.spaces = this.spaces.filter(({ id }) => id !== input.spaceId)
    })
  }
}
