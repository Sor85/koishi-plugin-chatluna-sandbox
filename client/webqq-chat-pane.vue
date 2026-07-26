<template>
  <main class="webqq-chat" :style="{ '--webqq-composer-space': composerSpace ? `${composerSpace}px` : undefined }">
    <header class="webqq-chat-header">
      <!-- 窄屏为单栏互切布局，会话列表被隐藏，必须提供返回入口；宽屏下此按钮不显示。 -->
      <button type="button" class="webqq-icon-button webqq-chat-back" aria-label="返回会话列表" @click="emit('back')">
        <IconChevronLeft :size="22" aria-hidden="true" />
      </button>
      <div class="webqq-chat-title">
        <WebqqAvatar class="webqq-avatar" :kind="model.avatarKind" :name="model.title" :avatar="model.avatar" />
        <div>
          <strong>{{ model.title }}</strong>
          <span>{{ model.subtitle }}</span>
        </div>
      </div>
      <button type="button" class="webqq-icon-button" :class="{ 'is-active': model.detailsVisible }" :aria-label="model.detailsVisible ? '关闭会话信息' : '打开会话信息'" @click="emit('toggleDetails')">
        <IconDots :size="22" aria-hidden="true" />
      </button>
    </header>

    <WebqqMessageList
      :model="model.messageList"
      @reply="replyingToMessageId = $event"
      @load-history="forwardLoadHistory"
      @request-friend="emit('requestFriend', $event)"
      @poke-friend="emit('pokeFriend', $event)"
      @set-remark="emit('setRemark', $event)"
      @delete-friend="emit('deleteFriend', $event)"
      @poke-group-member="emit('pokeGroupMember', $event)"
      @set-group-card="emit('setGroupCard', $event)"
      @set-group-admin="forwardSetGroupAdmin"
      @transfer-group-owner="emit('transferGroupOwner', $event)"
      @kick-group-member="emit('kickGroupMember', $event)"
    />

    <WebqqComposer
      :model="composerModel"
      @send="forwardSend"
      @select-operator="forwardSelectOperator"
      @manage-environment="forwardManageEnvironment"
      @edit-participant="emit('editParticipant', $event)"
      @delete-participant="emit('deleteParticipant', $event)"
      @clear-reply="replyingToMessageId = ''"
      @space-change="composerSpace = $event"
    />
  </main>
</template>

<script setup lang="ts">
import { IconChevronLeft, IconDots } from '@tabler/icons-vue'
import { computed, ref, watch } from 'vue'
import WebqqAvatar from './webqq-avatar.vue'
import WebqqComposer, { type WebqqComposerModel, type WebqqComposerSendIntent } from './webqq-composer.vue'
import WebqqMessageList, { type WebqqMessageListModel } from './webqq-message-list.vue'
import type { ManageSandboxEnvironmentInput } from '../src/types'

export interface WebqqChatPaneModel {
  conversationId?: string
  title: string
  subtitle: string
  avatar: string
  avatarKind: 'user' | 'bot' | 'group'
  detailsVisible: boolean
  participantNames: Record<string, string>
  messageList: WebqqMessageListModel
  composer: WebqqComposerModel
}

const props = defineProps<{ model: WebqqChatPaneModel }>()
const emit = defineEmits<{
  back: []
  toggleDetails: []
  send: [input: WebqqComposerSendIntent, resolve: () => void, reject: (error: unknown) => void]
  selectOperator: [participantId: string, resolve: () => void, reject: (error: unknown) => void]
  manageEnvironment: [input: ManageSandboxEnvironmentInput, resolve: () => void, reject: (error: unknown) => void]
  editParticipant: [entity: { type: 'user' | 'bot', id: string }]
  deleteParticipant: [entity: { type: 'user' | 'bot', id: string }]
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

const replyingToMessageId = ref('')
const composerSpace = ref(0)
const replyingToMessage = computed(() => props.model.messageList.messages.find(({ id }) => id === replyingToMessageId.value))
const composerModel = computed<WebqqComposerModel>(() => ({
  ...props.model.composer,
  replyingTo: replyingToMessage.value
    ? {
        id: replyingToMessage.value.id,
        authorName: props.model.participantNames[replyingToMessage.value.authorId] ?? replyingToMessage.value.authorId,
        content: replyingToMessage.value.content,
      }
    : undefined,
}))

watch(() => props.model.conversationId, () => {
  replyingToMessageId.value = ''
})

function forwardSend(input: WebqqComposerSendIntent, resolve: () => void, reject: (error: unknown) => void) {
  emit('send', input, resolve, reject)
}

function forwardSelectOperator(participantId: string, resolve: () => void, reject: (error: unknown) => void) {
  emit('selectOperator', participantId, resolve, reject)
}

function forwardManageEnvironment(input: ManageSandboxEnvironmentInput, resolve: () => void, reject: (error: unknown) => void) {
  emit('manageEnvironment', input, resolve, reject)
}

function forwardLoadHistory(resolve: () => void, reject: (error: unknown) => void) {
  emit('loadHistory', resolve, reject)
}

function forwardSetGroupAdmin(targetId: string, enabled: boolean) {
  emit('setGroupAdmin', targetId, enabled)
}
</script>
