import { beforeEach, describe, expect, it, vi } from 'vitest'

const clientMocks = vi.hoisted(() => ({
  send: vi.fn(async () => undefined),
}))

vi.mock('@koishijs/client', () => clientMocks)

import { FakeTestSpacePort } from '../client/test-space/fake-port'
import { createKoishiTestSpacePort } from '../client/test-space/koishi-port'
import type { SandboxTestSpaceSummary } from '../src/test-spaces'

function space(overrides: Partial<SandboxTestSpaceSummary> = {}): SandboxTestSpaceSummary {
  return {
    id: 'space-a',
    name: '空间甲',
    status: 'running',
    createdAt: '2026-08-01T00:00:00.000Z',
    snapshot: {
      revision: 1,
      participants: [],
      groups: [],
      conversations: [],
      messages: [],
      friendships: [],
      requests: [],
    },
    ...overrides,
  } as SandboxTestSpaceSummary
}

describe('Koishi 测试空间端口适配器', () => {
  beforeEach(() => clientMocks.send.mockClear())

  it('把七个生命周期操作映射到对应的 Console 端点', async () => {
    const port = createKoishiTestSpacePort()

    await port.listTestSpaces()
    await port.createTestSpace()
    await port.takeOverTestSpace({ spaceId: 'space-a' })
    await port.returnTestSpace({ spaceId: 'space-a' })
    await port.terminateTestSpace({ spaceId: 'space-a' })
    await port.reactivateTestSpace({ spaceId: 'space-a' })
    await port.deleteTestSpace({ spaceId: 'space-a' })

    expect(clientMocks.send.mock.calls).toEqual([
      ['chatluna-sandbox/test-spaces'],
      // Console 会把省略的参数序列化为 null，创建必须传普通对象。
      ['chatluna-sandbox/create-test-space', {}],
      ['chatluna-sandbox/take-over-test-space', { spaceId: 'space-a' }],
      ['chatluna-sandbox/return-test-space', { spaceId: 'space-a' }],
      ['chatluna-sandbox/terminate-test-space', { spaceId: 'space-a' }],
      ['chatluna-sandbox/reactivate-test-space', { spaceId: 'space-a' }],
      ['chatluna-sandbox/delete-test-space', { spaceId: 'space-a' }],
    ])
  })

  it('创建时给出名称会原样带上', async () => {
    const port = createKoishiTestSpacePort()

    await port.createTestSpace({ name: '回归空间' })

    expect(clientMocks.send).toHaveBeenCalledWith('chatluna-sandbox/create-test-space', { name: '回归空间' })
  })
})

describe('内存测试空间端口', () => {
  it('记录调用顺序与入参', async () => {
    const port = new FakeTestSpacePort()
    port.spaces = [space()]

    await port.listTestSpaces()
    await port.terminateTestSpace({ spaceId: 'space-a' })

    expect(port.calls).toEqual([
      { operation: 'listTestSpaces', input: undefined },
      { operation: 'terminateTestSpace', input: { spaceId: 'space-a' } },
    ])
  })

  it('创建把新空间追加进列表，删除把它移出列表', async () => {
    const port = new FakeTestSpacePort()
    port.spaces = [space()]

    const created = await port.createTestSpace()
    expect((await port.listTestSpaces()).map(({ id }) => id)).toEqual(['space-a', created.id])

    await port.deleteTestSpace({ spaceId: created.id })
    expect((await port.listTestSpaces()).map(({ id }) => id)).toEqual(['space-a'])
  })

  it('按操作注入失败，只影响下一次调用', async () => {
    const port = new FakeTestSpacePort()
    port.spaces = [space()]
    port.rejectNext('takeOverTestSpace', new Error('空间已被接管'))

    await expect(port.takeOverTestSpace({ spaceId: 'space-a' })).rejects.toThrow('空间已被接管')
    await expect(port.takeOverTestSpace({ spaceId: 'space-a' })).resolves.toMatchObject({ id: 'space-a' })
  })
})
