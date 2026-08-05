<template>
  <section
    ref="messagesElement"
    v-webqq-scrollbar="{ tone: 'accent' }"
    class="webqq-messages"
    :class="{ 'is-selecting': model.selectionMode }"
    aria-label="消息记录"
    @scroll="handleMessagesScroll"
  >
    <div v-if="!model.messages.length && !model.chatLunaStates.some((state) => state.thinking)" class="webqq-welcome">
      <WebqqAvatar class="webqq-avatar webqq-avatar-large" :kind="model.avatarKind" :name="model.title" :avatar="model.avatar" />
      <strong>{{ model.title }}</strong>
      <p>发送消息，验证插件在模拟 QQ 环境中的响应</p>
    </div>
    <ol v-else ref="messagesContentElement">
      <li v-if="model.hasMoreMessages" class="webqq-history-more-row">
        <button type="button" class="webqq-history-more" :disabled="historyLoading" @click="loadEarlierMessages">
          {{ historyLoading ? '加载中...' : '查看更早消息' }}
        </button>
      </li>
      <template v-for="(message, messageIndex) in model.messages" :key="message.id">
        <li v-if="shouldRenderAsEvent(message)" class="webqq-message-event">{{ getEventMessageText(message) }}</li>
        <ContextMenu v-else>
          <ContextMenuTrigger as-child :disabled="isRecalledMessage(message) || model.selectionMode">
            <li
              class="webqq-message-row"
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
                v-if="model.selectionMode"
                class="webqq-message-select-marker"
                :class="{ 'is-checked': isMessageSelected(message.id) }"
                aria-hidden="true"
              >
                <IconCheck :size="12" stroke-width="3" />
              </span>
              <div class="webqq-message-select-body">
              <ContextMenu v-if="message.authorId !== model.currentOperatorId">
                <ContextMenuTrigger as-child :disabled="model.selectionMode">
                  <button type="button" class="webqq-message-avatar-wrap webqq-message-avatar-trigger" :aria-label="`查看 ${getMessageAuthorName(message.authorId)} 的资料`" @click="handleMessageAvatarClick(message, $event)" @contextmenu.stop>
                    <WebqqAvatar class="webqq-message-avatar" :kind="isBotParticipant(message.authorId) ? 'bot' : 'user'" :name="getMessageAuthorName(message.authorId)" :avatar="getParticipantAvatar(message.authorId)" />
                  </button>
                </ContextMenuTrigger>
                <ContextMenuContent style="z-index: 140">
                  <ContextMenuItem @select="emit('openProfile', message.authorId)">
                    <IconId :size="16" aria-hidden="true" /> 查看资料
                  </ContextMenuItem>
                  <ContextMenuSub v-if="model.currentGroup && getCurrentGroupMember(message.authorId)">
                    <ContextMenuSubTrigger><IconUsers :size="16" aria-hidden="true" /> 群成员操作</ContextMenuSubTrigger>
                    <GroupMemberMenu
                      sub
                      :actor="getCurrentGroupMember(model.currentOperatorId ?? '')"
                      :target="getCurrentGroupMember(message.authorId)!"
                      @open-profile="emit('openProfile', message.authorId)"
                      @mention="emit('mentionGroupMember', message.authorId)"
                      @poke="emit('pokeGroupMember', message.authorId)"
                      @set-card="emit('setGroupCard', message.authorId)"
                      @set-title="emit('setGroupTitle', message.authorId)"
                      @set-admin="emit('setGroupAdmin', message.authorId, $event)"
                      @transfer-owner="emit('transferGroupOwner', message.authorId)"
                      @kick="emit('kickGroupMember', message.authorId)"
                    />
                  </ContextMenuSub>
                  <ContextMenuItem v-if="getChatFriendActions(message.authorId).includes('request')" @select="emit('requestFriend', message.authorId)">
                    <IconUserPlus :size="16" aria-hidden="true" /> 发送好友申请
                  </ContextMenuItem>
                  <ContextMenuItem v-else-if="getFriendMenuState(message.authorId).pendingOutgoing" disabled><IconClock :size="16" aria-hidden="true" /> 等待对方处理</ContextMenuItem>
                  <ContextMenuItem v-else-if="getFriendMenuState(message.authorId).pendingIncoming" disabled><IconBell :size="16" aria-hidden="true" /> 请在通知中处理申请</ContextMenuItem>
                  <ContextMenuSub v-if="!model.currentGroup && getChatFriendActions(message.authorId).includes('poke')">
                    <ContextMenuSubTrigger><IconHandClick :size="16" aria-hidden="true" /> 好友互动</ContextMenuSubTrigger>
                    <ContextMenuSubContent>
                      <ContextMenuItem @select="emit('pokeFriend', message.authorId)"><IconHandClick :size="16" aria-hidden="true" /> 戳一戳</ContextMenuItem>
                    </ContextMenuSubContent>
                  </ContextMenuSub>
                  <ContextMenuItem v-if="getChatFriendActions(message.authorId).includes('remark')" @select="emit('setRemark', message.authorId)"><IconTag :size="16" aria-hidden="true" /> 设置好友备注</ContextMenuItem>
                  <ContextMenuItem v-if="getChatFriendActions(message.authorId).includes('delete')" class="text-red-600 focus:bg-red-50 focus:text-red-700 dark:focus:bg-red-950/40" @select="emit('deleteFriend', message.authorId)"><IconUserMinus :size="16" aria-hidden="true" /> 删除好友</ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
              <ContextMenu v-else>
                <ContextMenuTrigger as-child :disabled="model.selectionMode">
                  <button type="button" class="webqq-message-avatar-wrap webqq-message-avatar-trigger" :aria-label="`查看 ${getMessageAuthorName(message.authorId)} 的资料`" @click="handleMessageAvatarClick(message, $event)" @contextmenu.stop>
                    <WebqqAvatar class="webqq-message-avatar" :kind="isBotParticipant(message.authorId) ? 'bot' : 'user'" :name="getMessageAuthorName(message.authorId)" :avatar="getParticipantAvatar(message.authorId)" />
                  </button>
                </ContextMenuTrigger>
                <ContextMenuContent style="z-index: 140">
                  <ContextMenuItem @select="emit('openProfile', message.authorId)">
                    <IconId :size="16" aria-hidden="true" /> 查看资料
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
              <div class="webqq-message-content">
                <div v-if="!isMergedMessage(model.messages, messageIndex, model.currentOperatorId)" class="webqq-sender-line">
                  <span class="webqq-message-author">{{ getMessageAuthorName(message.authorId) }}</span>
                  <span
                    v-if="getMessageRoleBadge(message.authorId)"
                    class="webqq-role-badge"
                    :class="`is-${getMessageRoleBadge(message.authorId)!.kind}`"
                  >{{ getMessageRoleBadge(message.authorId)!.text }}</span>
                </div>
                <div class="webqq-message-body">
                  <div class="webqq-message-stack">
                    <div class="webqq-message-bubble" @click.capture="handleMessageBubbleClick(message, $event)">
                      <button v-if="getReplyMessage(message)" class="webqq-message-quote is-clickable" type="button" aria-label="跳转到引用消息" @click.stop="scrollToQuotedMessage(getReplyMessage(message)!.id)">
                        <strong class="webqq-message-quote-title">{{ getMessageAuthorName(getReplyMessage(message)!.authorId) }}</strong>
                        <span>{{ getMessageText(getReplyMessage(message)!) }}</span>
                      </button>
                      <button
                        v-if="message.forwardId"
                        class="webqq-message-quote webqq-message-forward"
                        type="button"
                        :disabled="!getForwardPreview(message)"
                        aria-label="查看合并转发消息"
                        @click.stop="openForwardMessage(message)"
                      >
                        <strong class="webqq-message-quote-title">{{ getForwardPreview(message)?.title || '合并转发' }}</strong>
                        <template v-if="getForwardPreview(message)">
                          <span
                            v-for="(line, lineIndex) in getForwardPreview(message)!.lines"
                            :key="`${message.id}:forward:${lineIndex}`"
                          >{{ line }}</span>
                          <span class="webqq-message-forward-entry">查看{{ getForwardPreview(message)!.total }}条转发消息</span>
                        </template>
                        <span v-else>{{ getMessageText(message) || '[合并转发]' }}</span>
                      </button>
                      <template v-else>
                        <div v-for="media in message.media" :key="media.id" class="webqq-message-media">
                          <img v-if="media.type === 'image' && getMediaSource(media.id)" :src="getMediaSource(media.id)" :alt="media.name">
                          <audio v-else-if="media.type === 'audio' && getMediaSource(media.id)" :src="getMediaSource(media.id)" controls preload="metadata" />
                          <video v-else-if="media.type === 'video' && getMediaSource(media.id)" :src="getMediaSource(media.id)" controls preload="metadata" />
                          <a v-else-if="media.type === 'file' && getMediaSource(media.id)" :href="getMediaSource(media.id)" :download="media.name" class="webqq-message-file">
                            <IconPaperclip :size="18" aria-hidden="true" />
                            <span><strong>{{ media.name }}</strong><small>{{ formatMediaSize(media.size) }}</small></span>
                          </a>
                          <span v-else class="webqq-message-media-loading">{{ model.mediaLoadFailures[media.id] ? '媒体不可用' : '媒体加载中...' }}</span>
                        </div>
                        <span v-if="getMessageText(message)" class="webqq-message-text">{{ getMessageText(message) }}</span>
                      </template>
                      <span v-if="isRecalledMessage(message)" class="webqq-message-recalled-label">已撤回</span>
                      <WebqqMessageReactions
                        v-if="message.reactions?.length"
                        :reactions="message.reactions"
                        :current-operator-id="model.currentOperatorId"
                        :participants="model.participants"
                        :readonly="isReactionReadonly(message)"
                        @toggle="toggleReaction(message, $event)"
                      />
                    </div>
                  </div>
                  <time class="webqq-message-time">{{ formatMessageTime(message.createdAt) }}</time>
                </div>
              </div>
              </div>
            </li>
          </ContextMenuTrigger>
          <ContextMenuContent style="z-index: 140">
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
          class="webqq-thinking-row"
          :class="[
            message.authorId === model.currentOperatorId ? 'is-outgoing' : 'is-incoming',
            { 'is-recalled': isRecalledMessage(message) },
          ]"
        >
          <button
            type="button"
            class="webqq-thinking-toggle"
            :aria-expanded="isThinkingExpanded(message)"
            @click="toggleThinking(message)"
          >
            <span
              v-if="getMessageThinking(message)!.usage"
              class="webqq-thinking-usage"
              aria-label="本次 ChatLuna 调用指标"
            >
              <span class="webqq-thinking-usage-group">
                <svg class="webqq-thinking-usage-icon is-input" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 20V8" />
                  <path d="m7 13 5-5 5 5" />
                  <path d="M5 4h14" />
                </svg>
                <span>{{ getMessageThinking(message)!.usage!.inputTokens }}</span>
                <svg class="webqq-thinking-usage-icon is-output" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 4v12" />
                  <path d="m7 11 5 5 5-5" />
                  <path d="M5 20h14" />
                </svg>
                <span>{{ getMessageThinking(message)!.usage!.outputTokens }}</span>
              </span>
            </span>
            <span class="webqq-thinking-duration">{{ formatThinkingDuration(getMessageThinking(message)!.thoughtDurationMs) }}</span>
            <svg
              class="webqq-thinking-chevron"
              :class="{ 'is-expanded': isThinkingExpanded(message) }"
              viewBox="0 0 16 16"
              aria-hidden="true"
            >
              <path d="M6 3.5 10.5 8 6 12.5" />
            </svg>
          </button>
          <Transition name="webqq-thinking" @before-leave="prepareThinkingPanelLeave">
            <div v-if="isThinkingExpanded(message)" class="webqq-thinking-panel">
              <div class="webqq-thinking-content">{{ getMessageThinking(message)!.thought }}</div>
            </div>
          </Transition>
        </li>
        <li
          v-else-if="shouldShowUsage(message)"
          :key="`${message.id}:usage`"
          class="webqq-thinking-row is-usage-only"
          :class="[
            message.authorId === model.currentOperatorId ? 'is-outgoing' : 'is-incoming',
            { 'is-recalled': isRecalledMessage(message) },
          ]"
        >
          <div class="webqq-thinking-usage" aria-label="本次 ChatLuna 调用指标">
            <span class="webqq-thinking-usage-group">
              <svg class="webqq-thinking-usage-icon is-input" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 20V8" />
                <path d="m7 13 5-5 5 5" />
                <path d="M5 4h14" />
              </svg>
              <span>{{ getMessageUsage(message)!.usage!.inputTokens }}</span>
              <svg class="webqq-thinking-usage-icon is-output" viewBox="0 0 24 24" aria-hidden="true">
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
        class="webqq-message-row webqq-chatluna-state"
        :class="state.botParticipantId === model.currentOperatorId ? 'is-outgoing' : 'is-incoming'"
      >
        <span class="webqq-message-avatar-wrap">
          <WebqqAvatar
            class="webqq-message-avatar"
            kind="bot"
            :name="getParticipantName(state.botParticipantId)"
            :avatar="getParticipantAvatar(state.botParticipantId)"
          />
        </span>
        <div class="webqq-message-content">
          <!-- 等待气泡必须复用普通消息的 sender-line + message-body 结构：
               少了包裹层会丢掉 .webqq-sender-line + .webqq-message-body 的 6px 间距，
               等待气泡会比真实消息更贴近名字，被替换成真实消息时还会整体下跳。 -->
          <div class="webqq-sender-line">
            <span class="webqq-message-author">{{ getParticipantName(state.botParticipantId) }}</span>
          </div>
          <div class="webqq-message-body">
            <div class="webqq-message-bubble" aria-label="机器人正在思考">
              <span class="webqq-chatluna-thinking-dots">
                <span v-for="dot in 3" :key="dot" class="webqq-chatluna-thinking-dot" />
              </span>
            </div>
          </div>
        </div>
      </li>
    </ol>
  </section>
</template>

<script setup lang="ts">
import { IconArrowBackUp, IconBell, IconCheck, IconChecks, IconClock, IconHandClick, IconId, IconMessageReply, IconMoodSmile, IconPaperclip, IconTag, IconUserMinus, IconUserPlus, IconUsers } from '@tabler/icons-vue'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger } from './components/ui/context-menu'
import { getFriendMenuActions, type FriendMenuState } from './webqq/friend-menu'
import { getGroupAuthorityBadge, getGroupMemberDisplayName } from './webqq/group-display'
import GroupMemberMenu from './group-member-menu.vue'
import { getMessageClusterClass, isMergedMessage } from './webqq/message-cluster'
import {
  buildMessageListTail,
  isMessageListNearBottom,
  scrollMessageListToBottom,
  shouldFollowMessageListTail,
} from './webqq/message-list-scroll'
import { formatMentionContent } from './webqq/mention'
import WebqqAvatar from './webqq-avatar.vue'
import WebqqMessageReactions from './webqq-message-reactions.vue'
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

const props = defineProps<{ model: WebqqMessageListModel }>()
const emit = defineEmits<{
  reply: [messageId: string]
  recallMessage: [messageId: string]
  enterSelection: [messageId: string]
  toggleSelection: [messageId: string]
  openForward: [input: { messageId: string; forwardId: string }]
  setMessageReaction: [messageId: string, emojiId: string, enabled: boolean]
  openReactionPicker: [messageId: string]
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
let stickingToBottom = true
let previousMessageListTail: ReturnType<typeof buildMessageListTail> | undefined
let scrollFrame = 0
let scrollSettleFrame = 0
let followingMessageListTail = false
let forcingMessageListBottom = false
let contentResizeObserver: ResizeObserver | undefined
const participantNames = computed(() => Object.fromEntries(
  Object.entries(props.model.participants).map(([id, participant]) => [id, participant.name]),
))
let quoteHighlightTimer: ReturnType<typeof setTimeout> | undefined

const messageListTail = computed(() => buildMessageListTail({
  conversationId: props.model.currentConversation?.id ?? props.model.messages.at(-1)?.conversationId,
  messages: props.model.messages,
  chatLunaStates: props.model.chatLunaStates,
}))

function handleMessagesScroll() {
  const element = messagesElement.value
  if (!element) return
  const nearBottom = isMessageListNearBottom(element)
  if (followingMessageListTail && nearBottom) return
  // 追踪窗口内仍可能发生真实上滑；只有程序性滚动产生的置底事件可以忽略，否则会吞掉用户的脱离操作。
  stickingToBottom = nearBottom
  if (!nearBottom && followingMessageListTail) {
    followingMessageListTail = false
    if (scrollFrame) cancelAnimationFrame(scrollFrame)
    if (scrollSettleFrame) cancelAnimationFrame(scrollSettleFrame)
    scrollFrame = 0
    scrollSettleFrame = 0
    forcingMessageListBottom = false
  }
}

async function scheduleMessageListBottom(force = false) {
  followingMessageListTail = true
  forcingMessageListBottom ||= force
  await nextTick()
  if (scrollFrame) cancelAnimationFrame(scrollFrame)
  if (scrollSettleFrame) cancelAnimationFrame(scrollSettleFrame)
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0
    const element = messagesElement.value
    if (!element || (!stickingToBottom && !forcingMessageListBottom)) {
      followingMessageListTail = false
      forcingMessageListBottom = false
      return
    }
    scrollMessageListToBottom(element)
    // ResizeObserver 和浏览器滚动事件可能落在同一帧；再等一帧确认最终高度后才交还用户滚动判定。
    scrollSettleFrame = requestAnimationFrame(() => {
      scrollSettleFrame = 0
      const settledElement = messagesElement.value
      if (settledElement && (stickingToBottom || forcingMessageListBottom)) {
        scrollMessageListToBottom(settledElement)
      }
      followingMessageListTail = false
      forcingMessageListBottom = false
    })
  })
}

watch(messageListTail, (nextTail) => {
  const previousTail = previousMessageListTail
  const shouldFollow = shouldFollowMessageListTail(
    previousTail,
    nextTail,
    stickingToBottom,
  )
  previousMessageListTail = nextTail
  if (!shouldFollow) return
  stickingToBottom = true
  // 首次进入与切换会话必须覆盖上一会话的上滑状态；同会话尾部更新仍只在 sticky 状态下调用。
  void scheduleMessageListBottom(!previousTail || previousTail.conversationId !== nextTail.conversationId)
}, { immediate: true, flush: 'post' })

watch([messagesElement, messagesContentElement], ([element, content]) => {
  contentResizeObserver?.disconnect()
  contentResizeObserver = undefined
  if (!element || typeof ResizeObserver === 'undefined') return
  // 新消息中的媒体与 thinking 内容可能在 Vue 更新后继续增高；仅在 sticky 状态下补齐末尾位置。
  contentResizeObserver = new ResizeObserver(() => {
    if (stickingToBottom) void scheduleMessageListBottom()
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
  if ((event.target as HTMLElement | null)?.closest('.webqq-message-bubble')) return
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

// 主动贴表情仅限群消息；私聊不展示入口。撤回消息只读展示已有回应。
function canReactToMessage(message: SandboxMessage) {
  return !!props.model.currentGroup
    && !message.event
    && !isRecalledMessage(message)
    && !!props.model.currentOperatorId
}

function isReactionReadonly(message: SandboxMessage) {
  return !props.model.currentGroup
    || !!message.event
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
  if (quoteHighlightTimer) clearTimeout(quoteHighlightTimer)
  if (scrollFrame) cancelAnimationFrame(scrollFrame)
  if (scrollSettleFrame) cancelAnimationFrame(scrollSettleFrame)
  contentResizeObserver?.disconnect()
})
</script>
