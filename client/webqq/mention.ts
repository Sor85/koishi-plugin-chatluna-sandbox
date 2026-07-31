export interface ComposerMention {
  id: string
  name: string
}

export function addComposerMention(mentions: readonly ComposerMention[], mention: ComposerMention): ComposerMention[] {
  if (mentions.some(({ id }) => id === mention.id)) return [...mentions]
  return [...mentions, mention]
}

export function buildMentionContent(mentions: readonly ComposerMention[], input: string): string {
  const mentionContent = mentions.map(({ id }) => `<at id="${id}"/>`).join(' ')
  return [mentionContent, input.trim()].filter(Boolean).join(' ')
}

export function formatMentionContent(content: string, participantNames: Readonly<Record<string, string>>): string {
  return content.replace(/<at\s+id="([^"]+)"\s*\/>/g, (_, id: string) => `@${participantNames[id] ?? id}`)
}
