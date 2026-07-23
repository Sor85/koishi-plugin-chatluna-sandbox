import { computed, onMounted, ref, watch } from 'vue'
import type { WebqqChatPaneModel } from '../webqq-chat-pane.vue'
import type { WebqqComposerModel, WebqqComposerSendIntent, WebqqComposerSender } from '../webqq-composer.vue'
import type { WebqqDetailsPanelModel } from '../webqq-details-panel.vue'
import type { WebqqMessageListModel } from '../webqq-message-list.vue'
import type { WebqqSidebarModel } from '../webqq-sidebar.vue'
import type {
  ManageSandboxEnvironmentInput,
  SandboxConversation,
  SandboxFriendAction,
  SandboxGroupAction,
} from '../../src/types'
import type { SandboxWorkspaceView } from '../workspace-state'
import type { createWorkspaceController } from './workspace-controller'
import type { createWorkspaceLayout } from './workspace-layout'

type WorkspaceController = ReturnType<typeof createWorkspaceController>
type WorkspaceLayout = ReturnType<typeof createWorkspaceLayout>
type EnvironmentEntityType = 'user' | 'bot' | 'group'
type EnvironmentDialogMode = 'edit' | 'delete'
type Resolve = () => void
type Reject = (error: unknown) => void

export interface WebqqWorkspaceOverlayHost {
  openEntity(mode: EnvironmentDialogMode, target: { type: EnvironmentEntityType, id: string }): void
  openGroupAction(mode: 'card' | 'name', targetId: string, groupId: string, value: string): void
  openRemark(targetId: string, value: string): void
}

export function createWebqqWorkspaceShell(
  workspaceController: WorkspaceController,
  workspaceLayout: WorkspaceLayout,
  getOverlayHost: () => WebqqWorkspaceOverlayHost | undefined,
) {
  const workspace = workspaceController.workspace
  const currentUserId = workspaceController.currentUserId
  const composerSenderId = workspaceController.currentOperatorId
  const activeConversationId = workspaceController.activeConversationId
  const currentView = workspaceController.currentView
  const detailsVisible = workspaceLayout.detailsVisible
  const mediaSources = ref<Record<string, string>>({})
  const mediaLoadFailures = ref<Record<string, true>>({})
  const errorMessage = ref('')
  const snapshot = computed(() => workspace.value.snapshot)
  const appearance = computed(() => workspace.value.appearance)
  const currentUser = computed(() => snapshot.value.users.find(({ id }) => id === currentUserId.value))
  const currentOperatorId = computed(() => composerSenderId.value ?? currentUserId.value)
  const composerSenders = computed<WebqqComposerSender[]>(() => {
    const users = snapshot.value.users.map((user) => ({ ...user, type: 'user' as const }))
    const activeUserIndex = users.findIndex(({ id }) => id === currentUserId.value)
    const orderedUsers = activeUserIndex > 0
      ? [users[activeUserIndex], ...users.slice(0, activeUserIndex), ...users.slice(activeUserIndex + 1)]
      : users
    const conversation = snapshot.value.conversations.find(({ id }) => id === activeConversationId.value)
    const bot = snapshot.value.bots.find(({ id }) => id === conversation?.botId)
    return bot
      ? [orderedUsers[0], { ...bot, type: 'bot' as const }, ...orderedUsers.slice(1)].filter(Boolean) as WebqqComposerSender[]
      : orderedUsers
  })
  const visibleConversations = computed(() => snapshot.value.conversations.filter(({ userId }) => userId === currentUserId.value))
  const currentConversation = computed(() => visibleConversations.value.find(({ id }) => id === activeConversationId.value))
  const currentBot = computed(() => getBot(currentConversation.value?.botId))
  const currentGroup = computed(() => snapshot.value.groups.find(({ id }) => id === currentConversation.value?.groupId))
  const currentConversationTitle = computed(() => currentConversation.value
    ? getConversationTitle(currentConversation.value)
    : '选择一个会话')
  const currentConversationSubtitle = computed(() => {
    if (currentGroup.value) return `群聊 ${currentGroup.value.id} · ${currentGroup.value.members.length} 人`
    return currentBot.value ? '在线 · 虚拟 OneBot 机器人' : '暂无会话'
  })
  const messages = computed(() => {
    const ids = new Set(currentConversation.value?.messageIds ?? [])
    return snapshot.value.messages.filter(({ id }) => ids.has(id))
  })
  const messageListModel = computed<WebqqMessageListModel>(() => ({
    messages: messages.value,
    snapshot: snapshot.value,
    currentConversation: currentConversation.value,
    currentGroup: currentGroup.value,
    currentUserId: currentUserId.value,
    currentOperatorId: currentOperatorId.value,
    title: currentConversationTitle.value,
    avatar: currentGroup.value ? '' : currentBot.value?.avatar ?? '',
    avatarKind: currentGroup.value ? 'group' : 'bot',
    chatStyle: appearance.value.webQQChatStyle,
    hasMoreMessages: !!currentConversation.value?.hasMoreMessages,
    mediaSources: mediaSources.value,
    mediaLoadFailures: mediaLoadFailures.value,
  }))
  const composerModel = computed<WebqqComposerModel>(() => ({
    senders: composerSenders.value,
    currentOperatorId: composerSenderId.value,
    currentUserId: currentUserId.value,
    conversationId: currentConversation.value?.id,
    botId: currentBot.value?.id,
    snapshot: snapshot.value,
    accentColor: appearance.value.webQQAccentColor,
    externalError: errorMessage.value,
  }))
  const participantNames = computed(() => Object.fromEntries([
    ...snapshot.value.users.map(({ id, name }) => [id, name]),
    ...snapshot.value.bots.map(({ id, name }) => [id, name]),
  ]))
  const chatPaneModel = computed<WebqqChatPaneModel>(() => ({
    conversationId: currentConversation.value?.id,
    title: currentConversationTitle.value,
    subtitle: currentConversationSubtitle.value,
    avatar: currentGroup.value ? '' : currentBot.value?.avatar ?? '',
    avatarKind: currentGroup.value ? 'group' : 'bot',
    detailsVisible: detailsVisible.value,
    participantNames: participantNames.value,
    messageList: messageListModel.value,
    composer: composerModel.value,
  }))
  const detailsParticipants = computed(() => Object.fromEntries([
    ...snapshot.value.users.map(({ id, name, avatar }) => [id, { name, avatar, isBot: false }]),
    ...snapshot.value.bots.map(({ id, name, avatar }) => [id, { name, avatar, isBot: true }]),
  ]))
  const detailsPanelModel = computed<WebqqDetailsPanelModel>(() => ({
    view: currentView.value === 'profile' ? 'profile' : currentGroup.value ? 'group' : 'private',
    conversationId: currentConversation.value?.id,
    revision: snapshot.value.revision,
    counts: {
      users: snapshot.value.users.length,
      bots: snapshot.value.bots.length,
      groups: snapshot.value.groups.length,
      requests: snapshot.value.requests.length,
    },
    group: currentGroup.value,
    bot: currentBot.value,
    currentUserName: currentUser.value?.name,
    currentOperatorId: currentOperatorId.value,
    participants: detailsParticipants.value,
  }))
  const sidebarModel = computed<WebqqSidebarModel>(() => ({
    snapshot: snapshot.value,
    appearance: appearance.value,
    currentView: currentView.value,
    currentUserId: currentUserId.value,
    currentOperatorId: currentOperatorId.value,
    activeConversationId: activeConversationId.value,
  }))
  const overlayModel = computed(() => ({
    users: snapshot.value.users,
    bots: snapshot.value.bots,
    groups: snapshot.value.groups,
    accentColor: appearance.value.webQQAccentColor,
  }))
  const environmentModel = computed(() => snapshot.value)

  watch([currentUserId, () => currentConversation.value?.botId], ([userId, botId]) => {
    workspaceController.ensureOperator(userId, botId)
  })

  onMounted(() => workspaceController.load())

  watch(activeConversationId, () => {
    workspaceLayout.resetDetails()
  })

  watch(
    () => [currentUserId.value, ...messages.value.flatMap(({ media }) => media?.map(({ id }) => id) ?? [])].join(':'),
    () => void loadVisibleMedia(),
    { immediate: true },
  )

  async function manageEnvironment(input: ManageSandboxEnvironmentInput, resolve: Resolve, reject: Reject) {
    try {
      await workspaceController.manageEnvironment(input)
      resolve()
    } catch (error) {
      reject(error)
    }
  }

  async function performFriendAction(input: SandboxFriendAction) {
    errorMessage.value = ''
    try {
      await workspaceController.performFriendAction(input)
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '好友操作失败'
    }
  }

  async function performGroupAction(input: SandboxGroupAction) {
    errorMessage.value = ''
    try {
      await workspaceController.performGroupAction(input)
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '群组操作失败'
    }
  }

  function requestFriend(targetId: string) {
    return performFriendAction({ action: 'request', targetId, comment: '来自 OneBot Sandbox 的好友申请' })
  }

  async function handleSidebarNotification(requestId: string, approve: boolean, resolve: Resolve, reject: Reject) {
    try {
      await workspaceController.handleRelationshipRequest(requestId, approve)
      resolve()
    } catch (error) {
      reject(error)
    }
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
    if (group && conversation) return performGroupAction({ action: 'poke', groupId: group.id, targetId, conversationId: conversation.id })
  }

  function kickGroupMember(targetId: string) {
    const groupId = currentGroup.value?.id
    if (groupId) return performGroupAction({ action: 'kick', groupId, targetId })
  }

  function setGroupAdmin(targetId: string, enabled: boolean) {
    const groupId = currentGroup.value?.id
    if (groupId) return performGroupAction({ action: 'set-admin', groupId, targetId, enabled })
  }

  function transferGroupOwner(targetId: string) {
    const groupId = currentGroup.value?.id
    if (groupId) return performGroupAction({ action: 'transfer-owner', groupId, targetId })
  }

  function openGroupActionDialog(mode: 'card' | 'name', targetId = '', groupId = currentGroup.value?.id ?? '') {
    const value = mode === 'name'
      ? snapshot.value.groups.find(({ id }) => id === groupId)?.name ?? ''
      : getCurrentGroupMember(targetId)?.card ?? ''
    getOverlayHost()?.openGroupAction(mode, targetId, groupId, value)
  }

  async function saveGroupAction(
    input: { mode: 'card' | 'name', targetId: string, groupId: string, value: string },
    resolve: Resolve,
    reject: Reject,
  ) {
    errorMessage.value = ''
    try {
      if (input.mode === 'name') {
        await workspaceController.performGroupAction({ action: 'set-name', groupId: input.groupId, name: input.value })
      } else if (input.targetId) {
        await workspaceController.performGroupAction({ action: 'set-card', groupId: input.groupId, targetId: input.targetId, card: input.value })
      }
      resolve()
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '群组操作失败'
      reject(error)
    }
  }

  function pokeFriend(targetId: string) {
    const conversationId = currentConversation.value?.id
    if (conversationId) return performFriendAction({ action: 'poke', targetId, conversationId })
  }

  function deleteFriend(targetId: string) {
    return performFriendAction({ action: 'delete', targetId })
  }

  function openRemarkDialog(targetId: string) {
    const operatorId = currentOperatorId.value ?? ''
    const friendship = snapshot.value.friendships.find(({ participantIds }) => participantIds.includes(operatorId) && participantIds.includes(targetId))
    getOverlayHost()?.openRemark(targetId, friendship?.remarks[operatorId] ?? '')
  }

  async function saveFriendRemark(input: { targetId: string, remark: string }, resolve: Resolve, reject: Reject) {
    errorMessage.value = ''
    try {
      await workspaceController.performFriendAction({ action: 'set-remark', ...input })
      resolve()
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '好友操作失败'
      reject(error)
    }
  }

  function openEntityDialog(mode: EnvironmentDialogMode, target: { type: EnvironmentEntityType, id: string }) {
    getOverlayHost()?.openEntity(mode, target)
  }

  function selectConversation(conversationId: string) {
    workspaceController.selectConversation(conversationId)
  }

  function selectNavigation(view: SandboxWorkspaceView) {
    workspaceController.selectView(view)
  }

  function toggleDetails() {
    workspaceLayout.toggleDetails()
  }

  function closeDetails() {
    workspaceLayout.closeDetails()
  }

  function getBot(botId?: string) {
    return snapshot.value.bots.find(({ id }) => id === botId)
  }

  function getConversationTitle(conversation: SandboxConversation) {
    return snapshot.value.groups.find(({ id }) => id === conversation.groupId)?.name
      ?? getBot(conversation.botId)?.name
      ?? conversation.id
  }

  async function loadVisibleMedia() {
    if (!currentUserId.value) return
    const missingMedia = messages.value.flatMap(({ media }) => media ?? []).filter(({ id }) => !mediaSources.value[id])
    await Promise.all(missingMedia.map(async (media) => {
      try {
        const content = await workspaceController.getMediaContent(media.id)
        mediaSources.value = { ...mediaSources.value, [media.id]: `data:${content.mimeType};base64,${content.dataBase64}` }
        const { [media.id]: _, ...remainingFailures } = mediaLoadFailures.value
        mediaLoadFailures.value = remainingFailures
      } catch {
        mediaLoadFailures.value = { ...mediaLoadFailures.value, [media.id]: true }
      }
    }))
  }

  async function loadEarlierMessages(resolve: Resolve, reject: Reject) {
    const conversation = currentConversation.value
    const beforeMessageId = conversation?.messageIds[0]
    if (!conversation || !currentUser.value || !beforeMessageId) return resolve()
    errorMessage.value = ''
    try {
      await workspaceController.loadMessageHistory({ conversationId: conversation.id, beforeMessageId, limit: 50 })
      resolve()
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '读取历史消息失败'
      reject(error)
    }
  }

  async function sendComposerMessage(input: WebqqComposerSendIntent, resolve: Resolve, reject: Reject) {
    try {
      if (input.media) {
        await workspaceController.sendMediaMessage({
          senderId: input.senderId,
          botId: input.botId,
          conversationId: input.conversationId,
          fileName: input.media.fileName,
          mimeType: input.media.mimeType,
          dataBase64: input.media.dataBase64,
          content: input.content || undefined,
          replyToMessageId: input.replyToMessageId,
        })
      } else {
        await workspaceController.sendMessage({
          senderId: input.senderId,
          botId: input.botId,
          conversationId: input.conversationId,
          content: input.content,
          replyToMessageId: input.replyToMessageId,
        })
      }
      resolve()
    } catch (error) {
      reject(error)
    }
  }

  async function selectComposerOperator(participantId: string, resolve: Resolve, reject: Reject) {
    try {
      await workspaceController.selectOperator(participantId)
      workspaceLayout.resetDetails()
      resolve()
    } catch (error) {
      reject(error)
    }
  }

  function openComposerParticipantDialog(mode: EnvironmentDialogMode, entity: { type: 'user' | 'bot', id: string }) {
    openEntityDialog(mode, entity)
  }

  async function publishAnnouncement(content: string, resolve: Resolve, reject: Reject) {
    const group = currentGroup.value
    if (!group) return resolve()
    try {
      await workspaceController.setGroupAnnouncement({ groupId: group.id, content })
      resolve()
    } catch (error) {
      reject(error)
    }
  }

  async function deleteAnnouncement(announcementId: string, resolve: Resolve, reject: Reject) {
    const group = currentGroup.value
    if (!group) return resolve()
    try {
      await workspaceController.deleteGroupAnnouncement({ groupId: group.id, announcementId })
      resolve()
    } catch (error) {
      reject(error)
    }
  }

  return {
    appearance,
    chatPaneModel,
    closeDetails,
    currentView,
    deleteAnnouncement,
    deleteFriend,
    detailsPanelModel,
    detailsVisible,
    environmentModel,
    handleSidebarNotification,
    kickGroupMember,
    loadEarlierMessages,
    manageEnvironment,
    openComposerParticipantDialog,
    openEntityDialog,
    openGroupActionDialog,
    openRemarkDialog,
    overlayModel,
    performFriendAction,
    performGroupAction,
    pokeFriend,
    pokeGroupMember,
    publishAnnouncement,
    requestFriend,
    saveFriendRemark,
    saveGroupAction,
    selectComposerOperator,
    selectConversation,
    selectNavigation,
    sendComposerMessage,
    setGroupAdmin,
    sidebarModel,
    toggleDetails,
    transferGroupOwner,
  }
}
