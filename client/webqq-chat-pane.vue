<template>
  <main class="webqq-chat" :style="{ '--webqq-composer-space': composerSpace ? `${composerSpace}px` : undefined }">
    <header class="webqq-chat-header">
      <!-- 窄屏为单栏互切布局，会话列表被隐藏，必须提供返回入口；宽屏下此按钮不显示。 -->
      <button type="button" class="webqq-icon-button webqq-chat-back" aria-label="返回会话列表" @click="emit('back')">
        <IconChevronLeft :size="22" aria-hidden="true" />
      </button>
      <div class="webqq-chat-title">
        <ContextMenu v-if="model.profileParticipantId || model.profileGroupId">
          <ContextMenuTrigger as-child>
            <button type="button" class="webqq-chat-title-avatar" :aria-label="`查看 ${model.title} 的资料`">
              <WebqqAvatar class="webqq-avatar" :kind="model.avatarKind" :name="model.title" :avatar="model.avatar" />
            </button>
          </ContextMenuTrigger>
          <ContextMenuContent style="z-index: 140">
            <ContextMenuItem
              @select="model.profileGroupId
                ? emit('openGroupProfile', model.profileGroupId!)
                : emit('openProfile', model.profileParticipantId!)"
            >
              <IconId :size="16" aria-hidden="true" /> 查看资料
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        <WebqqAvatar v-else class="webqq-avatar" :kind="model.avatarKind" :name="model.title" :avatar="model.avatar" />
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
      :model="messageListModel"
      @reply="replyingToMessageId = $event"
      @recall-message="emit('recallMessage', $event)"
      @enter-selection="enterSelection"
      @toggle-selection="toggleSelection"
      @open-forward="openForwardDialog"
      @set-message-reaction="forwardSetMessageReaction"
      @open-reaction-picker="openReactionPicker"
      @load-history="forwardLoadHistory"
      @request-friend="emit('requestFriend', $event)"
      @poke-friend="emit('pokeFriend', $event)"
      @set-remark="emit('setRemark', $event)"
      @delete-friend="emit('deleteFriend', $event)"
      @mention-group-member="emit('mentionGroupMember', $event)"
      @poke-group-member="emit('pokeGroupMember', $event)"
      @set-group-card="emit('setGroupCard', $event)"
      @set-group-admin="forwardSetGroupAdmin"
      @transfer-group-owner="emit('transferGroupOwner', $event)"
      @kick-group-member="emit('kickGroupMember', $event)"
      @open-profile="emit('openProfile', $event)"
    />

    <WebqqEmojiPicker v-model:open="reactionPickerOpen" @select="selectReaction" />

    <div
      v-if="selectionMode"
      class="webqq-selection-bar"
      role="toolbar"
      aria-label="消息多选操作"
    >
      <div class="webqq-selection-bar-copy">
        <strong>已选 {{ selectedMessageIds.length }} 条</strong>
        <span>点击消息切换勾选，Esc 退出多选</span>
      </div>
      <div class="webqq-selection-bar-actions">
        <Button variant="outline" @click="exitSelection">取消</Button>
        <Button :disabled="!selectedMessageIds.length" @click="openForwardTargetDialog">
          <IconShare3 :size="16" aria-hidden="true" />
          合并转发
        </Button>
      </div>
    </div>

    <WebqqComposer
      v-else
      :model="composerModel"
      @send="forwardSend"
      @select-operator="forwardSelectOperator"
      @manage-environment="forwardManageEnvironment"
      @edit-participant="emit('editParticipant', $event)"
      @delete-participant="emit('deleteParticipant', $event)"
      @clear-reply="replyingToMessageId = ''"
      @space-change="composerSpace = $event"
    />

    <WebqqForwardTargetDialog
      v-model:open="forwardTargetOpen"
      :model="model.forwardTargets"
      :accent-color="model.composer.accentColor"
      @confirm="confirmForward"
    />

    <WebqqForwardModal
      v-if="forwardDialog"
      :title="forwardDialog.title"
      :items="forwardDialog.items"
      :nested-forwards="forwardDialog.nestedForwards"
      :participants="model.messageList.participants"
      :media-sources="model.messageList.mediaSources"
      :media-load-failures="model.messageList.mediaLoadFailures"
      @close="closeForwardDialog"
      @open-forward="openNestedForward"
      @open-image="previewImageUrl = $event"
    />
    <WebqqImagePreview v-if="previewImageUrl" :url="previewImageUrl" @close="previewImageUrl = ''" />
  </main>
</template>

<script setup lang="ts">
import { IconChevronLeft, IconDots, IconId, IconShare3 } from '@tabler/icons-vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Button } from './components/ui/button'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from './components/ui/context-menu'
import WebqqAvatar from './webqq-avatar.vue'
import WebqqComposer, { type WebqqComposerModel, type WebqqComposerSendIntent } from './webqq-composer.vue'
import WebqqEmojiPicker from './webqq-emoji-picker.vue'
import WebqqForwardModal from './webqq-forward-modal.vue'
import WebqqForwardTargetDialog, { type WebqqForwardTargetModel } from './webqq-forward-target-dialog.vue'
import WebqqImagePreview from './webqq-image-preview.vue'
import WebqqMessageList, { type WebqqMessageListModel } from './webqq-message-list.vue'
import { buildForwardPreview } from './webqq/forward-preview'
import {
  isRecalledMessage,
  type ManageSandboxEnvironmentInput,
  type SandboxForward,
  type SandboxForwardNode,
} from '../src/types'

export interface WebqqChatPaneModel {
  conversationId?: string
  title: string
  subtitle: string
  avatar: string
  avatarKind: 'user' | 'bot' | 'group'
  profileParticipantId?: string
  profileGroupId?: string
  detailsVisible: boolean
  participantNames: Record<string, string>
  messageList: WebqqMessageListModel
  composer: WebqqComposerModel
  // shell 提供最近/好友/群可转发目标；chat-pane 只消费展示。
  forwardTargets: WebqqForwardTargetModel
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
  recallMessage: [messageId: string]
  setMessageReaction: [messageId: string, emojiId: string, enabled: boolean]
  sendForwardMessage: [input: { conversationId: string, messageIds: string[] }, resolve: () => void, reject: (error: unknown) => void]
  getForwardMessage: [input: { forwardId?: string, messageId?: string }, resolve: (forward: SandboxForward) => void, reject: (error: unknown) => void]
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
  openProfile: [participantId: string]
  openGroupProfile: [groupId: string]
}>()

const replyingToMessageId = ref('')
const reactionPickerMessageId = ref('')
const reactionPickerOpen = computed({
  get: () => !!reactionPickerMessageId.value,
  set: (open: boolean) => {
    if (!open) reactionPickerMessageId.value = ''
  },
})
const composerSpace = ref(0)
const selectionMode = ref(false)
const selectedMessageIds = ref<string[]>([])
const forwardTargetOpen = ref(false)
const forwardLoading = ref(false)
const previewImageUrl = ref('')
const forwardDialog = ref<{
  title: string
  items: SandboxForwardNode[]
  nestedForwards: Record<string, SandboxForward>
}>()
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
const messageListModel = computed<WebqqMessageListModel>(() => ({
  ...props.model.messageList,
  selectionMode: selectionMode.value,
  selectedMessageIds: selectedMessageIds.value,
}))

watch(() => props.model.conversationId, () => {
  replyingToMessageId.value = ''
  reactionPickerMessageId.value = ''
  closeForwardDialog()
  // 切换会话必须清空多选，避免把旧会话 messageId 误转发。
  exitSelection()
})

watch(selectionMode, (active) => {
  if (active) {
    replyingToMessageId.value = ''
    reactionPickerMessageId.value = ''
    // 底部操作栏高度近似 composer 默认占用，保持消息列表底部留白。
    composerSpace.value = 88
  }
})

function isSelectableMessageId(messageId: string) {
  const message = props.model.messageList.messages.find(({ id }) => id === messageId)
  return !!message && !message.event && !isRecalledMessage(message)
}

function enterSelection(messageId: string) {
  if (!isSelectableMessageId(messageId)) return
  selectionMode.value = true
  selectedMessageIds.value = [messageId]
}

function toggleSelection(messageId: string) {
  if (!selectionMode.value || !isSelectableMessageId(messageId)) return
  if (selectedMessageIds.value.includes(messageId)) {
    selectedMessageIds.value = selectedMessageIds.value.filter((id) => id !== messageId)
    return
  }
  selectedMessageIds.value = [...selectedMessageIds.value, messageId]
}

function exitSelection() {
  selectionMode.value = false
  selectedMessageIds.value = []
  forwardTargetOpen.value = false
}

function openForwardTargetDialog() {
  if (!selectedMessageIds.value.length) return
  forwardTargetOpen.value = true
}

function confirmForward(conversationId: string, resolve: () => void, reject: (error: unknown) => void) {
  const messageIds = selectedMessageIds.value.filter(isSelectableMessageId)
  if (!messageIds.length) {
    reject(new Error('请先选择可转发的消息'))
    return
  }
  emit('sendForwardMessage', { conversationId, messageIds }, () => {
    exitSelection()
    resolve()
  }, reject)
}

function handleSelectionKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !selectionMode.value) return
  if (forwardTargetOpen.value) {
    forwardTargetOpen.value = false
    return
  }
  event.preventDefault()
  exitSelection()
}

onMounted(() => {
  window.addEventListener('keydown', handleSelectionKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleSelectionKeydown)
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

function forwardSetMessageReaction(messageId: string, emojiId: string, enabled: boolean) {
  emit('setMessageReaction', messageId, emojiId, enabled)
}

function openReactionPicker(messageId: string) {
  if (selectionMode.value) return
  reactionPickerMessageId.value = messageId
}

function selectReaction(emojiId: string) {
  const messageId = reactionPickerMessageId.value
  if (!messageId) return
  emit('setMessageReaction', messageId, emojiId, true)
  reactionPickerMessageId.value = ''
}

function forwardSetGroupAdmin(targetId: string, enabled: boolean) {
  emit('setGroupAdmin', targetId, enabled)
}

function loadForwardMessage(input: { forwardId?: string; messageId?: string }) {
  return new Promise<SandboxForward>((resolve, reject) => {
    emit('getForwardMessage', input, resolve, reject)
  })
}

async function openForwardByInput(input: { forwardId?: string; messageId?: string }) {
  if (forwardLoading.value) return
  forwardLoading.value = true
  try {
    const forward = await loadForwardMessage(input)
    const nestedEntries = await Promise.all(
      forward.nodes
        .map((node) => node.forwardId)
        .filter((forwardId): forwardId is string => !!forwardId)
        .map(async (forwardId) => {
          try {
            return [forwardId, await loadForwardMessage({ forwardId })] as const
          } catch {
            // 嵌套资源失败时保留外层弹窗；卡片回退为“合并转发”占位文案。
            return undefined
          }
        }),
    )
    const nestedForwards = Object.fromEntries(nestedEntries.filter((entry): entry is readonly [string, SandboxForward] => !!entry))
    forwardDialog.value = {
      title: buildForwardPreview(forward).title || '合并转发',
      items: forward.nodes.map((node) => ({ ...node })),
      nestedForwards,
    }
  } catch {
    // 页面控制层负责展示错误；弹窗只在成功后打开。
  } finally {
    forwardLoading.value = false
  }
}

function openForwardDialog(input: { messageId: string; forwardId: string }) {
  if (selectionMode.value) return
  void openForwardByInput(input)
}

function openNestedForward(forwardId: string) {
  void openForwardByInput({ forwardId })
}

function closeForwardDialog() {
  forwardDialog.value = undefined
  previewImageUrl.value = ''
}
</script>
