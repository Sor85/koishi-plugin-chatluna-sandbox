<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent :style="{ '--webqq-accent': accentColor }">
      <header class="grid gap-1 pr-8">
        <DialogTitle>{{ dialogTitle }}</DialogTitle>
        <DialogDescription>{{ dialogDescription }}</DialogDescription>
      </header>

      <form v-if="mode === 'edit'" class="grid gap-4" @submit.prevent="submitEdit">
        <div class="grid gap-1.5">
          <Label :for="`${fieldPrefix}-id`">{{ target?.type === 'group' ? '群号' : 'QQ ID' }}</Label>
          <Input
            :id="`${fieldPrefix}-id`"
            :model-value="draft.id"
            class="border-slate-200 focus-visible:border-[var(--webqq-accent)] focus-visible:ring-[color-mix(in_srgb,var(--webqq-accent)_18%,transparent)] dark:border-slate-700"
            disabled
          />
        </div>
        <div class="grid gap-1.5">
          <Label :for="`${fieldPrefix}-name`">{{ nameLabel }}</Label>
          <Input
            :id="`${fieldPrefix}-name`"
            v-model="draft.name"
            class="border-slate-200 focus-visible:border-[var(--webqq-accent)] focus-visible:ring-[color-mix(in_srgb,var(--webqq-accent)_18%,transparent)] dark:border-slate-700"
            required
          />
        </div>

        <template v-if="target?.type === 'bot'">
          <div class="grid gap-1.5">
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
            <Select v-model="member.participantId" @update:model-value="normalizeMemberRole(member)">
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
                <SelectItem value="owner" :disabled="isBotParticipant(member.participantId)">群主</SelectItem>
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
        <footer class="flex justify-end gap-2">
          <Button type="button" variant="outline" class="border-slate-200 bg-white hover:bg-slate-100 focus-visible:border-[var(--webqq-accent)] focus-visible:ring-[color-mix(in_srgb,var(--webqq-accent)_18%,transparent)] dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800" @click="emit('update:open', false)">取消</Button>
          <Button type="submit" class="bg-[var(--webqq-accent)] text-white hover:opacity-90" :disabled="busy">{{ busy ? '保存中...' : '保存' }}</Button>
        </footer>
      </form>

      <div v-else class="grid gap-4">
        <p class="m-0 text-sm leading-6 text-slate-600 dark:text-slate-300">{{ deleteMessage }}</p>
        <p v-if="errorMessage" class="m-0 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/50 dark:text-red-300" role="alert">
          {{ errorMessage }}
        </p>
        <footer class="flex justify-end gap-2">
          <Button type="button" variant="outline" class="border-slate-200 bg-white hover:bg-slate-100 focus-visible:border-[var(--webqq-accent)] focus-visible:ring-[color-mix(in_srgb,var(--webqq-accent)_18%,transparent)] dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800" @click="emit('update:open', false)">取消</Button>
          <Button type="button" variant="destructive" :disabled="busy" @click="submitDelete">{{ busy ? '删除中...' : '确认删除' }}</Button>
        </footer>
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
import { IconPlus, IconTrash } from '@tabler/icons-vue'
import { computed, reactive, ref, watch } from 'vue'
import { Button } from './components/ui/button'
import { Checkbox } from './components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './components/ui/dialog'
import { Input } from './components/ui/input'
import { Label } from './components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select'
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
const selectPortalTarget = ref<HTMLElement | null>(null)
const draft = reactive<{
  id: string
  name: string
  implementation: SandboxImplementationProfile
  enabled: boolean
  members: SandboxGroupMember[]
}>({ id: '', name: '', implementation: 'napcat', enabled: true, members: [] })

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

watch([() => props.open, () => props.target], ([open]) => {
  if (!open) return
  errorMessage.value = ''
  if (props.target?.type === 'user') {
    const value = props.users.find(({ id }) => id === props.target?.id)
    if (!value) return
    Object.assign(draft, { id: value.id, name: value.name, implementation: 'napcat', enabled: true, members: [] })
  } else if (props.target?.type === 'bot') {
    const value = props.bots.find(({ id }) => id === props.target?.id)
    if (!value) return
    Object.assign(draft, { ...value, members: [] })
  } else if (props.target?.type === 'group') {
    const value = props.groups.find(({ id }) => id === props.target?.id)
    if (!value) return
    Object.assign(draft, { id: value.id, name: value.name, implementation: 'napcat', enabled: true, members: value.members.map((member) => ({ ...member })) })
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
    await runAction({ action: 'update-bot', data: { id: draft.id, name: draft.name, implementation: draft.implementation, enabled: draft.enabled } })
  } else if (props.target?.type === 'group') {
    await runAction({ action: 'update-group', data: { id: draft.id, name: draft.name, members: draft.members.map((member) => ({ ...member })) } })
  }
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
  draft.members.push({ participantId: participant.id, card: participant.name, role: !hasOwner && participant.type === 'user' ? 'owner' : 'member' })
}

function removeGroupMember(index: number) {
  draft.members.splice(index, 1)
}

function isBotParticipant(participantId: string) {
  return props.bots.some(({ id }) => id === participantId)
}

function normalizeMemberRole(member: SandboxGroupMember) {
  if (member.role === 'owner' && isBotParticipant(member.participantId)) member.role = 'member'
}
</script>
