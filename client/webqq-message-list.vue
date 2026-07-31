<template>
  <section v-webqq-scrollbar="{ tone: 'accent' }" class="webqq-messages" aria-label="消息记录">
    <div v-if="!model.messages.length && !model.chatLunaStates.some((state) => state.thinking)" class="webqq-welcome">
      <WebqqAvatar class="webqq-avatar webqq-avatar-large" :kind="model.avatarKind" :name="model.title" :avatar="model.avatar" />
      <strong>{{ model.title }}</strong>
      <p>发送消息，验证插件在模拟 QQ 环境中的响应</p>
    </div>
    <ol v-else>
      <li v-if="model.hasMoreMessages" class="webqq-history-more-row">
        <button type="button" class="webqq-history-more" :disabled="historyLoading" @click="loadEarlierMessages">
          {{ historyLoading ? '加载中...' : '查看更早消息' }}
        </button>
      </li>
      <template v-for="(message, messageIndex) in model.messages" :key="message.id">
        <li v-if="message.event" class="webqq-message-event">{{ message.content }}</li>
        <ContextMenu v-else>
          <ContextMenuTrigger as-child>
            <li
              class="webqq-message-row"
              :class="[
                message.authorId === model.currentOperatorId ? 'is-outgoing' : 'is-incoming',
                getMessageClusterClass(model.messages, messageIndex, model.chatStyle, model.currentOperatorId),
                { 'is-merged': isMergedMessage(model.messages, messageIndex, model.chatStyle, model.currentOperatorId) },
                { 'is-quote-target': highlightedMessageId === message.id },
              ]"
              :data-message-id="message.id"
            >
              <ContextMenu v-if="message.authorId !== model.currentOperatorId">
                <ContextMenuTrigger as-child>
                  <button type="button" class="webqq-message-avatar-wrap webqq-message-avatar-trigger" :aria-label="`打开 ${getParticipantName(message.authorId)} 的操作菜单`" @contextmenu.stop>
                    <WebqqAvatar class="webqq-message-avatar" :kind="isBotParticipant(message.authorId) ? 'bot' : 'user'" :name="getParticipantName(message.authorId)" :avatar="getParticipantAvatar(message.authorId)" />
                  </button>
                </ContextMenuTrigger>
                <ContextMenuContent style="z-index: 140">
                  <ContextMenuSub v-if="model.currentGroup && getCurrentGroupMember(message.authorId)">
                    <ContextMenuSubTrigger><IconUsers :size="16" aria-hidden="true" /> 群成员操作</ContextMenuSubTrigger>
                    <GroupMemberMenu
                      sub
                      :actor="getCurrentGroupMember(model.currentOperatorId ?? '')"
                      :target="getCurrentGroupMember(message.authorId)!"
                      @mention="emit('mentionGroupMember', message.authorId)"
                      @poke="emit('pokeGroupMember', message.authorId)"
                      @set-card="emit('setGroupCard', message.authorId)"
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
              <span v-else class="webqq-message-avatar-wrap">
                <WebqqAvatar class="webqq-message-avatar" :kind="isBotParticipant(message.authorId) ? 'bot' : 'user'" :name="getParticipantName(message.authorId)" :avatar="getParticipantAvatar(message.authorId)" />
              </span>
              <div class="webqq-message-content">
                <div v-if="!isMergedMessage(model.messages, messageIndex, model.chatStyle, model.currentOperatorId)" class="webqq-sender-line">
                  <span class="webqq-message-author">{{ getParticipantName(message.authorId) }}</span>
                </div>
                <div class="webqq-message-body">
                  <div class="webqq-message-bubble">
                    <button v-if="getReplyMessage(message)" class="webqq-message-quote is-clickable" type="button" aria-label="跳转到引用消息" @click.stop="scrollToQuotedMessage(getReplyMessage(message)!.id)">
                      <strong class="webqq-message-quote-title">{{ getParticipantName(getReplyMessage(message)!.authorId) }}</strong>
                      <span>{{ getMessageText(getReplyMessage(message)!) }}</span>
                    </button>
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
                    <span v-if="getMessageText(message)">{{ getMessageText(message) }}</span>
                  </div>
                </div>
              </div>
            </li>
          </ContextMenuTrigger>
          <ContextMenuContent style="z-index: 140">
            <ContextMenuItem @select="emit('reply', message.id)"><IconMessageReply :size="16" aria-hidden="true" /> 回复</ContextMenuItem>
            <ContextMenuItem v-if="canRecallMessage(message)" class="text-red-600 focus:bg-red-50 focus:text-red-700 dark:focus:bg-red-950/40" @select="emit('recallMessage', message.id)">
              <IconArrowBackUp :size="16" aria-hidden="true" /> 撤回
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        <li
          v-if="getMessageThinking(message, messageIndex)"
          :key="`${message.id}:thinking`"
          class="webqq-thinking-row"
          :class="message.authorId === model.currentOperatorId ? 'is-outgoing' : 'is-incoming'"
        >
          <button
            type="button"
            class="webqq-thinking-toggle"
            :aria-expanded="isThinkingExpanded(getMessageThinking(message, messageIndex)!)"
            @click="toggleThinking(getMessageThinking(message, messageIndex)!)"
          >
            <span
              v-if="getMessageThinking(message, messageIndex)!.usage"
              class="webqq-thinking-usage"
              aria-label="本次 ChatLuna 调用指标"
            >
              <span class="webqq-thinking-usage-group">
                <svg class="webqq-thinking-usage-icon is-input" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 20V8" />
                  <path d="m7 13 5-5 5 5" />
                  <path d="M5 4h14" />
                </svg>
                <span>{{ getMessageThinking(message, messageIndex)!.usage!.inputTokens }}</span>
                <svg class="webqq-thinking-usage-icon is-output" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 4v12" />
                  <path d="m7 11 5 5 5-5" />
                  <path d="M5 20h14" />
                </svg>
                <span>{{ getMessageThinking(message, messageIndex)!.usage!.outputTokens }}</span>
              </span>
            </span>
            <span class="webqq-thinking-duration">{{ formatThinkingDuration(getMessageThinking(message, messageIndex)!.thoughtDurationMs) }}</span>
            <svg
              class="webqq-thinking-chevron"
              :class="{ 'is-expanded': isThinkingExpanded(getMessageThinking(message, messageIndex)!) }"
              viewBox="0 0 16 16"
              aria-hidden="true"
            >
              <path d="M6 3.5 10.5 8 6 12.5" />
            </svg>
          </button>
          <Transition name="webqq-thinking" @before-leave="prepareThinkingPanelLeave">
            <div v-if="isThinkingExpanded(getMessageThinking(message, messageIndex)!)" class="webqq-thinking-panel">
              <div class="webqq-thinking-content">{{ getMessageThinking(message, messageIndex)!.thought }}</div>
            </div>
          </Transition>
        </li>
        <li
          v-else-if="getMessageUsage(message, messageIndex)"
          :key="`${message.id}:usage`"
          class="webqq-thinking-row is-usage-only"
          :class="message.authorId === model.currentOperatorId ? 'is-outgoing' : 'is-incoming'"
        >
          <div class="webqq-thinking-usage" aria-label="本次 ChatLuna 调用指标">
            <span class="webqq-thinking-usage-group">
              <svg class="webqq-thinking-usage-icon is-input" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 20V8" />
                <path d="m7 13 5-5 5 5" />
                <path d="M5 4h14" />
              </svg>
              <span>{{ getMessageUsage(message, messageIndex)!.usage!.inputTokens }}</span>
              <svg class="webqq-thinking-usage-icon is-output" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 4v12" />
                <path d="m7 11 5 5 5-5" />
                <path d="M5 20h14" />
              </svg>
              <span>{{ getMessageUsage(message, messageIndex)!.usage!.outputTokens }}</span>
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
          <span class="webqq-message-author">{{ getParticipantName(state.botParticipantId) }}</span>
          <div class="webqq-message-bubble" aria-label="机器人正在思考">
            <span class="webqq-chatluna-thinking-dots">
              <span v-for="dot in 3" :key="dot" class="webqq-chatluna-thinking-dot" />
            </span>
          </div>
        </div>
      </li>
    </ol>
  </section>
</template>

<script setup lang="ts">
import { IconArrowBackUp, IconBell, IconClock, IconHandClick, IconMessageReply, IconPaperclip, IconTag, IconUserMinus, IconUserPlus, IconUsers } from '@tabler/icons-vue'
import { computed, onBeforeUnmount, ref } from 'vue'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger } from './components/ui/context-menu'
import { getFriendMenuActions, type FriendMenuState } from './webqq/friend-menu'
import GroupMemberMenu from './group-member-menu.vue'
import { getMessageClusterClass, isMergedMessage } from './webqq/message-cluster'
import { formatMentionContent } from './webqq/mention'
import WebqqAvatar from './webqq-avatar.vue'
import { vWebqqScrollbar } from './webqq-scrollbar'
import type { SandboxChatLunaState, SandboxConversation, SandboxGroup, SandboxMedia, SandboxMessage } from '../src/types'

interface MessageParticipant {
  name: string
  avatar?: string
  isBot: boolean
}

export interface WebqqMessageListModel {
  messages: SandboxMessage[]
  chatLunaStates: SandboxChatLunaState[]
  replyMessages: Record<string, SandboxMessage>
  participants: Record<string, MessageParticipant>
  friendMenuStates: Record<string, FriendMenuState>
  currentConversation?: SandboxConversation
  currentGroup?: SandboxGroup
  currentOperatorId?: string
  title: string
  avatar: string
  avatarKind: 'user' | 'bot' | 'group'
  chatStyle: 'tim' | 'qq'
  hasMoreMessages: boolean
  mediaSources: Record<string, string>
  mediaLoadFailures: Record<string, true>
}

const props = defineProps<{ model: WebqqMessageListModel }>()
const emit = defineEmits<{
  reply: [messageId: string]
  recallMessage: [messageId: string]
  loadHistory: [resolve: () => void, reject: (error: unknown) => void]
  requestFriend: [targetId: string]
  pokeFriend: [targetId: string]
  setRemark: [targetId: string]
  deleteFriend: [targetId: string]
  mentionGroupMember: [targetId: string]
  pokeGroupMember: [targetId: string]
  setGroupCard: [targetId: string]
  setGroupAdmin: [targetId: string, enabled: boolean]
  transferGroupOwner: [targetId: string]
  kickGroupMember: [targetId: string]
}>()

const historyLoading = ref(false)
const highlightedMessageId = ref('')
const expandedThinking = ref<Record<string, true>>({})
const participantNames = computed(() => Object.fromEntries(
  Object.entries(props.model.participants).map(([id, participant]) => [id, participant.name]),
))
let quoteHighlightTimer: ReturnType<typeof setTimeout> | undefined

function getThinkingKey(state: SandboxChatLunaState) {
  return `${state.botParticipantId}:${state.conversationId}:${state.updatedAt}`
}

// 本轮指标跟在该机器人最后一条消息下方；不新起头像行，避免看起来像一条独立消息。
function getMessageChatLunaState(message: SandboxMessage, index: number) {
  if (message.event) return
  const state = props.model.chatLunaStates.find(({ botParticipantId }) => botParticipantId === message.authorId)
  if (!state) return
  const messages = props.model.messages
  for (let cursor = messages.length - 1; cursor > index; cursor--) {
    if (!messages[cursor].event && messages[cursor].authorId === message.authorId) return
  }
  return state
}

function getMessageThinking(message: SandboxMessage, index: number) {
  const state = getMessageChatLunaState(message, index)
  return state?.thought ? state : undefined
}

// 没有思考内容但拿到了 Token 用量时单独常显指标，与 onebot-webqq 的 is-usage-only 行为一致。
function getMessageUsage(message: SandboxMessage, index: number) {
  const state = getMessageChatLunaState(message, index)
  return state && !state.thought && state.usage ? state : undefined
}

function isThinkingExpanded(state: SandboxChatLunaState) {
  return !!expandedThinking.value[getThinkingKey(state)]
}

function toggleThinking(state: SandboxChatLunaState) {
  const key = getThinkingKey(state)
  const next = { ...expandedThinking.value }
  if (next[key]) delete next[key]
  else next[key] = true
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
  const parentRect = element.parentElement.getBoundingClientRect()
  const panelRect = element.getBoundingClientRect()
  element.style.position = 'absolute'
  element.style.top = `${panelRect.top - parentRect.top}px`
  element.style.right = `${parentRect.right - panelRect.right}px`
  element.style.width = `${panelRect.width}px`
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

// 与服务端撤回权限一致：自己的消息随时可撤；群内群主/管理员可撤成员消息，但不能动群主或同级管理员。
function canRecallMessage(message: SandboxMessage) {
  const operatorId = props.model.currentOperatorId
  if (!operatorId || message.event) return false
  if (message.authorId === operatorId) return true
  if (!props.model.currentGroup) return false
  const actor = getCurrentGroupMember(operatorId)
  const target = getCurrentGroupMember(message.authorId)
  if (!actor || !target || actor.role === 'member') return false
  return target.role !== 'owner' && !(actor.role === 'admin' && target.role === 'admin')
}

function getMediaLabel(media: SandboxMedia) {
  return media.type === 'image' ? '图片' : media.type === 'audio' ? '语音' : media.type === 'video' ? '视频' : '文件'
}

function getMessageText(message: SandboxMessage) {
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
})
</script>
