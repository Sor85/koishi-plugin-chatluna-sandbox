<template>
  <main class="chatluna-sandbox-chat" :style="{ '--webqq-composer-space': composerSpace ? `${composerSpace}px` : undefined }">
    <header class="chatluna-sandbox-chat-header webqq-overlay-header" :class="{ 'is-searching': searchOpen }">
      <!-- 窄屏为单栏互切布局，会话列表被隐藏，必须提供返回入口；宽屏下此按钮不显示。 -->
      <button type="button" class="webqq-icon-button chatluna-sandbox-chat-back" aria-label="返回会话列表" @click="emit('back')">
        <IconChevronLeft :size="22" aria-hidden="true" />
      </button>
      <div class="chatluna-sandbox-chat-title">
        <ContextMenu v-if="model.profileParticipantId || model.profileGroupId">
          <ContextMenuTrigger as-child>
            <button type="button" class="chatluna-sandbox-chat-title-avatar" :aria-label="`查看 ${model.title} 的资料`" @click="openTitleProfile">
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
      <div class="chatluna-sandbox-chat-header-actions">
        <div
          ref="searchShellRef"
          class="chatluna-sandbox-chat-search-shell"
          :class="{ 'is-expanded': searchOpen }"
        >
          <button
            v-if="!searchOpen"
            ref="searchTriggerRef"
            type="button"
            class="webqq-icon-button chatluna-sandbox-chat-search-trigger"
            :disabled="!model.conversationId"
            aria-label="查找聊天记录"
            :aria-expanded="searchOpen"
            aria-controls="chatluna-sandbox-message-search-results"
            @click="toggleSearch"
          >
            <IconSearch :size="22" aria-hidden="true" />
          </button>
          <WebqqMessageSearch
            v-else
            :open="searchOpen"
            :loading="searchLoading"
            :error-message="searchError"
            :hits="searchHits"
            :next-before-message-id="searchNextBeforeMessageId"
            :participants="model.messageList.participants"
            :active-message-id="activeSearchMessageId"
            :revealing-message-id="revealingMessageId"
            @close="closeSearch(true)"
            @search="runSearch"
            @load-more="loadMoreSearchHits"
            @select="revealSearchHit"
            @date-popover-change="searchDatePopoverOpen = $event"
          />
        </div>
        <button type="button" class="webqq-icon-button" :class="{ 'is-active': model.detailsVisible }" :aria-label="model.detailsVisible ? '关闭会话信息' : '打开会话信息'" @click="emit('toggleDetails')">
          <IconDots :size="22" aria-hidden="true" />
        </button>
      </div>
    </header>

    <WebqqMessageList
      ref="messageListRef"
      :model="messageListModel"
      :preview="preview"
      :scroll-scope="scrollScope"
      @reply="replyingToMessageId = $event"
      @recall-message="emit('recallMessage', $event)"
      @clear-conversation="emit('clearConversation')"
      @branch-conversation-instance="emit('branchConversationInstance', $event)"
      @enter-selection="enterSelection"
      @toggle-selection="toggleSelection"
      @open-forward="openForwardDialog"
      @set-message-reaction="forwardSetMessageReaction"
      @open-reaction-picker="openReactionPicker"
      @open-model-request="emit('openModelRequest', $event)"
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
      class="chatluna-sandbox-selection-bar"
      role="toolbar"
      aria-label="消息多选操作"
    >
      <strong class="chatluna-sandbox-selection-bar-count">已选 {{ selectedMessageIds.length }} 条</strong>
      <div class="chatluna-sandbox-selection-bar-actions">
        <Button class="chatluna-sandbox-selection-bar-button" variant="outline" @click="exitSelection">取消</Button>
        <Button class="chatluna-sandbox-selection-bar-button" :disabled="!selectedMessageIds.length" @click="openForwardTargetDialog">
          <IconShare3 :size="16" aria-hidden="true" />
          合并转发
        </Button>
      </div>
    </div>

    <WebqqComposer
      v-else
      :model="composerModel"
      :preview="preview"
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
      :can-navigate-back="hasParentForwardFrame(forwardStack)"
      :participants="model.messageList.participants"
      :media-sources="model.messageList.mediaSources"
      :media-load-failures="model.messageList.mediaLoadFailures"
      @back="popForwardDialog"
      @close="closeForwardDialog"
      @open-forward="openNestedForward"
      @open-image="previewImageUrl = $event"
    />
    <WebqqImagePreview v-if="previewImageUrl" :url="previewImageUrl" @close="previewImageUrl = ''" />
  </main>
</template>

<script setup lang="ts">
import { IconChevronLeft, IconDots, IconId, IconSearch, IconShare3 } from '@tabler/icons-vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Button } from '#client/components/ui/button'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '#client/components/ui/context-menu'
import WebqqAvatar from '#client/shared/avatar.vue'
import WebqqComposer, { type WebqqComposerModel, type WebqqComposerSendIntent } from './composer.vue'
import WebqqEmojiPicker from './emoji-picker.vue'
import WebqqForwardModal from './forward-modal.vue'
import WebqqForwardTargetDialog, { type WebqqForwardTargetModel } from './forward-target-dialog.vue'
import WebqqImagePreview from './image-preview.vue'
import WebqqMessageList, { type WebqqMessageListModel } from './message-list.vue'
import WebqqMessageSearch from './message-search-panel.vue'
import {
  hasParentForwardFrame,
  closeForwardStack,
  loadForwardDialogFrame,
  popForwardFrame,
  pushForwardFrame,
  readForwardStackTop,
  type ForwardDialogFrame,
} from './forward-dialog-stack'
import {
  hasSelectedMessages,
  enterMessageSelection,
  exitMessageSelection,
  resolveForwardConfirmation,
  routeEscapeKey,
  toggleMessageSelection,
  type MessageSelectionState,
} from './message-selection'
import {
  createMessageSearchController,
  shouldCloseMessageSearchOnOutsidePointer,
} from './message-search'
import { formatMentionContent } from './mention'
import {
  type ManageSandboxEnvironmentInput,
  type SandboxForward,
  type SandboxMessageSearchResult,
  type SandboxMessageModelRequestReference,
  type SearchConversationMessagesInput,
} from '../../src/types'

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

const props = defineProps<{
  model: WebqqChatPaneModel
  preview?: boolean
  scrollScope?: string
}>()
const preview = computed(() => !!props.preview)
const scrollScope = computed(() => props.scrollScope)
const emit = defineEmits<{
  back: []
  toggleDetails: []
  send: [input: WebqqComposerSendIntent, resolve: () => void, reject: (error: unknown) => void]
  selectOperator: [participantId: string, resolve: () => void, reject: (error: unknown) => void]
  manageEnvironment: [input: ManageSandboxEnvironmentInput, resolve: () => void, reject: (error: unknown) => void]
  editParticipant: [entity: { type: 'user' | 'bot', id: string }]
  deleteParticipant: [entity: { type: 'user' | 'bot', id: string }]
  loadHistory: [resolve: () => void, reject: (error: unknown) => void]
  searchConversationMessages: [
    input: Omit<SearchConversationMessagesInput, 'operatorId'>,
    resolve: (result: SandboxMessageSearchResult) => void,
    reject: (error: unknown) => void,
  ]
  recallMessage: [messageId: string]
  clearConversation: []
  branchConversationInstance: [messageId: string]
  setMessageReaction: [messageId: string, emojiId: string, enabled: boolean]
  openModelRequest: [reference: SandboxMessageModelRequestReference]
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
const messageListRef = ref<{ revealMessage: (messageId: string) => boolean }>()
const searchShellRef = ref<HTMLElement>()
const searchTriggerRef = ref<HTMLButtonElement>()
/**
 * 搜索的整条编排住在 message-search 并由它的行为断言逐条执行；这里只负责注入
 * Console RPC、DOM 聚焦、下一拍与消息列表的跳转方法，并把状态解构给模板绑定。
 */
const messageSearch = createMessageSearchController({
  getConversationId: () => props.model.conversationId,
  search: (input) => new Promise<SandboxMessageSearchResult>((resolve, reject) => {
    emit('searchConversationMessages', input, resolve, reject)
  }),
  isMessageLoaded: (messageId) => props.model.messageList.messages.some(({ id }) => id === messageId),
  canLoadMore: () => !!props.model.messageList.hasMoreMessages,
  getOldestLoadedMessageId: () => props.model.messageList.messages[0]?.id,
  loadMore: () => new Promise<void>((resolve, reject) => emit('loadHistory', resolve, reject)),
  revealMessage: (messageId) => messageListRef.value?.revealMessage(messageId) ?? false,
  settle: () => nextTick(),
  focusTrigger: () => searchTriggerRef.value?.focus(),
  isSelectionActive: () => selectionMode.value,
  exitSelection: () => exitSelection(),
})
const {
  open: searchOpen,
  loading: searchLoading,
  error: searchError,
  hits: searchHits,
  nextBeforeMessageId: searchNextBeforeMessageId,
  activeMessageId: activeSearchMessageId,
  revealingMessageId,
  datePopoverOpen: searchDatePopoverOpen,
  close: closeSearch,
  toggle: toggleSearch,
  run: runSearch,
  loadMore: loadMoreSearchHits,
  revealHit: revealSearchHit,
} = messageSearch
const forwardStack = ref<ForwardDialogFrame[]>([])
const forwardDialog = computed(() => readForwardStackTop(forwardStack.value))
const replyingToMessage = computed(() => props.model.messageList.messages.find(({ id }) => id === replyingToMessageId.value))
const composerModel = computed<WebqqComposerModel>(() => ({
  ...props.model.composer,
  replyingTo: replyingToMessage.value
    ? {
        id: replyingToMessage.value.id,
        authorName: props.model.participantNames[replyingToMessage.value.authorId] ?? replyingToMessage.value.authorId,
        content: formatMentionContent(replyingToMessage.value.content, props.model.participantNames),
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
  // 搜索结果绑定当前会话；换会话后旧 hits 的 messageId 无意义。
  messageSearch.leaveConversation()
})

watch(selectionMode, (active) => {
  if (active) {
    replyingToMessageId.value = ''
    reactionPickerMessageId.value = ''
    // 搜索面板与多选操作栏叠在同一区域会抢焦点；进入多选时收起搜索。
    void closeSearch()
    // 短胶囊仍需为消息列表保留底部安全区，避免最后一条消息被悬浮操作栏遮住。
    composerSpace.value = 64
  }
})

function openTitleProfile() {
  if (props.model.profileGroupId) {
    emit('openGroupProfile', props.model.profileGroupId)
    return
  }
  if (props.model.profileParticipantId) emit('openProfile', props.model.profileParticipantId)
}

// 多选的六项判定住在 message-selection 并由它的行为断言逐条执行；这里只把结果写回状态。
const selectionContext = computed(() => ({ messageCapabilities: props.model.messageList.messageCapabilities }))

function applySelection(next: MessageSelectionState) {
  selectionMode.value = next.active
  selectedMessageIds.value = [...next.messageIds]
}

function enterSelection(messageId: string) {
  const next = enterMessageSelection(messageId, selectionContext.value)
  if (next) applySelection(next)
}

function toggleSelection(messageId: string) {
  applySelection(toggleMessageSelection(
    { active: selectionMode.value, messageIds: selectedMessageIds.value },
    messageId,
    selectionContext.value,
  ))
}

function exitSelection() {
  applySelection(exitMessageSelection())
  forwardTargetOpen.value = false
}

function openForwardTargetDialog() {
  if (!hasSelectedMessages({ active: selectionMode.value, messageIds: selectedMessageIds.value })) return
  forwardTargetOpen.value = true
}

function confirmForward(conversationId: string, resolve: () => void, reject: (error: unknown) => void) {
  const confirmation = resolveForwardConfirmation(
    { active: selectionMode.value, messageIds: selectedMessageIds.value },
    conversationId,
    selectionContext.value,
  )
  if (confirmation.kind === 'reject') {
    reject(new Error(confirmation.message))
    return
  }
  emit('sendForwardMessage', { conversationId, messageIds: [...confirmation.messageIds] }, () => {
    exitSelection()
    resolve()
  }, reject)
}

function handleSelectionKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  const action = routeEscapeKey({
    selectionActive: selectionMode.value,
    forwardTargetOpen: forwardTargetOpen.value,
    searchOpen: searchOpen.value,
    searchDatePopoverOpen: searchDatePopoverOpen.value,
  })
  if (action.kind === 'close-forward-target') {
    forwardTargetOpen.value = false
    return
  }
  if (action.kind === 'exit-selection') {
    event.preventDefault()
    exitSelection()
    return
  }
  if (action.kind === 'close-search') {
    event.preventDefault()
    void closeSearch(true)
  }
}

function handleSearchOutsidePointerDown(event: PointerEvent) {
  const target = event.target
  const element = target instanceof Element ? target : undefined
  const shouldClose = shouldCloseMessageSearchOnOutsidePointer({
    open: searchOpen.value,
    insideShell: target instanceof Node && !!searchShellRef.value?.contains(target),
    insideDatePopover: !!element?.closest('[data-chatluna-sandbox-message-search-date]'),
    // 日期弹层里的月/年下拉（shadcn Select）portal 到 body，不在弹层 DOM 子树内。
    insideSelectContent: !!element?.closest('.sandbox-select-content'),
  })
  // 外部点击应让目标元素自然接管焦点，不能像 Escape 一样强制回焦搜索按钮。
  if (shouldClose) void closeSearch()
}

onMounted(() => {
  if (preview.value) return
  window.addEventListener('keydown', handleSelectionKeydown)
  document.addEventListener('pointerdown', handleSearchOutsidePointerDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleSelectionKeydown)
  document.removeEventListener('pointerdown', handleSearchOutsidePointerDown)
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

// 栈的推入、弹出、栈顶取值与按入参读取住在 forward-dialog-stack；这里只管加载闸门。
async function openForwardByInput(input: { forwardId?: string; messageId?: string }, mode: 'replace' | 'push') {
  if (forwardLoading.value) return
  forwardLoading.value = true
  try {
    const frame = await loadForwardDialogFrame({ input, load: loadForwardMessage })
    if (frame) forwardStack.value = pushForwardFrame(forwardStack.value, frame, mode)
  } finally {
    forwardLoading.value = false
  }
}

function openForwardDialog(input: { messageId: string; forwardId: string }) {
  if (selectionMode.value) return
  void openForwardByInput(input, 'replace')
}

function openNestedForward(forwardId: string) {
  void openForwardByInput({ forwardId }, 'push')
}

function popForwardDialog() {
  if (!hasParentForwardFrame(forwardStack.value)) return
  forwardStack.value = popForwardFrame(forwardStack.value)
  previewImageUrl.value = ''
}

function closeForwardDialog() {
  forwardStack.value = closeForwardStack()
  previewImageUrl.value = ''
}
</script>
