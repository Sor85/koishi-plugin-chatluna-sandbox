<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent :style="{ '--webqq-accent': accentColor }">
      <DialogHeader>
        <DialogTitle>{{ dialogTitle }}</DialogTitle>
        <DialogDescription>{{ dialogDescription }}</DialogDescription>
      </DialogHeader>

      <form v-if="mode === 'edit'" class="webqq-secondary-form" @submit.prevent="submitEdit">
        <div class="webqq-secondary-field">
          <Label :for="`${fieldPrefix}-id`">{{ target?.type === 'group' ? '群号' : 'QQ ID' }}</Label>
          <Input
            :id="`${fieldPrefix}-id`"
            :model-value="draft.id"
            class="border-slate-200 focus-visible:border-[var(--webqq-accent)] focus-visible:ring-[color-mix(in_srgb,var(--webqq-accent)_18%,transparent)] dark:border-slate-700"
            disabled
          />
        </div>
        <div class="webqq-secondary-field">
          <Label :for="`${fieldPrefix}-name`">{{ nameLabel }}</Label>
          <Input
            :id="`${fieldPrefix}-name`"
            v-model="draft.name"
            class="border-slate-200 focus-visible:border-[var(--webqq-accent)] focus-visible:ring-[color-mix(in_srgb,var(--webqq-accent)_18%,transparent)] dark:border-slate-700"
            required
          />
        </div>

        <template v-if="target?.type === 'bot'">
          <div class="webqq-secondary-field">
            <Label :for="`${fieldPrefix}-implementation`">实现配置</Label>
            <Select v-model="draft.implementation">
              <SelectTrigger
                :id="`${fieldPrefix}-implementation`"
                class="w-full border-slate-200 focus-visible:border-[var(--webqq-accent)] focus-visible:ring-[color-mix(in_srgb,var(--webqq-accent)_18%,transparent)] dark:border-slate-700"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent :portal-to="selectPortalTarget" class="w-[var(--reka-select-trigger-width)] border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                <SelectItem value="napcat">NapCat</SelectItem>
                <SelectItem value="llbot">LLBot</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="grid gap-2">
            <div class="grid gap-1">
              <Label>能力覆盖</Label>
            </div>
            <div class="relative">
              <span class="pointer-events-none absolute inset-y-0 left-3 flex items-center" aria-hidden="true">
                <IconSearch class="size-4 text-slate-400" />
              </span>
              <Input
                v-model="capabilitySearch"
                class="border-slate-200 pl-9 focus-visible:border-[var(--webqq-accent)] focus-visible:ring-[color-mix(in_srgb,var(--webqq-accent)_18%,transparent)] dark:border-slate-700"
                placeholder="搜索 action、别名或作用"
                aria-label="搜索能力覆盖"
              />
            </div>
            <div class="grid max-h-48 gap-2 overflow-y-auto rounded-lg bg-slate-50 p-3 dark:bg-slate-900/60">
              <label
                v-for="capability in filteredCapabilities"
                :key="capability.id"
                class="flex items-start gap-2"
              >
                <Checkbox
                  :model-value="capability.supported && !draft.disabledCapabilities.includes(capability.id)"
                  :disabled="!capability.supported"
                  class="mt-0.5 border-slate-300 data-[state=checked]:border-[var(--webqq-accent)] data-[state=checked]:bg-[var(--webqq-accent)] data-[state=checked]:text-white dark:border-slate-600"
                  @update:model-value="setCapabilityEnabled(capability.id, $event === true)"
                />
                <span class="grid min-w-0 gap-0.5">
                  <span class="flex min-w-0 items-center gap-1.5">
                    <span class="min-w-0 truncate text-sm">{{ capability.action }}</span>
                    <Badge variant="secondary" class="shrink-0">
                      {{ capability.surface === 'standard' ? '标准能力' : '原生扩展' }}
                    </Badge>
                  </span>
                  <span class="text-xs leading-5 text-slate-600 dark:text-slate-300">{{ capability.description }}</span>
                  <small v-if="capability.aliases?.length || !capability.supported" class="text-xs text-slate-500 dark:text-slate-400">
                    <template v-if="capability.aliases?.length">别名 {{ capability.aliases.join('、') }}</template>
                    <template v-if="capability.aliases?.length && !capability.supported"> · </template>
                    <template v-if="!capability.supported">{{ capability.reason }}</template>
                  </small>
                </span>
              </label>
              <p v-if="!filteredCapabilities.length" class="m-0 py-3 text-center text-xs text-slate-500 dark:text-slate-400">
                没有匹配的能力
              </p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <Checkbox
              :id="`${fieldPrefix}-enabled`"
              v-model="draft.enabled"
              class="data-[state=checked]:border-[var(--webqq-accent)] data-[state=checked]:bg-[var(--webqq-accent)] data-[state=checked]:text-white"
            />
            <Label :for="`${fieldPrefix}-enabled`">启用机器人</Label>
          </div>
        </template>

        <section v-if="target?.type === 'group'" class="grid gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
          <div class="flex items-center justify-between gap-3">
            <strong class="text-sm">群成员</strong>
            <Button type="button" variant="ghost" size="sm" @click="addGroupMember">
              <IconPlus aria-hidden="true" /> 添加成员
            </Button>
          </div>
          <div v-for="(member, index) in draft.members" :key="`${member.participantId}:${index}`" class="grid grid-cols-[minmax(0,1fr)_110px_32px] gap-2">
            <Select v-model="member.participantId">
              <SelectTrigger :aria-label="`第 ${index + 1} 位群成员`" class="w-full border-slate-200 focus-visible:border-[var(--webqq-accent)] focus-visible:ring-[color-mix(in_srgb,var(--webqq-accent)_18%,transparent)] dark:border-slate-700">
                <SelectValue placeholder="选择参与者" />
              </SelectTrigger>
              <SelectContent :portal-to="selectPortalTarget" class="w-[var(--reka-select-trigger-width)] border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                <SelectItem v-for="participant in participants" :key="participant.id" :value="participant.id">
                  {{ participant.name }}（{{ participant.id }}）
                </SelectItem>
              </SelectContent>
            </Select>
            <Select v-model="member.role">
              <SelectTrigger :aria-label="`第 ${index + 1} 位群角色`" class="w-full border-slate-200 focus-visible:border-[var(--webqq-accent)] focus-visible:ring-[color-mix(in_srgb,var(--webqq-accent)_18%,transparent)] dark:border-slate-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent :portal-to="selectPortalTarget" class="w-[var(--reka-select-trigger-width)] border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                <SelectItem value="owner">群主</SelectItem>
                <SelectItem value="admin">管理员</SelectItem>
                <SelectItem value="member">成员</SelectItem>
              </SelectContent>
            </Select>
            <Button type="button" variant="ghost" size="icon-sm" class="text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/40" :aria-label="`移除第 ${index + 1} 位成员`" @click="removeGroupMember(index)">
              <IconTrash aria-hidden="true" />
            </Button>
            <Input
              v-model="member.card"
              class="col-span-3 border-slate-200 focus-visible:border-[var(--webqq-accent)] focus-visible:ring-[color-mix(in_srgb,var(--webqq-accent)_18%,transparent)] dark:border-slate-700"
              :aria-label="`第 ${index + 1} 位群名片`"
              placeholder="群名片"
            />
          </div>
          <p v-if="!draft.members.length" class="m-0 text-xs text-slate-500">至少添加一位普通用户作为群主。</p>
        </section>

        <p v-if="errorMessage" class="m-0 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/50 dark:text-red-300" role="alert">
          {{ errorMessage }}
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" class="border-slate-200 bg-white hover:bg-slate-100 focus-visible:border-[var(--webqq-accent)] focus-visible:ring-[color-mix(in_srgb,var(--webqq-accent)_18%,transparent)] dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800" @click="emit('update:open', false)">取消</Button>
          <Button type="submit" class="bg-[var(--webqq-accent)] text-white hover:opacity-90" :disabled="busy">{{ busy ? '保存中...' : '保存' }}</Button>
        </DialogFooter>
      </form>

      <div v-else class="webqq-secondary-form">
        <p class="m-0 text-sm leading-6 text-slate-600 dark:text-slate-300">{{ deleteMessage }}</p>
        <p v-if="errorMessage" class="m-0 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/50 dark:text-red-300" role="alert">
          {{ errorMessage }}
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" class="border-slate-200 bg-white hover:bg-slate-100 focus-visible:border-[var(--webqq-accent)] focus-visible:ring-[color-mix(in_srgb,var(--webqq-accent)_18%,transparent)] dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800" @click="emit('update:open', false)">取消</Button>
          <Button type="button" variant="destructive" class="bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500/20 dark:bg-red-600 dark:hover:bg-red-500" :disabled="busy" @click="submitDelete">{{ busy ? '删除中...' : '确认删除' }}</Button>
        </DialogFooter>
      </div>
      <!-- Select 必须挂在 Dialog 内部，否则 reka-ui 的默认 Portal 层级会落到遮罩下方。绝对定位宿主不参与 Dialog 高度计算。 -->
      <div
        ref="selectPortalTarget"
        class="pointer-events-none absolute inset-0 z-[170] [&_[data-reka-popper-content-wrapper]]:pointer-events-auto"
      />
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { IconPlus, IconSearch, IconTrash } from '@tabler/icons-vue'
import { computed, reactive, ref, watch } from 'vue'
import { Badge } from './components/ui/badge'
import { Button } from './components/ui/button'
import { Checkbox } from './components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './components/ui/dialog'
import { Input } from './components/ui/input'
import { Label } from './components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select'
import { getOneBotProfileBaseline } from '../src/onebot-profiles'
import type {
  ManageSandboxEnvironmentInput,
  SandboxBotProfile,
  SandboxGroup,
  SandboxGroupMember,
  SandboxImplementationProfile,
  SandboxUser,
} from '../src/types'

type EntityType = 'user' | 'bot' | 'group'
type DialogMode = 'edit' | 'delete'

const props = defineProps<{
  open: boolean
  mode: DialogMode
  target?: { type: EntityType, id: string }
  users: SandboxUser[]
  bots: SandboxBotProfile[]
  groups: SandboxGroup[]
  accentColor: string
}>()
const emit = defineEmits<{
  'update:open': [open: boolean]
  submit: [input: ManageSandboxEnvironmentInput, resolve: () => void, reject: (error: unknown) => void]
}>()

const busy = ref(false)
const errorMessage = ref('')
const capabilitySearch = ref('')
const selectPortalTarget = ref<HTMLElement | null>(null)
const draft = reactive<{
  id: string
  name: string
  implementation: SandboxImplementationProfile
  enabled: boolean
  disabledCapabilities: string[]
  members: SandboxGroupMember[]
}>({ id: '', name: '', implementation: 'napcat', enabled: true, disabledCapabilities: [], members: [] })

const entity = computed(() => {
  if (props.target?.type === 'user') return props.users.find(({ id }) => id === props.target?.id)
  if (props.target?.type === 'bot') return props.bots.find(({ id }) => id === props.target?.id)
  if (props.target?.type === 'group') return props.groups.find(({ id }) => id === props.target?.id)
  return undefined
})
const participants = computed(() => [
  ...props.users.map((user) => ({ ...user, type: 'user' as const })),
  ...props.bots.map((bot) => ({ ...bot, type: 'bot' as const })),
])
const entityLabel = computed(() => props.target?.type === 'user' ? '用户' : props.target?.type === 'bot' ? '机器人' : '群组')
const dialogTitle = computed(() => `${props.mode === 'edit' ? '编辑' : '删除'}${entityLabel.value}`)
const dialogDescription = computed(() => props.mode === 'edit' ? '账号 ID 创建后不可修改。' : '此操作会同步移除相关会话和关系。')
const deleteMessage = computed(() => {
  const name = entity.value?.name ?? props.target?.id ?? ''
  if (props.target?.type === 'user') return `删除用户“${name}”及其关联会话？若其为群主，所属群组也会删除。`
  return `删除${entityLabel.value}“${name}”及其关联会话？`
})
const nameLabel = computed(() => props.target?.type === 'user' ? '用户昵称' : props.target?.type === 'bot' ? '机器人昵称' : '群名称')
const fieldPrefix = computed(() => `environment-${props.target?.type ?? 'entity'}-edit`)
const profileBaseline = computed(() => getOneBotProfileBaseline(draft.implementation))
const filteredCapabilities = computed(() => {
  const query = capabilitySearch.value.trim().toLowerCase()
  if (!query) return profileBaseline.value.capabilities
  return profileBaseline.value.capabilities.filter((capability) => [
    capability.id,
    capability.action,
    capability.description,
    capability.reason,
    ...(capability.aliases ?? []),
  ].some((value) => value?.toLowerCase().includes(query)))
})

watch([() => props.open, () => props.target], ([open]) => {
  if (!open) return
  errorMessage.value = ''
  capabilitySearch.value = ''
  if (props.target?.type === 'user') {
    const value = props.users.find(({ id }) => id === props.target?.id)
    if (!value) return
    Object.assign(draft, { id: value.id, name: value.name, implementation: 'napcat', enabled: true, disabledCapabilities: [], members: [] })
  } else if (props.target?.type === 'bot') {
    const value = props.bots.find(({ id }) => id === props.target?.id)
    if (!value) return
    Object.assign(draft, { ...value, disabledCapabilities: value.disabledCapabilities ?? [], members: [] })
  } else if (props.target?.type === 'group') {
    const value = props.groups.find(({ id }) => id === props.target?.id)
    if (!value) return
    Object.assign(draft, { id: value.id, name: value.name, implementation: 'napcat', enabled: true, disabledCapabilities: [], members: value.members.map((member) => ({ ...member })) })
  }
}, { immediate: true })

async function runAction(input: ManageSandboxEnvironmentInput) {
  if (busy.value) return
  busy.value = true
  errorMessage.value = ''
  try {
    await new Promise<void>((resolve, reject) => emit('submit', input, resolve, reject))
    emit('update:open', false)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '环境管理失败'
  } finally {
    busy.value = false
  }
}

async function submitEdit() {
  if (props.target?.type === 'user') {
    await runAction({ action: 'update-user', data: { id: draft.id, name: draft.name } })
  } else if (props.target?.type === 'bot') {
    await runAction({
      action: 'update-bot',
      data: {
        id: draft.id,
        name: draft.name,
        implementation: draft.implementation,
        enabled: draft.enabled,
        disabledCapabilities: [...draft.disabledCapabilities],
      },
    })
  } else if (props.target?.type === 'group') {
    await runAction({ action: 'update-group', data: { id: draft.id, name: draft.name, members: draft.members.map((member) => ({ ...member })) } })
  }
}

function setCapabilityEnabled(capabilityId: string, enabled: boolean) {
  draft.disabledCapabilities = enabled
    ? draft.disabledCapabilities.filter((value) => value !== capabilityId)
    : [...new Set([...draft.disabledCapabilities, capabilityId])]
}

async function submitDelete() {
  if (!props.target) return
  if (props.target.type === 'user') await runAction({ action: 'delete-user', data: { id: props.target.id } })
  if (props.target.type === 'bot') await runAction({ action: 'delete-bot', data: { id: props.target.id } })
  if (props.target.type === 'group') await runAction({ action: 'delete-group', data: { id: props.target.id } })
}

function addGroupMember() {
  const participant = participants.value.find(({ id }) => !draft.members.some(({ participantId }) => participantId === id))
  if (!participant) return
  const hasOwner = draft.members.some(({ role }) => role === 'owner')
  draft.members.push({ participantId: participant.id, card: participant.name, role: hasOwner ? 'member' : 'owner' })
}

function removeGroupMember(index: number) {
  draft.members.splice(index, 1)
}

</script>
