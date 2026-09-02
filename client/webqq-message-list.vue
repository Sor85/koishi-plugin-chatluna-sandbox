<template>
  <ContextMenu>
    <ContextMenuTrigger as-child :disabled="preview || model.selectionMode || !model.currentConversation">
      <section
        ref="messagesElement"
        v-webqq-scrollbar="{ disabled: preview, tone: 'accent' }"
        class="chatluna-sandbox-messages"
        :class="{ 'is-selecting': model.selectionMode }"
        aria-label="消息记录"
        @scroll="handleMessagesScroll"
        @wheel.passive="handleMessageListUserScroll"
        @touchstart.passive="handleMessageListUserScroll"
        @pointerdown="finishMessageListScrollRestore"
      >
    <div v-if="!model.messages.length && !model.chatLunaStates.some((state) => state.thinking)" class="webqq-welcome" :class="{ 'is-bot': model.avatarKind === 'bot' }">
      <WebqqAvatar class="webqq-avatar webqq-avatar-large" :kind="model.avatarKind" :name="model.title" :avatar="model.avatar" />
      <strong>{{ model.title }}</strong>
      <template v-if="model.avatarKind === 'bot'">
        <span class="webqq-welcome-status"><i aria-hidden="true" />在线 · OneBot 机器人</span>
        <hr class="webqq-welcome-divider" aria-hidden="true" />
        <h2>发送一条消息开始测试</h2>
        <p>在模拟 QQ 环境中体验 OneBot 的消息交互</p>
      </template>
      <p v-else>发送消息，验证插件在模拟 QQ 环境中的响应</p>
    </div>
    <ol v-else ref="messagesContentElement">
      <li v-if="model.hasMoreMessages" class="webqq-history-more-row">
        <button type="button" class="webqq-history-more" :disabled="historyLoading" @click="loadEarlierMessages">
          {{ historyLoading ? '加载中...' : '查看更早消息' }}
        </button>
      </li>
      <template v-for="(message, messageIndex) in model.messages" :key="message.id">
        <li v-if="isForkBoundary(messageIndex)" :key="`${message.id}:fork-boundary`" class="chatluna-sandbox-fork-boundary">以上是与原会话共享的记录，在这条分支里只读</li>
        <li v-if="shouldRenderAsEvent(message)" class="chatluna-sandbox-message-event">{{ getEventMessageText(message) }}</li>
        <ContextMenu v-else>
          <li
            class="chatluna-sandbox-message-row"
              :class="[
                message.authorId === model.currentOperatorId ? 'is-outgoing' : 'is-incoming',
                getMessageClusterClass(model.messages, messageIndex, model.currentOperatorId),
                { 'is-merged': isMergedMessage(model.messages, messageIndex, model.currentOperatorId) },
                { 'is-quote-target': highlightedMessageId === message.id },
                { 'is-recalled': isRecalledMessage(message) },
                { 'is-inherited': isInheritedMessage(message) },
                { 'is-selecting': model.selectionMode },
                { 'is-selectable': model.selectionMode && capabilitiesOf(message).forward },
                { 'is-selected': model.selectionMode && isMessageSelected(message.id) },
              ]"
              :data-message-id="message.id"
              :aria-selected="model.selectionMode ? isMessageSelected(message.id) : undefined"
              @click="handleMessageClick(message, $event)"
            >
              <span
                v-if="model.selectionMode && capabilitiesOf(message).forward"
                class="chatluna-sandbox-message-select-marker"
                :class="{ 'is-checked': isMessageSelected(message.id) }"
                aria-hidden="true"
              >
                <IconCheck :size="12" stroke-width="3" />
              </span>
              <div class="chatluna-sandbox-message-select-body">
              <ContextMenu v-if="message.authorId !== model.currentOperatorId">
                <ContextMenuTrigger as-child :disabled="model.selectionMode">
                  <button type="button" class="chatluna-sandbox-message-avatar-wrap chatluna-sandbox-message-avatar-trigger" :aria-label="`查看 ${getMessageAuthorName(message.authorId)} 的资料`" @click="handleMessageAvatarClick(message, $event)" @contextmenu.stop>
                    <WebqqAvatar class="chatluna-sandbox-message-avatar" :kind="isBotParticipant(message.authorId) ? 'bot' : 'user'" :name="getMessageAuthorName(message.authorId)" :avatar="getParticipantAvatar(message.authorId)" />
                  </button>
                </ContextMenuTrigger>
                <ContextMenuContent style="z-index: 140">
                  <ContextMenuItem @select="emit('openProfile', message.authorId)">
                    <IconId :size="16" aria-hidden="true" /> 查看资料
                  </ContextMenuItem>
                  <ContextMenuItem v-if="getMessageGroupMemberActions(message.authorId).includes('mention')" @select="emit('mentionGroupMember', message.authorId)">
                    <IconAt :size="16" aria-hidden="true" /> @ 用户
                  </ContextMenuItem>
                  <ContextMenuItem v-if="getMessageGroupMemberActions(message.authorId).includes('poke')" @select="emit('pokeGroupMember', message.authorId)">
                    <IconHandClick :size="16" aria-hidden="true" /> 戳一戳
                  </ContextMenuItem>
                  <ContextMenuSub v-if="hasMessageGroupMemberManagementActions(message.authorId)">
                    <ContextMenuSubTrigger><IconUsers :size="16" aria-hidden="true" /> 群成员操作</ContextMenuSubTrigger>
                    <GroupMemberMenu
                      sub
                      management-only
                      :actor="getCurrentGroupMember(model.currentOperatorId ?? '')"
                      :target="getCurrentGroupMember(message.authorId)!"
                      @set-card="emit('setGroupCard', message.authorId)"
                      @set-title="emit('setGroupTitle', message.authorId)"
                      @set-admin="emit('setGroupAdmin', message.authorId, $event)"
                      @transfer-owner="emit('transferGroupOwner', message.authorId)"
                      @kick="emit('kickGroupMember', message.authorId)"
                    />
                  </ContextMenuSub>
                  <ContextMenuItem v-if="getChatFriendActions(message.authorId).includes('request')" @select="emit('requestFriend', message.authorId)">
                    <IconUserPlus :size="16" aria-hidden="true" /> 发送好友申请
                    <WebqqMenuExtensionMark />
                  </ContextMenuItem>
                  <ContextMenuItem v-else-if="getFriendMenuState(message.authorId).pendingOutgoing" disabled><IconClock :size="16" aria-hidden="true" /> 等待对方处理</ContextMenuItem>
                  <ContextMenuItem v-else-if="getFriendMenuState(message.authorId).pendingIncoming" disabled><IconBell :size="16" aria-hidden="true" /> 请在通知中处理申请</ContextMenuItem>
                  <ContextMenuItem v-if="!model.currentGroup && getChatFriendActions(message.authorId).includes('poke')" @select="emit('pokeFriend', message.authorId)">
                    <IconHandClick :size="16" aria-hidden="true" /> 戳一戳
                  </ContextMenuItem>
                  <ContextMenuItem v-if="!model.currentGroup && getChatFriendActions(message.authorId).includes('remark')" @select="emit('setRemark', message.authorId)"><IconTag :size="16" aria-hidden="true" /> 设置好友备注 <WebqqMenuExtensionMark /></ContextMenuItem>
                  <ContextMenuItem v-if="!model.currentGroup && getChatFriendActions(message.authorId).includes('delete')" class="text-red-600 focus:bg-red-50 focus:text-red-700 dark:focus:bg-red-950/40" @select="emit('deleteFriend', message.authorId)"><IconUserMinus :size="16" aria-hidden="true" /> 删除好友</ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
              <ContextMenu v-else>
                <ContextMenuTrigger as-child :disabled="model.selectionMode">
                  <button type="button" class="chatluna-sandbox-message-avatar-wrap chatluna-sandbox-message-avatar-trigger" :aria-label="`查看 ${getMessageAuthorName(message.authorId)} 的资料`" @click="handleMessageAvatarClick(message, $event)" @contextmenu.stop>
                    <WebqqAvatar class="chatluna-sandbox-message-avatar" :kind="isBotParticipant(message.authorId) ? 'bot' : 'user'" :name="getMessageAuthorName(message.authorId)" :avatar="getParticipantAvatar(message.authorId)" />
                  </button>
                </ContextMenuTrigger>
                <ContextMenuContent style="z-index: 140">
                  <ContextMenuItem @select="emit('openProfile', message.authorId)">
                    <IconId :size="16" aria-hidden="true" /> 查看资料
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
              <div class="chatluna-sandbox-message-content">
                <div v-if="!isMergedMessage(model.messages, messageIndex, model.currentOperatorId)" class="chatluna-sandbox-sender-line">
                  <span class="chatluna-sandbox-message-author">{{ getMessageAuthorName(message.authorId) }}</span>
                  <span
                    v-if="getMessageRoleBadge(message.authorId)"
                    class="webqq-role-badge"
                    :class="`is-${getMessageRoleBadge(message.authorId)!.kind}`"
                  >{{ getMessageRoleBadge(message.authorId)!.text }}</span>
                </div>
                <div class="chatluna-sandbox-message-body">
                  <div class="chatluna-sandbox-message-stack">
                    <ContextMenuTrigger as-child :disabled="isRecalledMessage(message) || model.selectionMode">
                      <div class="chatluna-sandbox-message-bubble" @contextmenu.stop @click.capture="handleMessageBubbleClick(message, $event)">
                      <button v-if="getReplyMessage(message)" class="chatluna-sandbox-message-quote is-clickable" type="button" aria-label="跳转到引用消息" @click.stop="scrollToQuotedMessage(getReplyMessage(message)!.id)">
                        <strong class="chatluna-sandbox-message-quote-title">{{ getMessageAuthorName(getReplyMessage(message)!.authorId) }}</strong>
                        <span>{{ getMessageText(getReplyMessage(message)!) }}</span>
                      </button>
                      <button
                        v-if="message.forwardId"
                        class="chatluna-sandbox-message-quote chatluna-sandbox-message-forward"
                        type="button"
                        :disabled="!getForwardPreview(message)"
                        aria-label="查看合并转发消息"
                        @click.stop="openForwardMessage(message)"
                      >
                        <strong class="chatluna-sandbox-message-quote-title">{{ getForwardPreview(message)?.title || '合并转发' }}</strong>
                        <template v-if="getForwardPreview(message)">
                          <span
                            v-for="(line, lineIndex) in getForwardPreview(message)!.lines"
                            :key="`${message.id}:forward:${lineIndex}`"
                          >{{ line }}</span>
                          <span class="chatluna-sandbox-message-forward-entry">查看{{ getForwardPreview(message)!.total }}条转发消息</span>
                        </template>
                        <span v-else>{{ getMessageText(message) || '[合并转发]' }}</span>
                      </button>
                      <template v-else>
                        <div v-for="media in message.media" :key="media.id" class="chatluna-sandbox-message-media">
                          <img v-if="media.type === 'image' && getMediaSource(media.id)" :src="getMediaSource(media.id)" :alt="media.name">
                          <audio v-else-if="media.type === 'audio' && getMediaSource(media.id)" :src="getMediaSource(media.id)" controls preload="metadata" />
                          <video v-else-if="media.type === 'video' && getMediaSource(media.id)" :src="getMediaSource(media.id)" controls preload="metadata" />
                          <a v-else-if="media.type === 'file' && getMediaSource(media.id)" :href="getMediaSource(media.id)" :download="media.name" class="chatluna-sandbox-message-file">
                            <IconPaperclip :size="18" aria-hidden="true" />
                            <span><strong>{{ media.name }}</strong><small>{{ formatMediaSize(media.size) }}</small></span>
                          </a>
                          <span v-else class="chatluna-sandbox-message-media-loading">{{ model.mediaLoadFailures[media.id] ? '媒体不可用' : '媒体加载中...' }}</span>
                        </div>
                        <span v-if="getMessageText(message)" class="chatluna-sandbox-message-text">{{ getMessageText(message) }}</span>
                      </template>
                      <span v-if="isRecalledMessage(message)" class="chatluna-sandbox-message-recalled-label">已撤回</span>
                      <WebqqMessageReactions
                        v-if="message.reactions?.length"
                        :reactions="message.reactions"
                        :current-operator-id="model.currentOperatorId"
                        :participants="model.participants"
                        :readonly="!capabilitiesOf(message).react"
                        @toggle="toggleReaction(message, $event)"
                      />
                      </div>
                    </ContextMenuTrigger>
                  </div>
                  <time class="chatluna-sandbox-message-time">{{ formatSandboxTimeOfDay(message.createdAt) }}</time>
                </div>
              </div>
              </div>
            </li>
          <ContextMenuContent style="z-index: 140">
            <ContextMenuItem
              v-if="isBotParticipant(message.authorId) && message.chatLuna?.modelRequests?.length"
              @select="emit('openModelRequest', message.chatLuna.modelRequests.at(-1)!)"
            >
              <IconExternalLink :size="16" aria-hidden="true" /> 跳转到对应请求
            </ContextMenuItem>
            <ContextMenuItem v-if="capabilitiesOf(message).reply" @select="emit('reply', message.id)"><IconMessageReply :size="16" aria-hidden="true" /> 回复</ContextMenuItem>
            <ContextMenuItem v-if="capabilitiesOf(message).branch" @select="emit('branchConversationInstance', message.id)">
              <IconGitBranch :size="16" aria-hidden="true" /> 创建分支
            </ContextMenuItem>
            <ContextMenuItem v-if="capabilitiesOf(message).react" @select="emit('openReactionPicker', message.id)">
              <IconMoodSmile :size="16" aria-hidden="true" /> 贴表情
            </ContextMenuItem>
            <ContextMenuItem
              v-if="capabilitiesOf(message).forward"
              @select="emit('enterSelection', message.id)"
            >
              <IconChecks :size="16" aria-hidden="true" /> 多选
            </ContextMenuItem>
            <ContextMenuItem v-if="capabilitiesOf(message).recall" class="text-red-600 focus:bg-red-50 focus:text-red-700 dark:focus:bg-red-950/40" @select="emit('recallMessage', message.id)">
              <IconArrowBackUp :size="16" aria-hidden="true" /> 撤回
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        <li
          v-if="shouldShowThinking(message)"
          :key="`${message.id}:thinking`"
          class="chatluna-sandbox-thinking-row"
          :class="[
            message.authorId === model.currentOperatorId ? 'is-outgoing' : 'is-incoming',
            { 'is-recalled': isRecalledMessage(message) },
          ]"
        >
          <button
            type="button"
            class="chatluna-sandbox-thinking-toggle"
            :aria-expanded="isThinkingExpanded(message)"
            @click="toggleThinking(message)"
          >
            <span
              v-if="getMessageThinking(message)!.usage"
              class="chatluna-sandbox-thinking-usage"
              aria-label="本次 ChatLuna 调用指标"
            >
              <span class="chatluna-sandbox-thinking-usage-group">
                <svg class="chatluna-sandbox-thinking-usage-icon is-input" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 20V8" />
                  <path d="m7 13 5-5 5 5" />
                  <path d="M5 4h14" />
                </svg>
                <span>{{ getMessageThinking(message)!.usage!.inputTokens }}</span>
                <svg class="chatluna-sandbox-thinking-usage-icon is-output" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 4v12" />
                  <path d="m7 11 5 5 5-5" />
                  <path d="M5 20h14" />
                </svg>
                <span>{{ getMessageThinking(message)!.usage!.outputTokens }}</span>
              </span>
            </span>
            <span class="chatluna-sandbox-thinking-duration">{{ formatThinkingDuration(getMessageThinking(message)!.thoughtDurationMs) }}</span>
            <svg
              class="chatluna-sandbox-thinking-chevron"
              :class="{ 'is-expanded': isThinkingExpanded(message) }"
              viewBox="0 0 16 16"
              aria-hidden="true"
            >
              <path d="M6 3.5 10.5 8 6 12.5" />
            </svg>
          </button>
          <Transition name="chatluna-sandbox-thinking" @before-leave="prepareThinkingPanelLeave">
            <div v-if="isThinkingExpanded(message)" class="chatluna-sandbox-thinking-panel">
              <div class="chatluna-sandbox-thinking-content">{{ getMessageThinking(message)!.thought }}</div>
            </div>
          </Transition>
        </li>
        <li
          v-else-if="shouldShowUsage(message)"
          :key="`${message.id}:usage`"
          class="chatluna-sandbox-thinking-row is-usage-only"
          :class="[
            message.authorId === model.currentOperatorId ? 'is-outgoing' : 'is-incoming',
            { 'is-recalled': isRecalledMessage(message) },
          ]"
        >
          <div class="chatluna-sandbox-thinking-usage" aria-label="本次 ChatLuna 调用指标">
            <span class="chatluna-sandbox-thinking-usage-group">
              <svg class="chatluna-sandbox-thinking-usage-icon is-input" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 20V8" />
                <path d="m7 13 5-5 5 5" />
                <path d="M5 4h14" />
              </svg>
              <span>{{ getMessageUsage(message)!.usage!.inputTokens }}</span>
              <svg class="chatluna-sandbox-thinking-usage-icon is-output" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 4v12" />
                <path d="m7 11 5 5 5-5" />
                <path d="M5 20h14" />
              </svg>
              <span>{{ getMessageUsage(message)!.usage!.outputTokens }}</span>
            </span>
          </div>
        </li>
      </template>
      <li
        v-for="state in model.chatLunaStates"
        v-show="state.thinking"
        :key="`${state.botParticipantId}:${state.conversationId}`"
        class="chatluna-sandbox-message-row webqq-chatluna-state"
        :class="state.botParticipantId === model.currentOperatorId ? 'is-outgoing' : 'is-incoming'"
      >
        <span class="chatluna-sandbox-message-avatar-wrap">
          <WebqqAvatar
            class="chatluna-sandbox-message-avatar"
            kind="bot"
            :name="getParticipantName(state.botParticipantId)"
            :avatar="getParticipantAvatar(state.botParticipantId)"
          />
        </span>
        <div class="chatluna-sandbox-message-content">
          <!-- 等待气泡必须复用普通消息的 sender-line + message-body 结构：
               少了包裹层会丢掉 .chatluna-sandbox-sender-line + .chatluna-sandbox-message-body 的 6px 间距，
               等待气泡会比真实消息更贴近名字，被替换成真实消息时还会整体下跳。 -->
          <div class="chatluna-sandbox-sender-line">
            <span class="chatluna-sandbox-message-author">{{ getParticipantName(state.botParticipantId) }}</span>
          </div>
          <div class="chatluna-sandbox-message-body">
            <div class="chatluna-sandbox-message-bubble" aria-label="机器人正在思考">
              <span class="webqq-chatluna-thinking-dots">
                <span v-for="dot in 3" :key="dot" class="webqq-chatluna-thinking-dot" />
              </span>
            </div>
          </div>
        </div>
      </li>
    </ol>
  </section>
    </ContextMenuTrigger>
    <ContextMenuContent style="z-index: 140">
      <ContextMenuItem class="text-red-600 focus:bg-red-50 focus:text-red-700 dark:focus:bg-red-950/40" @select="emit('clearConversation')">
        <IconTrash :size="16" aria-hidden="true" /> 清空会话记录
      </ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>
</template>

<script setup lang="ts">
import { IconArrowBackUp, IconAt, IconBell, IconCheck, IconChecks, IconClock, IconExternalLink, IconGitBranch, IconHandClick, IconId, IconMessageReply, IconMoodSmile, IconPaperclip, IconTag, IconTrash, IconUserMinus, IconUserPlus, IconUsers } from '@tabler/icons-vue'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger } from '#client/components/ui/context-menu'
import { type FriendMenuState } from '#client/webqq/friend-menu'
// 时刻的时区与语言都是格式化模块的显式参数，缺省指向浏览器环境；这里不再包一层。
import { formatSandboxTimeOfDay } from '#client/webqq/format-time'
import GroupMemberMenu from './group-member-menu.vue'
import { getMessageClusterClass, isMergedMessage } from '#client/webqq/message-cluster'
import { createMessageListFollowController } from '#client/webqq/message-list-follow'
import {
  createMessageListContentResizeBinding,
  routeMessageListContentResize,
  switchMessageListConversation,
} from '#client/webqq/message-list-conversation-switch'
import { loadEarlierMessageListHistory, type MessageListGeometry } from '#client/webqq/message-list-history-load'
import {
  readPointerContext,
  routeAvatarClick,
  routeBubbleClick,
  routeRowClick,
} from '#client/webqq/message-pointer-routing'
import { formatThinkingDuration, freezeThinkingPanel, toggleThinkingExpansion } from '#client/webqq/thinking-panel'
import {
  formatMediaSize,
  getEventMessageText as readEventMessageText,
  getForwardPreview as readForwardPreview,
  getMessageText as readMessageText,
  getMessageThinking,
  getMessageUsage,
  getReplyMessage as readReplyMessage,
  isForkBoundary as isForkBoundaryRow,
  isInheritedMessage as isInheritedPrefixMessage,
  readMessageCapabilities,
  resolveForwardOpenInput,
  resolveReactionToggle,
  shouldRenderAsEvent as shouldRenderMessageAsEvent,
  shouldShowThinking as shouldShowMessageThinking,
  shouldShowUsage as shouldShowMessageUsage,
  type MessagePresentationContext,
} from '#client/webqq/message-presentation'
import {
  getChatFriendActions as readChatFriendActions,
  getCurrentGroupMember as readCurrentGroupMember,
  getFriendMenuStateOf as readFriendMenuState,
  getMessageAuthorName as readMessageAuthorName,
  getMessageGroupMemberActions as readGroupMemberActions,
  getMessageRoleBadge as readMessageRoleBadge,
  getParticipantAvatar as readParticipantAvatar,
  getParticipantName as readParticipantName,
  hasGroupMemberManagementActions,
  isBotParticipant as readIsBotParticipant,
  type MessageParticipant,
  type ParticipantPresentationContext,
} from '#client/webqq/participant-presentation'
import {
  buildMessageListTail,
  scrollMessageListToBottom,
  shouldFollowMessageListTail,
} from '#client/webqq/message-list-scroll'
import {
  buildMessageListScrollStateKey,
  readMessageListScrollState,
  writeMessageListScrollState,
  type MessageListScrollState,
} from '#client/webqq/message-list-scroll-state'
import {
  createMessageListScrollRestoreScheduler,
  resolveMessageListScrollRestore,
  resolveMessageListScrollSave,
  revealMessageListMessage,
  type ScrollAnchorRow,
} from '#client/webqq/message-list-scroll-restore'
import { highlightMessageElement } from '#client/webqq/message-reveal'
import WebqqAvatar from './webqq-avatar.vue'
import WebqqMessageReactions from './webqq-message-reactions.vue'
import WebqqMenuExtensionMark from './webqq-menu-extension-mark.vue'
import { vWebqqScrollbar } from './webqq-scrollbar'
import type { ResolvedConversation } from '../src/conversation-resolution'
import { type MessageCapabilities } from '../src/message-capabilities'
import {
  isRecalledMessage,
  type SandboxChatLunaState,
  type SandboxForwardPreview,
  type SandboxGroup,
  type SandboxMessage,
  type SandboxMessageModelRequestReference,
} from '../src/types'

export interface WebqqMessageListModel {
  messages: SandboxMessage[]
  chatLunaStates: SandboxChatLunaState[]
  replyMessages: Record<string, SandboxMessage>
  // 外层合并转发卡片的轻量投影：标题、总数、最多 4 行。
  forwardPreviews: Record<string, SandboxForwardPreview>
  // 每条消息的能力位，由共享判据在外壳投影里算好；列表只渲染，不自己推导。
  messageCapabilities: Record<string, MessageCapabilities>
  participants: Record<string, MessageParticipant>
  friendMenuStates: Record<string, FriendMenuState>
  currentConversation?: ResolvedConversation
  currentGroup?: SandboxGroup
  currentOperatorId?: string
  title: string
  avatar: string
  avatarKind: 'user' | 'bot' | 'group'
  hasMoreMessages: boolean
  mediaSources: Record<string, string>
  mediaLoadFailures: Record<string, true>
  // 默认 true：保留撤回气泡；false：隐藏原文并显示结构化撤回事件。
  markRecalledMessages: boolean
  // chat-pane 多选态：列表只渲染勾选与点击切换，不拥有选择集合。
  selectionMode?: boolean
  selectedMessageIds?: string[]
}

const props = defineProps<{ model: WebqqMessageListModel; preview?: boolean; scrollScope?: string }>()
const preview = computed(() => !!props.preview)
const emit = defineEmits<{
  reply: [messageId: string]
  recallMessage: [messageId: string]
  clearConversation: []
  branchConversationInstance: [messageId: string]
  enterSelection: [messageId: string]
  toggleSelection: [messageId: string]
  openForward: [input: { messageId: string; forwardId: string }]
  setMessageReaction: [messageId: string, emojiId: string, enabled: boolean]
  openReactionPicker: [messageId: string]
  openModelRequest: [reference: SandboxMessageModelRequestReference]
  loadHistory: [resolve: () => void, reject: (error: unknown) => void]
  requestFriend: [targetId: string]
  pokeFriend: [targetId: string]
  setRemark: [targetId: string]
  deleteFriend: [targetId: string]
  mentionGroupMember: [targetId: string]
  pokeGroupMember: [targetId: string]
  setGroupCard: [targetId: string]
  setGroupTitle: [targetId: string]
  setGroupAdmin: [targetId: string, enabled: boolean]
  transferGroupOwner: [targetId: string]
  kickGroupMember: [targetId: string]
  openProfile: [participantId: string]
}>()

const historyLoading = ref(false)
const highlightedMessageId = ref('')
const expandedThinking = ref<Record<string, true>>({})
const messagesElement = ref<HTMLElement>()
const messagesContentElement = ref<HTMLOListElement>()
let previousMessageListTail: ReturnType<typeof buildMessageListTail> | undefined
const follow = createMessageListFollowController({
  getBox: () => messagesElement.value,
  nextTick,
  requestAnimationFrame: (callback) => requestAnimationFrame(callback),
  cancelAnimationFrame: (id) => cancelAnimationFrame(id),
})
const participantNames = computed(() => Object.fromEntries(
  Object.entries(props.model.participants).map(([id, participant]) => [id, participant.name]),
))
/**
 * 两个呈现模块共用的取数上下文。
 *
 * 合成一个 computed 而不是在每个包装函数里现拼：模板里每一行都会问好几次，逐次重建对象会让
 * 参与者名字映射按渲染次数重算，正是读取放大守卫要钉住的那类写法。
 */
const presentation = computed<MessagePresentationContext & ParticipantPresentationContext>(() => ({
  replyMessages: props.model.replyMessages,
  forwardPreviews: props.model.forwardPreviews,
  messageCapabilities: props.model.messageCapabilities,
  participantNames: participantNames.value,
  markRecalledMessages: props.model.markRecalledMessages,
  currentConversationId: props.model.currentConversation?.id,
  currentOperatorId: props.model.currentOperatorId,
  participants: props.model.participants,
  friendMenuStates: props.model.friendMenuStates,
  currentGroup: props.model.currentGroup,
}))
let quoteHighlightTimer: ReturnType<typeof setTimeout> | undefined

const messageListTail = computed(() => buildMessageListTail({
  conversationId: props.model.currentConversation?.id ?? props.model.messages.at(-1)?.conversationId,
  messages: props.model.messages,
  chatLunaStates: props.model.chatLunaStates,
}))
const scrollStateKey = computed(() => buildMessageListScrollStateKey(
  props.scrollScope,
  messageListTail.value.conversationId,
))
let activeScrollStateKey: string | undefined

/** 从 DOM 行映射出锚点判定要的几何。映射是机械动作，判定住在模块里。 */
function readScrollAnchorRows(element: HTMLElement): ScrollAnchorRow[] {
  return [...element.querySelectorAll<HTMLElement>('[data-message-id]')].map((row) => {
    const rect = row.getBoundingClientRect()
    return { messageId: row.dataset.messageId!, top: rect.top, bottom: rect.bottom }
  })
}

/** 一次读齐容器顶缘、滚动位置与全部消息行：恢复与加载更早的锚点补偿都按这三样算。 */
function readMessageListGeometry(): MessageListGeometry | undefined {
  const element = messagesElement.value
  if (!element) return
  return {
    containerTop: element.getBoundingClientRect().top,
    scrollTop: element.scrollTop,
    rows: readScrollAnchorRows(element),
  }
}

function applyMessageListScrollState(state: MessageListScrollState) {
  const element = messagesElement.value
  const geometry = readMessageListGeometry()
  if (!element || !geometry) return
  const outcome = resolveMessageListScrollRestore({
    state,
    containerTop: geometry.containerTop,
    currentScrollTop: geometry.scrollTop,
    rows: geometry.rows,
  })
  if (outcome.kind === 'bottom') scrollMessageListToBottom(element)
  else element.scrollTop = outcome.scrollTop
}

const restore = createMessageListScrollRestoreScheduler({
  requestAnimationFrame: (callback) => requestAnimationFrame(callback),
  cancelAnimationFrame: (id) => cancelAnimationFrame(id),
  apply: applyMessageListScrollState,
  getActiveKey: () => activeScrollStateKey,
})

function saveMessageListScrollState(key = activeScrollStateKey) {
  const element = messagesElement.value
  const next = resolveMessageListScrollSave({
    preview: preview.value,
    restoring: restore.restoring,
    box: element,
    stickingToBottom: follow.stickingToBottom,
    containerTop: element?.getBoundingClientRect().top ?? 0,
    rows: element ? readScrollAnchorRows(element) : [],
  })
  if (next) writeMessageListScrollState(key, next)
}

function scheduleMessageListScrollRestore(key: string | undefined) {
  restore.schedule(key)
}

function finishMessageListScrollRestore() {
  restore.finish()
}

/**
 * 开始一次恢复：停掉贴底追踪、记下待恢复状态、下一拍起排程。
 *
 * 会话切换与加载更早历史共用这一段——两者的差别只在待恢复状态是从哪里来的（存下来的，
 * 还是按加载前的锚点现算的），后续的分趟施加与防覆盖完全一样。
 */
function beginMessageListScrollRestore(state: MessageListScrollState, key = activeScrollStateKey) {
  follow.cancel()
  restore.begin(state)
  follow.setStickingToBottom(state.stickingToBottom)
  void nextTick(() => scheduleMessageListScrollRestore(key))
}

function restoreMessageListScrollState(key: string | undefined) {
  const state = readMessageListScrollState(key)
  if (!state) return false
  beginMessageListScrollRestore(state, key)
  return true
}

function handleMessagesScroll() {
  if (!messagesElement.value || restore.restoring) return
  follow.handleScroll()
}

function handleMessageListUserScroll() {
  finishMessageListScrollRestore()
  follow.handleUserScrollIntent()
}

watch(scrollStateKey, (nextKey, previousKey) => {
  switchMessageListConversation({ preview: preview.value, previousKey, nextKey }, {
    saveScrollState: saveMessageListScrollState,
    finishRestore: finishMessageListScrollRestore,
    cancelFollow: () => follow.cancel(),
    adoptKey: (key) => {
      activeScrollStateKey = key
      // 与状态键同拍换掉末尾签名：换会话本身不是「来了新消息」，让末尾 watcher 据此判定
      // 会把整段历史当成新消息，进而无条件置底。
      previousMessageListTail = messageListTail.value
    },
    restoreScrollState: restoreMessageListScrollState,
    stickToBottom: () => {
      follow.setStickingToBottom(true)
      void follow.scheduleBottom(true)
    },
  })
}, { immediate: true })

watch(messageListTail, (nextTail) => {
  if (preview.value) return
  const previousTail = previousMessageListTail
  const shouldFollow = shouldFollowMessageListTail(
    previousTail,
    nextTail,
    follow.stickingToBottom,
  )
  previousMessageListTail = nextTail
  if (!shouldFollow) return
  follow.setStickingToBottom(true)
  // 新消息与思考状态只在用户仍跟随末尾时置底；会话切换由 scrollStateKey watcher 单独处理。
  void follow.scheduleBottom()
}, { immediate: true, flush: 'post' })

// 新消息中的媒体与 thinking 内容可能在 Vue 更新后继续增高；补哪一种位置是模块里的二选一。
const contentResize = createMessageListContentResizeBinding({
  createObserver: (callback) => typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(callback),
  onResize: () => {
    const action = routeMessageListContentResize({
      restoring: !!restore.restoring,
      stickingToBottom: follow.stickingToBottom,
    })
    if (action.kind === 'reschedule-restore') scheduleMessageListScrollRestore(activeScrollStateKey)
    else if (action.kind === 'stick-to-bottom') void follow.scheduleBottom()
  },
})

watch([messagesElement, messagesContentElement], ([element, content]) => {
  contentResize.bind({ preview: preview.value, box: element, content })
}, { flush: 'post' })

// 思考与用量归档在消息上，因此多轮对话后每条机器人消息都保留自己的指标。
function isThinkingExpanded(message: SandboxMessage) {
  return !!expandedThinking.value[message.id]
}

function toggleThinking(message: SandboxMessage) {
  expandedThinking.value = toggleThinkingExpansion(expandedThinking.value, message.id)
}

function prepareThinkingPanelLeave(element: Element) {
  if (element instanceof HTMLElement) freezeThinkingPanel(element)
}

function getParticipantName(id: string) {
  return readParticipantName(id, presentation.value)
}

function getParticipantAvatar(id: string) {
  return readParticipantAvatar(id, presentation.value)
}

function isBotParticipant(id: string) {
  return readIsBotParticipant(id, presentation.value)
}

function getCurrentGroupMember(participantId: string) {
  return readCurrentGroupMember(participantId, presentation.value)
}

function getMessageGroupMemberActions(participantId: string) {
  return readGroupMemberActions(participantId, presentation.value)
}

function hasMessageGroupMemberManagementActions(participantId: string) {
  return hasGroupMemberManagementActions(participantId, presentation.value)
}

function getMessageAuthorName(participantId: string) {
  return readMessageAuthorName(participantId, presentation.value)
}

function getMessageRoleBadge(participantId: string) {
  return readMessageRoleBadge(participantId, presentation.value)
}

function getFriendMenuState(targetId: string): FriendMenuState {
  return readFriendMenuState(targetId, presentation.value)
}

function getChatFriendActions(targetId: string) {
  return readChatFriendActions(targetId, presentation.value)
}

function getReplyMessage(message: SandboxMessage) {
  return readReplyMessage(message, presentation.value)
}

function getForwardPreview(message: SandboxMessage) {
  return readForwardPreview(message, presentation.value)
}

function openForwardMessage(message: SandboxMessage) {
  const input = resolveForwardOpenInput(message, presentation.value)
  if (input) emit('openForward', input)
}

function shouldRenderAsEvent(message: SandboxMessage) {
  return shouldRenderMessageAsEvent(message, presentation.value)
}

function capabilitiesOf(message: SandboxMessage): MessageCapabilities {
  return readMessageCapabilities(message, presentation.value)
}

function isMessageSelected(messageId: string) {
  return !!props.model.selectedMessageIds?.includes(messageId)
}

/**
 * 三条分流规则住在 message-pointer-routing 并由它的行为断言逐条执行；这三个处理器只把判定
 * 结果翻译成 DOM 机械动作。能力位在每个处理器自己的函数体里读，不抽到公共辅助函数里——
 * 架构守卫「消息动作入口必须由能力位守门」按发起点所在的最小作用域逐个判定，抽走会让它看不见。
 */
function handleMessageAvatarClick(message: SandboxMessage, event: MouseEvent) {
  const action = routeAvatarClick(readPointerContext(props.model.selectionMode, capabilitiesOf(message)))
  if (action.kind === 'none') return
  event.preventDefault()
  event.stopPropagation()
  emit('openProfile', message.authorId)
}

function handleMessageBubbleClick(message: SandboxMessage, event: MouseEvent) {
  const action = routeBubbleClick(readPointerContext(props.model.selectionMode, capabilitiesOf(message)))
  if (action.kind === 'none') return
  event.preventDefault()
  event.stopPropagation()
  emit('toggleSelection', message.id)
}

function handleMessageClick(message: SandboxMessage, event: MouseEvent) {
  const context = readPointerContext(props.model.selectionMode, capabilitiesOf(message))
  const action = routeRowClick(context, event.target as HTMLElement | null)
  if (action.kind === 'none') return
  emit('toggleSelection', message.id)
}

function getEventMessageText(message: SandboxMessage) {
  return readEventMessageText(message, getMessageAuthorName)
}

function shouldShowThinking(message: SandboxMessage) {
  return shouldShowMessageThinking(message, presentation.value)
}

function shouldShowUsage(message: SandboxMessage) {
  return shouldShowMessageUsage(message, presentation.value)
}

function isInheritedMessage(message: SandboxMessage) {
  return isInheritedPrefixMessage(message, presentation.value)
}

function isForkBoundary(index: number) {
  return isForkBoundaryRow(props.model.messages, index, presentation.value)
}

function toggleReaction(message: SandboxMessage, emojiId: string) {
  const toggle = resolveReactionToggle(message, emojiId, presentation.value)
  if (toggle) emit('setMessageReaction', toggle.messageId, toggle.emojiId, toggle.enabled)
}

function getMessageText(message: SandboxMessage) {
  return readMessageText(message, presentation.value)
}

function getMediaSource(mediaId: string) {
  return props.model.mediaSources[mediaId] ?? ''
}

function revealMessage(messageId: string) {
  return revealMessageListMessage({
    stopFollowing: () => {
      follow.setStickingToBottom(false)
      follow.cancel()
    },
    highlight: () => {
      const result = highlightMessageElement({
        messageId,
        root: messagesElement.value ?? document,
        onHighlight: (id) => {
          highlightedMessageId.value = id
        },
        onClear: () => {
          highlightedMessageId.value = ''
          quoteHighlightTimer = undefined
        },
        clearTimer: quoteHighlightTimer,
      })
      quoteHighlightTimer = result.clearTimer
      return result.highlighted
    },
  })
}

function scrollToQuotedMessage(messageId: string) {
  revealMessage(messageId)
}

defineExpose({
  revealMessage,
})

function loadEarlierMessages() {
  return loadEarlierMessageListHistory({
    isLoading: () => historyLoading.value,
    setLoading: (loading) => {
      historyLoading.value = loading
    },
    isStickingToBottom: () => follow.stickingToBottom,
    readGeometry: readMessageListGeometry,
    requestHistory: () => new Promise<void>((resolve, reject) => emit('loadHistory', resolve, reject)),
    restoreAnchored: beginMessageListScrollRestore,
  })
}

onBeforeUnmount(() => {
  saveMessageListScrollState()
  if (quoteHighlightTimer) clearTimeout(quoteHighlightTimer)
  follow.cancel()
  finishMessageListScrollRestore()
  contentResize.disconnect()
})
</script>
