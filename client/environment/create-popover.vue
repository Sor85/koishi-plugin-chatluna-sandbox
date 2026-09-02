<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <slot name="trigger" />
    </PopoverTrigger>
    <PopoverContent
      class="webqq-environment-create-popover relative"
      :class="{ 'is-color-dark': colorMode === 'dark' }"
      :side="resolvedSide"
      align="start"
      :aria-label="title"
      :style="{ '--webqq-accent': accentColor }"
    >
      <form v-if="!avatarPickerOpen" class="webqq-secondary-form" @submit.prevent="submit">
        <button
          type="button"
          class="webqq-avatar-editor-trigger"
          aria-label="选择头像"
          @click="avatarPickerOpen = true"
        >
          <WebqqAvatar :kind="effectiveType" :name="draft.name" :avatar="draft.avatar" />
          <span>点击选择头像</span>
        </button>
        <header class="grid gap-1">
          <strong class="text-sm">{{ title }}</strong>
          <p class="webqq-secondary-hint m-0 text-xs leading-5">{{ description }}</p>
        </header>

        <div v-if="type === 'participant'" class="webqq-secondary-field">
          <Label for="environment-create-type">账号类型</Label>
          <Select v-model="participantType">
            <SelectTrigger
              id="environment-create-type"
              class="w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent :portal-to="selectPortalTarget" class="z-[120]">
              <SelectItem value="user">普通用户</SelectItem>
              <SelectItem value="bot">机器人</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div class="webqq-secondary-field">
          <Label for="environment-create-id">{{ effectiveType === 'group' ? '群号' : 'QQ ID' }}</Label>
          <Input
            id="environment-create-id"
            v-model="draft.id"
            class="text-sm"
            inputmode="numeric"
            pattern="[0-9]+"
            required
          />
        </div>

        <div class="webqq-secondary-field">
          <Label for="environment-create-name">{{ effectiveType === 'user' ? '用户昵称' : effectiveType === 'bot' ? '机器人昵称' : '群名称' }}</Label>
          <Input
            id="environment-create-name"
            v-model="draft.name"
            class="text-sm"
            required
          />
        </div>
        <div v-if="effectiveType === 'user' || effectiveType === 'bot'" class="webqq-secondary-field">
          <Label for="environment-create-personal-note">个性签名</Label>
          <Input
            id="environment-create-personal-note"
            v-model="draft.personalNote"
            class="text-sm"
            placeholder="可选"
          />
        </div>

        <template v-if="effectiveType === 'bot'">
          <div class="webqq-secondary-field">
            <Label for="environment-create-implementation">实现配置</Label>
            <Select v-model="botImplementation">
              <SelectTrigger
                id="environment-create-implementation"
                class="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent :portal-to="selectPortalTarget" class="z-[120]">
                <SelectItem value="napcat">NapCat</SelectItem>
                <SelectItem value="llbot">LLBot</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="flex items-center gap-2">
            <Checkbox
              id="environment-create-enabled"
              v-model="botEnabled"
            />
            <Label for="environment-create-enabled">启用机器人</Label>
          </div>
        </template>

        <p v-if="errorMessage" class="webqq-form-error m-0 rounded-lg px-3 py-2 text-xs" role="alert">
          {{ errorMessage }}
        </p>

        <Button
          type="submit"
          class="w-full"
          :disabled="busy || (effectiveType === 'group' && !canCreateGroup)"
        >
          {{ busy ? '创建中...' : submitLabel }}
        </Button>
      </form>
      <WebqqAvatarPicker
        v-else
        :kind="effectiveType"
        :model-value="draft.avatar"
        input-id="environment-create-avatar-file"
        @back="avatarPickerOpen = false"
        @select="selectAvatar"
      />
      <!-- 下拉层挂在父 Popover 内的绝对定位宿主，避免外部点击误判，同时不参与表单高度计算。 -->
      <div
        ref="selectPortalTarget"
        class="pointer-events-none absolute inset-0 z-[120] [&_[data-reka-popper-content-wrapper]]:pointer-events-auto"
      />
    </PopoverContent>
  </Popover>
</template>

<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import { computed, reactive, ref, watch } from 'vue'
import { Button } from '#client/components/ui/button'
import { Checkbox } from '#client/components/ui/checkbox'
import { Input } from '#client/components/ui/input'
import { Label } from '#client/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '#client/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#client/components/ui/select'
import WebqqAvatar from '#client/shared/avatar.vue'
import WebqqAvatarPicker from './avatar-picker.vue'
import type {
  ManageSandboxEnvironmentInput,
  SandboxBotProfile,
  SandboxImplementationProfile,
  SandboxParticipant,
} from '../../src/types'

type EnvironmentCreateType = 'user' | 'bot' | 'group' | 'participant'
type ParticipantCreateType = 'user' | 'bot'

const props = withDefaults(defineProps<{
  type: EnvironmentCreateType
  currentOperator?: Pick<SandboxParticipant, 'id' | 'name'>
  bots?: Pick<SandboxBotProfile, 'id' | 'name'>[]
  accentColor: string
  colorMode: 'light' | 'dark'
  side?: 'top' | 'right' | 'bottom' | 'left'
}>(), {
  bots: () => [],
  side: 'right',
})
const emit = defineEmits<{
  submit: [input: ManageSandboxEnvironmentInput, resolve: () => void, reject: (error: unknown) => void]
  openChange: [open: boolean]
}>()

const open = ref(false)
const busy = ref(false)
const errorMessage = ref('')
const draft = reactive({ id: '', name: '', avatar: '', personalNote: '' })
const avatarPickerOpen = ref(false)
const participantType = ref<ParticipantCreateType>('user')
const botImplementation = ref<SandboxImplementationProfile>('napcat')
const botEnabled = ref(true)
const selectPortalTarget = ref<HTMLElement | null>(null)
const isNarrow = useMediaQuery('(max-width: 768px)')
const resolvedSide = computed(() => props.side === 'right' && isNarrow.value ? 'bottom' : props.side)
const canCreateGroup = computed(() => !!props.currentOperator && props.bots.length > 0)
const effectiveType = computed(() => props.type === 'participant' ? participantType.value : props.type)
const title = computed(() => props.type === 'participant'
  ? '添加测试账号'
  : props.type === 'user' ? '添加测试用户' : props.type === 'bot' ? '添加测试机器人' : '添加测试群组')
const submitLabel = computed(() => effectiveType.value === 'user' ? '添加测试用户' : effectiveType.value === 'bot' ? '添加测试机器人' : '添加测试群组')
const description = computed(() => {
  if (effectiveType.value === 'user') return '创建后可在发送框头像区域切换身份'
  if (effectiveType.value === 'bot') return '创建后会为所有测试用户建立私聊会话'
  if (!props.currentOperator) return '请先创建并选择一位测试参与者'
  if (!props.bots.length) return '请先在发送消息控件中添加测试机器人'
  return `当前操作者“${props.currentOperator.name}”为群主，现有机器人自动加入群组`
})

watch(open, (value) => {
  emit('openChange', value)
  if (!value) return
  errorMessage.value = ''
  draft.id = ''
  draft.name = ''
  draft.avatar = ''
  draft.personalNote = ''
  avatarPickerOpen.value = false
  participantType.value = 'user'
  botImplementation.value = 'napcat'
  botEnabled.value = true
})

async function submit() {
  if (busy.value) return
  const input = createInput()
  if (!input) return
  busy.value = true
  errorMessage.value = ''
  try {
    await new Promise<void>((resolve, reject) => emit('submit', input, resolve, reject))
    open.value = false
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '创建失败'
  } finally {
    busy.value = false
  }
}

function selectAvatar(avatar: string) {
  draft.avatar = avatar
  avatarPickerOpen.value = false
}

function createInput(): ManageSandboxEnvironmentInput | undefined {
  const profile = draft.personalNote.trim() ? { personalNote: draft.personalNote.trim() } : undefined
  if (effectiveType.value === 'user') {
    return { action: 'create-user', data: { id: draft.id, name: draft.name, ...(draft.avatar ? { avatar: draft.avatar } : {}), ...(profile ? { profile } : {}) } }
  }
  if (effectiveType.value === 'bot') {
    return {
      action: 'create-bot',
      data: {
        id: draft.id,
        name: draft.name,
        implementation: botImplementation.value,
        enabled: botEnabled.value,
        ...(draft.avatar ? { avatar: draft.avatar } : {}),
        ...(profile ? { profile } : {}),
      },
    }
  }
  const owner = props.currentOperator
  if (!owner || !props.bots.length) return undefined
  return {
    action: 'create-group',
    data: {
      id: draft.id,
      name: draft.name,
      ...(draft.avatar ? { avatar: draft.avatar } : {}),
      members: [
        { participantId: owner.id, card: owner.name, role: 'owner' },
        ...props.bots
          .filter(({ id }) => id !== owner.id)
          .map((bot) => ({ participantId: bot.id, card: bot.name, role: 'member' as const })),
      ],
    },
  }
}
</script>
