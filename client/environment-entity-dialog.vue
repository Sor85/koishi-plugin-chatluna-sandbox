<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent
      :class="{ 'webqq-group-editor-dialog': target?.type === 'group' && mode === 'edit' }"
      :style="{ '--webqq-accent': accentColor }"
    >
      <WebqqAvatarPicker
        v-if="avatarPickerOpen"
        :kind="target?.type ?? 'user'"
        :model-value="draft.avatar"
        :input-id="`${fieldPrefix}-avatar-file`"
        @back="avatarPickerOpen = false"
        @select="selectAvatar"
      />
      <template v-else>
      <DialogHeader>
        <DialogTitle>{{ dialogTitle }}</DialogTitle>
        <DialogDescription>{{ dialogDescription }}</DialogDescription>
      </DialogHeader>

      <form v-if="mode === 'edit'" class="webqq-secondary-form" @submit.prevent="submitEdit">
        <button
          type="button"
          class="webqq-avatar-editor-trigger"
          aria-label="选择头像"
          @click="avatarPickerOpen = true"
        >
          <WebqqAvatar :kind="target?.type ?? 'user'" :name="draft.name" :avatar="draft.avatar || entity?.avatar" />
          <span>点击更换头像</span>
        </button>
        <div class="webqq-secondary-field">
          <Label :for="`${fieldPrefix}-id`">{{ target?.type === 'group' ? '群号' : 'QQ ID' }}</Label>
          <Input
            :id="`${fieldPrefix}-id`"
            :model-value="draft.id"
            disabled
          />
        </div>
        <div class="webqq-secondary-field">
          <Label :for="`${fieldPrefix}-name`">{{ nameLabel }}</Label>
          <Input
            :id="`${fieldPrefix}-name`"
            v-model="draft.name"
            required
          />
        </div>
        <div v-if="target?.type === 'user' || target?.type === 'bot'" class="webqq-secondary-field">
          <Label :for="`${fieldPrefix}-personal-note`">个性签名</Label>
          <Input
            :id="`${fieldPrefix}-personal-note`"
            v-model="draft.personalNote"
            placeholder="可选，环境管理写入账号资料"
          />
        </div>
        <div v-if="target?.type === 'user' || target?.type === 'bot'" class="webqq-secondary-field">
          <Label :for="`${fieldPrefix}-sex`">性别</Label>
          <Select v-model="draft.sex">
            <SelectTrigger :id="`${fieldPrefix}-sex`" class="w-full">
              <SelectValue placeholder="未设置" />
            </SelectTrigger>
            <SelectContent :portal-to="selectPortalTarget">
              <SelectItem value="unset">未设置</SelectItem>
              <SelectItem value="unknown">未知</SelectItem>
              <SelectItem value="male">男</SelectItem>
              <SelectItem value="female">女</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <template v-if="target?.type === 'bot'">
          <div class="webqq-secondary-field">
            <Label :for="`${fieldPrefix}-implementation`">实现配置</Label>
            <Select v-model="draft.implementation">
              <SelectTrigger
                :id="`${fieldPrefix}-implementation`"
                class="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent :portal-to="selectPortalTarget">
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
                <IconSearch class="webqq-secondary-hint size-4" />
              </span>
              <Input
                v-model="capabilitySearch"
                class="webqq-capability-search"
                placeholder="搜索 action、别名或作用"
                aria-label="搜索能力覆盖"
              />
            </div>
            <div class="webqq-secondary-panel grid max-h-48 gap-2 overflow-y-auto rounded-lg p-3">
              <label
                v-for="capability in filteredCapabilities"
                :key="capability.id"
                class="flex items-start gap-2"
              >
                <Checkbox
                  :model-value="capability.supported && !draft.disabledCapabilities.includes(capability.id)"
                  :disabled="!capability.supported"
                  class="mt-0.5"
                  @update:model-value="setCapabilityEnabled(capability.id, $event === true)"
                />
                <span class="grid min-w-0 gap-0.5">
                  <span class="flex min-w-0 items-center gap-1.5">
                    <span class="min-w-0 truncate text-sm">{{ capability.action }}</span>
                    <Badge variant="secondary" class="shrink-0">
                      {{ capability.surface === 'standard' ? '标准能力' : '原生扩展' }}
                    </Badge>
                  </span>
                  <span class="webqq-secondary-hint text-xs leading-5">{{ capability.description }}</span>
                  <small v-if="capability.aliases?.length || !capability.supported" class="webqq-secondary-hint text-xs">
                    <template v-if="capability.aliases?.length">别名 {{ capability.aliases.join('、') }}</template>
                    <template v-if="capability.aliases?.length && !capability.supported"> · </template>
                    <template v-if="!capability.supported">{{ capability.reason }}</template>
                  </small>
                </span>
              </label>
              <p v-if="!filteredCapabilities.length" class="webqq-secondary-hint m-0 py-3 text-center text-xs">
                没有匹配的能力
              </p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <Checkbox
              :id="`${fieldPrefix}-enabled`"
              v-model="draft.enabled"
            />
            <Label :for="`${fieldPrefix}-enabled`">启用机器人</Label>
          </div>
        </template>

        <section v-if="target?.type === 'group'" class="webqq-secondary-divider chatluna-sandbox-group-members-editor">
          <div class="chatluna-sandbox-group-members-heading">
            <div>
              <strong>群成员</strong>
              <p class="webqq-secondary-hint">点击头像添加或移除群成员。</p>
            </div>
            <span class="chatluna-sandbox-group-members-count">{{ draft.members.length }} / {{ participants.length }}</span>
          </div>
          <div class="chatluna-sandbox-group-member-grid">
            <article
              v-for="participant in participants"
              :key="participant.id"
              :class="['chatluna-sandbox-group-member-card', { 'is-selected': memberOf(participant.id) }]"
            >
              <button
                type="button"
                class="chatluna-sandbox-group-member-select"
                :aria-pressed="!!memberOf(participant.id)"
                :aria-label="`${memberOf(participant.id) ? '移除' : '添加'}${participant.name}（${participant.id}）`"
                @click="toggleGroupMember(participant.id)"
              >
                <span class="chatluna-sandbox-group-member-avatar-wrap">
                  <WebqqAvatar
                    class="chatluna-sandbox-group-member-avatar"
                    :kind="participant.type"
                    :name="participant.name"
                    :avatar="participant.avatar"
                  />
                  <span class="chatluna-sandbox-group-member-state" aria-hidden="true">
                    <IconCheck v-if="memberOf(participant.id)" />
                    <IconPlus v-else />
                  </span>
                </span>
                <span class="chatluna-sandbox-group-member-copy">
                  <strong>{{ participant.name }}</strong>
                  <small>{{ participant.id }}</small>
                  <template v-if="memberOf(participant.id)">
                    <small>{{ memberOf(participant.id)!.card || '未设置群昵称' }}</small>
                    <small>{{ memberRoleLabel(memberOf(participant.id)!.role) }}</small>
                  </template>
                  <small v-else>点击添加</small>
                </span>
              </button>
              <button
                v-if="memberOf(participant.id)"
                type="button"
                class="chatluna-sandbox-group-member-edit"
                :aria-label="`编辑${participant.name}的群资料`"
                @click="editingMemberId = participant.id"
              >
                <IconPencil aria-hidden="true" />
              </button>
            </article>
          </div>
          <div v-if="editingParticipant && editingMember" class="chatluna-sandbox-group-member-editor">
            <div class="chatluna-sandbox-group-member-editor-heading">
              <WebqqAvatar
                :kind="editingParticipant.type"
                :name="editingParticipant.name"
                :avatar="editingParticipant.avatar"
              />
              <span>
                <strong>{{ editingParticipant.name }}</strong>
                <small>{{ editingParticipant.id }}</small>
              </span>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="关闭成员资料编辑" @click="editingMemberId = ''">
                <IconX aria-hidden="true" />
              </Button>
            </div>
            <div class="chatluna-sandbox-group-member-controls">
              <div class="webqq-secondary-field">
                <Label :for="`${fieldPrefix}-member-card`">群昵称</Label>
                <Input
                  :id="`${fieldPrefix}-member-card`"
                  :model-value="editingMember.card"
                  :aria-label="`${editingParticipant.name}的群昵称`"
                  placeholder="群昵称"
                  @update:model-value="setGroupMemberCard(editingParticipant.id, String($event))"
                />
              </div>
              <div class="webqq-secondary-field">
                <Label :for="`${fieldPrefix}-member-role`">群身份</Label>
                <Select
                  :model-value="editingMember.role"
                  @update:model-value="setGroupMemberRole(editingParticipant.id, $event as SandboxGroupMember['role'])"
                >
                  <SelectTrigger :id="`${fieldPrefix}-member-role`" :aria-label="`${editingParticipant.name}的群身份`" class="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent :portal-to="selectPortalTarget">
                    <SelectItem value="owner">群主</SelectItem>
                    <SelectItem value="admin">管理员</SelectItem>
                    <SelectItem value="member">成员</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <p v-if="!draft.members.length" class="webqq-secondary-hint m-0 text-xs">至少添加一位普通用户作为群主。</p>
        </section>

        <p v-if="errorMessage" class="webqq-form-error m-0 rounded-lg px-3 py-2 text-xs" role="alert">
          {{ errorMessage }}
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" @click="emit('update:open', false)">取消</Button>
          <Button type="submit" :disabled="busy">{{ busy ? '保存中...' : '保存' }}</Button>
        </DialogFooter>
      </form>

      <div v-else class="webqq-secondary-form">
        <p class="webqq-secondary-hint m-0 text-sm leading-6">{{ deleteMessage }}</p>
        <p v-if="errorMessage" class="webqq-form-error m-0 rounded-lg px-3 py-2 text-xs" role="alert">
          {{ errorMessage }}
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" @click="emit('update:open', false)">取消</Button>
          <Button type="button" variant="destructive" :disabled="busy" @click="submitDelete">{{ busy ? '删除中...' : '确认删除' }}</Button>
        </DialogFooter>
      </div>
      <!-- Select 必须挂在 Dialog 内部，否则 reka-ui 的默认 Portal 层级会落到遮罩下方。绝对定位宿主不参与 Dialog 高度计算。 -->
      <div
        ref="selectPortalTarget"
        class="pointer-events-none absolute inset-0 z-[170] [&_[data-reka-popper-content-wrapper]]:pointer-events-auto"
      />
      </template>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { IconCheck, IconPencil, IconPlus, IconSearch, IconX } from '@tabler/icons-vue'
import { computed, reactive, ref, watch } from 'vue'
import { Badge } from './components/ui/badge'
import { Button } from './components/ui/button'
import { Checkbox } from './components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './components/ui/dialog'
import { Input } from './components/ui/input'
import { Label } from './components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select'
import { getOneBotProfileBaseline } from '../src/onebot-profiles'
import WebqqAvatar from './webqq-avatar.vue'
import WebqqAvatarPicker from './webqq-avatar-picker.vue'
import type {
  ManageSandboxEnvironmentInput,
  SandboxAccountSex,
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
const avatarPickerOpen = ref(false)
const editingMemberId = ref('')
const selectPortalTarget = ref<HTMLElement | null>(null)
const draft = reactive<{
  id: string
  name: string
  avatar: string
  personalNote: string
  sex: 'unset' | SandboxAccountSex
  implementation: SandboxImplementationProfile
  enabled: boolean
  disabledCapabilities: string[]
  members: SandboxGroupMember[]
}>({ id: '', name: '', avatar: '', personalNote: '', sex: 'unset', implementation: 'napcat', enabled: true, disabledCapabilities: [], members: [] })

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
const editingParticipant = computed(() => participants.value.find(({ id }) => id === editingMemberId.value))
const editingMember = computed(() => memberOf(editingMemberId.value))
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
  avatarPickerOpen.value = false
  editingMemberId.value = ''
  if (props.target?.type === 'user') {
    const value = props.users.find(({ id }) => id === props.target?.id)
    if (!value) return
    Object.assign(draft, {
      id: value.id,
      name: value.name,
      avatar: value.avatar ?? '',
      personalNote: value.profile?.personalNote ?? '',
      sex: value.profile?.sex ?? 'unset',
      implementation: 'napcat',
      enabled: true,
      disabledCapabilities: [],
      members: [],
    })
  } else if (props.target?.type === 'bot') {
    const value = props.bots.find(({ id }) => id === props.target?.id)
    if (!value) return
    Object.assign(draft, {
      ...value,
      avatar: value.avatar ?? '',
      personalNote: value.profile?.personalNote ?? '',
      sex: value.profile?.sex ?? 'unset',
      disabledCapabilities: value.disabledCapabilities ?? [],
      members: [],
    })
  } else if (props.target?.type === 'group') {
    const value = props.groups.find(({ id }) => id === props.target?.id)
    if (!value) return
    Object.assign(draft, {
      id: value.id,
      name: value.name,
      avatar: value.avatar ?? '',
      personalNote: '',
      sex: 'unset',
      implementation: 'napcat',
      enabled: true,
      disabledCapabilities: [],
      members: value.members.map((member) => ({ ...member })),
    })
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

function buildAccountProfile() {
  const profile = {
    ...(draft.personalNote.trim() ? { personalNote: draft.personalNote.trim() } : {}),
    ...(draft.sex !== 'unset' ? { sex: draft.sex as SandboxAccountSex } : {}),
  }
  return Object.keys(profile).length ? profile : undefined
}

function selectAvatar(avatar: string) {
  draft.avatar = avatar
  avatarPickerOpen.value = false
  errorMessage.value = ''
}

async function submitEdit() {
  if (props.target?.type === 'user') {
    await runAction({
      action: 'update-user',
      data: {
        id: draft.id,
        name: draft.name,
        avatar: draft.avatar,
        profile: buildAccountProfile(),
      },
    })
  } else if (props.target?.type === 'bot') {
    await runAction({
      action: 'update-bot',
      data: {
        id: draft.id,
        name: draft.name,
        implementation: draft.implementation,
        enabled: draft.enabled,
        disabledCapabilities: [...draft.disabledCapabilities],
        avatar: draft.avatar,
        profile: buildAccountProfile(),
      },
    })
  } else if (props.target?.type === 'group') {
    await runAction({ action: 'update-group', data: { id: draft.id, name: draft.name, avatar: draft.avatar, members: draft.members.map((member) => ({ ...member })) } })
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

function memberOf(participantId: string) {
  return draft.members.find((member) => member.participantId === participantId)
}

function toggleGroupMember(participantId: string) {
  const index = draft.members.findIndex((member) => member.participantId === participantId)
  if (index >= 0) {
    draft.members.splice(index, 1)
    if (editingMemberId.value === participantId) editingMemberId.value = ''
    return
  }
  const participant = participants.value.find(({ id }) => id === participantId)
  if (!participant) return
  const hasOwner = draft.members.some(({ role }) => role === 'owner')
  draft.members.push({ participantId, card: participant.name, role: hasOwner ? 'member' : 'owner' })
}

function memberRoleLabel(role?: SandboxGroupMember['role']) {
  if (role === 'owner') return '群主'
  if (role === 'admin') return '管理员'
  return '成员'
}

function setGroupMemberRole(participantId: string, role: SandboxGroupMember['role']) {
  const member = memberOf(participantId)
  if (member) member.role = role
}

function setGroupMemberCard(participantId: string, card: string) {
  const member = memberOf(participantId)
  if (member) member.card = card
}

</script>
