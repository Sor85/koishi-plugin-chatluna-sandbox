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
        <DialogTitle>{{ groupActionMode === 'name' ? '修改群名称' : '修改群名片' }}</DialogTitle>
        <DialogDescription>
          {{ groupActionMode === 'name' ? '新的群名称会对所有群成员和机器人可见。' : '留空可以清除当前群名片。' }}
        </DialogDescription>
      </DialogHeader>
      <Input
        v-model="groupActionInput"
        :placeholder="groupActionMode === 'name' ? '输入群名称' : '输入群名片'"
        @keydown.enter="submitGroupAction"
      />
      <DialogFooter>
        <Button variant="outline" @click="groupActionOpen = false">取消</Button>
        <Button @click="submitGroupAction">保存</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Button } from './components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './components/ui/dialog'
import { Input } from './components/ui/input'
import EnvironmentEntityDialog from './environment-entity-dialog.vue'
import type {
  ManageSandboxEnvironmentInput,
  SandboxBotProfile,
  SandboxGroup,
  SandboxUser,
} from '../src/types'

type EntityType = 'user' | 'bot' | 'group'
type EntityMode = 'edit' | 'delete'
type GroupActionMode = 'card' | 'name'
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

defineExpose({ openEntity, openGroupAction, openRemark })
</script>
