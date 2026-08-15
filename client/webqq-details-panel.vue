<template>
  <aside class="webqq-profile" :aria-label="panelLabel">
    <header class="webqq-info-header">
      <strong>{{ panelLabel }}</strong>
      <button type="button" class="webqq-info-close" aria-label="关闭会话信息" @click="emit('close')">
        <IconDots :size="22" aria-hidden="true" />
      </button>
    </header>

    <div v-if="model.view === 'profile'" v-webqq-scrollbar="{ disabled: preview }" class="webqq-private-info">
      <div class="webqq-profile-hero">
        <span class="webqq-avatar webqq-avatar-profile webqq-avatar-bot"><IconDatabase :size="32" aria-hidden="true" /></span>
        <h2>{{ persistenceTitle }}</h2>
        <p>修订 {{ model.revision }}</p>
      </div>
      <dl class="webqq-profile-details">
        <div><dt>普通用户</dt><dd>{{ model.counts.users }}</dd></div>
        <div><dt>虚拟机器人</dt><dd>{{ model.counts.bots }}</dd></div>
        <div><dt>群组</dt><dd>{{ model.counts.groups }}</dd></div>
        <div><dt>待处理申请</dt><dd>{{ model.counts.requests }}</dd></div>
        <div><dt>状态来源</dt><dd :title="model.persistence.message">{{ persistenceLabel }}</dd></div>
      </dl>
    </div>

    <div v-else-if="model.group" class="chatluna-sandbox-group-info-body">
      <section v-webqq-scrollbar="{ disabled: preview, tone: 'accent' }" class="chatluna-sandbox-group-announcements">
        <div class="webqq-info-section-title">
          <h3>群公告</h3>
          <button type="button" :aria-label="announcementEditorOpen ? '取消添加群公告' : '添加群公告'" :class="{ 'is-active': announcementEditorOpen }" @click="toggleAnnouncementEditor">
            <IconPlus :size="17" aria-hidden="true" />
          </button>
        </div>
        <span v-if="errorMessage" class="webqq-info-error" role="alert">{{ errorMessage }}</span>
        <form v-if="announcementEditorOpen" class="webqq-announcement-editor" @submit.prevent="publishAnnouncement">
          <textarea v-model="announcementInput" rows="3" placeholder="发布一条群公告" />
          <div><button type="submit" :disabled="announcementSending || !announcementInput.trim()">{{ announcementSending ? '发布中' : '发布' }}</button></div>
        </form>
        <p v-if="!model.group.announcements.length" class="chatluna-sandbox-group-empty">暂无群公告</p>
        <article v-for="announcement in model.group.announcements" :key="announcement.id" class="chatluna-sandbox-group-announcement">
          <button type="button" class="webqq-announcement-delete" :aria-label="`删除群公告：${announcement.content}`" :disabled="deletingAnnouncementId === announcement.id" @click="deleteAnnouncement(announcement.id)">
            <IconTrash :size="15" aria-hidden="true" />
          </button>
          <p>{{ announcement.content }}</p>
          <time>{{ getParticipant(announcement.authorId).name }} · {{ formatDateTime(announcement.createdAt) }}</time>
        </article>
      </section>
      <section class="chatluna-sandbox-group-members">
        <h3>群成员 {{ model.group.members.length }}</h3>
        <input v-model="groupMemberSearch" type="search" placeholder="搜索群昵称或 QQ 号">
        <div v-if="!visibleGroupMembers.length" class="chatluna-sandbox-group-empty">暂无群成员</div>
        <div v-else v-webqq-scrollbar="{ disabled: preview, tone: 'accent' }" class="chatluna-sandbox-group-member-list">
          <ContextMenu v-for="member in visibleGroupMembers" :key="member.participantId">
            <ContextMenuTrigger as-child>
              <article class="chatluna-sandbox-group-member">
                <WebqqAvatar class="webqq-menu-avatar" :kind="getParticipant(member.participantId).isBot ? 'bot' : 'user'" :name="getGroupMemberName(member)" :avatar="getParticipant(member.participantId).avatar" />
                <span><strong>{{ getGroupMemberName(member) }}</strong><small>{{ member.participantId }}</small></span>
                <span class="chatluna-sandbox-group-member-badges">
                  <em v-if="member.title" class="is-title">{{ member.title }}</em>
                  <em>{{ getGroupRoleLabel(member.role) }}</em>
                </span>
              </article>
            </ContextMenuTrigger>
            <GroupMemberMenu
              :actor="getCurrentGroupMember(model.currentOperatorId ?? '')"
              :target="member"
              @mention="emit('mentionGroupMember', member.participantId)"
              @poke="emit('pokeGroupMember', member.participantId)"
              @set-card="emit('setGroupCard', member.participantId)"
              @set-title="emit('setGroupTitle', member.participantId)"
              @set-admin="emit('setGroupAdmin', member.participantId, $event)"
              @transfer-owner="emit('transferGroupOwner', member.participantId)"
              @kick="emit('kickGroupMember', member.participantId)"
            />
          </ContextMenu>
        </div>
      </section>
    </div>

    <div v-else v-webqq-scrollbar="{ disabled: preview, tone: 'accent' }" class="webqq-private-info">
      <div class="webqq-profile-hero">
        <WebqqAvatar class="webqq-avatar webqq-avatar-profile" :kind="model.privateParticipant?.isBot ? 'bot' : 'user'" :name="model.privateParticipant?.name" :avatar="model.privateParticipant?.avatar" />
        <h2>{{ model.privateParticipant?.name ?? '未选择联系人' }}</h2>
        <p>{{ model.privateParticipant?.id ?? '未选择会话' }}</p>
        <span class="webqq-online"><i /> 在线</span>
      </div>
      <dl class="webqq-profile-details">
        <div v-if="model.privateParticipant?.personalNote"><dt>个性签名</dt><dd>{{ model.privateParticipant.personalNote }}</dd></div>
        <div><dt>平台</dt><dd>OneBot</dd></div>
        <div><dt>会话类型</dt><dd>私聊</dd></div>
        <div><dt>当前操作者</dt><dd>{{ model.currentOperatorName || '未选择' }}</dd></div>
        <div><dt>模拟环境</dt><dd :title="model.persistence.message">{{ persistenceLabel }}</dd></div>
      </dl>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { IconDatabase, IconDots, IconPlus, IconTrash } from '@tabler/icons-vue'
import { computed, ref, watch } from 'vue'
import { ContextMenu, ContextMenuTrigger } from './components/ui/context-menu'
import GroupMemberMenu from './group-member-menu.vue'
import { getGroupMemberDisplayName, getGroupRoleLabel } from './webqq/group-display'
import WebqqAvatar from './webqq-avatar.vue'
import { vWebqqScrollbar } from './webqq-scrollbar'
import type { SandboxBotProfile, SandboxGroup, SandboxGroupMember, SandboxPersistenceStatus } from '../src/types'

export interface WebqqDetailsParticipant {
  name: string
  avatar?: string
  isBot: boolean
}

export interface WebqqDetailsPanelModel {
  view: 'profile' | 'group' | 'private'
  conversationId?: string
  revision: number
  counts: { users: number, bots: number, groups: number, requests: number }
  group?: SandboxGroup
  bot?: SandboxBotProfile
  privateParticipant?: { id: string, name: string, avatar?: string, isBot: boolean, personalNote?: string }
  currentOperatorName?: string
  currentOperatorId?: string
  persistence: SandboxPersistenceStatus
  participants: Record<string, WebqqDetailsParticipant>
}

const props = defineProps<{ model: WebqqDetailsPanelModel; preview?: boolean }>()
const preview = computed(() => props.preview)
const emit = defineEmits<{
  close: []
  publishAnnouncement: [content: string, resolve: () => void, reject: (error: unknown) => void]
  deleteAnnouncement: [announcementId: string, resolve: () => void, reject: (error: unknown) => void]
  mentionGroupMember: [targetId: string]
  pokeGroupMember: [targetId: string]
  setGroupCard: [targetId: string]
  setGroupTitle: [targetId: string]
  setGroupAdmin: [targetId: string, enabled: boolean]
  transferGroupOwner: [targetId: string]
  kickGroupMember: [targetId: string]
  openProfile: [participantId: string]
}>()

const announcementInput = ref('')
const announcementSending = ref(false)
const announcementEditorOpen = ref(false)
const deletingAnnouncementId = ref('')
const groupMemberSearch = ref('')
const errorMessage = ref('')
const panelLabel = computed(() => props.model.view === 'profile' ? '环境摘要' : props.model.group ? '群信息' : '私聊信息')
const persistenceTitle = computed(() => props.model.persistence.mode === 'database' ? '数据库持久化场景' : '默认内存场景')
const persistenceLabel = computed(() => {
  const persistence = props.model.persistence
  if (persistence.mode === 'memory') return '服务端内存'
  if (!persistence.available) return 'Koishi Database 不可用'
  return persistence.persisted ? 'Koishi Database' : 'Koishi Database 待写入'
})
const visibleGroupMembers = computed(() => {
  const group = props.model.group
  const query = groupMemberSearch.value.trim().toLowerCase()
  if (!group || !query) return group?.members ?? []
  return group.members.filter((member) => getGroupMemberName(member).toLowerCase().includes(query) || member.participantId.includes(query))
})

watch(() => props.model.conversationId, () => {
  groupMemberSearch.value = ''
  announcementInput.value = ''
  announcementEditorOpen.value = false
  deletingAnnouncementId.value = ''
  errorMessage.value = ''
})

function getParticipant(id: string): WebqqDetailsParticipant {
  return props.model.participants[id] ?? { name: id, isBot: false }
}

function getGroupMemberName(member: SandboxGroupMember) {
  return getGroupMemberDisplayName(member, getParticipant(member.participantId).name)
}

function getCurrentGroupMember(participantId: string) {
  return props.model.group?.members.find((member) => member.participantId === participantId)
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function toggleAnnouncementEditor() {
  announcementEditorOpen.value = !announcementEditorOpen.value
  announcementInput.value = ''
  errorMessage.value = ''
}

async function publishAnnouncement() {
  const content = announcementInput.value.trim()
  if (!content || announcementSending.value) return
  announcementSending.value = true
  errorMessage.value = ''
  try {
    await new Promise<void>((resolve, reject) => emit('publishAnnouncement', content, resolve, reject))
    announcementInput.value = ''
    announcementEditorOpen.value = false
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '发布群公告失败'
  } finally {
    announcementSending.value = false
  }
}

async function deleteAnnouncement(announcementId: string) {
  if (deletingAnnouncementId.value) return
  deletingAnnouncementId.value = announcementId
  errorMessage.value = ''
  try {
    await new Promise<void>((resolve, reject) => emit('deleteAnnouncement', announcementId, resolve, reject))
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '删除群公告失败'
  } finally {
    deletingAnnouncementId.value = ''
  }
}
</script>
