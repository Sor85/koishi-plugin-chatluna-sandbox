<template>
  <EnvironmentEntityDialog
    :open="entityOpen"
    :mode="entityMode"
    :target="entityTarget"
    :users="users"
    :bots="bots"
    :groups="groups"
    :accent-color="accentColor"
    @update:open="entityOpen = $event"
    @submit="forwardManageEnvironment"
  />
  <Dialog v-model:open="remarkOpen">
    <DialogContent :style="{ '--webqq-accent': accentColor }">
      <DialogHeader>
        <DialogTitle>设置好友备注</DialogTitle>
        <DialogDescription>备注只对当前测试用户生效，不会修改对方资料昵称。</DialogDescription>
      </DialogHeader>
      <Input
        v-model="remarkInput"
        placeholder="留空可删除备注"
        @keydown.enter="submitRemark"
      />
      <DialogFooter>
        <Button variant="outline" @click="remarkOpen = false">取消</Button>
        <Button @click="submitRemark">保存</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
  <Dialog v-model:open="groupActionOpen">
    <DialogContent :style="{ '--webqq-accent': accentColor }">
      <DialogHeader>
        <DialogTitle>{{ groupActionCopy.title }}</DialogTitle>
        <DialogDescription>{{ groupActionCopy.description }}</DialogDescription>
      </DialogHeader>
      <Input
        v-model="groupActionInput"
        :placeholder="groupActionCopy.placeholder"
        @keydown.enter="submitGroupAction"
      />
      <DialogFooter>
        <Button variant="outline" @click="groupActionOpen = false">取消</Button>
        <Button @click="submitGroupAction">保存</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
  <section
    v-if="profileOpen && profileCard"
    ref="profilePanelRef"
    class="webqq-secondary-page webqq-profile-card-page"
    :style="{ '--webqq-accent': accentColor, ...profilePanelStyle }"
    aria-label="查看资料"
  >
    <header class="webqq-secondary-page-header">
      <strong>查看资料</strong>
    </header>
    <div class="webqq-profile-card">
      <div class="webqq-profile-card-hero">
        <WebqqAvatar
          class="webqq-avatar webqq-avatar-profile"
          :kind="profileCard.avatarKind"
          :name="profileCard.name"
          :avatar="profileCard.avatar"
          :show-bot-badge="profileCard.avatarKind === 'bot'"
        />
        <div>
          <h2>{{ profileCard.name }}</h2>
          <p>{{ profileCard.identityLabel }} {{ profileCard.participantId }}</p>
          <p v-if="profileCard.personalNote" class="webqq-profile-card-note">{{ profileCard.personalNote }}</p>
        </div>
      </div>
      <section
        v-for="section in profileCardSections"
        :key="section.group"
        class="webqq-profile-card-section"
      >
        <h3>{{ section.label }}</h3>
        <dl class="webqq-profile-card-fields">
          <div v-for="field in section.fields" :key="`${section.group}:${field.label}:${field.value}`">
            <dt>{{ field.label }}</dt>
            <dd>{{ field.value }}</dd>
          </div>
        </dl>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Button } from './components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './components/ui/dialog'
import { Input } from './components/ui/input'
import EnvironmentEntityDialog from './environment-entity-dialog.vue'
import WebqqAvatar from './webqq-avatar.vue'
import { getFloatingPanelStyle } from './webqq/floating-panel'
import { groupProfileCardFields, type ProfileCardModel } from './webqq/profile-card'
import type {
  ManageSandboxEnvironmentInput,
  SandboxBotProfile,
  SandboxGroup,
  SandboxUser,
} from '../src/types'

type EntityType = 'user' | 'bot' | 'group'
type EntityMode = 'edit' | 'delete'
type GroupActionMode = 'card' | 'name' | 'title'

const GROUP_ACTION_COPY: Record<GroupActionMode, { title: string, description: string, placeholder: string }> = {
  card: { title: '修改群名片', description: '留空可以清除当前群名片。', placeholder: '输入群名片' },
  name: { title: '修改群名称', description: '新的群名称会对所有群成员和机器人可见。', placeholder: '输入群名称' },
  title: { title: '设置专属头衔', description: '专属头衔只能由群主授予，留空可以清除当前头衔。', placeholder: '输入专属头衔' },
}
type Resolve = () => void
type Reject = (error: unknown) => void

defineProps<{
  users: SandboxUser[]
  bots: SandboxBotProfile[]
  groups: SandboxGroup[]
  accentColor: string
}>()
const emit = defineEmits<{
  manageEnvironment: [input: ManageSandboxEnvironmentInput, resolve: Resolve, reject: Reject]
  saveRemark: [input: { targetId: string, remark: string }, resolve: Resolve, reject: Reject]
  saveGroupAction: [input: { mode: GroupActionMode, targetId: string, groupId: string, value: string }, resolve: Resolve, reject: Reject]
}>()

const entityOpen = ref(false)
const entityMode = ref<EntityMode>('edit')
const entityTarget = ref<{ type: EntityType, id: string }>()
const remarkOpen = ref(false)
const remarkTargetId = ref('')
const remarkInput = ref('')
const groupActionOpen = ref(false)
const groupActionMode = ref<GroupActionMode>('card')
const groupActionTargetId = ref('')
const groupActionGroupId = ref('')
const groupActionInput = ref('')
const groupActionCopy = computed(() => GROUP_ACTION_COPY[groupActionMode.value])
const profileOpen = ref(false)
const profileCard = ref<ProfileCardModel>()
const profileCardSections = computed(() => profileCard.value ? groupProfileCardFields(profileCard.value.fields) : [])
const profilePanelRef = ref<HTMLElement>()
const profilePanelStyle = ref<Record<string, string>>({})

function openEntity(mode: EntityMode, target: { type: EntityType, id: string }) {
  entityMode.value = mode
  entityTarget.value = target
  entityOpen.value = true
}

function forwardManageEnvironment(input: ManageSandboxEnvironmentInput, resolve: Resolve, reject: Reject) {
  emit('manageEnvironment', input, resolve, reject)
}

function openRemark(targetId: string, value: string) {
  remarkTargetId.value = targetId
  remarkInput.value = value
  remarkOpen.value = true
}

function openGroupAction(mode: GroupActionMode, targetId: string, groupId: string, value: string) {
  groupActionMode.value = mode
  groupActionTargetId.value = targetId
  groupActionGroupId.value = groupId
  groupActionInput.value = value
  groupActionOpen.value = true
}

function openProfile(card: ProfileCardModel) {
  profileCard.value = card
  profilePanelStyle.value = getFloatingPanelStyle({ width: 320, height: 360 })
  profileOpen.value = true
}

function closeProfileOnOutsidePointer(event: PointerEvent) {
  if (!profileOpen.value || profilePanelRef.value?.contains(event.target as Node)) return
  profileOpen.value = false
}

onMounted(() => document.addEventListener('pointerdown', closeProfileOnOutsidePointer))
onBeforeUnmount(() => document.removeEventListener('pointerdown', closeProfileOnOutsidePointer))

async function submitRemark() {
  if (!remarkTargetId.value) return
  try {
    await new Promise<void>((resolve, reject) => emit('saveRemark', {
      targetId: remarkTargetId.value,
      remark: remarkInput.value,
    }, resolve, reject))
    remarkOpen.value = false
  } catch {}
}

async function submitGroupAction() {
  if (!groupActionGroupId.value) return
  try {
    await new Promise<void>((resolve, reject) => emit('saveGroupAction', {
      mode: groupActionMode.value,
      targetId: groupActionTargetId.value,
      groupId: groupActionGroupId.value,
      value: groupActionInput.value,
    }, resolve, reject))
    groupActionOpen.value = false
  } catch {}
}

defineExpose({ openEntity, openGroupAction, openRemark, openProfile })
</script>
