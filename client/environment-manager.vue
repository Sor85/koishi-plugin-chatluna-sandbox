<template>
  <section class="environment-manager" aria-label="模拟 QQ 环境管理">
    <header class="environment-header">
      <div>
        <small>环境管理</small>
        <h1>模拟 QQ 环境</h1>
        <p>静默准备用户、机器人、群组和初始关系，不产生运行时事件。</p>
      </div>
      <button type="button" class="danger-button" :disabled="busy" @click="resetDefaultScene">
        <IconRefresh :size="17" aria-hidden="true" />
        恢复默认场景
      </button>
    </header>

    <nav class="environment-tabs" aria-label="环境目录类型">
      <button
        v-for="item in sections"
        :key="item.id"
        type="button"
        :class="{ 'is-active': section === item.id }"
        :aria-current="section === item.id ? 'page' : undefined"
        @click="section = item.id"
      >
        <component :is="item.icon" :size="17" aria-hidden="true" />
        {{ item.label }}
        <span>{{ item.count }}</span>
      </button>
    </nav>

    <p v-if="errorMessage" class="environment-error" role="alert">{{ errorMessage }}</p>

    <div v-if="section === 'users'" :class="['environment-body', { 'is-editing': editingUserId }]">
      <form v-if="editingUserId" class="environment-form" @submit.prevent="submitUser">
        <div class="form-heading">
          <div>
            <h2>编辑普通用户</h2>
            <p>QQ ID 创建后不可修改。</p>
          </div>
          <button type="button" class="text-button" @click="clearUserDraft">取消</button>
        </div>
        <label>
          <span>QQ ID</span>
          <input v-model="userDraft.id" inputmode="numeric" pattern="[0-9]+" :disabled="!!editingUserId" required>
        </label>
        <label>
          <span>用户昵称</span>
          <input v-model="userDraft.name" required>
        </label>
        <button class="primary-button" type="submit" :disabled="busy">
          保存用户
        </button>
      </form>

      <div class="directory-list">
        <article v-for="user in snapshot.users" :key="user.id" class="directory-card">
          <span class="directory-avatar">{{ getInitial(user.name) }}</span>
          <span class="directory-copy"><strong>{{ user.name }}</strong><small>{{ user.id }}</small></span>
          <div class="directory-actions">
            <button type="button" @click="editUser(user)">编辑</button>
            <button type="button" class="is-danger" :disabled="busy" @click="deleteUser(user)">删除</button>
          </div>
        </article>
      </div>
    </div>

    <div v-else-if="section === 'bots'" :class="['environment-body', { 'is-editing': editingBotId }]">
      <form v-if="editingBotId" class="environment-form" @submit.prevent="submitBot">
        <div class="form-heading">
          <div>
            <h2>编辑虚拟 OneBot 机器人</h2>
            <p>每个机器人独立选择 NapCat 或 LLBot。</p>
          </div>
          <button type="button" class="text-button" @click="clearBotDraft">取消</button>
        </div>
        <label>
          <span>QQ ID</span>
          <input v-model="botDraft.id" inputmode="numeric" pattern="[0-9]+" :disabled="!!editingBotId" required>
        </label>
        <label>
          <span>机器人昵称</span>
          <input v-model="botDraft.name" required>
        </label>
        <label>
          <span>实现配置</span>
          <select v-model="botDraft.implementation">
            <option value="napcat">NapCat</option>
            <option value="llbot">LLBot</option>
          </select>
        </label>
        <label class="checkbox-field">
          <input v-model="botDraft.enabled" type="checkbox">
          <span>启用机器人</span>
        </label>
        <button class="primary-button" type="submit" :disabled="busy">
          保存机器人
        </button>
      </form>

      <div class="directory-list">
        <article v-for="bot in snapshot.bots" :key="bot.id" class="directory-card">
          <span class="directory-avatar is-bot">{{ getInitial(bot.name) }}</span>
          <span class="directory-copy">
            <strong>{{ bot.name }}</strong>
            <small>{{ bot.id }} · {{ bot.implementation === 'napcat' ? 'NapCat' : 'LLBot' }}</small>
          </span>
          <span :class="['status-pill', bot.enabled ? 'is-online' : 'is-offline']">
            {{ bot.enabled ? '已启用' : '已停用' }}
          </span>
          <div class="directory-actions">
            <button type="button" @click="editBot(bot)">编辑</button>
            <button type="button" class="is-danger" :disabled="busy" @click="deleteBot(bot)">删除</button>
          </div>
        </article>
      </div>
    </div>

    <div v-else :class="['environment-body', 'is-groups', { 'is-editing': editingGroupId }]">
      <form v-if="editingGroupId" class="environment-form group-form" @submit.prevent="submitGroup">
        <div class="form-heading">
          <div>
            <h2>编辑群组</h2>
            <p>成员关系由环境管理静默准备。</p>
          </div>
          <button type="button" class="text-button" @click="clearGroupDraft">取消</button>
        </div>
        <label>
          <span>群号</span>
          <input v-model="groupDraft.id" inputmode="numeric" pattern="[0-9]+" :disabled="!!editingGroupId" required>
        </label>
        <label>
          <span>群名称</span>
          <input v-model="groupDraft.name" required>
        </label>
        <div class="member-editor">
          <div class="member-editor-title">
            <strong>初始成员</strong>
            <button type="button" class="text-button" @click="addGroupMember">
              <IconPlus :size="15" aria-hidden="true" /> 添加成员
            </button>
          </div>
          <div v-for="(member, index) in groupDraft.members" :key="`${member.participantId}:${index}`" class="member-row">
            <select v-model="member.participantId" aria-label="群成员" @change="normalizeMemberRole(member)">
              <option value="" disabled>选择参与者</option>
              <option v-for="participant in participants" :key="participant.id" :value="participant.id">
                {{ participant.name }}（{{ participant.id }}）
              </option>
            </select>
            <select v-model="member.role" aria-label="群角色">
              <option value="owner" :disabled="isBotParticipant(member.participantId)">群主</option>
              <option value="admin">管理员</option>
              <option value="member">成员</option>
            </select>
            <input v-model="member.card" aria-label="群名片" placeholder="群名片">
            <button type="button" class="icon-danger" aria-label="移除成员" @click="removeGroupMember(index)">
              <IconTrash :size="15" aria-hidden="true" />
            </button>
          </div>
          <p v-if="!groupDraft.members.length" class="empty-members">至少添加一位普通用户作为群主。</p>
        </div>
        <button class="primary-button" type="submit" :disabled="busy">
          保存群组
        </button>
      </form>

      <div class="directory-list">
        <article v-for="group in snapshot.groups" :key="group.id" class="directory-card">
          <span class="directory-avatar is-group">{{ getInitial(group.name) }}</span>
          <span class="directory-copy"><strong>{{ group.name }}</strong><small>{{ group.id }} · {{ group.members.length }} 人</small></span>
          <div class="directory-actions">
            <button type="button" @click="editGroup(group)">编辑</button>
            <button type="button" class="is-danger" :disabled="busy" @click="deleteGroup(group)">删除</button>
          </div>
        </article>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { send } from '@koishijs/client'
import { IconPlus, IconRefresh, IconRobot, IconTrash, IconUser, IconUsers } from '@tabler/icons-vue'
import { computed, reactive, ref } from 'vue'
import type {
  ManageSandboxEnvironmentInput,
  SandboxBotProfile,
  SandboxGroup,
  SandboxGroupMember,
  SandboxImplementationProfile,
  SandboxSnapshot,
  SandboxUser,
  SandboxWorkspaceState,
} from '../src/types'

const props = defineProps<{ snapshot: SandboxSnapshot }>()
const emit = defineEmits<{ updated: [workspace: SandboxWorkspaceState] }>()

type EnvironmentSection = 'users' | 'bots' | 'groups'
const section = ref<EnvironmentSection>('users')
const busy = ref(false)
const errorMessage = ref('')
const editingUserId = ref('')
const editingBotId = ref('')
const editingGroupId = ref('')
const userDraft = reactive({ id: '', name: '' })
const botDraft = reactive<{ id: string, name: string, implementation: SandboxImplementationProfile, enabled: boolean }>({
  id: '',
  name: '',
  implementation: 'napcat',
  enabled: true,
})
const groupDraft = reactive<{ id: string, name: string, members: SandboxGroupMember[] }>({
  id: '',
  name: '',
  members: [],
})

const sections = computed(() => [
  { id: 'users' as const, label: '普通用户', icon: IconUser, count: props.snapshot.users.length },
  { id: 'bots' as const, label: '机器人', icon: IconRobot, count: props.snapshot.bots.length },
  { id: 'groups' as const, label: '群组', icon: IconUsers, count: props.snapshot.groups.length },
])
const participants = computed(() => [
  ...props.snapshot.users.map((user) => ({ ...user, type: 'user' as const })),
  ...props.snapshot.bots.map((bot) => ({ ...bot, type: 'bot' as const })),
])

async function runAction(input: ManageSandboxEnvironmentInput): Promise<boolean> {
  if (busy.value) return false
  busy.value = true
  errorMessage.value = ''
  try {
    emit('updated', await send('onebot-sandbox/manage-environment', input))
    return true
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '环境管理失败'
    return false
  } finally {
    busy.value = false
  }
}

async function submitUser() {
  const succeeded = await runAction({
    action: 'update-user',
    data: { id: userDraft.id, name: userDraft.name },
  })
  if (succeeded) clearUserDraft()
}

function editUser(user: SandboxUser) {
  editingUserId.value = user.id
  userDraft.id = user.id
  userDraft.name = user.name
}

function clearUserDraft() {
  editingUserId.value = ''
  userDraft.id = ''
  userDraft.name = ''
}

async function deleteUser(user: SandboxUser) {
  if (!window.confirm(`删除用户“${user.name}”及其关联会话？若其为群主，所属群组也会删除。`)) return
  const succeeded = await runAction({ action: 'delete-user', data: { id: user.id } })
  if (succeeded && editingUserId.value === user.id) clearUserDraft()
}

async function submitBot() {
  const succeeded = await runAction({
    action: 'update-bot',
    data: { ...botDraft },
  })
  if (succeeded) clearBotDraft()
}

function editBot(bot: SandboxBotProfile) {
  editingBotId.value = bot.id
  Object.assign(botDraft, bot)
}

function clearBotDraft() {
  editingBotId.value = ''
  Object.assign(botDraft, { id: '', name: '', implementation: 'napcat', enabled: true })
}

async function deleteBot(bot: SandboxBotProfile) {
  if (!window.confirm(`删除机器人“${bot.name}”及其关联会话？`)) return
  const succeeded = await runAction({ action: 'delete-bot', data: { id: bot.id } })
  if (succeeded && editingBotId.value === bot.id) clearBotDraft()
}

async function submitGroup() {
  const succeeded = await runAction({
    action: 'update-group',
    data: {
      id: groupDraft.id,
      name: groupDraft.name,
      members: groupDraft.members.map((member) => ({ ...member })),
    },
  })
  if (succeeded) clearGroupDraft()
}

function editGroup(group: SandboxGroup) {
  editingGroupId.value = group.id
  groupDraft.id = group.id
  groupDraft.name = group.name
  groupDraft.members = group.members.map((member) => ({ ...member }))
}

function clearGroupDraft() {
  editingGroupId.value = ''
  groupDraft.id = ''
  groupDraft.name = ''
  groupDraft.members = []
}

function addGroupMember() {
  const participant = participants.value.find(({ id }) => !groupDraft.members.some(({ participantId }) => participantId === id))
  if (!participant) return
  const hasOwner = groupDraft.members.some(({ role }) => role === 'owner')
  groupDraft.members.push({
    participantId: participant.id,
    card: participant.name,
    role: !hasOwner && participant.type === 'user' ? 'owner' : 'member',
  })
}

function removeGroupMember(index: number) {
  groupDraft.members.splice(index, 1)
}

function isBotParticipant(participantId: string) {
  return props.snapshot.bots.some(({ id }) => id === participantId)
}

function normalizeMemberRole(member: SandboxGroupMember) {
  if (member.role === 'owner' && isBotParticipant(member.participantId)) member.role = 'member'
}

async function deleteGroup(group: SandboxGroup) {
  if (!window.confirm(`删除群组“${group.name}”及其关联会话？`)) return
  const succeeded = await runAction({ action: 'delete-group', data: { id: group.id } })
  if (succeeded && editingGroupId.value === group.id) clearGroupDraft()
}

async function resetDefaultScene() {
  if (!window.confirm('恢复默认场景将清除当前环境中的全部修改，是否继续？')) return
  const succeeded = await runAction({ action: 'reset-default' })
  if (!succeeded) return
  clearUserDraft()
  clearBotDraft()
  clearGroupDraft()
}

function getInitial(name?: string) {
  return name?.trim().slice(0, 1).toUpperCase() || '?'
}
</script>

<style scoped>
.environment-manager {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
  color: var(--webqq-text);
  background: var(--webqq-bg);
}

.environment-header {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 24px 28px 18px;
  border-bottom: 1px solid var(--webqq-border);
}

.environment-header small,
.environment-header p,
.form-heading p,
.directory-copy small {
  color: var(--webqq-muted);
}

.environment-header h1,
.environment-header p,
.form-heading h2,
.form-heading p {
  margin: 0;
}

.environment-header h1 {
  margin-top: 3px;
  font-size: 22px;
}

.environment-header p {
  margin-top: 5px;
  font-size: 12px;
}

.environment-tabs {
  display: flex;
  flex: 0 0 auto;
  gap: 6px;
  padding: 12px 28px;
  border-bottom: 1px solid var(--webqq-border);
}

.environment-tabs button,
.danger-button,
.primary-button,
.text-button,
.directory-actions button,
.icon-danger {
  border: 0;
  font: inherit;
  cursor: pointer;
}

.environment-tabs button {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  border-radius: 9px;
  color: var(--webqq-muted);
  background: transparent;
}

.environment-tabs button.is-active {
  color: var(--webqq-accent);
  background: color-mix(in srgb, var(--webqq-accent) 10%, transparent);
}

.environment-tabs span {
  font-size: 11px;
}

.environment-error {
  flex: 0 0 auto;
  margin: 12px 28px 0;
  padding: 9px 12px;
  border-radius: 8px;
  color: #b91c1c;
  background: #fee2e2;
  font-size: 12px;
}

.environment-body {
  display: grid;
  min-height: 0;
  flex: 1;
  grid-template-columns: minmax(0, 1fr);
  gap: 20px;
  overflow: auto;
  padding: 20px 28px 28px;
}

.environment-body.is-editing {
  grid-template-columns: minmax(260px, 320px) minmax(0, 1fr);
}

.environment-form,
.directory-list {
  min-width: 0;
}

.environment-form {
  align-self: start;
  padding: 18px;
  border: 1px solid var(--webqq-border);
  border-radius: 14px;
  background: color-mix(in srgb, var(--webqq-surface-muted) 76%, transparent);
}

.form-heading {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.form-heading h2 {
  font-size: 15px;
}

.form-heading p {
  margin-top: 4px;
  font-size: 11px;
}

.environment-form > label {
  display: grid;
  gap: 6px;
  margin-bottom: 12px;
  color: var(--webqq-muted);
  font-size: 12px;
}

.environment-form input,
.environment-form select {
  width: 100%;
  min-width: 0;
  height: 36px;
  padding: 0 10px;
  border: 1px solid var(--webqq-border);
  border-radius: 8px;
  outline: 0;
  color: var(--webqq-text);
  background: var(--webqq-bg);
}

.environment-form input:focus,
.environment-form select:focus {
  border-color: var(--webqq-accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--webqq-accent) 18%, transparent);
}

.environment-form .checkbox-field {
  display: flex;
  align-items: center;
  gap: 8px;
}

.checkbox-field input {
  width: 16px;
  height: 16px;
}

.primary-button,
.danger-button {
  display: inline-flex;
  min-height: 36px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 14px;
  border-radius: 9px;
}

.primary-button {
  width: 100%;
  color: #fff;
  background: var(--webqq-accent);
}

.danger-button {
  color: #b91c1c;
  background: #fee2e2;
}

.primary-button:disabled,
.danger-button:disabled,
.directory-actions button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.text-button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  color: var(--webqq-accent);
  background: transparent;
  font-size: 12px;
}

.directory-list {
  display: grid;
  align-content: start;
  gap: 8px;
}

.directory-card {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 10px;
  padding: 11px 12px;
  border: 1px solid var(--webqq-border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--webqq-bg) 84%, transparent);
}

.directory-avatar {
  display: inline-flex;
  width: 36px;
  height: 36px;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: #fff;
  background: #64748b;
  font-size: 12px;
  font-weight: 700;
}

.directory-avatar.is-bot {
  background: var(--webqq-accent);
}

.directory-avatar.is-group {
  background: #0f766e;
}

.directory-copy,
.directory-copy strong,
.directory-copy small {
  min-width: 0;
}

.directory-copy strong,
.directory-copy small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.directory-copy strong {
  font-size: 13px;
}

.directory-copy small {
  margin-top: 3px;
  font-size: 11px;
}

.directory-actions {
  display: flex;
  gap: 4px;
}

.directory-actions button {
  padding: 5px 7px;
  border-radius: 6px;
  color: var(--webqq-accent);
  background: transparent;
  font-size: 11px;
}

.directory-actions button:hover,
.directory-actions button:focus-visible {
  background: var(--webqq-hover);
}

.directory-actions button.is-danger,
.icon-danger {
  color: #dc2626;
}

.status-pill {
  padding: 3px 7px;
  border-radius: 999px;
  font-size: 10px;
}

.status-pill.is-online {
  color: #15803d;
  background: #dcfce7;
}

.status-pill.is-offline {
  color: #64748b;
  background: #e2e8f0;
}

.member-editor {
  margin-bottom: 14px;
  padding-top: 4px;
  border-top: 1px solid var(--webqq-border);
}

.member-editor-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
  font-size: 12px;
}

.member-row {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(84px, 0.7fr) minmax(0, 1fr) 28px;
  gap: 6px;
  margin-bottom: 7px;
}

.member-row .icon-danger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  background: transparent;
}

.empty-members {
  margin: 0 0 10px;
  color: var(--webqq-muted);
  font-size: 11px;
}

@media (max-width: 900px) {
  .environment-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .environment-body {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 560px) {
  .environment-header,
  .environment-tabs,
  .environment-body {
    padding-right: 14px;
    padding-left: 14px;
  }

  .environment-tabs {
    overflow-x: auto;
  }

  .directory-card {
    grid-template-columns: 38px minmax(0, 1fr) auto;
  }

  .status-pill {
    display: none;
  }

  .directory-actions {
    grid-column: 2 / -1;
  }

  .member-row {
    grid-template-columns: 1fr 1fr 28px;
  }

  .member-row input {
    grid-column: 1 / 3;
  }
}
</style>
