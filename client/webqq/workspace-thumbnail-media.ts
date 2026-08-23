import type { SandboxSnapshot } from '../../src/types'

const MEDIA_REF = /^sandbox-media:\/\/([a-f0-9]{32})$/

export function thumbnailMediaCacheKey(spaceId: string | undefined, mediaId: string) {
  return `${spaceId ?? 'main'}:${mediaId}`
}

export function collectAvatarMediaIds(snapshot: Pick<SandboxSnapshot, 'participants' | 'groups'>) {
  return [...new Set(
    [...snapshot.participants.map(({ avatar }) => avatar), ...snapshot.groups.map(({ avatar }) => avatar)]
      .flatMap((reference) => reference?.match(MEDIA_REF)?.[1] ?? []),
  )]
}

export function resolveThumbnailAvatar(
  reference: string | undefined,
  mediaSources: Record<string, string>,
  previous?: string,
) {
  const id = reference?.match(MEDIA_REF)?.[1]
  if (!id) return reference ?? ''
  if (mediaSources[id]) return mediaSources[id]
  // 轮询会带回 sandbox-media 引用；已成功的 data URL 必须保留，否则缩略图会闪回字母头像。
  if (previous?.startsWith('data:')) return previous
  return ''
}

export function mediaSourcesFromCache(
  mediaIds: readonly string[],
  cache: Map<string, string>,
  spaceId?: string,
) {
  return Object.fromEntries(mediaIds.flatMap((id) => {
    const cached = cache.get(thumbnailMediaCacheKey(spaceId, id))
    return cached ? [[id, cached]] : []
  }))
}

export function applyThumbnailAvatars(
  snapshot: SandboxSnapshot,
  mediaSources: Record<string, string>,
  previous?: Pick<SandboxSnapshot, 'participants' | 'groups'>,
): SandboxSnapshot {
  const previousParticipants = Object.fromEntries(previous?.participants.map(({ id, avatar }) => [id, avatar]) ?? [])
  const previousGroups = Object.fromEntries(previous?.groups.map(({ id, avatar }) => [id, avatar]) ?? [])
  return {
    ...snapshot,
    participants: snapshot.participants.map((participant) => ({
      ...participant,
      avatar: resolveThumbnailAvatar(participant.avatar, mediaSources, previousParticipants[participant.id]),
    })),
    groups: snapshot.groups.map((group) => ({
      ...group,
      avatar: resolveThumbnailAvatar(group.avatar, mediaSources, previousGroups[group.id]),
    })),
  }
}
