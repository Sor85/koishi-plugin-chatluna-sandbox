<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <slot name="trigger" />
    </PopoverTrigger>
    <PopoverContent
      class="relative"
      :side="resolvedSide"
      align="start"
      :aria-label="title"
      :style="{ '--webqq-accent': accentColor }"
    >
      <form class="grid gap-4" @submit.prevent="submit">
        <header class="grid gap-1">
          <strong class="text-sm">{{ title }}</strong>
          <p class="m-0 text-xs leading-5 text-slate-500 dark:text-slate-400">{{ description }}</p>
        </header>

        <div v-if="type === 'participant'" class="grid gap-1.5">
          <Label for="environment-create-type">账号类型</Label>
          <Select v-model="participantType">
            <SelectTrigger
              id="environment-create-type"
              class="w-full border-slate-200 focus-visible:border-[var(--webqq-accent)] focus-visible:ring-[color-mix(in_srgb,var(--webqq-accent)_18%,transparent)] dark:border-slate-700"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent :portal-to="selectPortalTarget" class="z-[120] w-[var(--reka-select-trigger-width)] border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
              <SelectItem value="user" class="focus:bg-slate-100 dark:focus:bg-slate-800">普通用户</SelectItem>
              <SelectItem value="bot" class="focus:bg-slate-100 dark:focus:bg-slate-800">机器人</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div class="grid gap-1.5">
          <Label for="environment-create-id">{{ effectiveType === 'group' ? '群号' : 'QQ ID' }}</Label>
          <Input
            id="environment-create-id"
            v-model="draft.id"
            class="border-slate-200 text-sm focus-visible:border-[var(--webqq-accent)] focus-visible:ring-[color-mix(in_srgb,var(--webqq-accent)_18%,transparent)] dark:border-slate-700"
            inputmode="numeric"
            pattern="[0-9]+"
            required
          />
        </div>

        <div class="grid gap-1.5">
          <Label for="environment-create-name">{{ effectiveType === 'user' ? '用户昵称' : effectiveType === 'bot' ? '机器人昵称' : '群名称' }}</Label>
          <Input
            id="environment-create-name"
            v-model="draft.name"
            class="border-slate-200 text-sm focus-visible:border-[var(--webqq-accent)] focus-visible:ring-[color-mix(in_srgb,var(--webqq-accent)_18%,transparent)] dark:border-slate-700"
            required
          />
        </div>

        <template v-if="effectiveType === 'bot'">
          <div class="grid gap-1.5">
            <Label for="environment-create-implementation">实现配置</Label>
            <Select v-model="botImplementation">
              <SelectTrigger
                id="environment-create-implementation"
                class="w-full border-slate-200 focus-visible:border-[var(--webqq-accent)] focus-visible:ring-[color-mix(in_srgb,var(--webqq-accent)_18%,transparent)] dark:border-slate-700"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent :portal-to="selectPortalTarget" class="z-[120] w-[var(--reka-select-trigger-width)] border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                <SelectItem value="napcat" class="focus:bg-slate-100 dark:focus:bg-slate-800">NapCat</SelectItem>
                <SelectItem value="llbot" class="focus:bg-slate-100 dark:focus:bg-slate-800">LLBot</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="flex items-center gap-2">
            <Checkbox
              id="environment-create-enabled"
              v-model="botEnabled"
              class="border-slate-300 data-[state=checked]:border-[var(--webqq-accent)] data-[state=checked]:bg-[var(--webqq-accent)] data-[state=checked]:text-white dark:border-slate-600"
            />
            <Label for="environment-create-enabled">启用机器人</Label>
          </div>
        </template>

        <p v-if="errorMessage" class="m-0 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/50 dark:text-red-300" role="alert">
          {{ errorMessage }}
        </p>

        <Button
          type="submit"
          class="inline-flex h-9 items-center justify-center rounded-lg bg-[var(--webqq-accent)] px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="busy || (effectiveType === 'group' && !canCreateGroup)"
        >
          {{ busy ? '创建中...' : submitLabel }}
        </Button>
      </form>
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
import { Button } from './components/ui/button'
import { Checkbox } from './components/ui/checkbox'
import { Input } from './components/ui/input'
import { Label } from './components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from './components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select'
import type {
  ManageSandboxEnvironmentInput,
  SandboxImplementationProfile,
  SandboxSnapshot,
} from '../src/types'

type EnvironmentCreateType = 'user' | 'bot' | 'group' | 'participant'
type ParticipantCreateType = 'user' | 'bot'

const props = withDefaults(defineProps<{
  type: EnvironmentCreateType
  snapshot: SandboxSnapshot
  currentUserId?: string
  accentColor: string
  side?: 'top' | 'right' | 'bottom' | 'left'
}>(), {
  side: 'right',
})
const emit = defineEmits<{
  submit: [input: ManageSandboxEnvironmentInput, resolve: () => void, reject: (error: unknown) => void]
  openChange: [open: boolean]
}>()

const open = ref(false)
const busy = ref(false)
const errorMessage = ref('')
const draft = reactive({ id: '', name: '' })
const participantType = ref<ParticipantCreateType>('user')
const botImplementation = ref<SandboxImplementationProfile>('napcat')
const botEnabled = ref(true)
const selectPortalTarget = ref<HTMLElement | null>(null)
const isNarrow = useMediaQuery('(max-width: 768px)')
const resolvedSide = computed(() => props.side === 'right' && isNarrow.value ? 'bottom' : props.side)
const currentUser = computed(() => props.snapshot.users.find(({ id }) => id === props.currentUserId))
const canCreateGroup = computed(() => !!currentUser.value && props.snapshot.bots.length > 0)
const effectiveType = computed(() => props.type === 'participant' ? participantType.value : props.type)
const title = computed(() => props.type === 'participant'
  ? '添加测试账号'
  : props.type === 'user' ? '添加测试用户' : props.type === 'bot' ? '添加测试机器人' : '添加测试群组')
const submitLabel = computed(() => effectiveType.value === 'user' ? '添加测试用户' : effectiveType.value === 'bot' ? '添加测试机器人' : '添加测试群组')
const description = computed(() => {
  if (effectiveType.value === 'user') return '创建后可在发送框头像区域切换身份'
  if (effectiveType.value === 'bot') return '创建后会为所有测试用户建立私聊会话'
  if (!currentUser.value) return '请先创建并选择一位测试用户'
  if (!props.snapshot.bots.length) return '请先在发送消息控件中添加测试机器人'
  return `当前用户“${currentUser.value.name}”为群主，现有机器人自动加入群组`
})

watch(open, (value) => {
  emit('openChange', value)
  if (!value) return
  errorMessage.value = ''
  draft.id = ''
  draft.name = ''
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

function createInput(): ManageSandboxEnvironmentInput | undefined {
  if (effectiveType.value === 'user') {
    return { action: 'create-user', data: { id: draft.id, name: draft.name } }
  }
  if (effectiveType.value === 'bot') {
    return {
      action: 'create-bot',
      data: { id: draft.id, name: draft.name, implementation: botImplementation.value, enabled: botEnabled.value },
    }
  }
  const owner = currentUser.value
  if (!owner || !props.snapshot.bots.length) return undefined
  return {
    action: 'create-group',
    data: {
      id: draft.id,
      name: draft.name,
      members: [
        { participantId: owner.id, card: owner.name, role: 'owner' },
        ...props.snapshot.bots.map((bot) => ({ participantId: bot.id, card: bot.name, role: 'member' as const })),
      ],
    },
  }
}
</script>
