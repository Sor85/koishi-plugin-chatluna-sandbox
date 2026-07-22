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
              v-if="sidebarTab === 'friends'"
              type="bot"
              :snapshot="snapshot"
              :current-user-id="currentUserId"
              :accent-color="workspace.appearance.webQQAccentColor"
              @updated="applyWorkspaceUpdate"
            >
              <template #trigger>
                <button type="button" class="webqq-session webqq-session-create">
                  <span class="webqq-avatar webqq-avatar-create"><IconPlus :size="20" aria-hidden="true" /></span>
                  <span class="webqq-session-copy">
                    <strong>添加机器人</strong>
                    <small>创建新的测试机器人</small>
                  </span>
                </button>
              </template>
            </EnvironmentCreatePopover>
            <EnvironmentCreatePopover
              v-if="sidebarTab === 'groups'"
              type="group"
              :snapshot="snapshot"
              :current-user-id="currentUserId"
              :accent-color="workspace.appearance.webQQAccentColor"
              @updated="applyWorkspaceUpdate"
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
                  <span class="webqq-avatar webqq-avatar-bot is-group">{{ getInitial(group.name) }}</span>
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
                  <span :class="['webqq-avatar', { 'is-bot': entry.isBot }]">
                    <img v-if="entry.avatar" :src="entry.avatar" :alt="entry.displayName">
                    <template v-else>{{ getInitial(entry.displayName) }}</template>
                    <span v-if="entry.isBot" class="webqq-avatar-bot-badge">
                      <IconRobotFace :size="10" stroke-width="2.4" aria-hidden="true" />
                    </span>
                  </span>
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
                  <span :class="['webqq-avatar webqq-avatar-bot', { 'is-bot': !conversation.groupId, 'is-group': !!conversation.groupId }]">
                    <img v-if="getConversationAvatar(conversation)" :src="getConversationAvatar(conversation)" :alt="getConversationTitle(conversation)">
                    <template v-else>{{ getInitial(getConversationTitle(conversation)) }}</template>
                    <span v-if="!conversation.groupId" class="webqq-avatar-bot-badge">
                      <IconRobotFace :size="10" stroke-width="2.4" aria-hidden="true" />
                    </span>
                  </span>
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

        <main :class="['webqq-chat', { 'is-environment': currentView === 'profile' }]">
          <EnvironmentManager
            v-if="currentView === 'profile'"
            :snapshot="snapshot"
          />
          <template v-else>
          <header class="webqq-chat-header">
            <div class="webqq-chat-title">
              <span :class="['webqq-avatar webqq-avatar-bot', { 'is-bot': !currentGroup && !!currentBot, 'is-group': !!currentGroup }]">
                <img v-if="currentBot?.avatar && !currentGroup" :src="currentBot.avatar" :alt="currentConversationTitle">
                <template v-else>{{ getInitial(currentConversationTitle) }}</template>
                <span v-if="!currentGroup && currentBot" class="webqq-avatar-bot-badge">
                  <IconRobotFace :size="10" stroke-width="2.4" aria-hidden="true" />
                </span>
              </span>
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

          <section v-webqq-scrollbar="{ tone: 'accent' }" class="webqq-messages" aria-label="消息记录">
            <div v-if="!messages.length" class="webqq-welcome">
              <span :class="['webqq-avatar webqq-avatar-large webqq-avatar-bot', { 'is-group': !!currentGroup }]">{{ getInitial(currentConversationTitle) }}</span>
              <strong>{{ currentConversationTitle }}</strong>
              <p>发送消息，验证插件在模拟 QQ 环境中的响应</p>
            </div>
            <ol v-else>
              <li v-if="currentConversation?.hasMoreMessages" class="webqq-history-more-row">
                <button type="button" class="webqq-history-more" :disabled="historyLoading" @click="loadEarlierMessages">
                  {{ historyLoading ? '加载中...' : '查看更早消息' }}
                </button>
              </li>
              <template v-for="(message, messageIndex) in messages" :key="message.id">
                <li v-if="message.event" class="webqq-message-event">
                  {{ message.content }}
                </li>
                <ContextMenu v-else>
                  <ContextMenuTrigger as-child>
                    <li
                    class="webqq-message-row"
                    :class="[
                      message.authorId === currentUser?.id ? 'is-outgoing' : 'is-incoming',
                      getChatMessageClusterClass(messageIndex),
                      { 'is-merged': isMergedChatMessage(messageIndex) },
                      { 'is-quote-target': highlightedMessageId === message.id },
                    ]"
                    :data-message-id="message.id"
                  >
                    <ContextMenu v-if="message.authorId !== currentUser?.id">
                      <ContextMenuTrigger as-child>
                        <button
                          type="button"
                          class="webqq-message-avatar-wrap webqq-message-avatar-trigger"
                          :aria-label="`打开 ${getParticipantName(message.authorId)} 的操作菜单`"
                          @contextmenu.stop
                        >
                          <span class="webqq-message-avatar">
                            <img v-if="getParticipantAvatar(message.authorId)" :src="getParticipantAvatar(message.authorId)" :alt="getParticipantName(message.authorId)">
                            <template v-else>{{ getInitial(getParticipantName(message.authorId)) }}</template>
                          </span>
                        </button>
                      </ContextMenuTrigger>
                      <ContextMenuContent style="z-index: 140">
                        <ContextMenuSub v-if="currentGroup && getCurrentGroupMember(message.authorId)">
                          <ContextMenuSubTrigger>
                            <IconUsers :size="16" aria-hidden="true" /> 群成员操作
                          </ContextMenuSubTrigger>
                          <GroupMemberMenu
                            sub
                            :actor="getCurrentGroupMember(currentOperatorId ?? '')"
                            :target="getCurrentGroupMember(message.authorId)!"
                            @poke="pokeGroupMember(message.authorId)"
                            @set-card="openGroupActionDialog('card', message.authorId)"
                            @set-admin="setGroupAdmin(message.authorId, $event)"
                            @transfer-owner="transferGroupOwner(message.authorId)"
                            @kick="kickGroupMember(message.authorId)"
                          />
                        </ContextMenuSub>
                        <ContextMenuItem v-if="getChatFriendActions(message.authorId).includes('request')" @select="requestFriend(message.authorId)">
                          <IconUserPlus :size="16" aria-hidden="true" /> 发送好友申请
                        </ContextMenuItem>
                        <ContextMenuItem v-else-if="getFriendMenuState(message.authorId).pendingOutgoing" disabled>
                          <IconClock :size="16" aria-hidden="true" /> 等待对方处理
                        </ContextMenuItem>
                        <ContextMenuItem v-else-if="getFriendMenuState(message.authorId).pendingIncoming" disabled>
                          <IconBell :size="16" aria-hidden="true" /> 请在通知中处理申请
                        </ContextMenuItem>
                        <ContextMenuSub v-if="!currentGroup && getChatFriendActions(message.authorId).includes('poke')">
                          <ContextMenuSubTrigger>
                            <IconHandClick :size="16" aria-hidden="true" /> 好友互动
                          </ContextMenuSubTrigger>
                          <ContextMenuSubContent>
                            <ContextMenuItem @select="pokeFriend(message.authorId)">
                              <IconHandClick :size="16" aria-hidden="true" /> 戳一戳
                            </ContextMenuItem>
                          </ContextMenuSubContent>
                        </ContextMenuSub>
                        <ContextMenuItem v-if="getChatFriendActions(message.authorId).includes('remark')" @select="openRemarkDialog(message.authorId)">
                          <IconTag :size="16" aria-hidden="true" /> 设置好友备注
                        </ContextMenuItem>
                        <ContextMenuItem v-if="getChatFriendActions(message.authorId).includes('delete')" class="text-red-600 focus:bg-red-50 focus:text-red-700 dark:focus:bg-red-950/40" @select="deleteFriend(message.authorId)">
                          <IconUserMinus :size="16" aria-hidden="true" /> 删除好友
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                    <span v-else class="webqq-message-avatar-wrap">
                      <span class="webqq-message-avatar">
                        <img v-if="getParticipantAvatar(message.authorId)" :src="getParticipantAvatar(message.authorId)" :alt="getParticipantName(message.authorId)">
                        <template v-else>{{ getInitial(getParticipantName(message.authorId)) }}</template>
                      </span>
                    </span>
                    <div class="webqq-message-content">
                      <div v-if="!isMergedChatMessage(messageIndex)" class="webqq-sender-line">
                        <span class="webqq-message-author">{{ getParticipantName(message.authorId) }}</span>
                      </div>
                      <div class="webqq-message-body">
                        <div class="webqq-message-bubble">
                          <button
                            v-if="getReplyMessage(message)"
                            class="webqq-message-quote is-clickable"
                            type="button"
                            aria-label="跳转到引用消息"
                            @click.stop="scrollToQuotedMessage(getReplyMessage(message)!.id)"
                          >
                            <strong class="webqq-message-quote-title">{{ getParticipantName(getReplyMessage(message)!.authorId) }}</strong>
                            <span>{{ getReplyMessage(message)!.content }}</span>
                          </button>
                          <div v-for="media in message.media" :key="media.id" class="webqq-message-media">
                            <img
                              v-if="media.type === 'image' && getMediaSource(media.id)"
                              :src="getMediaSource(media.id)"
                              :alt="media.name"
                            >
                            <audio
                              v-else-if="media.type === 'audio' && getMediaSource(media.id)"
                              :src="getMediaSource(media.id)"
                              controls
                              preload="metadata"
                            />
                            <video
                              v-else-if="media.type === 'video' && getMediaSource(media.id)"
                              :src="getMediaSource(media.id)"
                              controls
                              preload="metadata"
                            />
                            <a
                              v-else-if="media.type === 'file' && getMediaSource(media.id)"
                              :href="getMediaSource(media.id)"
                              :download="media.name"
                              class="webqq-message-file"
                            >
                              <IconPaperclip :size="18" aria-hidden="true" />
                              <span><strong>{{ media.name }}</strong><small>{{ formatMediaSize(media.size) }}</small></span>
                            </a>
                            <span v-else class="webqq-message-media-loading">
                              {{ mediaLoadFailures[media.id] ? '媒体不可用' : '媒体加载中...' }}
                            </span>
                          </div>
                          <span v-if="getMessageText(message)">{{ getMessageText(message) }}</span>
                        </div>
                      </div>
                    </div>
                    </li>
                  </ContextMenuTrigger>
                  <ContextMenuContent style="z-index: 140">
                    <ContextMenuItem @select="replyingToMessageId = message.id">
                      <IconMessageReply :size="16" aria-hidden="true" /> 回复
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              </template>
            </ol>
          </section>

          <div ref="composerLayoutRef" class="webqq-composer-layout-root">
            <form class="webqq-composer" :style="composerStyle" @submit.prevent="sendMessage">
              <span v-if="errorMessage" class="webqq-composer-error" role="alert">{{ errorMessage }}</span>
              <div v-if="replyingToMessage" class="webqq-composer-reply">
                <span>回复 {{ getParticipantName(replyingToMessage.authorId) }}：{{ replyingToMessage.content }}</span>
                <button type="button" aria-label="取消回复" @click="replyingToMessageId = ''">
                  <IconX :size="15" aria-hidden="true" />
                </button>
              </div>
              <div v-if="selectedMediaFile" :class="['webqq-composer-media', { 'has-reply': replyingToMessage }]">
                <IconPaperclip :size="16" aria-hidden="true" />
                <span>{{ selectedMediaFile.name }} · {{ formatMediaSize(selectedMediaFile.size) }}</span>
                <button type="button" aria-label="移除待发送媒体" @click="clearSelectedMedia">
                  <IconX :size="15" aria-hidden="true" />
                </button>
              </div>
              <div ref="userStackLayoutRef" class="webqq-composer-user-layout-root" :style="userLayoutStyle">
                <div
                  :class="['webqq-composer-user-capsule', { 'is-expanded': userStackVisualExpanded }]"
                  :style="userCapsuleStyle"
                  @pointerenter="expandUserStack"
                  @pointerleave="collapseUserStack"
                  @focusin="focusUserStack"
                  @focusout="blurUserStack"
                >
                  <div
                    :class="['webqq-composer-user-stack', {
                      'is-expanded': userStackVisualExpanded,
                      'is-overflow-expanding': userStackOverflowMotion === 'expanding',
                      'is-overflow-collapsing': userStackOverflowMotion === 'collapsing',
                    }]"
                    :style="userStackStyle"
                  >
                    <TooltipProvider :delay-duration="300">
                      <ContextMenu
                        v-for="(sender, index) in userStackUsers"
                        :key="sender.id"
                      >
                        <Tooltip>
                          <ContextMenuTrigger as-child>
                            <TooltipTrigger as-child>
                              <button
                                type="button"
                                :class="['webqq-composer-user-switch', {
                                  'is-active': sender.id === composerSenderId,
                                  'is-bot': sender.type === 'bot',
                                  'is-collapsed-extra': isUserCollapsedExtra(index),
                                }]"
                                :aria-label="sender.id === composerSenderId
                                  ? `当前发送者：${sender.name}${sender.type === 'bot' ? '（机器人）' : ''}`
                                  : `切换发送者：${sender.name}${sender.type === 'bot' ? '（机器人）' : ''}`"
                                :aria-pressed="sender.id === composerSenderId"
                                :aria-hidden="isUserCollapsedHidden(index) ? 'true' : undefined"
                                :tabindex="isUserCollapsedHidden(index) ? -1 : undefined"
                                :style="getUserSwitchStyle(index)"
                                @click="selectComposerUser(sender)"
                              >
                                <span :class="['webqq-composer-user-avatar', { 'is-bot': sender.type === 'bot' }]">
                                  {{ getInitial(sender.name) }}
                                  <span v-if="sender.type === 'bot' && sender.id === composerSenderId" class="webqq-composer-user-bot-badge">
                                    <IconRobotFace :size="10" stroke-width="2.4" aria-hidden="true" />
                                  </span>
                                </span>
                              </button>
                            </TooltipTrigger>
                          </ContextMenuTrigger>
                          <TooltipContent side="top">
                            {{ sender.name }}
                          </TooltipContent>
                        </Tooltip>
                        <ContextMenuContent style="z-index: 140">
                          <ContextMenuItem @select="openEntityDialog('edit', { type: sender.type, id: sender.id })">
                            <IconEdit :size="16" aria-hidden="true" /> 编辑{{ sender.type === 'bot' ? '机器人' : '用户' }}
                          </ContextMenuItem>
                          <ContextMenuItem class="text-red-600 focus:bg-red-50 focus:text-red-700 dark:focus:bg-red-950/40" @select="openEntityDialog('delete', { type: sender.type, id: sender.id })">
                            <IconTrash :size="16" aria-hidden="true" /> 删除{{ sender.type === 'bot' ? '机器人' : '用户' }}
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                    </TooltipProvider>
                    <span
                      v-if="userStackMetrics.overflowCount"
                      class="webqq-composer-user-overflow"
                      :style="userOverflowStyle"
                      aria-hidden="true"
                    >
                      <span v-if="userOverflowPreview" class="webqq-composer-user-overflow-avatar">
                        {{ getInitial(userOverflowPreview.name) }}
                        <span v-if="userOverflowPreview.type === 'bot' && userOverflowPreview.id === composerSenderId" class="webqq-composer-user-bot-badge">
                          <IconRobotFace :size="10" stroke-width="2.4" aria-hidden="true" />
                        </span>
                      </span>
                      <span class="webqq-composer-user-overflow-label">
                        <span class="webqq-composer-user-overflow-plus">+</span>
                        <span class="webqq-composer-user-overflow-count">{{ userStackMetrics.overflowCount }}</span>
                      </span>
                    </span>
                    <EnvironmentCreatePopover
                      type="user"
                      side="top"
                      :snapshot="snapshot"
                      :current-user-id="currentUserId"
                      :accent-color="workspace.appearance.webQQAccentColor"
                      @updated="applyWorkspaceUpdate"
                      @open-change="handleCreateUserOpen"
                    >
                      <template #trigger>
                        <button
                          type="button"
                          :class="['webqq-composer-user-add', { 'is-collapsed-hidden': hasUserStackOverflow && !userStackVisualExpanded }]"
                          :style="userAddStyle"
                          aria-label="添加测试用户"
                        >
                          <IconPlus :size="18" stroke-width="2" aria-hidden="true" />
                        </button>
                      </template>
                    </EnvironmentCreatePopover>
                  </div>
                </div>
              </div>
              <div class="webqq-composer-main">
                <label class="sr-only" for="onebot-sandbox-input">消息内容</label>
                <textarea
                  id="onebot-sandbox-input"
                  v-webqq-scrollbar="{ tone: 'accent' }"
                  v-model="input"
                  rows="1"
                  placeholder="发送消息"
                  :disabled="sending || !currentConversation"
                  @keydown.enter.exact.prevent="sendMessage"
                />
              </div>
              <input
                ref="mediaInputRef"
                class="sr-only"
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp,audio/*,video/mp4,video/webm,video/quicktime,.txt,.csv,.json,.pdf,.zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                @change="selectMediaFile"
              >
              <button
                class="webqq-composer-action"
                type="button"
                aria-label="选择文件"
                :disabled="sending || !currentConversation"
                @click="mediaInputRef?.click()"
              >
                <IconPaperclip :size="19" stroke-width="2" aria-hidden="true" />
              </button>
              <button
                class="webqq-composer-action is-primary"
                type="submit"
                aria-label="发送"
                :disabled="sending || (!input.trim() && !selectedMediaFile) || !currentConversation"
              >
                <IconSend :size="19" stroke-width="2" aria-hidden="true" />
              </button>
            </form>
          </div>
          </template>
        </main>

        <aside class="webqq-profile" :aria-label="currentView === 'profile' ? '环境摘要' : currentGroup ? '群信息' : '私聊信息'">
          <header class="webqq-info-header">
            <strong>{{ currentView === 'profile' ? '环境摘要' : currentGroup ? '群信息' : '私聊信息' }}</strong>
            <button type="button" class="webqq-info-close" aria-label="关闭会话信息" @click="detailsOpen = false">
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
                      <span :class="['webqq-menu-avatar', { 'is-bot': isBotParticipant(member.participantId) }]">
                        <img v-if="getParticipantAvatar(member.participantId)" :src="getParticipantAvatar(member.participantId)" :alt="getGroupMemberName(member)">
                        <template v-else>{{ getInitial(getGroupMemberName(member)) }}</template>
                        <span v-if="isBotParticipant(member.participantId)" class="webqq-avatar-bot-badge">
                          <IconRobotFace :size="10" stroke-width="2.4" aria-hidden="true" />
                        </span>
                      </span>
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
              <span class="webqq-avatar webqq-avatar-profile webqq-avatar-bot is-bot">
                <img v-if="currentBot?.avatar" :src="currentBot.avatar" :alt="currentBot.name">
                <template v-else>{{ getInitial(currentBot?.name) }}</template>
                <span v-if="currentBot" class="webqq-avatar-bot-badge">
                  <IconRobotFace :size="14" stroke-width="2.4" aria-hidden="true" />
                </span>
              </span>
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
        <EnvironmentEntityDialog
          v-model:open="entityDialogOpen"
          :mode="entityDialogMode"
          :target="entityDialogTarget"
          :snapshot="snapshot"
          :current-user-id="currentUserId"
          :accent-color="workspace.appearance.webQQAccentColor"
          @updated="applyWorkspaceUpdate"
        />
        <Dialog v-model:open="remarkDialogOpen">
          <DialogContent :style="{ '--webqq-accent': workspace.appearance.webQQAccentColor }">
            <DialogTitle>设置好友备注</DialogTitle>
            <DialogDescription>备注只对当前测试用户生效，不会修改对方资料昵称。</DialogDescription>
            <Input
              v-model="remarkInput"
              class="border-slate-200 focus-visible:border-[var(--webqq-accent)] focus-visible:ring-[color-mix(in_srgb,var(--webqq-accent)_18%,transparent)] dark:border-slate-700"
              placeholder="留空可删除备注"
              @keydown.enter="saveFriendRemark"
            />
            <div class="webqq-dialog-actions">
              <Button variant="outline" class="border-slate-200 bg-white hover:bg-slate-100 focus-visible:border-[var(--webqq-accent)] focus-visible:ring-[color-mix(in_srgb,var(--webqq-accent)_18%,transparent)] dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800" @click="remarkDialogOpen = false">取消</Button>
              <Button class="bg-[var(--webqq-accent)] text-white hover:opacity-90" @click="saveFriendRemark">保存</Button>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog v-model:open="groupActionDialogOpen">
          <DialogContent :style="{ '--webqq-accent': workspace.appearance.webQQAccentColor }">
            <DialogTitle>{{ groupActionDialogMode === 'name' ? '修改群名称' : '修改群名片' }}</DialogTitle>
            <DialogDescription>
              {{ groupActionDialogMode === 'name' ? '新的群名称会对所有群成员和机器人可见。' : '留空可以清除当前群名片。' }}
            </DialogDescription>
            <Input
              v-model="groupActionInput"
              class="border-slate-200 focus-visible:border-[var(--webqq-accent)] focus-visible:ring-[color-mix(in_srgb,var(--webqq-accent)_18%,transparent)] dark:border-slate-700"
              :placeholder="groupActionDialogMode === 'name' ? '输入群名称' : '输入群名片'"
              @keydown.enter="saveGroupAction"
            />
            <div class="webqq-dialog-actions">
              <Button variant="outline" class="border-slate-200 bg-white hover:bg-slate-100 focus-visible:border-[var(--webqq-accent)] focus-visible:ring-[color-mix(in_srgb,var(--webqq-accent)_18%,transparent)] dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800" @click="groupActionDialogOpen = false">取消</Button>
              <Button class="bg-[var(--webqq-accent)] text-white hover:opacity-90" @click="saveGroupAction">保存</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </k-content>
  </k-layout>
</template>

<script setup lang="ts">
import { send } from '@koishijs/client'
import { createLayout, type AutoLayout } from 'animejs'
import {
  IconAddressBook,
  IconBell,
  IconClock,
  IconDatabase,
  IconDots,
  IconEdit,
  IconHandClick,
  IconMessageCircle,
  IconPaperclip,
  IconPlus,
  IconRobotFace,
  IconMessageReply,
  IconSearch,
  IconSend,
  IconTrash,
  IconTag,
  IconX,
  IconUser,
  IconUserMinus,
  IconUserPlus,
  IconUserCircle,
  IconUsers,
} from '@tabler/icons-vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Button } from './components/ui/button'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger } from './components/ui/context-menu'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './components/ui/dialog'
import { Input } from './components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from './components/ui/popover'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './components/ui/tooltip'
import EnvironmentCreatePopover from './environment-create-popover.vue'
import EnvironmentEntityDialog from './environment-entity-dialog.vue'
import EnvironmentManager from './environment-manager.vue'
import { getFriendMenuActions, type FriendMenuState } from './friend-menu'
import GroupMemberMenu from './group-member-menu.vue'
import NotificationMenu from './notification-menu.vue'
import { getIncomingNotificationRequests } from './notification-requests'
import { getFriendDirectory, getGroupDirectory } from './relationship-directory'
import {
  loadWorkspacePreferences,
  resolveWorkspaceSelection,
  saveWorkspacePreferences,
  type SandboxWorkspaceView,
} from './workspace-state'
import { vWebqqScrollbar } from './webqq-scrollbar'
import { getMessageClusterClass, isMergedMessage } from './message-cluster'
import {
  getUserStackMetrics,
  getUserStackLayoutMetrics,
  orderUsersByActive,
  USER_AVATAR_SIZE,
  USER_STACK_COLLAPSED_STEP,
  USER_STACK_EXPANDED_STEP,
} from './user-stack'
import type {
  SandboxAppearance,
  SandboxConversation,
  SandboxGroupMember,
  SandboxMedia,
  SandboxMessage,
  SandboxSnapshot,
  SandboxWorkspaceState,
  SandboxFriendAction,
  SandboxGroupAction,
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
  friendships: [],
  requests: [],
}
const workspace = ref<SandboxWorkspaceState>({
  snapshot: emptySnapshot,
  appearance: defaultAppearance,
})
const currentUserId = ref<string>()
const composerSenderId = ref<string>()
const activeConversationId = ref<string>()
const currentView = ref<SandboxWorkspaceView>('messages')
const searchQuery = ref('')
const input = ref('')
const mediaInputRef = ref<HTMLInputElement>()
const selectedMediaFile = ref<File>()
const mediaSources = ref<Record<string, string>>({})
const mediaLoadFailures = ref<Record<string, true>>({})
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
const composerLayoutRef = ref<HTMLElement>()
const userStackLayoutRef = ref<HTMLElement>()
const userStackExpanded = ref(false)
const userStackHovered = ref(false)
const userStackFocused = ref(false)
const createUserOpen = ref(false)
const remarkDialogOpen = ref(false)
const remarkTargetId = ref('')
const remarkInput = ref('')
const groupActionDialogOpen = ref(false)
const groupActionDialogMode = ref<'card' | 'name'>('card')
const groupActionTargetId = ref('')
const groupActionGroupId = ref('')
const groupActionInput = ref('')
const notificationTab = ref<'friends' | 'groups'>('friends')
const handlingRequestId = ref('')
const notificationErrorMessage = ref('')
type EnvironmentEntityType = 'user' | 'bot' | 'group'
type EnvironmentDialogMode = 'edit' | 'delete'
const entityDialogOpen = ref(false)
const entityDialogMode = ref<EnvironmentDialogMode>('edit')
const entityDialogTarget = ref<{ type: EnvironmentEntityType, id: string }>()
type UserStackOverflowMotion = 'idle' | 'expanding' | 'collapsing'
const userStackOverflowMotion = ref<UserStackOverflowMotion>('idle')
let suppressUserStackCollapse = false
let suppressUserStackCollapseTimer: ReturnType<typeof setTimeout> | undefined
let userStackOverflowMotionTimer: ReturnType<typeof setTimeout> | undefined
let userStackLayout: AutoLayout | undefined
let userStackTransitionUntil = 0
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
type ComposerSender = { id: string, name: string, type: 'user' | 'bot' }
const userStackUsers = computed<ComposerSender[]>(() => {
  const users = snapshot.value.users.map((user) => ({ ...user, type: 'user' as const }))
  const activeUserIndex = users.findIndex(({ id }) => id === currentUserId.value)
  const orderedUsers = activeUserIndex > 0
    ? [users[activeUserIndex], ...users.slice(0, activeUserIndex), ...users.slice(activeUserIndex + 1)]
    : users
  const conversation = snapshot.value.conversations.find(({ id }) => id === activeConversationId.value)
  const bot = snapshot.value.bots.find(({ id }) => id === conversation?.botId)
  const senders = bot
    ? [orderedUsers[0], { ...bot, type: 'bot' as const }, ...orderedUsers.slice(1)].filter(Boolean) as ComposerSender[]
    : orderedUsers
  return orderUsersByActive(senders, composerSenderId.value)
})
const userStackMetrics = computed(() => getUserStackMetrics(userStackUsers.value.length))
const userStackLayoutMetrics = computed(() => getUserStackLayoutMetrics(userStackUsers.value.length))
const hasUserStackOverflow = computed(() => userStackMetrics.value.overflowCount > 0)
const userStackVisualExpanded = computed(() => userStackExpanded.value || !hasUserStackOverflow.value)
const userOverflowPreview = computed(() => userStackUsers.value[userStackMetrics.value.collapsedVisibleCount])
const composerStyle = computed(() => {
  const extraWidth = Math.max(0, userStackLayoutMetrics.value.collapsedWidth - USER_AVATAR_SIZE)
  const visualExtension = userStackVisualExpanded.value
    ? Math.max(0, userStackLayoutMetrics.value.expandedWidth - userStackLayoutMetrics.value.collapsedWidth)
    : 0
  return {
    width: `${460 + extraWidth}px`,
    '--webqq-composer-visual-extension': `${visualExtension}px`,
  }
})
const userLayoutStyle = computed(() => ({
  '--webqq-user-layout-width': `${userStackLayoutMetrics.value.collapsedWidth}px`,
}))
const userCapsuleStyle = computed(() => ({
  '--webqq-user-capsule-collapsed-width': `${userStackLayoutMetrics.value.collapsedWidth}px`,
  '--webqq-user-capsule-expanded-width': `${userStackLayoutMetrics.value.expandedWidth}px`,
}))
const userStackStyle = computed(() => ({
  '--webqq-user-stack-collapsed-width': `${userStackLayoutMetrics.value.collapsedWidth}px`,
  '--webqq-user-stack-expanded-width': `${userStackLayoutMetrics.value.expandedWidth}px`,
}))
const userAddStyle = computed(() => ({
  '--webqq-user-add-collapsed-right': `${userStackLayoutMetrics.value.addCollapsedRight}px`,
  '--webqq-user-add-expanded-right': `${userStackLayoutMetrics.value.addExpandedRight}px`,
}))
const userOverflowStyle = computed(() => {
  const collapsedRight = userStackMetrics.value.collapsedVisibleCount * USER_STACK_COLLAPSED_STEP
  const expandedRight = userStackMetrics.value.collapsedVisibleCount * USER_STACK_EXPANDED_STEP
  const coveredByExpandedAvatar = userStackExpanded.value || userStackOverflowMotion.value === 'expanding'
  const overflowZIndex = userStackUsers.value.length - userStackMetrics.value.collapsedVisibleCount
    - (coveredByExpandedAvatar ? 1 : 0)
  return {
    '--webqq-user-overflow-right': `${collapsedRight}px`,
    '--webqq-user-overflow-expanded-right': `${expandedRight}px`,
    '--webqq-user-overflow-z-index': `${overflowZIndex}`,
  }
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

function isMergedChatMessage(index: number) {
  return isMergedMessage(messages.value, index, workspace.value.appearance.webQQChatStyle, currentUserId.value)
}

function getChatMessageClusterClass(index: number) {
  return getMessageClusterClass(messages.value, index, workspace.value.appearance.webQQChatStyle, currentUserId.value)
}
const replyingToMessageId = ref('')
const replyingToMessage = computed(() => snapshot.value.messages.find(({ id }) => id === replyingToMessageId.value))
const historyLoading = ref(false)
const highlightedMessageId = ref('')
let quoteHighlightTimer: ReturnType<typeof setTimeout> | undefined

watch([currentUserId, () => currentConversation.value?.botId], ([userId, botId]) => {
  if (composerSenderId.value !== userId && composerSenderId.value !== botId) composerSenderId.value = userId
})

onMounted(async () => {
  const preferences = loadWorkspacePreferences(window.localStorage)
  try {
    workspace.value = await send('onebot-sandbox/workspace', { actorUserId: preferences.currentUserId })
  } catch {
    workspace.value = await send('onebot-sandbox/workspace')
  }
  applySelection(resolveWorkspaceSelection(snapshot.value, preferences))
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
  replyingToMessageId.value = ''
})

watch(
  () => [currentUserId.value, ...messages.value.flatMap(({ media }) => media?.map(({ id }) => id) ?? [])].join(':'),
  () => void loadVisibleMedia(),
  { immediate: true },
)

watch(hasUserStackOverflow, (hasOverflow) => {
  if (!hasOverflow) userStackExpanded.value = false
})

function applySelection(selection: ReturnType<typeof resolveWorkspaceSelection>) {
  currentUserId.value = selection.currentUserId
  if (!composerSenderId.value) composerSenderId.value = selection.currentUserId
  activeConversationId.value = selection.activeConversationId
  currentView.value = selection.currentView
}

function applyWorkspaceUpdate(nextWorkspace: SandboxWorkspaceState) {
  workspace.value = nextWorkspace
  applySelection(resolveWorkspaceSelection(snapshot.value, {
    currentUserId: currentUserId.value,
    activeConversationId: activeConversationId.value,
    currentView: currentView.value,
  }))
}

async function performFriendAction(input: SandboxFriendAction) {
  const actorUserId = currentOperatorId.value
  if (!actorUserId) return
  errorMessage.value = ''
  try {
    const nextWorkspace = await send('onebot-sandbox/friend-action', { ...input, actorUserId })
    applyWorkspaceUpdate(nextWorkspace)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '好友操作失败'
  }
}

async function performGroupAction(input: SandboxGroupAction) {
  const actorUserId = currentOperatorId.value
  if (!actorUserId) return
  errorMessage.value = ''
  try {
    const nextWorkspace = await send('onebot-sandbox/group-action', { ...input, actorUserId })
    applyWorkspaceUpdate(nextWorkspace)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '群组操作失败'
  }
}

function requestFriend(targetId: string) {
  return performFriendAction({ action: 'request', targetId, comment: '来自 OneBot Sandbox 的好友申请' })
}

async function handleNotificationRequest(requestId: string, approve: boolean) {
  const actorUserId = currentUserId.value
  if (!actorUserId) return
  handlingRequestId.value = requestId
  notificationErrorMessage.value = ''
  try {
    const request = snapshot.value.requests.find(({ id }) => id === requestId)
    const nextWorkspace = request?.type === 'group'
      ? await send('onebot-sandbox/group-action', { action: 'handle-request', requestId, approve, actorUserId })
      : await send('onebot-sandbox/friend-action', { action: 'handle-request', requestId, approve, actorUserId })
    applyWorkspaceUpdate(nextWorkspace)
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
  groupActionDialogMode.value = mode
  groupActionTargetId.value = targetId
  groupActionGroupId.value = groupId
  groupActionInput.value = mode === 'name'
    ? snapshot.value.groups.find(({ id }) => id === groupId)?.name ?? ''
    : getCurrentGroupMember(targetId)?.card ?? ''
  groupActionDialogOpen.value = true
}

async function saveGroupAction() {
  const groupId = groupActionGroupId.value
  if (!groupId) return
  if (groupActionDialogMode.value === 'name') {
    await performGroupAction({ action: 'set-name', groupId, name: groupActionInput.value })
  } else if (groupActionTargetId.value) {
    await performGroupAction({ action: 'set-card', groupId, targetId: groupActionTargetId.value, card: groupActionInput.value })
  }
  if (!errorMessage.value) groupActionDialogOpen.value = false
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
  remarkTargetId.value = targetId
  remarkInput.value = friendship?.remarks[operatorId] ?? ''
  remarkDialogOpen.value = true
}

async function saveFriendRemark() {
  if (!remarkTargetId.value) return
  await performFriendAction({ action: 'set-remark', targetId: remarkTargetId.value, remark: remarkInput.value })
  if (!errorMessage.value) remarkDialogOpen.value = false
}

function openEntityDialog(mode: EnvironmentDialogMode, target: { type: EnvironmentEntityType, id: string }) {
  entityDialogMode.value = mode
  entityDialogTarget.value = target
  entityDialogOpen.value = true
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

function getUserSwitchStyle(index: number) {
  const collapsedRight = isUserCollapsedExtra(index)
    ? userStackMetrics.value.collapsedVisibleCount * USER_STACK_COLLAPSED_STEP
    : index * USER_STACK_COLLAPSED_STEP
  return {
    '--webqq-user-collapsed-right': `${collapsedRight}px`,
    '--webqq-user-expanded-right': `${index * USER_STACK_EXPANDED_STEP}px`,
    zIndex: String(userStackUsers.value.length - index),
  }
}

function isUserCollapsedExtra(index: number) {
  return userStackMetrics.value.overflowCount > 0 && index >= userStackMetrics.value.collapsedVisibleCount
}

function isUserCollapsedHidden(index: number) {
  return !userStackExpanded.value && isUserCollapsedExtra(index)
}

function ensureUserStackLayout() {
  if (userStackLayout || !userStackLayoutRef.value) return userStackLayout
  // 用户重排只记录头像区；发送框正文位于同一外壳内，不能像 WebQQ 胶囊那样把外壳
  // 加入 FLIP，否则 Anime.js 会连正文一起投影，重现整个发送控件横向移动的问题。
  userStackLayout = createLayout(userStackLayoutRef.value, {
    children: [
      '.webqq-composer-user-capsule',
      '.webqq-composer-user-stack',
      '.webqq-composer-user-switch',
      '.webqq-composer-user-overflow',
      '.webqq-composer-user-add',
    ],
  })
  return userStackLayout
}

function recordUserStackLayout() {
  const layout = ensureUserStackLayout()
  layout?.record()
  return layout
}

async function animateUserStackLayout(layout?: AutoLayout) {
  if (!layout) return
  await nextTick()
  await layout.animate({ duration: 260, ease: 'out(3)' })
}

async function waitForUserStackTransition() {
  const remaining = userStackTransitionUntil - performance.now()
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining))
}

function setUserStackExpanded(expanded: boolean) {
  if (!hasUserStackOverflow.value || userStackExpanded.value === expanded) return
  userStackOverflowMotion.value = expanded ? 'expanding' : 'collapsing'
  if (userStackOverflowMotionTimer) clearTimeout(userStackOverflowMotionTimer)
  userStackOverflowMotionTimer = setTimeout(() => {
    userStackOverflowMotion.value = 'idle'
    userStackOverflowMotionTimer = undefined
  }, 280)
  userStackExpanded.value = expanded
  userStackTransitionUntil = performance.now() + 180
}

// 与 WebQQ 胶囊保持一致：Chrome 在点击后会重新聚焦 keyed 按钮，重排期间的伪 focusout
// 不能触发折叠，否则会中断 FLIP 并让头像停在错误位置。
function syncUserStackExpanded() {
  if (suppressUserStackCollapse) return
  setUserStackExpanded(userStackHovered.value || userStackFocused.value || createUserOpen.value)
}

function handleCreateUserOpen(open: boolean) {
  createUserOpen.value = open
  syncUserStackExpanded()
}

function expandUserStack() {
  userStackHovered.value = true
  syncUserStackExpanded()
}

function collapseUserStack() {
  userStackHovered.value = false
  syncUserStackExpanded()
}

function focusUserStack() {
  userStackFocused.value = true
  syncUserStackExpanded()
}

function blurUserStack(event: FocusEvent) {
  const nextTarget = event.relatedTarget
  const currentTarget = event.currentTarget
  userStackFocused.value = nextTarget instanceof Node
    && currentTarget instanceof Node
    && currentTarget.contains(nextTarget)
  syncUserStackExpanded()
}

async function selectComposerUser(sender: ComposerSender) {
  if (sender.id === composerSenderId.value) return
  suppressUserStackCollapse = true
  if (suppressUserStackCollapseTimer) clearTimeout(suppressUserStackCollapseTimer)
  // 展开和折叠由同步 CSS transition 完成；等头像停止移动后再记录用户重排，
  // 避免 Anime.js 在过渡中途读取坐标并吞掉点击切换动画。
  await waitForUserStackTransition()
  const layout = recordUserStackLayout()
  composerSenderId.value = sender.id
  if (sender.type === 'user') {
    workspace.value = await send('onebot-sandbox/workspace', { actorUserId: sender.id })
    applySelection(resolveWorkspaceSelection(snapshot.value, {
      currentUserId: sender.id,
      currentView: 'messages',
    }))
  }
  input.value = ''
  detailsOpen.value = false
  await animateUserStackLayout(layout)
  suppressUserStackCollapseTimer = setTimeout(() => {
    suppressUserStackCollapse = false
    suppressUserStackCollapseTimer = undefined
    userStackFocused.value = !!composerLayoutRef.value?.contains(document.activeElement)
    syncUserStackExpanded()
  }, 280)
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

onBeforeUnmount(() => {
  userStackLayout?.revert()
  userStackLayout = undefined
  if (suppressUserStackCollapseTimer) clearTimeout(suppressUserStackCollapseTimer)
  if (userStackOverflowMotionTimer) clearTimeout(userStackOverflowMotionTimer)
  if (quoteHighlightTimer) clearTimeout(quoteHighlightTimer)
})

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

function getReplyMessage(message: SandboxMessage) {
  return message.replyToMessageId
    ? snapshot.value.messages.find(({ id }) => id === message.replyToMessageId)
    : undefined
}

function getMediaLabel(media: SandboxMedia) {
  return media.type === 'image' ? '图片' : media.type === 'audio' ? '语音' : media.type === 'video' ? '视频' : '文件'
}

function getMessageText(message: SandboxMessage) {
  if (message.media?.length === 1 && message.content === `[${getMediaLabel(message.media[0])}] ${message.media[0].name}`) return ''
  return message.content
}

function getMediaSource(mediaId: string) {
  return mediaSources.value[mediaId] ?? ''
}

async function loadVisibleMedia() {
  const actorUserId = currentUserId.value
  if (!actorUserId) return
  const missingMedia = messages.value.flatMap(({ media }) => media ?? []).filter(({ id }) => !mediaSources.value[id])
  await Promise.all(missingMedia.map(async (media) => {
    try {
      const content = await send('onebot-sandbox/media-content', { actorUserId, mediaId: media.id })
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

function formatMediaSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function selectMediaFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (file.size > 10 * 1024 * 1024) {
    errorMessage.value = '媒体大小不能超过 10 MB'
    clearSelectedMedia()
    return
  }
  selectedMediaFile.value = file
  errorMessage.value = ''
}

function clearSelectedMedia() {
  selectedMediaFile.value = undefined
  if (mediaInputRef.value) mediaInputRef.value.value = ''
}

function readFileBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      const separator = result.indexOf(',')
      if (separator < 0) return reject(new Error('无法读取媒体内容'))
      resolve(result.slice(separator + 1))
    })
    reader.addEventListener('error', () => reject(reader.error ?? new Error('无法读取媒体内容')))
    reader.readAsDataURL(file)
  })
}

function scrollToQuotedMessage(messageId: string) {
  const element = document.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`)
  if (!element) return
  element.scrollIntoView({ behavior: 'smooth', block: 'center' })
  highlightedMessageId.value = messageId
  if (quoteHighlightTimer) clearTimeout(quoteHighlightTimer)
  quoteHighlightTimer = setTimeout(() => {
    highlightedMessageId.value = ''
    quoteHighlightTimer = undefined
  }, 1400)
}

async function loadEarlierMessages() {
  const conversation = currentConversation.value
  const user = currentUser.value
  const beforeMessageId = conversation?.messageIds[0]
  if (!conversation || !user || !beforeMessageId || historyLoading.value) return

  historyLoading.value = true
  errorMessage.value = ''
  try {
    const history = await send('onebot-sandbox/message-history', {
      actorUserId: user.id,
      conversationId: conversation.id,
      beforeMessageId,
      limit: 50,
    })
    const knownIds = new Set(snapshot.value.messages.map(({ id }) => id))
    workspace.value = {
      ...workspace.value,
      snapshot: {
        ...snapshot.value,
        conversations: snapshot.value.conversations.map((item) => item.id === conversation.id ? {
          ...item,
          messageIds: [...history.messages.map((message: SandboxMessage) => message.id), ...item.messageIds],
          hasMoreMessages: !!history.nextBeforeMessageId,
        } : item),
        messages: [...history.messages.filter((message: SandboxMessage) => !knownIds.has(message.id)), ...snapshot.value.messages],
      },
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '读取历史消息失败'
  } finally {
    historyLoading.value = false
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

async function sendMessage() {
  const content = input.value.trim()
  const mediaFile = selectedMediaFile.value
  const user = currentUser.value
  const bot = currentBot.value
  const conversation = currentConversation.value
  const senderId = composerSenderId.value ?? user?.id
  if ((!content && !mediaFile) || !user || !bot || !conversation || !senderId || sending.value) return

  sending.value = true
  errorMessage.value = ''
  try {
    workspace.value = mediaFile
      ? await send('onebot-sandbox/send-media-message', {
          actorUserId: user.id,
          senderId,
          botId: bot.id,
          conversationId: conversation.id,
          fileName: mediaFile.name,
          mimeType: mediaFile.type,
          dataBase64: await readFileBase64(mediaFile),
          content: content || undefined,
          replyToMessageId: replyingToMessageId.value || undefined,
        })
      : await send('onebot-sandbox/send-message', {
          actorUserId: user.id,
          senderId,
          botId: bot.id,
          conversationId: conversation.id,
          content,
          replyToMessageId: replyingToMessageId.value || undefined,
        })
    applySelection(resolveWorkspaceSelection(snapshot.value, {
      currentUserId: user.id,
      activeConversationId: conversation.id,
      currentView: currentView.value,
    }))
    input.value = ''
    clearSelectedMedia()
    replyingToMessageId.value = ''
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
