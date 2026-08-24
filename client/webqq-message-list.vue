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
                { 'is-selecting': model.selectionMode },
                { 'is-selectable': model.selectionMode && isMessageSelectable(message) },
                { 'is-selected': model.selectionMode && isMessageSelected(message.id) },
              ]"
              :data-message-id="message.id"
              :aria-selected="model.selectionMode ? isMessageSelected(message.id) : undefined"
              @click="handleMessageClick(message, $event)"
            >
              <span
                v-if="model.selectionMode && isMessageSelectable(message)"
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
                        :readonly="isReactionReadonly(message)"
                        @toggle="toggleReaction(message, $event)"
                      />
                      </div>
                    </ContextMenuTrigger>
                  </div>
                  <time class="chatluna-sandbox-message-time">{{ formatMessageTime(message.createdAt) }}</time>
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
            <ContextMenuItem v-if="!isRecalledMessage(message)" @select="emit('reply', message.id)"><IconMessageReply :size="16" aria-hidden="true" /> 回复</ContextMenuItem>
            <ContextMenuItem v-if="canReactToMessage(message)" @select="emit('openReactionPicker', message.id)">
              <IconMoodSmile :size="16" aria-hidden="true" /> 贴表情
            </ContextMenuItem>
            <ContextMenuItem
              v-if="!isRecalledMessage(message) && !message.event"
              @select="emit('enterSelection', message.id)"
            >
              <IconChecks :size="16" aria-hidden="true" /> 多选
            </ContextMenuItem>
            <ContextMenuItem v-if="canRecallMessage(message)" class="text-red-600 focus:bg-red-50 focus:text-red-700 dark:focus:bg-red-950/40" @select="emit('recallMessage', message.id)">
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
import { IconArrowBackUp, IconAt, IconBell, IconCheck, IconChecks, IconClock, IconExternalLink, IconHandClick, IconId, IconMessageReply, IconMoodSmile, IconPaperclip, IconTag, IconTrash, IconUserMinus, IconUserPlus, IconUsers } from '@tabler/icons-vue'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger } from './components/ui/context-menu'
import { getFriendMenuActions, type FriendMenuState } from './webqq/friend-menu'
import { getGroupAuthorityBadge, getGroupMemberDisplayName } from './webqq/group-display'
import { getGroupMemberMenuActions, type GroupMemberMenuAction } from './webqq/group-menu'
import GroupMemberMenu from './group-member-menu.vue'
import { getMessageClusterClass, isMergedMessage } from './webqq/message-cluster'
import { createMessageListFollowController } from './webqq/message-list-follow'
import {
  buildMessageListTail,
  scrollMessageListToBottom,
  shouldFollowMessageListTail,
} from './webqq/message-list-scroll'
import {
  buildMessageListScrollStateKey,
  calculateAnchoredMessageListScrollTop,
  readMessageListScrollState,
  writeMessageListScrollState,
  type MessageListScrollState,
} from './webqq/message-list-scroll-state'
import { highlightMessageElement } from './webqq/message-reveal'
import { formatMentionContent } from './webqq/mention'
import WebqqAvatar from './webqq-avatar.vue'
import WebqqMessageReactions from './webqq-message-reactions.vue'
import WebqqMenuExtensionMark from './webqq-menu-extension-mark.vue'
import { vWebqqScrollbar } from './webqq-scrollbar'
import {
  formatRecalledMessageEventText,
  isRecalledMessage,
  type SandboxChatLunaState,
  type SandboxConversation,
  type SandboxForwardPreview,
  type SandboxGroup,
  type SandboxMedia,
  type SandboxMessage,
  type SandboxMessageModelRequestReference,
} from '../src/types'

interface MessageParticipant {
  name: string
  avatar?: string
  isBot: boolean
}

export interface WebqqMessageListModel {
  messages: SandboxMessage[]
  chatLunaStates: SandboxChatLunaState[]
  replyMessages: Record<string, SandboxMessage>
  // 外层合并转发卡片的轻量投影：标题、总数、最多 4 行。
  forwardPreviews: Record<string, SandboxForwardPreview>
  participants: Record<string, MessageParticipant>
  friendMenuStates: Record<string, FriendMenuState>
  currentConversation?: SandboxConversation
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
let restoreFrame = 0
let restoreSettleFrame = 0
let restoringScrollState: MessageListScrollState | undefined
let contentResizeObserver: ResizeObserver | undefined
const follow = createMessageListFollowController({
  getBox: () => messagesElement.value,
  nextTick,
  requestAnimationFrame: (callback) => requestAnimationFrame(callback),
  cancelAnimationFrame: (id) => cancelAnimationFrame(id),
})
const participantNames = computed(() => Object.fromEntries(
  Object.entries(props.model.participants).map(([id, participant]) => [id, participant.name]),
))
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

function getMessageListScrollAnchor(element: HTMLElement) {
  const containerTop = element.getBoundingClientRect().top
  const rows = element.querySelectorAll<HTMLElement>('[data-message-id]')
  for (const row of rows) {
    const rect = row.getBoundingClientRect()
    if (rect.bottom <= containerTop) continue
    return {
      messageId: row.dataset.messageId!,
      offsetTop: rect.top - containerTop,
    }
  }
}

function applyMessageListScrollState(state: MessageListScrollState) {
  const element = messagesElement.value
  if (!element) return
  if (state.stickingToBottom) {
    scrollMessageListToBottom(element)
    return
  }
  const anchor = state.anchor
  const anchorElement = anchor
    ? [...element.querySelectorAll<HTMLElement>('[data-message-id]')]
        .find((row) => row.dataset.messageId === anchor.messageId)
    : undefined
  if (!anchor || !anchorElement) {
    element.scrollTop = state.scrollTop
    return
  }
  element.scrollTop = calculateAnchoredMessageListScrollTop({
    currentScrollTop: element.scrollTop,
    currentAnchorTop: anchorElement.getBoundingClientRect().top,
    containerTop: element.getBoundingClientRect().top,
    savedAnchorOffsetTop: anchor.offsetTop,
  })
}

function saveMessageListScrollState(key = activeScrollStateKey) {
  if (preview.value) return
  if (restoringScrollState) {
    writeMessageListScrollState(key, restoringScrollState)
    return
  }
  const element = messagesElement.value
  if (!element) return
  writeMessageListScrollState(key, {
    scrollTop: element.scrollTop,
    stickingToBottom: follow.stickingToBottom,
    anchor: follow.stickingToBottom ? undefined : getMessageListScrollAnchor(element),
  })
}

function scheduleMessageListScrollRestore(key: string | undefined) {
  if (!restoringScrollState) return
  if (restoreFrame) cancelAnimationFrame(restoreFrame)
  if (restoreSettleFrame) cancelAnimationFrame(restoreSettleFrame)
  restoreFrame = requestAnimationFrame(() => {
    restoreFrame = 0
    if (!restoringScrollState || activeScrollStateKey !== key) return
    applyMessageListScrollState(restoringScrollState)
    restoreSettleFrame = requestAnimationFrame(() => {
      restoreSettleFrame = 0
      if (!restoringScrollState || activeScrollStateKey !== key) return
      applyMessageListScrollState(restoringScrollState)
    })
  })
}

function finishMessageListScrollRestore() {
  restoringScrollState = undefined
  if (restoreFrame) cancelAnimationFrame(restoreFrame)
  if (restoreSettleFrame) cancelAnimationFrame(restoreSettleFrame)
  restoreFrame = 0
  restoreSettleFrame = 0
}

function restoreMessageListScrollState(key: string | undefined) {
  const state = readMessageListScrollState(key)
  if (!state) return false
  follow.cancel()
  restoringScrollState = state
  follow.setStickingToBottom(state.stickingToBottom)
  void nextTick(() => scheduleMessageListScrollRestore(key))
  return true
}

function handleMessagesScroll() {
  if (!messagesElement.value || restoringScrollState) return
  follow.handleScroll()
}

function handleMessageListUserScroll() {
  finishMessageListScrollRestore()
  follow.handleUserScrollIntent()
}

watch(scrollStateKey, (nextKey, previousKey) => {
  if (preview.value) return
  if (previousKey) saveMessageListScrollState(previousKey)
  finishMessageListScrollRestore()
  follow.cancel()
  activeScrollStateKey = nextKey
  previousMessageListTail = messageListTail.value
  if (restoreMessageListScrollState(nextKey)) return
  if (!nextKey) return
  follow.setStickingToBottom(true)
  void follow.scheduleBottom(true)
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

watch([messagesElement, messagesContentElement], ([element, content]) => {
  contentResizeObserver?.disconnect()
  if (preview.value) return
  contentResizeObserver = undefined
  if (!element || typeof ResizeObserver === 'undefined') return
  // 新消息中的媒体与 thinking 内容可能在 Vue 更新后继续增高；仅在 sticky 状态下补齐末尾位置。
  contentResizeObserver = new ResizeObserver(() => {
    if (restoringScrollState) scheduleMessageListScrollRestore(activeScrollStateKey)
    else if (follow.stickingToBottom) void follow.scheduleBottom()
  })
  contentResizeObserver.observe(element)
  if (content) contentResizeObserver.observe(content)
}, { flush: 'post' })

// 思考与用量归档在消息上，因此多轮对话后每条机器人消息都保留自己的指标。
function getMessageThinking(message: SandboxMessage) {
  return message.chatLuna?.thought ? message.chatLuna : undefined
}

// 没有思考内容但拿到了 Token 用量时单独常显指标，与 onebot-webqq 的 is-usage-only 行为一致。
function getMessageUsage(message: SandboxMessage) {
  const chatLuna = message.chatLuna
  return chatLuna && !chatLuna.thought && chatLuna.usage ? chatLuna : undefined
}

function isThinkingExpanded(message: SandboxMessage) {
  return !!expandedThinking.value[message.id]
}

function toggleThinking(message: SandboxMessage) {
  const next = { ...expandedThinking.value }
  if (next[message.id]) delete next[message.id]
  else next[message.id] = true
  expandedThinking.value = next
}

function formatThinkingDuration(durationMs?: number) {
  if (durationMs === undefined) return '思考过程'
  return `已思考 ${Math.max(0, Math.round(durationMs / 1000))}s`
}

// Vue 离场节点默认会继续占住文档流，导致后续消息只能等思考面板淡出结束后才上移；
// 这里把离场面板冻结在原视觉位置，让消息位移和面板离场同步开始。
function prepareThinkingPanelLeave(element: Element) {
  if (!(element instanceof HTMLElement) || !element.parentElement) return
  const row = element.parentElement
  const parentRect = row.getBoundingClientRect()
  const panelRect = element.getBoundingClientRect()
  element.style.position = 'absolute'
  element.style.top = `${panelRect.top - parentRect.top}px`
  // 面板脱流后思考行宽度立刻收缩成指标行宽度，水平锚点必须选收缩后位置不变的一侧
  // （入向行左缘固定、出向行右缘固定），否则面板会在离场瞬间水平跳位。
  if (row.classList.contains('is-incoming')) {
    element.style.left = `${panelRect.left - parentRect.left}px`
  } else {
    element.style.right = `${parentRect.right - panelRect.right}px`
  }
  element.style.width = `${panelRect.width}px`
  // max-width 里的 100% 同样按收缩后的行宽重算，会把冻结宽度压小、迫使单行思考内容先换行再淡出。
  element.style.maxWidth = 'none'
  element.style.marginTop = '0'
}

function getParticipantName(id: string) {
  return props.model.participants[id]?.name ?? id
}

function getParticipantAvatar(id: string) {
  return props.model.participants[id]?.avatar
}

function isBotParticipant(id: string) {
  return props.model.participants[id]?.isBot ?? false
}

function getCurrentGroupMember(participantId: string) {
  return props.model.currentGroup?.members.find((member) => member.participantId === participantId)
}

function getMessageGroupMemberActions(participantId: string) {
  const target = getCurrentGroupMember(participantId)
  if (!target) return []
  return getGroupMemberMenuActions(getCurrentGroupMember(props.model.currentOperatorId ?? ''), target)
}

const messageGroupManagementActions: GroupMemberMenuAction[] = [
  'set-card',
  'set-title',
  'set-admin',
  'unset-admin',
  'transfer-owner',
  'kick',
]

function hasMessageGroupMemberManagementActions(participantId: string) {
  return getMessageGroupMemberActions(participantId).some((action) => messageGroupManagementActions.includes(action))
}

function getMessageAuthorName(participantId: string) {
  return getGroupMemberDisplayName(getCurrentGroupMember(participantId), getParticipantName(participantId))
}

function getMessageRoleBadge(participantId: string) {
  return getGroupAuthorityBadge(getCurrentGroupMember(participantId))
}

function formatMessageTime(createdAt: string) {
  return new Date(createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getFriendMenuState(targetId: string): FriendMenuState {
  return props.model.friendMenuStates[targetId]
    ?? { isFriend: false, pendingOutgoing: false, pendingIncoming: false }
}

function getChatFriendActions(targetId: string) {
  return getFriendMenuActions(getFriendMenuState(targetId), true)
}

function getReplyMessage(message: SandboxMessage) {
  return message.replyToMessageId ? props.model.replyMessages[message.replyToMessageId] : undefined
}

function getForwardPreview(message: SandboxMessage) {
  return message.forwardId ? props.model.forwardPreviews[message.id] : undefined
}

function openForwardMessage(message: SandboxMessage) {
  if (!message.forwardId || !getForwardPreview(message)) return
  emit('openForward', { messageId: message.id, forwardId: message.forwardId })
}

// 戳一戳始终是事件；撤回在关闭 mark 时也呈现为结构化事件，开启时仍渲染原气泡。
function shouldRenderAsEvent(message: SandboxMessage) {
  return !!message.event || (isRecalledMessage(message) && !props.model.markRecalledMessages)
}

// 与服务端 sendForwardMessage 约束一致：事件与撤回消息不可进入合并转发。
function isMessageSelectable(message: SandboxMessage) {
  return !message.event && !isRecalledMessage(message)
}

function isMessageSelected(messageId: string) {
  return !!props.model.selectedMessageIds?.includes(messageId)
}

function handleMessageAvatarClick(message: SandboxMessage, event: MouseEvent) {
  // 多选时头像仍属于整条消息的可选区域；不能阻断冒泡，否则点击头像无法切换勾选。
  if (props.model.selectionMode) return
  event.preventDefault()
  event.stopPropagation()
  emit('openProfile', message.authorId)
}

function handleMessageBubbleClick(message: SandboxMessage, event: MouseEvent) {
  if (!props.model.selectionMode || !isMessageSelectable(message)) return
  // 捕获阶段先于卡片、媒体和回应控件执行；多选时整颗气泡只负责切换勾选，不能误打开详情或文件。
  event.preventDefault()
  event.stopPropagation()
  emit('toggleSelection', message.id)
}

function handleMessageClick(message: SandboxMessage, event: MouseEvent) {
  if (!props.model.selectionMode || !isMessageSelectable(message)) return
  // 气泡由捕获处理器统一接管；这里只覆盖头像、发送者信息和行内空白区域。
  if ((event.target as HTMLElement | null)?.closest('.chatluna-sandbox-message-bubble')) return
  emit('toggleSelection', message.id)
}

function getEventMessageText(message: SandboxMessage) {
  if (isRecalledMessage(message)) {
    const operatorId = message.lifecycle?.operatorId ?? message.authorId
    return formatRecalledMessageEventText(message, getMessageAuthorName(operatorId))
  }
  return message.content
}

function shouldShowThinking(message: SandboxMessage) {
  // 关闭 mark 时连同思考一起隐藏；开启时思考仍可读，仅随消息弱化。
  return !!getMessageThinking(message) && !(isRecalledMessage(message) && !props.model.markRecalledMessages)
}

function shouldShowUsage(message: SandboxMessage) {
  return !!getMessageUsage(message) && !(isRecalledMessage(message) && !props.model.markRecalledMessages)
}

// 与服务端撤回权限一致：自己的消息随时可撤；群内群主/管理员可撤成员消息，但不能动群主或同级管理员。
function canRecallMessage(message: SandboxMessage) {
  const operatorId = props.model.currentOperatorId
  if (!operatorId || message.event || isRecalledMessage(message)) return false
  if (message.authorId === operatorId) return true
  if (!props.model.currentGroup) return false
  const actor = getCurrentGroupMember(operatorId)
  const target = getCurrentGroupMember(message.authorId)
  if (!actor || !target || actor.role === 'member') return false
  return target.role !== 'owner' && !(actor.role === 'admin' && target.role === 'admin')
}

// 私聊与群聊共用回应入口；事件消息不可回应，撤回消息只读展示已有回应。
function canReactToMessage(message: SandboxMessage) {
  return !message.event
    && !isRecalledMessage(message)
    && !!props.model.currentOperatorId
}

function isReactionReadonly(message: SandboxMessage) {
  return !!message.event
    || isRecalledMessage(message)
    || !props.model.currentOperatorId
}

function toggleReaction(message: SandboxMessage, emojiId: string) {
  if (isReactionReadonly(message) || !props.model.currentOperatorId) return
  const reaction = message.reactions?.find((item) => item.emojiId === emojiId)
  const enabled = !reaction?.participantIds.includes(props.model.currentOperatorId)
  emit('setMessageReaction', message.id, emojiId, enabled)
}

function getMediaLabel(media: SandboxMedia) {
  return media.type === 'image' ? '图片' : media.type === 'audio' ? '语音' : media.type === 'video' ? '视频' : '文件'
}

function getMessageText(message: SandboxMessage) {
  // 外层合并转发卡片自己渲染预览行，避免与 content 摘要重复。
  if (message.forwardId) return ''
  if (message.media?.length === 1 && message.content === `[${getMediaLabel(message.media[0])}] ${message.media[0].name}`) return ''
  return formatMentionContent(message.content, participantNames.value)
}

function getMediaSource(mediaId: string) {
  return props.model.mediaSources[mediaId] ?? ''
}

function formatMediaSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function revealMessage(messageId: string) {
  follow.setStickingToBottom(false)
  follow.cancel()
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
}

function scrollToQuotedMessage(messageId: string) {
  revealMessage(messageId)
}

defineExpose({
  revealMessage,
})

async function loadEarlierMessages() {
  if (historyLoading.value) return
  historyLoading.value = true
  try {
    await new Promise<void>((resolve, reject) => emit('loadHistory', resolve, reject))
  } catch {
    // 页面控制层负责展示具体错误；列表只需要结束 loading，避免事件 Promise 泄漏为未处理拒绝。
  } finally {
    historyLoading.value = false
  }
}

onBeforeUnmount(() => {
  saveMessageListScrollState()
  if (quoteHighlightTimer) clearTimeout(quoteHighlightTimer)
  follow.cancel()
  finishMessageListScrollRestore()
  contentResizeObserver?.disconnect()
})
</script>
