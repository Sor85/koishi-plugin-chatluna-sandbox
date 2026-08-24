<template>
        <nav class="webqq-rail" aria-label="WebQQ 主导航">
          <div class="webqq-brand" aria-label="ChatLuna Sandbox">
            <span class="webqq-brand-logo" aria-hidden="true">
              <SandboxActivityIcon />
            </span>
            <strong>ChatLuna Sandbox</strong>
          </div>
          <button
            v-for="item in visibleNavigationItems"
            :key="item.id"
            type="button"
            class="webqq-rail-button"
            :class="{
              'is-active': isNavigationActive(item.id),
              'is-rail-pin-end': item.id === 'spaces',
              'is-mcp-running': item.id === 'spaces' && spacesBusy,
            }"
            :aria-label="item.id === 'spaces' && spacesBusy ? 'AI 测试空间（AI 控制中）' : item.label"
            :aria-current="isNavigationActive(item.id) ? 'page' : undefined"
            @click="selectNavigation(item.id)"
          >
            <SandboxAgentControlIcon v-if="item.id === 'spaces'" :running="spacesBusy" />
            <component v-else-if="item.icon" :is="item.icon" :size="20" stroke-width="1.8" aria-hidden="true" />
            <span v-if="item.id !== 'spaces'" class="webqq-rail-label">{{ item.label }}</span>
          </button>
        </nav>

        <aside v-if="isWebqqView" class="webqq-conversations" aria-label="会话列表">
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
                  'is-frosted': appearance.enableSandboxFrostedGlass,
                  'is-plain': !appearance.enableSandboxFrostedGlass,
                  'is-color-dark': colorMode === 'dark',
                }]"
                :style="{ '--webqq-accent': appearance.sandboxAccentColor, '--webqq-muted': '#64748b' }"
              >
                <NotificationMenu
                  v-model:tab="notificationTab"
                  :friends="notificationRequests.friends"
                  :groups="notificationRequests.groups"
                  :participants="model.participants"
                  :group-names="model.groupNames"
                  :handling-request-id="handlingRequestId"
                  :error-text="notificationErrorMessage"
                  @handle="handleNotificationRequest"
                />
              </PopoverContent>
            </Popover>
          </header>
          <label v-if="sidebarTab !== 'recent'" class="chatluna-sandbox-search">
            <IconSearch :size="18" aria-hidden="true" />
            <span class="sr-only">搜索会话</span>
            <input
              v-model="searchQuery"
              type="search"
              :placeholder="sidebarTab === 'friends' ? '搜索好友...' : '搜索群组...'"
              autocomplete="off"
            >
          </label>
          <div v-webqq-scrollbar="{ disabled: preview, tone: 'accent' }" class="webqq-session-list">
            <EnvironmentCreatePopover
              v-if="sidebarTab === 'groups'"
              type="group"
              :current-operator="model.currentOperator"
              :bots="model.bots"
              :color-mode="colorMode"
              :accent-color="appearance.sandboxAccentColor"
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
                  :class="{ 'is-active': group.conversationId && group.conversationId === activeConversationId }"
                  @click="group.conversationId && selectConversation(group.conversationId)"
                >
                  <WebqqAvatar class="webqq-avatar webqq-avatar-bot" kind="group" :name="group.name" :avatar="group.avatar" />
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
                <ContextMenuItem v-if="!group.member && !group.pending" @select="requestJoinGroup(group.id)">
                  <IconUserPlus :size="16" aria-hidden="true" /> 申请加入群组
                  <WebqqMenuExtensionMark />
                </ContextMenuItem>
                <ContextMenuItem v-else-if="!group.member && group.pending" disabled>
                  <IconClock :size="16" aria-hidden="true" /> 等待群管理员处理
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
                  <WebqqMenuExtensionMark />
                </ContextMenuItem>
                <ContextMenuItem class="text-red-600 focus:bg-red-50 focus:text-red-700 dark:focus:bg-red-950/40" @select="openEntityDialog('delete', { type: 'group', id: group.id })">
                  <IconTrash :size="16" aria-hidden="true" /> 删除群组
                  <WebqqMenuExtensionMark />
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
                  :class="{ 'is-active': entry.conversationId && entry.conversationId === activeConversationId }"
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
                <ContextMenuItem @select="emit('openProfile', entry.id)">
                  <IconId :size="16" aria-hidden="true" /> 查看资料
                </ContextMenuItem>
                <ContextMenuItem v-if="!entry.isFriend && !entry.pendingOutgoing && !entry.pendingIncoming" @select="requestFriend(entry.id)">
                  <IconUserPlus :size="16" aria-hidden="true" /> 发送好友申请
                  <WebqqMenuExtensionMark />
                </ContextMenuItem>
                <ContextMenuItem v-else-if="entry.pendingOutgoing" disabled>
                  <IconClock :size="16" aria-hidden="true" /> 等待对方处理
                </ContextMenuItem>
                <ContextMenuItem v-else-if="entry.pendingIncoming" disabled>
                  <IconBell :size="16" aria-hidden="true" /> 请在通知中处理申请
                </ContextMenuItem>
                <ContextMenuItem v-if="entry.isFriend" @select="openRemarkDialog(entry.id)">
                  <IconTag :size="16" aria-hidden="true" /> 设置好友备注
                  <WebqqMenuExtensionMark />
                </ContextMenuItem>
                <ContextMenuItem v-if="entry.isFriend" class="text-red-600 focus:bg-red-50 focus:text-red-700 dark:focus:bg-red-950/40" @select="deleteFriend(entry.id)">
                  <IconUserMinus :size="16" aria-hidden="true" /> 删除好友
                </ContextMenuItem>
                <ContextMenuItem
                  v-if="currentGroupId && !model.currentGroupMemberIds.includes(entry.id)"
                  @select="inviteToCurrentGroup(entry.id)"
                >
                  <IconUserPlus :size="16" aria-hidden="true" /> 邀请加入当前群组
                  <WebqqMenuExtensionMark />
                </ContextMenuItem>
                <ContextMenuItem @select="openEntityDialog('edit', { type: entry.isBot ? 'bot' : 'user', id: entry.id })">
                  <IconEdit :size="16" aria-hidden="true" /> 编辑{{ entry.isBot ? '机器人' : '用户' }}
                  <WebqqMenuExtensionMark />
                </ContextMenuItem>
                <ContextMenuItem class="text-red-600 focus:bg-red-50 focus:text-red-700 dark:focus:bg-red-950/40" @select="openEntityDialog('delete', { type: entry.isBot ? 'bot' : 'user', id: entry.id })">
                  <IconTrash :size="16" aria-hidden="true" /> 删除{{ entry.isBot ? '机器人' : '用户' }}
                  <WebqqMenuExtensionMark />
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
                    class="webqq-avatar"
                    :kind="conversation.avatarKind"
                    :name="conversation.title"
                    :avatar="conversation.avatar"
                  />
                  <span class="webqq-session-copy">
                    <strong>{{ conversation.title }}</strong>
                    <small>{{ conversation.preview }}</small>
                  </span>
                  <time>{{ conversation.time }}</time>
                </button>
              </ContextMenuTrigger>
              <ContextMenuContent style="z-index: 140">
                <ContextMenuItem
                  v-if="conversation.groupId"
                  :disabled="conversation.actorRole === 'member'"
                  @select="openGroupActionDialog('name', '', conversation.groupId)"
                >
                  <IconEdit :size="16" aria-hidden="true" />
                  {{ conversation.actorRole === 'member' ? '需要管理员权限修改群名称' : '修改群名称' }}
                </ContextMenuItem>
                <ContextMenuItem
                  v-if="conversation.groupId"
                  :disabled="conversation.actorRole === 'owner'"
                  class="text-red-600 focus:bg-red-50 focus:text-red-700 dark:focus:bg-red-950/40"
                  @select="leaveGroup(conversation.groupId!)"
                >
                  <IconUserMinus :size="16" aria-hidden="true" />
                  {{ conversation.actorRole === 'owner' ? '群主不能直接退群' : '退出群组' }}
                </ContextMenuItem>
                <ContextMenuItem
                  class="text-red-600 focus:bg-red-50 focus:text-red-700 dark:focus:bg-red-950/40"
                  @select="emit('removeRecentConversation', conversation.id)"
                >
                  <IconTrash :size="16" aria-hidden="true" /> 删除会话
                </ContextMenuItem>
                <ContextMenuItem @select="openEntityDialog('edit', conversation.entityTarget)">
                  <IconEdit :size="16" aria-hidden="true" /> 编辑{{ conversation.entityLabel }}
                  <WebqqMenuExtensionMark />
                </ContextMenuItem>
                <ContextMenuItem class="text-red-600 focus:bg-red-50 focus:text-red-700 dark:focus:bg-red-950/40" @select="openEntityDialog('delete', conversation.entityTarget)">
                  <IconTrash :size="16" aria-hidden="true" /> 删除{{ conversation.entityLabel }}
                  <WebqqMenuExtensionMark />
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
  IconBell, IconBrain, IconBug, IconClock, IconEdit, IconFileCode, IconHistory, IconId, IconMessageCircle, IconPlus,
  IconSearch, IconSettings, IconTag, IconTrash, IconUser, IconUserMinus, IconUserPlus, IconUsers,
} from '@tabler/icons-vue'
import { computed, ref } from 'vue'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from './components/ui/context-menu'
import { Popover, PopoverContent, PopoverTrigger } from './components/ui/popover'
import EnvironmentCreatePopover from './environment-create-popover.vue'
import NotificationMenu from './notification-menu.vue'
import SandboxActivityIcon from './sandbox-activity-icon.vue'
import SandboxAgentControlIcon from './sandbox-agent-control-icon.vue'
import { getGroupRoleLabel } from './webqq/group-display'
import WebqqAvatar from './webqq-avatar.vue'
import WebqqMenuExtensionMark from './webqq-menu-extension-mark.vue'
import { vWebqqScrollbar } from './webqq-scrollbar'
import type {
  ManageSandboxEnvironmentInput, SandboxAppearance, SandboxBotProfile, SandboxFriendAction,
  SandboxGroup, SandboxGroupAction, SandboxGroupMember, SandboxParticipant, SandboxRelationshipRequest,
} from '../src/types'

type SidebarTab = 'recent' | 'friends' | 'groups'
type EnvironmentEntityType = 'user' | 'bot' | 'group'
type EnvironmentDialogMode = 'edit' | 'delete'

export interface WebqqSidebarConversation {
  id: string
  groupId?: string
  title: string
  avatar?: string
  avatarKind: 'user' | 'bot' | 'group'
  preview: string
  time: string
  actorRole?: SandboxGroupMember['role']
  entityTarget: { type: 'user' | 'bot' | 'group', id: string }
  entityLabel: '用户' | '机器人' | '群组'
}

export interface WebqqSidebarFriend {
  id: string
  isBot: boolean
  isFriend: boolean
  pendingOutgoing: boolean
  pendingIncoming: boolean
  conversationId?: string
  avatar?: string
  displayName: string
  status: string
  relation: 'added' | 'pending' | 'missing'
}

export interface WebqqSidebarGroup extends SandboxGroup {
  member?: SandboxGroupMember
  pending: boolean
  conversationId?: string
  relation: 'joined' | 'pending' | 'missing'
}

interface SidebarParticipant {
  name: string
  avatar?: string
  isBot: boolean
}

export interface WebqqSidebarModel {
  appearance: SandboxAppearance
  currentView: 'messages' | 'contacts' | 'profile' | 'debug' | 'mcp-calls' | 'model-requests' | 'presets' | 'spaces'
  activeConversationId?: string
  currentGroupId?: string
  currentGroupMemberIds: string[]
  currentOperator?: Pick<SandboxParticipant, 'id' | 'name'>
  bots: Pick<SandboxBotProfile, 'id' | 'name'>[]
  conversations: WebqqSidebarConversation[]
  friends: WebqqSidebarFriend[]
  groups: WebqqSidebarGroup[]
  notificationRequests: { friends: SandboxRelationshipRequest[], groups: SandboxRelationshipRequest[] }
  participants: Record<string, SidebarParticipant>
  groupNames: Record<string, string>
}

const props = defineProps<{
  model: WebqqSidebarModel
  activeSpaceId?: string
  colorMode: 'light' | 'dark'
  preview?: boolean
  mcpRunning?: boolean
}>()
const preview = computed(() => props.preview)
// 缩略图预览不得播放运行特效，避免总览卡片再次出现已去掉的 AI 动效。
const spacesBusy = computed(() => !!props.mcpRunning && !preview.value)
const emit = defineEmits<{
  selectView: [view: WebqqSidebarModel['currentView']]
  selectConversation: [conversationId: string]
  removeRecentConversation: [conversationId: string]
  manageEnvironment: [input: ManageSandboxEnvironmentInput, resolve: () => void, reject: (error: unknown) => void]
  friendAction: [input: SandboxFriendAction]
  groupAction: [input: SandboxGroupAction]
  handleNotification: [requestId: string, approve: boolean, resolve: () => void, reject: (error: unknown) => void]
  openEntityDialog: [mode: EnvironmentDialogMode, entity: { type: EnvironmentEntityType, id: string }]
  openGroupActionDialog: [mode: 'card' | 'name', targetId: string, groupId?: string]
  openRemarkDialog: [targetId: string]
  openProfile: [participantId: string]
}>()

const appearance = computed(() => props.model.appearance)
const colorMode = computed(() => props.colorMode)
const currentView = computed(() => props.model.currentView)
const isWebqqView = computed(() => currentView.value === 'messages' || currentView.value === 'contacts')
const activeConversationId = computed(() => props.model.activeConversationId)
const currentGroupId = computed(() => props.model.currentGroupId)
const searchQuery = ref('')
const sidebarTab = ref<SidebarTab>('recent')
const notificationTab = ref<'friends' | 'groups'>('friends')
const handlingRequestId = ref('')
const notificationErrorMessage = ref('')
const navigationItems = [
  { id: 'messages' as const, label: '消息', icon: IconMessageCircle },
  { id: 'debug' as const, label: '调试', icon: IconBug },
  { id: 'mcp-calls' as const, label: 'MCP 调用', icon: IconHistory },
  { id: 'model-requests' as const, label: '模型请求', icon: IconBrain },
  { id: 'presets' as const, label: '预设', icon: IconFileCode },
  { id: 'profile' as const, label: '环境管理', icon: IconSettings },
  { id: 'spaces' as const, label: 'AI 测试空间' },
]
const visibleNavigationItems = computed(() => {
  // 总览仍保留 activeSpaceId 以定位缩回的空间卡片，不能仅据此判断仍在空间内部。
  const isInsideTestSpace = props.activeSpaceId && currentView.value !== 'spaces'
  return isInsideTestSpace
    ? navigationItems.filter(({ id }) => id === 'messages' || id === 'spaces')
    : navigationItems
})
const sidebarTabs = [
  { id: 'recent' as const, label: '最近', icon: IconClock },
  { id: 'friends' as const, label: '好友', icon: IconUser },
  { id: 'groups' as const, label: '群组', icon: IconUsers },
]
const filteredConversations = computed(() => sidebarTab.value === 'recent' ? props.model.conversations : [])
const notificationRequests = computed(() => props.model.notificationRequests)
const pendingNotificationCount = computed(() => notificationRequests.value.friends.length + notificationRequests.value.groups.length)
const filteredFriendDirectory = computed(() => {
  if (sidebarTab.value !== 'friends') return []
  const query = searchQuery.value.trim().toLowerCase()
  return query ? props.model.friends.filter(({ id, displayName }) => id.includes(query) || displayName.toLowerCase().includes(query)) : props.model.friends
})
const filteredGroupDirectory = computed(() => {
  if (sidebarTab.value !== 'groups') return []
  const query = searchQuery.value.trim().toLowerCase()
  return query ? props.model.groups.filter(({ id, name }) => id.includes(query) || name.toLowerCase().includes(query)) : props.model.groups
})

function selectNavigation(view: WebqqSidebarModel['currentView']) {
  if (view === 'messages') sidebarTab.value = 'recent'
  if (view === 'contacts') sidebarTab.value = 'friends'
  emit('selectView', view)
}

function isNavigationActive(view: typeof navigationItems[number]['id']) {
  return view === 'messages' ? isWebqqView.value : currentView.value === view
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
  if (currentGroupId.value) emit('groupAction', { action: 'invite', groupId: currentGroupId.value, targetId })
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
</script>
