<template>
  <section v-webqq-scrollbar="{ tone: 'accent' }" class="webqq-messages" aria-label="消息记录">
    <div v-if="!model.messages.length" class="webqq-welcome">
      <WebqqAvatar class="webqq-avatar webqq-avatar-large webqq-avatar-bot" :kind="model.avatarKind" :name="model.title" :avatar="model.avatar" />
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
                message.authorId === model.currentUserId ? 'is-outgoing' : 'is-incoming',
                getMessageClusterClass(model.messages, messageIndex, model.chatStyle, model.currentUserId),
                { 'is-merged': isMergedMessage(model.messages, messageIndex, model.chatStyle, model.currentUserId) },
                { 'is-quote-target': highlightedMessageId === message.id },
              ]"
              :data-message-id="message.id"
            >
              <ContextMenu v-if="message.authorId !== model.currentUserId">
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
                <div v-if="!isMergedMessage(model.messages, messageIndex, model.chatStyle, model.currentUserId)" class="webqq-sender-line">
                  <span class="webqq-message-author">{{ getParticipantName(message.authorId) }}</span>
                </div>
                <div class="webqq-message-body">
                  <div class="webqq-message-bubble">
                    <button v-if="getReplyMessage(message)" class="webqq-message-quote is-clickable" type="button" aria-label="跳转到引用消息" @click.stop="scrollToQuotedMessage(getReplyMessage(message)!.id)">
                      <strong class="webqq-message-quote-title">{{ getParticipantName(getReplyMessage(message)!.authorId) }}</strong>
                      <span>{{ getReplyMessage(message)!.content }}</span>
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
          </ContextMenuContent>
        </ContextMenu>
      </template>
    </ol>
  </section>
</template>

<script setup lang="ts">
import { IconBell, IconClock, IconHandClick, IconMessageReply, IconPaperclip, IconTag, IconUserMinus, IconUserPlus, IconUsers } from '@tabler/icons-vue'
import { onBeforeUnmount, ref } from 'vue'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger } from './components/ui/context-menu'
import { getFriendMenuActions, type FriendMenuState } from './webqq/friend-menu'
import GroupMemberMenu from './group-member-menu.vue'
import { getMessageClusterClass, isMergedMessage } from './webqq/message-cluster'
import WebqqAvatar from './webqq-avatar.vue'
import { vWebqqScrollbar } from './webqq-scrollbar'
import type { SandboxConversation, SandboxGroup, SandboxMedia, SandboxMessage } from '../src/types'

interface MessageParticipant {
  name: string
  avatar?: string
  isBot: boolean
}

export interface WebqqMessageListModel {
  messages: SandboxMessage[]
  replyMessages: Record<string, SandboxMessage>
  participants: Record<string, MessageParticipant>
  friendMenuStates: Record<string, FriendMenuState>
  currentOperatorIsBot: boolean
  currentConversation?: SandboxConversation
  currentGroup?: SandboxGroup
  currentUserId?: string
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
  loadHistory: [resolve: () => void, reject: (error: unknown) => void]
  requestFriend: [targetId: string]
  pokeFriend: [targetId: string]
  setRemark: [targetId: string]
  deleteFriend: [targetId: string]
  pokeGroupMember: [targetId: string]
  setGroupCard: [targetId: string]
  setGroupAdmin: [targetId: string, enabled: boolean]
  transferGroupOwner: [targetId: string]
  kickGroupMember: [targetId: string]
}>()

const historyLoading = ref(false)
const highlightedMessageId = ref('')
let quoteHighlightTimer: ReturnType<typeof setTimeout> | undefined

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
  return getFriendMenuActions(getFriendMenuState(targetId), props.model.currentOperatorIsBot)
}

function getReplyMessage(message: SandboxMessage) {
  return message.replyToMessageId ? props.model.replyMessages[message.replyToMessageId] : undefined
}

function getMediaLabel(media: SandboxMedia) {
  return media.type === 'image' ? '图片' : media.type === 'audio' ? '语音' : media.type === 'video' ? '视频' : '文件'
}

function getMessageText(message: SandboxMessage) {
  if (message.media?.length === 1 && message.content === `[${getMediaLabel(message.media[0])}] ${message.media[0].name}`) return ''
  return message.content
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
