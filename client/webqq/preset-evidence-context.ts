import type { SandboxBotProfile, SandboxConversation, SandboxGroup } from '../../src/types'

export interface PresetEvidenceBotOption {
  id: string
  name: string
}

export function resolvePresetEvidenceBots(
  conversation: SandboxConversation | undefined,
  group: SandboxGroup | undefined,
  bots: readonly SandboxBotProfile[],
): PresetEvidenceBotOption[] {
  if (!conversation) return []
  const candidateIds = conversation.type === 'direct'
    ? conversation.participantIds
    : group?.members.map(({ participantId }) => participantId) ?? []
  const botById = new Map(bots.map((bot) => [bot.id, bot]))
  return [...new Set(candidateIds)].flatMap((id) => {
    const bot = botById.get(id)
    return bot ? [{ id: bot.id, name: bot.name }] : []
  })
}
