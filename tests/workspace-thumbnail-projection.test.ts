import { describe, expect, it } from 'vitest'
import { FakeWorkspacePort } from '../client/webqq/fake-workspace-port'
import { createWorkspaceThumbnailProjection } from '../client/webqq/workspace-thumbnail-projection'
import type { SandboxAppearance, SandboxSnapshot, SandboxWorkspaceState } from '../src/types'

const appearance = {
  sandboxAccentColor: '#3b82f6',
  enableSandboxFrostedGlass: false,
  sandboxTimBubbleTail: false,
} as unknown as SandboxAppearance

const MEDIA_ID = 'a'.repeat(32)
const OTHER_MEDIA_ID = 'b'.repeat(32)

function snapshot(overrides: Partial<SandboxSnapshot> = {}): SandboxSnapshot {
  return {
    revision: 1,
    participants: [],
    groups: [],
    conversations: [],
    messages: [],
    friendships: [],
    requests: [],
    ...overrides,
  }
}

function user(id: string, avatar?: string) {
  return { id, name: `用户${id}`, kind: 'user' as const, avatar }
}

function createPort() {
  const port = new FakeWorkspacePort({ snapshot: snapshot() } as unknown as SandboxWorkspaceState)
  port.mediaContentResult = { ...port.mediaContentResult, mimeType: 'image/png', dataBase64: 'UE5H' }
  return port
}

describe('缩略图投影', () => {
  it('按 key 交出每个空间的三个区域模型', () => {
    const projection = createWorkspaceThumbnailProjection(createPort())

    const models = projection.buildModels([
      { key: 'main', snapshot: snapshot({ participants: [user('10001')] }) },
      { key: 'space-a', spaceId: 'space-a', snapshot: snapshot({ participants: [user('10002')] }) },
    ], appearance, 'light')

    expect(Object.keys(models)).toEqual(['main', 'space-a'])
    expect(Object.keys(models.main!)).toEqual(['sidebar', 'chatPane', 'detailsPanel'])
  })

  it('按显式 spaceId 读媒体，主环境省略 spaceId', async () => {
    const port = createPort()
    const projection = createWorkspaceThumbnailProjection(port)
    const sources = [
      { key: 'main', snapshot: snapshot({ participants: [user('10001', `sandbox-media://${MEDIA_ID}`)] }) },
      { key: 'space-a', spaceId: 'space-a', snapshot: snapshot({ participants: [user('10002', `sandbox-media://${OTHER_MEDIA_ID}`)] }) },
    ]

    await projection.loadMissingMedia(sources)

    expect(port.calls.map(({ input }) => input)).toEqual([
      { spaceId: undefined, operatorId: '10001', mediaId: MEDIA_ID },
      { spaceId: 'space-a', operatorId: '10002', mediaId: OTHER_MEDIA_ID },
    ])
  })

  it('媒体到达后区域模型换成 data URL 头像', async () => {
    const port = createPort()
    const projection = createWorkspaceThumbnailProjection(port)
    const sources = [{ key: 'main', snapshot: snapshot({ participants: [user('10001', `sandbox-media://${MEDIA_ID}`)] }) }]

    expect(projection.buildModels(sources, appearance, 'light').main!.sidebar.participants['10001']?.avatar).toBe('')
    await projection.loadMissingMedia(sources)

    expect(projection.buildModels(sources, appearance, 'light').main!.sidebar.participants['10001']?.avatar)
      .toBe('data:image/png;base64,UE5H')
  })

  it('已缓存的媒体不再重复请求', async () => {
    const port = createPort()
    const projection = createWorkspaceThumbnailProjection(port)
    const sources = [{ key: 'main', snapshot: snapshot({ participants: [user('10001', `sandbox-media://${MEDIA_ID}`)] }) }]

    await projection.loadMissingMedia(sources)
    await projection.loadMissingMedia(sources)

    expect(port.calls).toHaveLength(1)
  })

  it('同一媒体 ID 在不同空间各读一次，缓存不跨空间串味', async () => {
    const port = createPort()
    const projection = createWorkspaceThumbnailProjection(port)
    const sources = [
      { key: 'main', snapshot: snapshot({ participants: [user('10001', `sandbox-media://${MEDIA_ID}`)] }) },
      { key: 'space-a', spaceId: 'space-a', snapshot: snapshot({ participants: [user('10002', `sandbox-media://${MEDIA_ID}`)] }) },
    ]

    await projection.loadMissingMedia(sources)

    expect(port.calls).toHaveLength(2)
  })

  it('没有参与者可充当读取者时不发请求', async () => {
    const port = createPort()
    const projection = createWorkspaceThumbnailProjection(port)

    await projection.loadMissingMedia([{ key: 'main', snapshot: snapshot() }])

    expect(port.calls).toEqual([])
  })

  it('单张头像读失败不影响同批其余头像', async () => {
    const port = createPort()
    port.rejectNext('getMediaContent', new Error('媒体不存在'))
    const projection = createWorkspaceThumbnailProjection(port)
    const sources = [{
      key: 'main',
      snapshot: snapshot({ participants: [user('10001', `sandbox-media://${MEDIA_ID}`), user('10002', `sandbox-media://${OTHER_MEDIA_ID}`)] }),
    }]

    await projection.loadMissingMedia(sources)

    const models = projection.buildModels(sources, appearance, 'light')
    expect(port.calls).toHaveLength(2)
    expect(models.main!.sidebar.participants['10001']?.avatar).toBe('')
  })

  it('轮询带回 sandbox-media 引用时保留已解析的 data URL，不闪回字母头像', async () => {
    const port = createPort()
    const projection = createWorkspaceThumbnailProjection(port)
    const participants = [user('10001', `sandbox-media://${MEDIA_ID}`)]
    const first = [{ key: 'main', snapshot: snapshot({ participants }) }]

    await projection.loadMissingMedia(first)
    projection.buildModels(first, appearance, 'light')
    // 下一轮轮询返回同一份原始引用，投影必须沿用上一轮已解析的结果。
    const second = [{ key: 'main', snapshot: snapshot({ revision: 2, participants }) }]

    expect(projection.buildModels(second, appearance, 'light').main!.sidebar.participants['10001']?.avatar)
      .toBe('data:image/png;base64,UE5H')
  })
})
