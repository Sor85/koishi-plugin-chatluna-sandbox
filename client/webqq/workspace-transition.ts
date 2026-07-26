export function createWorkspaceLayoutId(spaceId?: string): string {
  return `webqq-space-${spaceId ?? 'main'}`
}
