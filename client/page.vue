<template>
  <k-layout container="onebot-sandbox-layout" main="onebot-sandbox-page">
    <k-content>
      <div
        class="webqq-workspace"
        :class="{
          'is-frosted': workspace.appearance.enableWebQQFrostedGlass,
          'has-tim-tail': workspace.appearance.webQQTimBubbleTail,
          'is-details-open': detailsVisible,
          'is-details-closed': !detailsVisible,
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

        <main v-if="currentView === 'profile'" class="webqq-chat is-environment">
          <EnvironmentManager :snapshot="snapshot" />
        </main>
        <WebqqChatPane
          v-else
          :model="chatPaneModel"
          @toggle-details="toggleDetails"
          @send="sendComposerMessage"
          @select-operator="selectComposerOperator"
          @manage-environment="manageEnvironment"
          @edit-participant="openComposerParticipantDialog('edit', $event)"
          @delete-participant="openComposerParticipantDialog('delete', $event)"
          @load-history="loadEarlierMessages"
          @request-friend="requestFriend"
          @poke-friend="pokeFriend"
          @set-remark="openRemarkDialog"
          @delete-friend="deleteFriend"
          @poke-group-member="pokeGroupMember"
          @set-group-card="openGroupActionDialog('card', $event)"
          @set-group-admin="setGroupAdmin"
          @transfer-group-owner="transferGroupOwner"
          @kick-group-member="kickGroupMember"
        />

        <aside class="webqq-profile" :aria-label="currentView === 'profile' ? '环境摘要' : currentGroup ? '群信息' : '私聊信息'">
          <header class="webqq-info-header">
            <strong>{{ currentView === 'profile' ? '环境摘要' : currentGroup ? '群信息' : '私聊信息' }}</strong>
            <button type="button" class="webqq-info-close" aria-label="关闭会话信息" @click="closeDetails">
              <IconDots :size="22" aria-hidden="true" />
            </button>
          </header>

          <div v-if="currentView === 'profile'" v-webqq-scrollbar class="webqq-private-info">
            <div class="webqq-profile-hero">
              <span class="webqq-avatar webqq-avatar-profile webqq-avatar-bot">
                <IconDatabase :size="32" aria-hidden="true" />
              </span>
              <h2>默认内存场景</h2>
              <p>修订 {{ snapshot.revision }}</p>
            </div>
            <dl class="webqq-profile-details">
              <div><dt>普通用户</dt><dd>{{ snapshot.users.length }}</dd></div>
              <div><dt>虚拟机器人</dt><dd>{{ snapshot.bots.length }}</dd></div>
              <div><dt>群组</dt><dd>{{ snapshot.groups.length }}</dd></div>
              <div><dt>待处理申请</dt><dd>{{ snapshot.requests.length }}</dd></div>
              <div><dt>状态来源</dt><dd>服务端内存</dd></div>
            </dl>
          </div>

          <div v-else-if="currentGroup" class="webqq-group-info-body">
            <section v-webqq-scrollbar="{ tone: 'accent' }" class="webqq-group-announcements">
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
              <div v-else v-webqq-scrollbar="{ tone: 'accent' }" class="webqq-group-member-list">
                <ContextMenu v-for="member in visibleGroupMembers" :key="member.participantId">
                  <ContextMenuTrigger as-child>
                    <article class="webqq-group-member">
                      <WebqqAvatar
                        class="webqq-menu-avatar"
                        :kind="isBotParticipant(member.participantId) ? 'bot' : 'user'"
                        :name="getGroupMemberName(member)"
                        :avatar="getParticipantAvatar(member.participantId)"
                      />
                      <span>
                        <strong>{{ getGroupMemberName(member) }}</strong>
                        <small>{{ member.participantId }}</small>
                      </span>
                      <em>{{ getGroupRoleLabel(member.role) }}</em>
                    </article>
                  </ContextMenuTrigger>
                  <GroupMemberMenu
                    :actor="getCurrentGroupMember(currentOperatorId ?? '')"
                    :target="member"
                    @poke="pokeGroupMember(member.participantId)"
                    @set-card="openGroupActionDialog('card', member.participantId)"
                    @set-admin="setGroupAdmin(member.participantId, $event)"
                    @transfer-owner="transferGroupOwner(member.participantId)"
                    @kick="kickGroupMember(member.participantId)"
                  />
                </ContextMenu>
              </div>
            </section>
          </div>

          <div v-else v-webqq-scrollbar="{ tone: 'accent' }" class="webqq-private-info">
            <div class="webqq-profile-hero">
              <WebqqAvatar
                class="webqq-avatar webqq-avatar-profile webqq-avatar-bot"
                kind="bot"
                :name="currentBot?.name"
                :avatar="currentBot?.avatar"
                :show-bot-badge="!!currentBot"
              />
              <h2>{{ currentBot?.name ?? 'Koishi' }}</h2>
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
        <WorkspaceOverlayHost
          ref="overlayHostRef"
          :users="snapshot.users"
          :bots="snapshot.bots"
          :groups="snapshot.groups"
          :accent-color="workspace.appearance.webQQAccentColor"
          @manage-environment="manageEnvironment"
          @save-remark="saveFriendRemark"
          @save-group-action="saveGroupAction"
        />
      </div>
    </k-content>
  </k-layout>
</template>

<script setup lang="ts">
import {
  IconAddressBook,
  IconBell,
  IconClock,
  IconDatabase,
  IconDots,
  IconEdit,
  IconHandClick,
  IconMessageCircle,
  IconPlus,
  IconRobotFace,
  IconSearch,
  IconTrash,
  IconTag,
  IconUser,
  IconUserMinus,
  IconUserPlus,
  IconUserCircle,
  IconUsers,
} from '@tabler/icons-vue'
import { computed, onMounted, ref, watch } from 'vue'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger } from './components/ui/context-menu'
import { Popover, PopoverContent, PopoverTrigger } from './components/ui/popover'
import EnvironmentCreatePopover from './environment-create-popover.vue'
import EnvironmentManager from './environment-manager.vue'
import { getFriendMenuActions, type FriendMenuState } from './friend-menu'
import GroupMemberMenu from './group-member-menu.vue'
import NotificationMenu from './notification-menu.vue'
import WebqqAvatar from './webqq-avatar.vue'
import WebqqChatPane, { type WebqqChatPaneModel } from './webqq-chat-pane.vue'
import type { WebqqComposerModel, WebqqComposerSendIntent, WebqqComposerSender } from './webqq-composer.vue'
import type { WebqqMessageListModel } from './webqq-message-list.vue'
import WorkspaceOverlayHost from './workspace-overlay-host.vue'
import { getIncomingNotificationRequests } from './notification-requests'
import { getFriendDirectory, getGroupDirectory } from './relationship-directory'
import { type SandboxWorkspaceView } from './workspace-state'
import { koishiWorkspacePort } from './webqq/koishi-workspace-port'
import { createWorkspaceController } from './webqq/workspace-controller'
import { createWorkspaceLayout } from './webqq/workspace-layout'
import { vWebqqScrollbar } from './webqq-scrollbar'
import type {
  SandboxConversation,
  SandboxGroupMember,
  SandboxFriendAction,
  SandboxGroupAction,
  ManageSandboxEnvironmentInput,
} from '../src/types'

const workspaceController = createWorkspaceController(koishiWorkspacePort, window.localStorage)
const workspace = workspaceController.workspace
const currentUserId = workspaceController.currentUserId
const composerSenderId = workspaceController.currentOperatorId
const activeConversationId = workspaceController.activeConversationId
const currentView = workspaceController.currentView
const searchQuery = ref('')
const mediaSources = ref<Record<string, string>>({})
const mediaLoadFailures = ref<Record<string, true>>({})
const errorMessage = ref('')
const infoErrorMessage = ref('')
const announcementInput = ref('')
const announcementSending = ref(false)
const announcementEditorOpen = ref(false)
const deletingAnnouncementId = ref('')
const groupMemberSearch = ref('')
const workspaceLayout = createWorkspaceLayout()
const detailsVisible = workspaceLayout.detailsVisible
const overlayHostRef = ref<InstanceType<typeof WorkspaceOverlayHost>>()
const notificationTab = ref<'friends' | 'groups'>('friends')
const handlingRequestId = ref('')
const notificationErrorMessage = ref('')
type EnvironmentEntityType = 'user' | 'bot' | 'group'
type EnvironmentDialogMode = 'edit' | 'delete'
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
const currentOperatorId = computed(() => composerSenderId.value ?? currentUserId.value)
const currentOperatorIsBot = computed(() => snapshot.value.bots.some(({ id }) => id === currentOperatorId.value))
const composerSenders = computed<WebqqComposerSender[]>(() => {
  const users = snapshot.value.users.map((user) => ({ ...user, type: 'user' as const }))
  const activeUserIndex = users.findIndex(({ id }) => id === currentUserId.value)
  const orderedUsers = activeUserIndex > 0
    ? [users[activeUserIndex], ...users.slice(0, activeUserIndex), ...users.slice(activeUserIndex + 1)]
    : users
  const conversation = snapshot.value.conversations.find(({ id }) => id === activeConversationId.value)
  const bot = snapshot.value.bots.find(({ id }) => id === conversation?.botId)
  const senders = bot
    ? [orderedUsers[0], { ...bot, type: 'bot' as const }, ...orderedUsers.slice(1)].filter(Boolean) as WebqqComposerSender[]
    : orderedUsers
  return senders
})
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
const notificationRequests = computed(() => getIncomingNotificationRequests(snapshot.value, currentUserId.value))
const pendingNotificationCount = computed(() => notificationRequests.value.friends.length + notificationRequests.value.groups.length)
const friendDirectory = computed(() => getFriendDirectory(snapshot.value, currentOperatorId.value))
const filteredFriendDirectory = computed(() => {
  if (sidebarTab.value !== 'friends') return []
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return friendDirectory.value
  return friendDirectory.value.filter(({ id, displayName }) => id.includes(query) || displayName.toLowerCase().includes(query))
})
const groupDirectory = computed(() => getGroupDirectory(snapshot.value, currentOperatorId.value))
const filteredGroupDirectory = computed(() => {
  if (sidebarTab.value !== 'groups') return []
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return groupDirectory.value
  return groupDirectory.value.filter(({ id, name }) => id.includes(query) || name.toLowerCase().includes(query))
})

function getFriendMenuState(targetId: string): FriendMenuState {
  const actorUserId = currentOperatorId.value
  if (!actorUserId) return { isFriend: false, pendingOutgoing: false, pendingIncoming: false }

  return {
    isFriend: snapshot.value.friendships.some(({ participantIds }) => participantIds.includes(actorUserId) && participantIds.includes(targetId)),
    pendingOutgoing: snapshot.value.requests.some(({ type, requesterId, targetId: requestTargetId }) => type === 'friend' && requesterId === actorUserId && requestTargetId === targetId),
    pendingIncoming: snapshot.value.requests.some(({ type, requesterId, targetId: requestTargetId }) => type === 'friend' && requesterId === targetId && requestTargetId === actorUserId),
  }
}

function getChatFriendActions(targetId: string) {
  return getFriendMenuActions(getFriendMenuState(targetId), true)
}
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
const messageListModel = computed<WebqqMessageListModel>(() => ({
  messages: messages.value,
  snapshot: snapshot.value,
  currentConversation: currentConversation.value,
  currentGroup: currentGroup.value,
  currentUserId: currentUserId.value,
  currentOperatorId: currentOperatorId.value,
  title: currentConversationTitle.value,
  avatar: currentGroup.value ? '' : currentBot.value?.avatar ?? '',
  avatarKind: currentGroup.value ? 'group' : 'bot',
  chatStyle: workspace.value.appearance.webQQChatStyle,
  hasMoreMessages: !!currentConversation.value?.hasMoreMessages,
  mediaSources: mediaSources.value,
  mediaLoadFailures: mediaLoadFailures.value,
}))
const composerModel = computed<WebqqComposerModel>(() => ({
  senders: composerSenders.value,
  currentOperatorId: composerSenderId.value,
  currentUserId: currentUserId.value,
  conversationId: currentConversation.value?.id,
  botId: currentBot.value?.id,
  snapshot: snapshot.value,
  accentColor: workspace.value.appearance.webQQAccentColor,
  externalError: errorMessage.value,
}))
const participantNames = computed(() => Object.fromEntries([
  ...snapshot.value.users.map(({ id, name }) => [id, name]),
  ...snapshot.value.bots.map(({ id, name }) => [id, name]),
]))
const chatPaneModel = computed<WebqqChatPaneModel>(() => ({
  conversationId: currentConversation.value?.id,
  title: currentConversationTitle.value,
  subtitle: currentConversationSubtitle.value,
  avatar: currentGroup.value ? '' : currentBot.value?.avatar ?? '',
  avatarKind: currentGroup.value ? 'group' : 'bot',
  detailsVisible: detailsVisible.value,
  participantNames: participantNames.value,
  messageList: messageListModel.value,
  composer: composerModel.value,
}))

watch([currentUserId, () => currentConversation.value?.botId], ([userId, botId]) => {
  workspaceController.ensureOperator(userId, botId)
})

onMounted(async () => {
  await workspaceController.load()
})

watch(activeConversationId, () => {
  workspaceLayout.resetDetails()
  groupMemberSearch.value = ''
  announcementInput.value = ''
  announcementEditorOpen.value = false
  deletingAnnouncementId.value = ''
  infoErrorMessage.value = ''
})

watch(
  () => [currentUserId.value, ...messages.value.flatMap(({ media }) => media?.map(({ id }) => id) ?? [])].join(':'),
  () => void loadVisibleMedia(),
  { immediate: true },
)

async function manageEnvironment(
  input: ManageSandboxEnvironmentInput,
  resolve: () => void,
  reject: (error: unknown) => void,
) {
  try {
    await workspaceController.manageEnvironment(input)
    resolve()
  } catch (error) {
    reject(error)
  }
}

async function performFriendAction(input: SandboxFriendAction) {
  errorMessage.value = ''
  try {
    await workspaceController.performFriendAction(input)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '好友操作失败'
  }
}

async function performGroupAction(input: SandboxGroupAction) {
  errorMessage.value = ''
  try {
    await workspaceController.performGroupAction(input)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '群组操作失败'
  }
}

function requestFriend(targetId: string) {
  return performFriendAction({ action: 'request', targetId, comment: '来自 OneBot Sandbox 的好友申请' })
}

async function handleNotificationRequest(requestId: string, approve: boolean) {
  handlingRequestId.value = requestId
  notificationErrorMessage.value = ''
  try {
    await workspaceController.handleRelationshipRequest(requestId, approve)
  } catch (error) {
    notificationErrorMessage.value = error instanceof Error ? error.message : '处理通知失败'
  } finally {
    handlingRequestId.value = ''
  }
}

function requestJoinGroup(groupId: string) {
  return performGroupAction({ action: 'request-join', groupId, comment: '来自 OneBot Sandbox 的入群申请' })
}

function inviteToCurrentGroup(targetId: string) {
  const groupId = currentGroup.value?.id
  if (!groupId) return
  return performGroupAction({ action: 'invite', groupId, targetId })
}

function getCurrentGroupMember(participantId: string) {
  const groupId = currentGroup.value?.id
  return groupId ? getGroupMember(groupId, participantId) : undefined
}

function getGroupMember(groupId: string, participantId: string) {
  return snapshot.value.groups.find(({ id }) => id === groupId)?.members.find((member) => member.participantId === participantId)
}

function pokeGroupMember(targetId: string) {
  const group = currentGroup.value
  const conversation = currentConversation.value
  if (!group || !conversation) return
  return performGroupAction({ action: 'poke', groupId: group.id, targetId, conversationId: conversation.id })
}

function kickGroupMember(targetId: string) {
  const groupId = currentGroup.value?.id
  if (!groupId) return
  return performGroupAction({ action: 'kick', groupId, targetId })
}

function setGroupAdmin(targetId: string, enabled: boolean) {
  const groupId = currentGroup.value?.id
  if (!groupId) return
  return performGroupAction({ action: 'set-admin', groupId, targetId, enabled })
}

function transferGroupOwner(targetId: string) {
  const groupId = currentGroup.value?.id
  if (!groupId) return
  return performGroupAction({ action: 'transfer-owner', groupId, targetId })
}

function leaveGroup(groupId: string) {
  return performGroupAction({ action: 'leave', groupId })
}

function openGroupActionDialog(mode: 'card' | 'name', targetId = '', groupId = currentGroup.value?.id ?? '') {
  const value = mode === 'name'
    ? snapshot.value.groups.find(({ id }) => id === groupId)?.name ?? ''
    : getCurrentGroupMember(targetId)?.card ?? ''
  overlayHostRef.value?.openGroupAction(mode, targetId, groupId, value)
}

async function saveGroupAction(
  input: { mode: 'card' | 'name', targetId: string, groupId: string, value: string },
  resolve: () => void,
  reject: (error: unknown) => void,
) {
  errorMessage.value = ''
  try {
    if (input.mode === 'name') {
      await workspaceController.performGroupAction({ action: 'set-name', groupId: input.groupId, name: input.value })
    } else if (input.targetId) {
      await workspaceController.performGroupAction({ action: 'set-card', groupId: input.groupId, targetId: input.targetId, card: input.value })
    }
    resolve()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '群组操作失败'
    reject(error)
  }
}

function pokeFriend(targetId: string) {
  const conversationId = currentConversation.value?.id
  if (!conversationId) return
  return performFriendAction({ action: 'poke', targetId, conversationId })
}

function deleteFriend(targetId: string) {
  return performFriendAction({ action: 'delete', targetId })
}

function openRemarkDialog(targetId: string) {
  const operatorId = currentOperatorId.value ?? ''
  const friendship = snapshot.value.friendships.find(({ participantIds }) => participantIds.includes(operatorId) && participantIds.includes(targetId))
  overlayHostRef.value?.openRemark(targetId, friendship?.remarks[operatorId] ?? '')
}

async function saveFriendRemark(
  input: { targetId: string, remark: string },
  resolve: () => void,
  reject: (error: unknown) => void,
) {
  errorMessage.value = ''
  try {
    await workspaceController.performFriendAction({ action: 'set-remark', ...input })
    resolve()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '好友操作失败'
    reject(error)
  }
}

function openEntityDialog(mode: EnvironmentDialogMode, target: { type: EnvironmentEntityType, id: string }) {
  overlayHostRef.value?.openEntity(mode, target)
}

function getConversationEntityTarget(conversation: SandboxConversation): { type: 'bot' | 'group', id: string } {
  return conversation.groupId
    ? { type: 'group', id: conversation.groupId }
    : { type: 'bot', id: conversation.botId }
}

function getConversationEntityLabel(conversation: SandboxConversation) {
  return conversation.groupId ? '群组' : '机器人'
}

function selectConversation(conversationId: string) {
  workspaceController.selectConversation(conversationId)
}

function selectNavigation(view: SandboxWorkspaceView) {
  workspaceController.selectView(view)
  if (view === 'messages') sidebarTab.value = 'recent'
  if (view === 'contacts') sidebarTab.value = 'friends'
}

function toggleDetails() {
  workspaceLayout.toggleDetails()
}

function closeDetails() {
  workspaceLayout.closeDetails()
}

function selectSidebarTab(tab: SidebarTab) {
  sidebarTab.value = tab
  searchQuery.value = ''
  workspaceController.selectView('contacts')
}

function getBot(botId?: string) {
  return snapshot.value.bots.find(({ id }) => id === botId)
}

function getConversationTitle(conversation: SandboxConversation) {
  return snapshot.value.groups?.find(({ id }) => id === conversation.groupId)?.name
    ?? getBot(conversation.botId)?.name
    ?? conversation.id
}

function getConversationAvatar(conversation: SandboxConversation) {
  return conversation.groupId ? undefined : getBot(conversation.botId)?.avatar
}

function getParticipantName(id: string) {
  return snapshot.value.users.find((user) => user.id === id)?.name
    ?? snapshot.value.bots.find((bot) => bot.id === id)?.name
    ?? id
}

function getParticipantAvatar(id: string) {
  return snapshot.value.users.find((user) => user.id === id)?.avatar
    ?? snapshot.value.bots.find((bot) => bot.id === id)?.avatar
}

function isBotParticipant(id: string) {
  return snapshot.value.bots.some((bot) => bot.id === id)
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

async function loadVisibleMedia() {
  const actorUserId = currentUserId.value
  if (!actorUserId) return
  const missingMedia = messages.value.flatMap(({ media }) => media ?? []).filter(({ id }) => !mediaSources.value[id])
  await Promise.all(missingMedia.map(async (media) => {
    try {
      const content = await workspaceController.getMediaContent(media.id)
      mediaSources.value = {
        ...mediaSources.value,
        [media.id]: `data:${content.mimeType};base64,${content.dataBase64}`,
      }
      const { [media.id]: _, ...remainingFailures } = mediaLoadFailures.value
      mediaLoadFailures.value = remainingFailures
    } catch {
      mediaLoadFailures.value = { ...mediaLoadFailures.value, [media.id]: true }
    }
  }))
}

async function loadEarlierMessages(resolve: () => void, reject: (error: unknown) => void) {
  const conversation = currentConversation.value
  const user = currentUser.value
  const beforeMessageId = conversation?.messageIds[0]
  if (!conversation || !user || !beforeMessageId) return resolve()

  errorMessage.value = ''
  try {
    await workspaceController.loadMessageHistory({
      conversationId: conversation.id,
      beforeMessageId,
      limit: 50,
    })
    resolve()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '读取历史消息失败'
    reject(error)
  }
}

function getConversationPreview(conversationId: string) {
  return getConversationMessages(conversationId).at(-1)?.content ?? '开始一段新对话'
}

function getConversationTime(conversationId: string) {
  const value = getConversationMessages(conversationId).at(-1)?.createdAt
  if (!value) return ''
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

async function sendComposerMessage(input: WebqqComposerSendIntent, resolve: () => void, reject: (error: unknown) => void) {
  try {
    if (input.media) {
      await workspaceController.sendMediaMessage({
        senderId: input.senderId,
        botId: input.botId,
        conversationId: input.conversationId,
        fileName: input.media.fileName,
        mimeType: input.media.mimeType,
        dataBase64: input.media.dataBase64,
        content: input.content || undefined,
        replyToMessageId: input.replyToMessageId,
      })
    } else {
      await workspaceController.sendMessage({
        senderId: input.senderId,
        botId: input.botId,
        conversationId: input.conversationId,
        content: input.content,
        replyToMessageId: input.replyToMessageId,
      })
    }
    resolve()
  } catch (error) {
    reject(error)
  }
}

async function selectComposerOperator(participantId: string, resolve: () => void, reject: (error: unknown) => void) {
  try {
    await workspaceController.selectOperator(participantId)
    workspaceLayout.resetDetails()
    resolve()
  } catch (error) {
    reject(error)
  }
}

function openComposerParticipantDialog(mode: EnvironmentDialogMode, entity: { type: 'user' | 'bot', id: string }) {
  openEntityDialog(mode, entity)
}

async function publishAnnouncement() {
  const content = announcementInput.value.trim()
  const user = currentUser.value
  const group = currentGroup.value
  if (!content || !user || !group || announcementSending.value) return

  announcementSending.value = true
  infoErrorMessage.value = ''
  try {
    await workspaceController.setGroupAnnouncement({
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
    await workspaceController.deleteGroupAnnouncement({
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
