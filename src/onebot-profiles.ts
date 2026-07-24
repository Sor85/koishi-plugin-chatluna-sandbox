import type { SandboxImplementationProfile } from './types'

export type SandboxOneBotCapabilitySurface = 'standard' | 'native'

export interface SandboxOneBotCapability {
  action: string
  aliases?: string[]
  surface: SandboxOneBotCapabilitySurface
  supported: boolean
  reason?: string
}

export interface SandboxOneBotProfileBaseline {
  id: SandboxImplementationProfile
  label: string
  snapshotDate: string
  sourceRevision: string
  appName: string
  appVersion: string
  capabilities: SandboxOneBotCapability[]
}

export interface SandboxOneBotMessageEventFields {
  message_id: number
  message_seq: number
  real_id?: number
  message_format: 'array'
  font: number
}

const standardActions = [
  'get_status',
  'get_login_info',
  'get_version_info',
  'get_friend_list',
  'get_group_list',
  'get_group_info',
  'get_group_member_info',
  'get_group_member_list',
  'send_private_msg',
  'send_group_msg',
  'send_msg',
  'get_msg',
  'delete_msg',
  'set_group_kick',
  'set_group_admin',
  'set_group_card',
  'set_group_name',
  'set_friend_add_request',
  'set_group_add_request',
] as const

const nativeActions: SandboxOneBotCapability[] = [
  { action: 'get_stranger_info', surface: 'native', supported: true },
  { action: 'delete_friend', surface: 'native', supported: true },
  { action: 'set_group_owner', surface: 'native', supported: true },
  { action: 'set_qq_profile', surface: 'native', supported: true },
  { action: 'set_qq_avatar', surface: 'native', supported: true },
  { action: 'send_poke', aliases: ['friend_poke', 'group_poke'], surface: 'native', supported: true },
]

function createCapabilities(unsupported: SandboxOneBotCapability[]): SandboxOneBotCapability[] {
  return [
    ...standardActions.map((action) => ({ action, surface: 'standard' as const, supported: true })),
    ...nativeActions,
    ...unsupported,
  ]
}

const baselines: Record<SandboxImplementationProfile, SandboxOneBotProfileBaseline> = {
  napcat: {
    id: 'napcat',
    label: 'NapCat',
    snapshotDate: '2026-07-24',
    sourceRevision: '33546b936e008c017b2b9c1c41a0bb4f9e86c5be',
    appName: 'NapCat.Onebot',
    appVersion: 'sandbox-2026.07.24',
    capabilities: createCapabilities([
      { action: 'get_ai_characters', surface: 'native', supported: false, reason: '沙盒未模拟 NapCat 群聊 AI 声聊资源' },
    ]),
  },
  llbot: {
    id: 'llbot',
    label: 'LLBot',
    snapshotDate: '2026-07-24',
    sourceRevision: 'd6e2f485b8164597d04a2907d307739ecfcf4a55',
    appName: 'LLOneBot',
    appVersion: 'sandbox-2026.07.24',
    capabilities: createCapabilities([
      { action: 'get_flash_file_info', surface: 'native', supported: false, reason: '沙盒未模拟 LLBot 闪传文件' },
    ]),
  },
}

export function getOneBotProfileBaseline(profile: SandboxImplementationProfile): SandboxOneBotProfileBaseline {
  return structuredClone(baselines[profile])
}

export function getOneBotCapabilityMatrix(
  profile: SandboxImplementationProfile,
  disabledCapabilities: readonly string[] = [],
): SandboxOneBotCapability[] {
  const disabled = new Set(disabledCapabilities)
  return getOneBotProfileBaseline(profile).capabilities.map((capability) => disabled.has(capability.action)
    ? { ...capability, supported: false, reason: '已被机器人能力覆盖禁用' }
    : capability)
}

export function resolveOneBotAction(
  profile: SandboxImplementationProfile,
  disabledCapabilities: readonly string[],
  action: string,
): string {
  const baseline = baselines[profile]
  const capability = baseline.capabilities.find((item) => item.action === action || item.aliases?.includes(action))
  if (!capability) throw new Error(`${baseline.label} 基线不支持 OneBot action：${action}`)
  if (disabledCapabilities.includes(capability.action)) throw new Error(`能力已被禁用：${capability.action}`)
  if (!capability.supported) throw new Error(`${baseline.label} 暂不支持 ${capability.action}：${capability.reason}`)
  return capability.action
}

export function normalizeDisabledCapabilities(
  profile: SandboxImplementationProfile,
  values: readonly string[] | undefined,
): string[] | undefined {
  if (!values?.length) return undefined
  const supported = new Set(baselines[profile].capabilities.filter(({ supported }) => supported).map(({ action }) => action))
  const normalized = [...new Set(values.map((value) => value.trim()).filter(Boolean))]
  const unknown = normalized.find((action) => !supported.has(action))
  if (unknown) throw new Error(`${baselines[profile].label} 基线中不存在可禁用能力：${unknown}`)
  return normalized.length ? normalized : undefined
}

export function getOneBotMessageSequence(messageId: string): number {
  if (!/^[\da-f]+$/i.test(messageId)) throw new Error(`消息 ID 不是十六进制：${messageId}`)
  return Number.parseInt(messageId, 16)
}

export function getOneBotMessageEventFields(
  profile: SandboxImplementationProfile,
  messageId: string,
): SandboxOneBotMessageEventFields {
  const sequence = getOneBotMessageSequence(messageId)
  const common = { message_id: sequence, message_seq: sequence, message_format: 'array' as const, font: 0 }
  return profile === 'napcat' ? { ...common, real_id: sequence } : common
}
