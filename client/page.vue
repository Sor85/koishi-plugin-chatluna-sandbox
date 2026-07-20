<template>
  <k-layout container="onebot-sandbox-layout" main="onebot-sandbox-page">
    <k-content>
      <div
        class="webqq-workspace"
        :class="{
          'is-frosted': workspace.appearance.enableWebQQFrostedGlass,
          'has-tim-tail': workspace.appearance.webQQTimBubbleTail,
          'is-details-open': detailsOpen,
        }"
        :data-chat-style="workspace.appearance.webQQChatStyle"
        :data-color-mode="workspace.appearance.webQQColorMode"
        :data-mobile-view="currentView"
        :style="{ '--webqq-accent': workspace.appearance.webQQAccentColor }"
      >
        <nav class="webqq-rail" aria-label="WebQQ 主导航">
          <button
            v-for="item in navigationItems"
            :key="item.id"
            type="button"
            class="webqq-rail-button"
            :class="{ 'is-active': currentView === item.id }"
            :aria-label="item.label"
            :aria-current="currentView === item.id ? 'page' : undefined"
            @click="selectNavigation(item.id)"
          >
            <component :is="item.icon" :size="22" stroke-width="1.8" aria-hidden="true" />
          </button>
        </nav>

        <aside class="webqq-conversations" aria-label="会话列表">
          <header class="webqq-sidebar-tabs-row">
            <div class="webqq-sidebar-tabs" aria-label="会话分类">
              <button
                v-for="tab in sidebarTabs"
                :key="tab.id"
                type="button"
                :class="{ 'is-active': sidebarTab === tab.id }"
                :aria-current="sidebarTab === tab.id ? 'page' : undefined"
                @click="selectSidebarTab(tab.id)"
              >
                <component :is="tab.icon" :size="16" stroke-width="2" aria-hidden="true" />
                {{ tab.label }}
              </button>
            </div>
            <button type="button" class="webqq-sidebar-notify" aria-label="通知（暂不可用）" disabled>
              <IconBell :size="20" stroke-width="1.8" aria-hidden="true" />
            </button>
          </header>
          <label v-if="sidebarTab !== 'recent'" class="webqq-search">
            <IconSearch :size="18" aria-hidden="true" />
            <span class="sr-only">搜索会话</span>
            <input
              v-model="searchQuery"
              type="search"
              :placeholder="sidebarTab === 'friends' ? '搜索好友...' : '搜索群组...'"
              autocomplete="off"
            >
          </label>
          <div v-webqq-scrollbar class="webqq-session-list">
            <button
              v-for="conversation in filteredConversations"
              :key="conversation.id"
              type="button"
              class="webqq-session"
              :class="{ 'is-active': conversation.id === activeConversationId }"
              @click="selectConversation(conversation.id)"
            >
              <span class="webqq-avatar webqq-avatar-bot">{{ getInitial(getConversationTitle(conversation)) }}</span>
              <span class="webqq-session-copy">
                <strong>{{ getConversationTitle(conversation) }}</strong>
                <small>{{ getConversationPreview(conversation.id) }}</small>
              </span>
              <time>{{ getConversationTime(conversation.id) }}</time>
            </button>
            <p v-if="!filteredConversations.length" class="webqq-empty">没有匹配的会话</p>
          </div>
        </aside>

        <main class="webqq-chat">
          <header class="webqq-chat-header">
            <div class="webqq-chat-title">
              <span class="webqq-avatar webqq-avatar-bot">{{ getInitial(currentConversationTitle) }}</span>
              <div>
                <strong>{{ currentConversationTitle }}</strong>
                <span>{{ currentConversationSubtitle }}</span>
              </div>
            </div>
            <button
              type="button"
              class="webqq-icon-button"
              :class="{ 'is-active': detailsOpen }"
              :aria-label="detailsOpen ? '关闭会话信息' : '打开会话信息'"
              @click="detailsOpen = !detailsOpen"
            >
              <IconDots :size="22" aria-hidden="true" />
            </button>
          </header>

          <section v-webqq-scrollbar class="webqq-messages" aria-label="消息记录">
            <div v-if="!messages.length" class="webqq-welcome">
              <span class="webqq-avatar webqq-avatar-large webqq-avatar-bot">{{ getInitial(currentConversationTitle) }}</span>
              <strong>{{ currentConversationTitle }}</strong>
              <p>发送消息，验证插件在模拟 QQ 环境中的响应</p>
            </div>
            <ol v-else>
              <li
                v-for="message in messages"
                :key="message.id"
                class="webqq-message-row"
                :class="message.authorId === currentUser?.id ? 'is-outgoing' : 'is-incoming'"
              >
                <span class="webqq-message-avatar-wrap">
                  <span class="webqq-message-avatar">
                    {{ getInitial(getParticipantName(message.authorId)) }}
                  </span>
                </span>
                <div class="webqq-message-content">
                  <div class="webqq-sender-line">
                    <span class="webqq-message-author">{{ getParticipantName(message.authorId) }}</span>
                  </div>
                  <div class="webqq-message-body">
                    <p class="webqq-message-bubble">{{ message.content }}</p>
                  </div>
                </div>
              </li>
            </ol>
          </section>

          <form class="webqq-composer" @submit.prevent="sendMessage">
            <span v-if="errorMessage" class="webqq-composer-error" role="alert">{{ errorMessage }}</span>
            <span class="webqq-composer-avatar" aria-hidden="true">
              {{ getInitial(currentUser?.name) }}
            </span>
            <div class="webqq-composer-main">
              <label class="sr-only" for="onebot-sandbox-input">消息内容</label>
              <textarea
                id="onebot-sandbox-input"
                v-model="input"
                rows="1"
                placeholder="发送消息"
                :disabled="sending || !currentConversation"
                @keydown.enter.exact.prevent="sendMessage"
              />
            </div>
            <button class="webqq-composer-action" type="button" aria-label="选择文件" disabled>
              <IconPaperclip :size="19" stroke-width="2" aria-hidden="true" />
            </button>
            <button
              class="webqq-composer-action is-primary"
              type="submit"
              aria-label="发送"
              :disabled="sending || !input.trim() || !currentConversation"
            >
              <IconSend :size="19" stroke-width="2" aria-hidden="true" />
            </button>
          </form>
        </main>

        <aside class="webqq-profile" :aria-label="currentGroup ? '群信息' : '私聊信息'">
          <header class="webqq-info-header">
            <strong>{{ currentGroup ? '群信息' : '私聊信息' }}</strong>
            <button type="button" class="webqq-info-close" aria-label="关闭会话信息" @click="detailsOpen = false">
              <IconDots :size="22" aria-hidden="true" />
            </button>
          </header>

          <div v-if="currentGroup" class="webqq-group-info-body">
            <section v-webqq-scrollbar class="webqq-group-announcements">
              <div class="webqq-info-section-title">
                <h3>群公告</h3>
                <button
                  type="button"
                  :aria-label="announcementEditorOpen ? '取消添加群公告' : '添加群公告'"
                  :class="{ 'is-active': announcementEditorOpen }"
                  @click="toggleAnnouncementEditor"
                >
                  <IconPlus :size="17" aria-hidden="true" />
                </button>
              </div>
              <span v-if="infoErrorMessage" class="webqq-info-error" role="alert">{{ infoErrorMessage }}</span>
              <form v-if="announcementEditorOpen" class="webqq-announcement-editor" @submit.prevent="publishAnnouncement">
                <textarea v-model="announcementInput" rows="3" placeholder="发布一条群公告" />
                <div>
                  <button type="submit" :disabled="announcementSending || !announcementInput.trim()">
                    {{ announcementSending ? '发布中' : '发布' }}
                  </button>
                </div>
              </form>
              <p v-if="!currentGroup.announcements.length" class="webqq-group-empty">暂无群公告</p>
              <article
                v-for="announcement in currentGroup.announcements"
                :key="announcement.id"
                class="webqq-group-announcement"
              >
                <button
                  type="button"
                  class="webqq-announcement-delete"
                  :aria-label="`删除群公告：${announcement.content}`"
                  :disabled="deletingAnnouncementId === announcement.id"
                  @click="deleteAnnouncement(announcement.id)"
                >
                  <IconTrash :size="15" aria-hidden="true" />
                </button>
                <p>{{ announcement.content }}</p>
                <time>{{ getParticipantName(announcement.authorId) }} · {{ formatDateTime(announcement.createdAt) }}</time>
              </article>
            </section>
            <section class="webqq-group-members">
              <h3>群成员 {{ currentGroup.members.length }}</h3>
              <input v-model="groupMemberSearch" type="search" placeholder="搜索群昵称或 QQ 号">
              <div v-if="!visibleGroupMembers.length" class="webqq-group-empty">暂无群成员</div>
              <div v-else v-webqq-scrollbar class="webqq-group-member-list">
                <article v-for="member in visibleGroupMembers" :key="member.participantId" class="webqq-group-member">
                  <span class="webqq-menu-avatar">{{ getInitial(getGroupMemberName(member)) }}</span>
                  <span>
                    <strong>{{ getGroupMemberName(member) }}</strong>
                    <small>{{ member.participantId }}</small>
                  </span>
                  <em>{{ getGroupRoleLabel(member.role) }}</em>
                </article>
              </div>
            </section>
          </div>

          <div v-else v-webqq-scrollbar class="webqq-private-info">
            <div class="webqq-profile-hero">
              <span class="webqq-avatar webqq-avatar-profile webqq-avatar-bot">{{ getInitial(currentBot?.name) }}</span>
              <h2>{{ currentBot?.name ?? 'OneBot Sandbox' }}</h2>
              <p>{{ currentBot?.id ?? '未选择机器人' }}</p>
              <span class="webqq-online"><i /> 在线</span>
            </div>
            <dl class="webqq-profile-details">
              <div><dt>平台</dt><dd>OneBot</dd></div>
              <div><dt>会话类型</dt><dd>私聊</dd></div>
              <div><dt>当前用户</dt><dd>{{ currentUser?.name ?? '未选择' }}</dd></div>
              <div><dt>模拟环境</dt><dd>服务端内存</dd></div>
            </dl>
          </div>
        </aside>
      </div>
    </k-content>
  </k-layout>
</template>

<script setup lang="ts">
import { send } from '@koishijs/client'
import {
  IconAddressBook,
  IconBell,
  IconClock,
  IconDots,
  IconMessageCircle,
  IconPaperclip,
  IconPlus,
  IconSearch,
  IconSend,
  IconTrash,
  IconUser,
  IconUserCircle,
  IconUsers,
} from '@tabler/icons-vue'
import { computed, onMounted, ref, watch } from 'vue'
import {
  loadWorkspacePreferences,
  resolveWorkspaceSelection,
  saveWorkspacePreferences,
  type SandboxWorkspaceView,
} from './workspace-state'
import { vWebqqScrollbar } from './webqq-scrollbar'
import type {
  SandboxAppearance,
  SandboxConversation,
  SandboxGroupMember,
  SandboxSnapshot,
  SandboxWorkspaceState,
} from '../src/types'

const defaultAppearance: SandboxAppearance = {
  enableWebQQFrostedGlass: true,
  webQQChatStyle: 'tim',
  webQQTimBubbleTail: true,
  webQQColorMode: 'auto',
  webQQAccentColor: '#2563eb',
}
const emptySnapshot: SandboxSnapshot = {
  revision: 0,
  users: [],
  bots: [],
  groups: [],
  conversations: [],
  messages: [],
}
const workspace = ref<SandboxWorkspaceState>({
  snapshot: emptySnapshot,
  appearance: defaultAppearance,
})
const currentUserId = ref<string>()
const activeConversationId = ref<string>()
const currentView = ref<SandboxWorkspaceView>('messages')
const searchQuery = ref('')
const input = ref('')
const sending = ref(false)
const errorMessage = ref('')
const infoErrorMessage = ref('')
const announcementInput = ref('')
const announcementSending = ref(false)
const announcementEditorOpen = ref(false)
const deletingAnnouncementId = ref('')
const groupMemberSearch = ref('')
const detailsOpen = ref(false)
const hydrated = ref(false)
type SidebarTab = 'recent' | 'friends' | 'groups'
const sidebarTab = ref<SidebarTab>('recent')

const navigationItems = [
  { id: 'messages' as const, label: '消息', icon: IconMessageCircle },
  { id: 'contacts' as const, label: '联系人', icon: IconAddressBook },
  { id: 'profile' as const, label: '资料', icon: IconUserCircle },
]
const sidebarTabs = [
  { id: 'recent' as const, label: '最近', icon: IconClock },
  { id: 'friends' as const, label: '好友', icon: IconUser },
  { id: 'groups' as const, label: '群组', icon: IconUsers },
]
const snapshot = computed(() => workspace.value.snapshot)
const currentUser = computed(() => snapshot.value.users.find(({ id }) => id === currentUserId.value))
const visibleConversations = computed(() => snapshot.value.conversations.filter(({ userId }) => userId === currentUserId.value))
const filteredConversations = computed(() => {
  const conversations = visibleConversations.value.filter((conversation) => {
    if (sidebarTab.value === 'friends') return conversation.type === 'direct'
    if (sidebarTab.value === 'groups') return conversation.type === 'group'
    return true
  })
  const query = searchQuery.value.trim().toLowerCase()
  if (!query || sidebarTab.value === 'recent') return conversations
  return conversations.filter((conversation) => {
    return getConversationTitle(conversation).toLowerCase().includes(query)
      || conversation.botId.includes(query)
      || conversation.groupId?.includes(query)
  })
})
const currentConversation = computed(() => visibleConversations.value.find(({ id }) => id === activeConversationId.value))
const currentBot = computed(() => getBot(currentConversation.value?.botId))
const currentGroup = computed(() => snapshot.value.groups?.find(({ id }) => id === currentConversation.value?.groupId))
const currentConversationTitle = computed(() => currentConversation.value
  ? getConversationTitle(currentConversation.value)
  : '选择一个会话')
const currentConversationSubtitle = computed(() => {
  if (currentGroup.value) return `群聊 ${currentGroup.value.id} · ${currentGroup.value.members.length} 人`
  return currentBot.value ? '在线 · 虚拟 OneBot 机器人' : '暂无会话'
})
const visibleGroupMembers = computed(() => {
  const group = currentGroup.value
  const query = groupMemberSearch.value.trim().toLowerCase()
  if (!group) return []
  if (!query) return group.members
  return group.members.filter((member) => getGroupMemberName(member).toLowerCase().includes(query)
    || member.participantId.includes(query))
})
const messages = computed(() => {
  const ids = new Set(currentConversation.value?.messageIds ?? [])
  return snapshot.value.messages.filter(({ id }) => ids.has(id))
})

onMounted(async () => {
  workspace.value = await send('onebot-sandbox/workspace')
  applySelection(resolveWorkspaceSelection(snapshot.value, loadWorkspacePreferences(window.localStorage)))
  hydrated.value = true
})

watch([currentUserId, activeConversationId, currentView], () => {
  if (!hydrated.value) return
  saveWorkspacePreferences(window.localStorage, {
    currentUserId: currentUserId.value,
    activeConversationId: activeConversationId.value,
    currentView: currentView.value,
  })
})

watch(activeConversationId, () => {
  detailsOpen.value = false
  groupMemberSearch.value = ''
  announcementInput.value = ''
  announcementEditorOpen.value = false
  deletingAnnouncementId.value = ''
  infoErrorMessage.value = ''
})

function applySelection(selection: ReturnType<typeof resolveWorkspaceSelection>) {
  currentUserId.value = selection.currentUserId
  activeConversationId.value = selection.activeConversationId
  currentView.value = selection.currentView
}

function selectConversation(conversationId: string) {
  activeConversationId.value = conversationId
  currentView.value = 'messages'
}

function selectNavigation(view: SandboxWorkspaceView) {
  currentView.value = view
  if (view === 'messages') sidebarTab.value = 'recent'
  if (view === 'contacts') sidebarTab.value = 'friends'
}

function selectSidebarTab(tab: SidebarTab) {
  sidebarTab.value = tab
  searchQuery.value = ''
  currentView.value = 'contacts'
}

function getBot(botId?: string) {
  return snapshot.value.bots.find(({ id }) => id === botId)
}

function getConversationTitle(conversation: SandboxConversation) {
  return snapshot.value.groups?.find(({ id }) => id === conversation.groupId)?.name
    ?? getBot(conversation.botId)?.name
    ?? conversation.id
}

function getParticipantName(id: string) {
  return snapshot.value.users.find((user) => user.id === id)?.name
    ?? snapshot.value.bots.find((bot) => bot.id === id)?.name
    ?? id
}

function getInitial(name?: string) {
  return name?.trim().slice(0, 1).toUpperCase() || '?'
}

function getGroupMemberName(member: SandboxGroupMember) {
  return member.card?.trim() || getParticipantName(member.participantId)
}

function getGroupRoleLabel(role: SandboxGroupMember['role']) {
  if (role === 'owner') return '群主'
  if (role === 'admin') return '管理员'
  return '成员'
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function getConversationMessages(conversationId: string) {
  const conversation = snapshot.value.conversations.find(({ id }) => id === conversationId)
  const ids = new Set(conversation?.messageIds ?? [])
  return snapshot.value.messages.filter(({ id }) => ids.has(id))
}

function getConversationPreview(conversationId: string) {
  return getConversationMessages(conversationId).at(-1)?.content ?? '开始一段新对话'
}

function getConversationTime(conversationId: string) {
  const value = getConversationMessages(conversationId).at(-1)?.createdAt
  if (!value) return ''
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

async function sendMessage() {
  const content = input.value.trim()
  const user = currentUser.value
  const bot = currentBot.value
  const conversation = currentConversation.value
  if (!content || !user || !bot || !conversation || sending.value) return

  sending.value = true
  errorMessage.value = ''
  try {
    workspace.value = await send('onebot-sandbox/send-message', {
      actorUserId: user.id,
      botId: bot.id,
      conversationId: conversation.id,
      content,
    })
    applySelection(resolveWorkspaceSelection(snapshot.value, {
      currentUserId: user.id,
      activeConversationId: conversation.id,
      currentView: currentView.value,
    }))
    input.value = ''
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '发送失败'
  } finally {
    sending.value = false
  }
}

async function publishAnnouncement() {
  const content = announcementInput.value.trim()
  const user = currentUser.value
  const group = currentGroup.value
  if (!content || !user || !group || announcementSending.value) return

  announcementSending.value = true
  infoErrorMessage.value = ''
  try {
    workspace.value = await send('onebot-sandbox/set-group-announcement', {
      actorUserId: user.id,
      groupId: group.id,
      content,
    })
    announcementInput.value = ''
    announcementEditorOpen.value = false
  } catch (error) {
    infoErrorMessage.value = error instanceof Error ? error.message : '发布群公告失败'
  } finally {
    announcementSending.value = false
  }
}

function toggleAnnouncementEditor() {
  announcementEditorOpen.value = !announcementEditorOpen.value
  announcementInput.value = ''
  infoErrorMessage.value = ''
}

async function deleteAnnouncement(announcementId: string) {
  const user = currentUser.value
  const group = currentGroup.value
  if (!user || !group || deletingAnnouncementId.value) return

  deletingAnnouncementId.value = announcementId
  infoErrorMessage.value = ''
  try {
    workspace.value = await send('onebot-sandbox/delete-group-announcement', {
      actorUserId: user.id,
      groupId: group.id,
      announcementId,
    })
  } catch (error) {
    infoErrorMessage.value = error instanceof Error ? error.message : '删除群公告失败'
  } finally {
    deletingAnnouncementId.value = ''
  }
}
</script>
