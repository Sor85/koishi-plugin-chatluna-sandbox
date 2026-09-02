import { ref } from 'vue'
import type { SandboxAppearance, SandboxSnapshot } from '../../src/types'
import type { WorkspacePort } from '#client/workspace/port'
import {
  applyThumbnailAvatars,
  collectAvatarMediaIds,
  mediaSourcesFromCache,
  thumbnailMediaCacheKey,
} from './thumbnail-media'
import { buildWorkspaceThumbnailModels, type WorkspaceThumbnailModels } from './thumbnail-model'

/** 一张待绘制的缩略图：`key` 是总览网格里的卡片键，`spaceId` 省略时表示主环境。 */
export interface WorkspaceThumbnailSource {
  key: string
  spaceId?: string
  snapshot: SandboxSnapshot
}

/** 缩略图没有当前操作者的概念，取第一个普通用户、否则取第一个参与者来读媒体。 */
function previewOperatorId(snapshot: Pick<SandboxSnapshot, 'participants'>) {
  return snapshot.participants.find(({ kind }) => kind === 'user')?.id
    ?? snapshot.participants[0]?.id
    ?? ''
}

/**
 * 把完整工作区快照投影成缩略图区域模型，并按需补齐头像媒体。缩略图组件因此只收三个
 * 区域模型：整个工作区的读取与媒体解析都发生在这里，可以脱离浏览器执行。
 */
export function createWorkspaceThumbnailProjection(port: WorkspacePort) {
  /**
   * 已解析的头像媒体，键含 spaceId 所以不跨空间串味。用响应式记录而不是 Map：
   * 媒体到达后必须让读过它的 computed 重算，Map 的写入 Vue 看不见。
   * 它只增不删，所以轮询带回原始 `sandbox-media://` 引用时仍能同步换回 data URL，
   * 不会先闪回字母头像。
   */
  const mediaCache = ref<Record<string, string>>({})
  let generation = 0

  function buildModels(
    sources: readonly WorkspaceThumbnailSource[],
    appearance: SandboxAppearance,
    colorMode: 'light' | 'dark',
  ): Record<string, WorkspaceThumbnailModels> {
    const cache = mediaCache.value
    return Object.fromEntries(sources.map((source) => {
      const mediaSources = mediaSourcesFromCache(collectAvatarMediaIds(source.snapshot), cache, source.spaceId)
      const resolved = applyThumbnailAvatars(source.snapshot, mediaSources)
      return [source.key, buildWorkspaceThumbnailModels(resolved, appearance, colorMode)]
    }))
  }

  async function loadMissingMedia(sources: readonly WorkspaceThumbnailSource[]) {
    const current = ++generation
    const requests = sources.flatMap((source) => {
      const operatorId = previewOperatorId(source.snapshot)
      if (!operatorId) return []
      return collectAvatarMediaIds(source.snapshot)
        .filter((mediaId) => !(thumbnailMediaCacheKey(source.spaceId, mediaId) in mediaCache.value))
        .map((mediaId) => ({ mediaId, operatorId, spaceId: source.spaceId }))
    })
    if (!requests.length) return
    const loaded: Record<string, string> = {}
    await Promise.all(requests.map(async ({ mediaId, operatorId, spaceId }) => {
      try {
        const content = await port.getMediaContent({ spaceId, operatorId, mediaId })
        loaded[thumbnailMediaCacheKey(spaceId, mediaId)] = `data:${content.mimeType};base64,${content.dataBase64}`
      } catch {
        // 单张头像读失败只让它退回字母头像，不影响同批其余头像。
      }
    }))
    // 轮询期间可能已经发起了新一轮解析；旧一轮不再写缓存，避免用过期结果覆盖新结果。
    if (current !== generation || !Object.keys(loaded).length) return
    mediaCache.value = { ...mediaCache.value, ...loaded }
  }

  return { buildModels, loadMissingMedia }
}
