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
      @branch-conversation="emit('branchConversation', $event)"
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
      :can-navigate-back="forwardStack.length > 1"
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
import { Button } from './components/ui/button'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from './components/ui/context-menu'
import WebqqAvatar from './webqq-avatar.vue'
import WebqqComposer, { type WebqqComposerModel, type WebqqComposerSendIntent } from './webqq-composer.vue'
import WebqqEmojiPicker from './webqq-emoji-picker.vue'
import WebqqForwardModal from './webqq-forward-modal.vue'
import WebqqForwardTargetDialog, { type WebqqForwardTargetModel } from './webqq-forward-target-dialog.vue'
import WebqqImagePreview from './webqq-image-preview.vue'
import WebqqMessageList, { type WebqqMessageListModel } from './webqq-message-list.vue'
import WebqqMessageSearch, { type WebqqMessageSearchCriteria } from './webqq-message-search.vue'
import { buildForwardPreview } from './webqq/forward-preview'
import { localDateToMessageSearchRange } from './webqq/message-search-date'
import { formatMentionContent } from './webqq/mention'
import { ensureMessageLoaded } from './webqq/message-reveal'
import {
  isRecalledMessage,
  type ManageSandboxEnvironmentInput,
  type SandboxForward,
  type SandboxForwardNode,
  type SandboxMessageSearchHit,
  type SandboxMessageSearchResult,
  type SandboxMessageModelRequestReference,
  type SearchConversationMessagesInput,
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
  branchConversation: [messageId: string]
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
const searchOpen = ref(false)
const searchDatePopoverOpen = ref(false)
const searchLoading = ref(false)
const searchError = ref('')
type SearchCriteriaSnapshot = Pick<
  SearchConversationMessagesInput,
  'query' | 'createdAtStart' | 'createdAtEnd'
>
const searchCriteria = ref<SearchCriteriaSnapshot>({ query: '' })
const searchHits = ref<SandboxMessageSearchHit[]>([])
const searchNextBeforeMessageId = ref<string>()
const activeSearchMessageId = ref('')
const revealingMessageId = ref('')
let searchRequestSerial = 0
interface ForwardDialogFrame {
  title: string
  items: SandboxForwardNode[]
  nestedForwards: Record<string, SandboxForward>
}
const forwardStack = ref<ForwardDialogFrame[]>([])
const forwardDialog = computed(() => forwardStack.value.at(-1))
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
  resetSearchState()
  searchOpen.value = false
})

watch(selectionMode, (active) => {
  if (active) {
    replyingToMessageId.value = ''
    reactionPickerMessageId.value = ''
    // 搜索面板与多选操作栏叠在同一区域会抢焦点；进入多选时收起搜索。
    closeSearch()
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
  if (event.key !== 'Escape') return
  if (selectionMode.value) {
    if (forwardTargetOpen.value) {
      forwardTargetOpen.value = false
      return
    }
    event.preventDefault()
    exitSelection()
    return
  }
  if (searchOpen.value) {
    if (searchDatePopoverOpen.value) return
    event.preventDefault()
    void closeSearch(true)
  }
}

function handleSearchOutsidePointerDown(event: PointerEvent) {
  if (!searchOpen.value) return
  const target = event.target
  if (target instanceof Node && searchShellRef.value?.contains(target)) return
  if (target instanceof Element && target.closest('[data-chatluna-sandbox-message-search-date]')) return
  // 日期弹层里的月/年下拉（shadcn Select）portal 到 body，不在弹层 DOM 子树内；
  // 点击下拉选项不是"搜索外部点击"，否则会把搜索栏连同日期弹层一起关掉。
  if (target instanceof Element && target.closest('.sandbox-select-content')) return
  // 外部点击应让目标元素自然接管焦点，不能像 Escape 一样强制回焦搜索按钮。
  void closeSearch()
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

function resetSearchState() {
  searchRequestSerial += 1
  searchDatePopoverOpen.value = false
  searchLoading.value = false
  searchError.value = ''
  searchCriteria.value = { query: '' }
  searchHits.value = []
  searchNextBeforeMessageId.value = undefined
  activeSearchMessageId.value = ''
  revealingMessageId.value = ''
}

async function closeSearch(restoreFocus = false) {
  searchOpen.value = false
  resetSearchState()
  if (!restoreFocus) return
  await nextTick()
  searchTriggerRef.value?.focus()
}

function toggleSearch() {
  if (!props.model.conversationId) return
  if (searchOpen.value) {
    closeSearch()
    return
  }
  // 搜索与多选互斥：避免同时出现悬浮操作栏与结果面板。
  if (selectionMode.value) exitSelection()
  searchOpen.value = true
}

function requestSearch(input: Omit<SearchConversationMessagesInput, 'operatorId'>) {
  return new Promise<SandboxMessageSearchResult>((resolve, reject) => {
    emit('searchConversationMessages', input, resolve, reject)
  })
}

async function runSearch(criteria: WebqqMessageSearchCriteria) {
  const conversationId = props.model.conversationId
  const query = criteria.query.trim()
  const dateRange = criteria.localDate
    ? localDateToMessageSearchRange(criteria.localDate)
    : undefined
  const snapshot: SearchCriteriaSnapshot = {
    query,
    ...(dateRange ?? {}),
  }
  const serial = ++searchRequestSerial
  searchCriteria.value = snapshot
  activeSearchMessageId.value = ''
  searchHits.value = []
  searchNextBeforeMessageId.value = undefined
  searchError.value = ''
  if (!conversationId || (!query && !dateRange)) {
    searchLoading.value = false
    return
  }
  if (criteria.localDate && !dateRange) {
    searchLoading.value = false
    searchError.value = '筛选日期无效'
    return
  }

  searchLoading.value = true
  try {
    const result = await requestSearch({ conversationId, ...snapshot, limit: 30 })
    if (serial !== searchRequestSerial) return
    searchHits.value = result.hits
    searchNextBeforeMessageId.value = result.nextBeforeMessageId
  } catch (error) {
    if (serial !== searchRequestSerial) return
    searchHits.value = []
    searchNextBeforeMessageId.value = undefined
    searchError.value = error instanceof Error ? error.message : '搜索会话消息失败'
  } finally {
    if (serial === searchRequestSerial) searchLoading.value = false
  }
}

async function loadMoreSearchHits() {
  const conversationId = props.model.conversationId
  const beforeMessageId = searchNextBeforeMessageId.value
  const criteria = searchCriteria.value
  if (
    !conversationId
    || !beforeMessageId
    || (!criteria.query && !criteria.createdAtStart)
    || searchLoading.value
  ) return

  const serial = ++searchRequestSerial
  searchLoading.value = true
  searchError.value = ''
  try {
    const result = await requestSearch({
      conversationId,
      ...criteria,
      beforeMessageId,
      limit: 30,
    })
    if (serial !== searchRequestSerial) return
    const known = new Set(searchHits.value.map(({ messageId }) => messageId))
    searchHits.value = [
      ...searchHits.value,
      ...result.hits.filter(({ messageId }) => !known.has(messageId)),
    ]
    searchNextBeforeMessageId.value = result.nextBeforeMessageId
  } catch (error) {
    if (serial !== searchRequestSerial) return
    searchError.value = error instanceof Error ? error.message : '搜索会话消息失败'
  } finally {
    if (serial === searchRequestSerial) searchLoading.value = false
  }
}

async function revealSearchHit(hit: SandboxMessageSearchHit) {
  if (revealingMessageId.value) return
  revealingMessageId.value = hit.messageId
  searchError.value = ''
  try {
    const loaded = await ensureMessageLoaded({
      messageId: hit.messageId,
      isLoaded: () => props.model.messageList.messages.some(({ id }) => id === hit.messageId),
      canLoadMore: () => !!props.model.messageList.hasMoreMessages,
      getOldestLoadedMessageId: () => props.model.messageList.messages[0]?.id,
      loadMore: () => new Promise<void>((resolve, reject) => emit('loadHistory', resolve, reject)),
    })
    if (!loaded) {
      searchError.value = '消息尚未加载，且没有更多历史消息'
      return
    }
    await nextTick()
    const revealed = messageListRef.value?.revealMessage(hit.messageId) ?? false
    if (!revealed) {
      searchError.value = '无法定位到该消息'
      return
    }
    activeSearchMessageId.value = hit.messageId
  } catch (error) {
    searchError.value = error instanceof Error ? error.message : '定位消息失败'
  } finally {
    revealingMessageId.value = ''
  }
}

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

async function openForwardByInput(input: { forwardId?: string; messageId?: string }, mode: 'replace' | 'push') {
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
    const frame: ForwardDialogFrame = {
      title: buildForwardPreview(forward).title || '合并转发',
      items: forward.nodes.map((node) => ({ ...node })),
      nestedForwards,
    }
    // 根消息重置历史；嵌套详情压栈，返回时直接恢复上一帧而不重复 RPC。
    forwardStack.value = mode === 'push' ? [...forwardStack.value, frame] : [frame]
  } catch {
    // 页面控制层负责展示错误；弹窗只在成功后打开。
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
  if (forwardStack.value.length <= 1) return
  forwardStack.value = forwardStack.value.slice(0, -1)
  previewImageUrl.value = ''
}

function closeForwardDialog() {
  forwardStack.value = []
  previewImageUrl.value = ''
}
</script>
