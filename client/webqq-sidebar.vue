<template>
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
            <Popover v-slot="{ open }">
              <PopoverTrigger as-child>
                <button
                  type="button"
                  class="webqq-sidebar-notify"
                  :class="{ 'is-active': open, 'has-notification': pendingNotificationCount }"
                  :aria-label="`通知${pendingNotificationCount ? `（${pendingNotificationCount}）` : ''}`"
                >
                  <IconBell :size="20" stroke-width="1.8" aria-hidden="true" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="center"
                :class="['webqq-notification-popover', {
                  'is-frosted': workspace.appearance.enableWebQQFrostedGlass,
                  'is-plain': !workspace.appearance.enableWebQQFrostedGlass,
                  'is-color-dark': workspace.appearance.webQQColorMode === 'dark',
                  'is-color-auto': workspace.appearance.webQQColorMode === 'auto',
                }]"
                :style="{ '--webqq-accent': workspace.appearance.webQQAccentColor, '--webqq-muted': '#64748b' }"
              >
                <NotificationMenu
                  v-model:tab="notificationTab"
                  :friends="notificationRequests.friends"
                  :groups="notificationRequests.groups"
                  :snapshot="snapshot"
                  :handling-request-id="handlingRequestId"
                  :error-text="notificationErrorMessage"
                  @handle="handleNotificationRequest"
                />
              </PopoverContent>
            </Popover>
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
          <div v-webqq-scrollbar="{ tone: 'accent' }" class="webqq-session-list">
            <EnvironmentCreatePopover
              v-if="sidebarTab === 'groups'"
              type="group"
              :snapshot="snapshot"
              :current-user-id="currentUserId"
              :accent-color="workspace.appearance.webQQAccentColor"
              @submit="manageEnvironment"
            >
              <template #trigger>
                <button type="button" class="webqq-session webqq-session-create">
                  <span class="webqq-avatar webqq-avatar-create"><IconPlus :size="20" aria-hidden="true" /></span>
                  <span class="webqq-session-copy">
                    <strong>添加群组</strong>
                    <small>创建新的测试群组</small>
                  </span>
                </button>
              </template>
            </EnvironmentCreatePopover>
            <ContextMenu v-for="group in filteredGroupDirectory" :key="`directory:${group.id}`">
              <ContextMenuTrigger as-child>
                <button
                  type="button"
                  class="webqq-session"
                  :class="{ 'is-active': group.conversationId === activeConversationId }"
                  @click="group.conversationId && selectConversation(group.conversationId)"
                >
                  <WebqqAvatar class="webqq-avatar webqq-avatar-bot" kind="group" :name="group.name" />
                  <span class="webqq-session-copy">
                    <strong>{{ group.name }}</strong>
                    <small>
                      {{ group.member
                        ? `群聊 ${group.id} · ${getGroupRoleLabel(group.member.role)}`
                        : group.pending
                          ? `群聊 ${group.id} · 入群申请待处理`
                          : `群聊 ${group.id} · 右键申请加入` }}
                    </small>
                  </span>
                  <span :class="['webqq-relation-badge', `is-${group.relation}`]">
                    {{ group.member ? '已加入' : group.pending ? '待处理' : '未加入' }}
                  </span>
                </button>
              </ContextMenuTrigger>
              <ContextMenuContent style="z-index: 140">
                <ContextMenuItem v-if="!group.member && !group.pending && !currentOperatorIsBot" @select="requestJoinGroup(group.id)">
                  <IconUserPlus :size="16" aria-hidden="true" /> 申请加入群组
                </ContextMenuItem>
                <ContextMenuItem v-else-if="!group.member && group.pending" disabled>
                  <IconClock :size="16" aria-hidden="true" /> 等待群管理员处理
                </ContextMenuItem>
                <ContextMenuItem v-else-if="!group.member" disabled>
                  <IconRobotFace :size="16" aria-hidden="true" /> 当前机器人不支持主动申请加群
                </ContextMenuItem>
                <ContextMenuItem
                  v-if="group.member"
                  :disabled="group.member.role === 'member'"
                  @select="openGroupActionDialog('name', '', group.id)"
                >
                  <IconEdit :size="16" aria-hidden="true" />
                  {{ group.member.role === 'member' ? '需要管理员权限修改群名称' : '修改群名称' }}
                </ContextMenuItem>
                <ContextMenuItem
                  v-if="group.member"
                  :disabled="group.member.role === 'owner'"
                  class="text-red-600 focus:bg-red-50 focus:text-red-700 dark:focus:bg-red-950/40"
                  @select="leaveGroup(group.id)"
                >
                  <IconUserMinus :size="16" aria-hidden="true" />
                  {{ group.member.role === 'owner' ? '群主不能直接退群' : '退出群组' }}
                </ContextMenuItem>
                <ContextMenuItem @select="openEntityDialog('edit', { type: 'group', id: group.id })">
                  <IconEdit :size="16" aria-hidden="true" /> 编辑群组
                </ContextMenuItem>
                <ContextMenuItem class="text-red-600 focus:bg-red-50 focus:text-red-700 dark:focus:bg-red-950/40" @select="openEntityDialog('delete', { type: 'group', id: group.id })">
                  <IconTrash :size="16" aria-hidden="true" /> 删除群组
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
            <ContextMenu
              v-for="entry in filteredFriendDirectory"
              :key="entry.id"
            >
              <ContextMenuTrigger as-child>
                <button
                  type="button"
                  class="webqq-session"
                  :class="{ 'is-active': entry.conversationId === activeConversationId }"
                  @click="entry.conversationId && selectConversation(entry.conversationId)"
                >
                  <WebqqAvatar
                    class="webqq-avatar"
                    :kind="entry.isBot ? 'bot' : 'user'"
                    :name="entry.displayName"
                    :avatar="entry.avatar"
                  />
                  <span class="webqq-session-copy">
                    <strong>{{ entry.displayName }}</strong>
                    <small>{{ entry.status }}</small>
                  </span>
                  <span :class="['webqq-relation-badge', `is-${entry.relation}`]">
                    {{ entry.isFriend ? '已添加' : entry.pendingOutgoing || entry.pendingIncoming ? '待处理' : '未添加' }}
                  </span>
                </button>
              </ContextMenuTrigger>
              <ContextMenuContent style="z-index: 140">
                <ContextMenuItem v-if="!entry.isFriend && !entry.pendingOutgoing && !entry.pendingIncoming && !currentOperatorIsBot" @select="requestFriend(entry.id)">
                  <IconUserPlus :size="16" aria-hidden="true" /> 发送好友申请
                </ContextMenuItem>
                <ContextMenuItem v-else-if="entry.pendingOutgoing" disabled>
                  <IconClock :size="16" aria-hidden="true" /> 等待对方处理
                </ContextMenuItem>
                <ContextMenuItem v-else-if="entry.pendingIncoming" disabled>
                  <IconBell :size="16" aria-hidden="true" /> 请在通知中处理申请
                </ContextMenuItem>
                <ContextMenuItem v-else-if="!entry.isFriend" disabled>
                  <IconRobotFace :size="16" aria-hidden="true" /> 当前机器人不支持主动发送好友申请
                </ContextMenuItem>
                <ContextMenuItem v-if="entry.isFriend && !currentOperatorIsBot" @select="openRemarkDialog(entry.id)">
                  <IconTag :size="16" aria-hidden="true" /> 设置好友备注
                </ContextMenuItem>
                <ContextMenuItem v-if="entry.isFriend && !currentOperatorIsBot" class="text-red-600 focus:bg-red-50 focus:text-red-700 dark:focus:bg-red-950/40" @select="deleteFriend(entry.id)">
                  <IconUserMinus :size="16" aria-hidden="true" /> 删除好友
                </ContextMenuItem>
                <ContextMenuItem
                  v-if="currentGroup && !currentGroup.members.some(({ participantId }) => participantId === entry.id)"
                  @select="inviteToCurrentGroup(entry.id)"
                >
                  <IconUserPlus :size="16" aria-hidden="true" /> 邀请加入当前群组
                </ContextMenuItem>
                <ContextMenuItem @select="openEntityDialog('edit', { type: entry.isBot ? 'bot' : 'user', id: entry.id })">
                  <IconEdit :size="16" aria-hidden="true" /> 编辑{{ entry.isBot ? '机器人' : '用户' }}
                </ContextMenuItem>
                <ContextMenuItem class="text-red-600 focus:bg-red-50 focus:text-red-700 dark:focus:bg-red-950/40" @select="openEntityDialog('delete', { type: entry.isBot ? 'bot' : 'user', id: entry.id })">
                  <IconTrash :size="16" aria-hidden="true" /> 删除{{ entry.isBot ? '机器人' : '用户' }}
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
            <ContextMenu
              v-for="conversation in sidebarTab === 'recent' ? filteredConversations : []"
              :key="conversation.id"
            >
              <ContextMenuTrigger as-child>
                <button
                  type="button"
                  class="webqq-session"
                  :class="{ 'is-active': conversation.id === activeConversationId }"
                  @click="selectConversation(conversation.id)"
                >
                  <WebqqAvatar
                    class="webqq-avatar webqq-avatar-bot"
                    :kind="conversation.groupId ? 'group' : 'bot'"
                    :name="getConversationTitle(conversation)"
                    :avatar="getConversationAvatar(conversation)"
                  />
                  <span class="webqq-session-copy">
                    <strong>{{ getConversationTitle(conversation) }}</strong>
                    <small>{{ getConversationPreview(conversation.id) }}</small>
                  </span>
                  <time>{{ getConversationTime(conversation.id) }}</time>
                </button>
              </ContextMenuTrigger>
              <ContextMenuContent style="z-index: 140">
                <ContextMenuItem
                  v-if="conversation.groupId"
                  :disabled="getGroupMember(conversation.groupId, currentOperatorId ?? '')?.role === 'member'"
                  @select="openGroupActionDialog('name', '', conversation.groupId)"
                >
                  <IconEdit :size="16" aria-hidden="true" />
                  {{ getGroupMember(conversation.groupId, currentOperatorId ?? '')?.role === 'member' ? '需要管理员权限修改群名称' : '修改群名称' }}
                </ContextMenuItem>
                <ContextMenuItem
                  v-if="conversation.groupId"
                  :disabled="getGroupMember(conversation.groupId, currentOperatorId ?? '')?.role === 'owner'"
                  class="text-red-600 focus:bg-red-50 focus:text-red-700 dark:focus:bg-red-950/40"
                  @select="leaveGroup(conversation.groupId!)"
                >
                  <IconUserMinus :size="16" aria-hidden="true" />
                  {{ getGroupMember(conversation.groupId, currentOperatorId ?? '')?.role === 'owner' ? '群主不能直接退群' : '退出群组' }}
                </ContextMenuItem>
                <ContextMenuItem @select="openEntityDialog('edit', getConversationEntityTarget(conversation))">
                  <IconEdit :size="16" aria-hidden="true" /> 编辑{{ getConversationEntityLabel(conversation) }}
                </ContextMenuItem>
                <ContextMenuItem class="text-red-600 focus:bg-red-50 focus:text-red-700 dark:focus:bg-red-950/40" @select="openEntityDialog('delete', getConversationEntityTarget(conversation))">
                  <IconTrash :size="16" aria-hidden="true" /> 删除{{ getConversationEntityLabel(conversation) }}
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
            <p
              v-if="sidebarTab === 'friends'
                ? !filteredFriendDirectory.length
                : sidebarTab === 'groups'
                  ? !filteredGroupDirectory.length
                  : !filteredConversations.length"
              class="webqq-empty"
            >没有匹配的会话</p>
          </div>
        </aside>
</template>

<script setup lang="ts">
import {
  IconAddressBook, IconBell, IconClock, IconEdit, IconMessageCircle, IconPlus, IconRobotFace,
  IconSearch, IconTag, IconTrash, IconUser, IconUserCircle, IconUserMinus, IconUserPlus, IconUsers,
} from '@tabler/icons-vue'
import { computed, ref } from 'vue'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from './components/ui/context-menu'
import { Popover, PopoverContent, PopoverTrigger } from './components/ui/popover'
import EnvironmentCreatePopover from './environment-create-popover.vue'
import NotificationMenu from './notification-menu.vue'
import WebqqAvatar from './webqq-avatar.vue'
import { getIncomingNotificationRequests } from './notification-requests'
import { getFriendDirectory, getGroupDirectory } from './relationship-directory'
import { vWebqqScrollbar } from './webqq-scrollbar'
import type {
  ManageSandboxEnvironmentInput, SandboxAppearance, SandboxConversation, SandboxFriendAction,
  SandboxGroupAction, SandboxGroupMember, SandboxSnapshot, SandboxWorkspaceState,
} from '../src/types'

type SidebarTab = 'recent' | 'friends' | 'groups'
type EnvironmentEntityType = 'user' | 'bot' | 'group'
type EnvironmentDialogMode = 'edit' | 'delete'

export interface WebqqSidebarModel {
  snapshot: SandboxSnapshot
  appearance: SandboxAppearance
  currentView: 'messages' | 'contacts' | 'profile'
  currentUserId?: string
  currentOperatorId?: string
  activeConversationId?: string
}

const props = defineProps<{ model: WebqqSidebarModel }>()
const emit = defineEmits<{
  selectView: [view: WebqqSidebarModel['currentView']]
  selectConversation: [conversationId: string]
  manageEnvironment: [input: ManageSandboxEnvironmentInput, resolve: () => void, reject: (error: unknown) => void]
  friendAction: [input: SandboxFriendAction]
  groupAction: [input: SandboxGroupAction]
  handleNotification: [requestId: string, approve: boolean, resolve: () => void, reject: (error: unknown) => void]
  openEntityDialog: [mode: EnvironmentDialogMode, entity: { type: EnvironmentEntityType, id: string }]
  openGroupActionDialog: [mode: 'card' | 'name', targetId: string, groupId?: string]
  openRemarkDialog: [targetId: string]
}>()

const workspace = computed<SandboxWorkspaceState>(() => ({ snapshot: props.model.snapshot, appearance: props.model.appearance }))
const snapshot = computed(() => props.model.snapshot)
const currentView = computed(() => props.model.currentView)
const currentUserId = computed(() => props.model.currentUserId)
const currentOperatorId = computed(() => props.model.currentOperatorId)
const activeConversationId = computed(() => props.model.activeConversationId)
const currentOperatorIsBot = computed(() => snapshot.value.bots.some(({ id }) => id === currentOperatorId.value))
const searchQuery = ref('')
const sidebarTab = ref<SidebarTab>('recent')
const notificationTab = ref<'friends' | 'groups'>('friends')
const handlingRequestId = ref('')
const notificationErrorMessage = ref('')
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
const visibleConversations = computed(() => snapshot.value.conversations.filter(({ userId }) => userId === currentUserId.value))
const filteredConversations = computed(() => sidebarTab.value === 'recent' ? visibleConversations.value : [])
const notificationRequests = computed(() => getIncomingNotificationRequests(snapshot.value, currentUserId.value))
const pendingNotificationCount = computed(() => notificationRequests.value.friends.length + notificationRequests.value.groups.length)
const friendDirectory = computed(() => getFriendDirectory(snapshot.value, currentOperatorId.value))
const groupDirectory = computed(() => getGroupDirectory(snapshot.value, currentOperatorId.value))
const filteredFriendDirectory = computed(() => {
  if (sidebarTab.value !== 'friends') return []
  const query = searchQuery.value.trim().toLowerCase()
  return query ? friendDirectory.value.filter(({ id, displayName }) => id.includes(query) || displayName.toLowerCase().includes(query)) : friendDirectory.value
})
const filteredGroupDirectory = computed(() => {
  if (sidebarTab.value !== 'groups') return []
  const query = searchQuery.value.trim().toLowerCase()
  return query ? groupDirectory.value.filter(({ id, name }) => id.includes(query) || name.toLowerCase().includes(query)) : groupDirectory.value
})
const currentConversation = computed(() => visibleConversations.value.find(({ id }) => id === activeConversationId.value))
const currentGroup = computed(() => snapshot.value.groups.find(({ id }) => id === currentConversation.value?.groupId))

function selectNavigation(view: WebqqSidebarModel['currentView']) {
  if (view === 'messages') sidebarTab.value = 'recent'
  if (view === 'contacts') sidebarTab.value = 'friends'
  emit('selectView', view)
}

function selectSidebarTab(tab: SidebarTab) {
  sidebarTab.value = tab
  searchQuery.value = ''
  emit('selectView', 'contacts')
}

function selectConversation(conversationId: string) {
  emit('selectConversation', conversationId)
}

function manageEnvironment(input: ManageSandboxEnvironmentInput, resolve: () => void, reject: (error: unknown) => void) {
  emit('manageEnvironment', input, resolve, reject)
}

function requestFriend(targetId: string) {
  emit('friendAction', { action: 'request', targetId, comment: '来自 OneBot Sandbox 的好友申请' })
}

function deleteFriend(targetId: string) {
  emit('friendAction', { action: 'delete', targetId })
}

function requestJoinGroup(groupId: string) {
  emit('groupAction', { action: 'request-join', groupId, comment: '来自 OneBot Sandbox 的入群申请' })
}

function leaveGroup(groupId: string) {
  emit('groupAction', { action: 'leave', groupId })
}

function inviteToCurrentGroup(targetId: string) {
  if (currentGroup.value) emit('groupAction', { action: 'invite', groupId: currentGroup.value.id, targetId })
}

async function handleNotificationRequest(requestId: string, approve: boolean) {
  handlingRequestId.value = requestId
  notificationErrorMessage.value = ''
  try {
    await new Promise<void>((resolve, reject) => emit('handleNotification', requestId, approve, resolve, reject))
  } catch (error) {
    notificationErrorMessage.value = error instanceof Error ? error.message : '处理申请失败'
  } finally {
    handlingRequestId.value = ''
  }
}

function openEntityDialog(mode: EnvironmentDialogMode, entity: { type: EnvironmentEntityType, id: string }) {
  emit('openEntityDialog', mode, entity)
}

function openGroupActionDialog(mode: 'card' | 'name', targetId: string, groupId?: string) {
  emit('openGroupActionDialog', mode, targetId, groupId)
}

function openRemarkDialog(targetId: string) {
  emit('openRemarkDialog', targetId)
}

function getBot(botId?: string) {
  return snapshot.value.bots.find(({ id }) => id === botId)
}

function getConversationTitle(conversation: SandboxConversation) {
  return snapshot.value.groups.find(({ id }) => id === conversation.groupId)?.name ?? getBot(conversation.botId)?.name ?? conversation.id
}

function getConversationAvatar(conversation: SandboxConversation) {
  return conversation.groupId ? undefined : getBot(conversation.botId)?.avatar
}

function getConversationMessages(conversationId: string) {
  const ids = new Set(snapshot.value.conversations.find(({ id }) => id === conversationId)?.messageIds ?? [])
  return snapshot.value.messages.filter(({ id }) => ids.has(id))
}

function getConversationPreview(conversationId: string) {
  return getConversationMessages(conversationId).at(-1)?.content ?? '开始一段新对话'
}

function getConversationTime(conversationId: string) {
  const value = getConversationMessages(conversationId).at(-1)?.createdAt
  return value ? new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : ''
}

function getGroupMember(groupId: string, participantId: string) {
  return snapshot.value.groups.find(({ id }) => id === groupId)?.members.find((member) => member.participantId === participantId)
}

function getGroupRoleLabel(role: SandboxGroupMember['role']) {
  return role === 'owner' ? '群主' : role === 'admin' ? '管理员' : '成员'
}

function getConversationEntityTarget(conversation: SandboxConversation) {
  return conversation.groupId ? { type: 'group' as const, id: conversation.groupId } : { type: 'bot' as const, id: conversation.botId }
}

function getConversationEntityLabel(conversation: SandboxConversation) {
  return conversation.groupId ? '群组' : '机器人'
}
</script>
