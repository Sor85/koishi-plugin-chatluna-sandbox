import { computed, onMounted, ref, watch } from 'vue'
import type { WebqqChatPaneModel } from '../webqq-chat-pane.vue'
import type { WebqqComposerModel, WebqqComposerSendIntent, WebqqComposerSender } from '../webqq-composer.vue'
import type { WebqqDetailsPanelModel } from '../webqq-details-panel.vue'
import type { WebqqForwardTargetModel, WebqqForwardTargetOption } from '../webqq-forward-target-dialog.vue'
import type { WebqqMessageListModel } from '../webqq-message-list.vue'
import type { WebqqSidebarModel } from '../webqq-sidebar.vue'
import type {
  GetSandboxOneBotDebugRecordsInput,
  ManageSandboxEnvironmentInput,
  SandboxConversation,
  SandboxForward,
  SandboxFriendAction,
  SandboxGroupAction,
} from '../../src/types'
import { formatRecalledMessageEventText, getSandboxBots, getSandboxUsers, isRecalledMessage } from '../../src/types'
import type { SandboxWorkspaceView } from './workspace-state'
import type { FriendMenuState } from './friend-menu'
import { buildForwardPreviewMap } from './forward-preview'
import { formatMentionContent } from './mention'
import { getIncomingNotificationRequests } from './notification-requests'
import { buildGroupProfileCardModel, buildProfileCardModel } from './profile-card'
import { getConversationPeerId, getFriendDirectory, getGroupDirectory, getVisibleRecentConversations } from './relationship-directory'
import type { createWorkspaceController } from './workspace-controller'
import type { createWorkspaceLayout } from './workspace-layout'

type WorkspaceController = ReturnType<typeof createWorkspaceController>
type WorkspaceLayout = ReturnType<typeof createWorkspaceLayout>
type EnvironmentEntityType = 'user' | 'bot' | 'group'
type EnvironmentDialogMode = 'edit' | 'delete'
export type GroupActionMode = 'card' | 'name' | 'title'
type Resolve = () => void
type Reject = (error: unknown) => void

export interface WebqqWorkspaceOverlayHost {
  openEntity(mode: EnvironmentDialogMode, target: { type: EnvironmentEntityType, id: string }): void
  openGroupAction(mode: GroupActionMode, targetId: string, groupId: string, value: string): void
  openRemark(targetId: string, value: string): void
  openProfile(card: NonNullable<ReturnType<typeof buildProfileCardModel>>): void
}

export function createWebqqWorkspaceShell(
  workspaceController: WorkspaceController,
  workspaceLayout: WorkspaceLayout,
  getOverlayHost: () => WebqqWorkspaceOverlayHost | undefined,
) {
  const workspace = workspaceController.workspace
  const currentOperatorId = workspaceController.currentOperatorId
  const activeConversationId = workspaceController.activeConversationId
  const currentView = workspaceController.currentView
  const detailsVisible = workspaceLayout.detailsVisible
  const mediaSources = ref<Record<string, string>>({})
  const mediaLoadFailures = ref<Record<string, true>>({})
  const errorMessage = ref('')
  const debugLoading = ref(false)
  const debugError = ref('')
  const snapshot = computed(() => workspace.value.snapshot)
  const users = computed(() => getSandboxUsers(snapshot.value))
  const bots = computed(() => getSandboxBots(snapshot.value))
  const appearance = computed(() => workspace.value.appearance)
  const currentOperator = computed(() => snapshot.value.participants.find(({ id }) => id === currentOperatorId.value))
  const composerSenders = computed<WebqqComposerSender[]>(() => workspaceController.composer.value.participants
    .map((participant) => ({ ...participant, avatar: resolveAvatar(participant.avatar) })))
  const visibleConversations = computed<SandboxConversation[]>(() => workspaceController.sidebar.value.conversations
    .map((conversation) => ({ ...conversation, messageIds: [...conversation.messageIds] })))
  const currentConversation = computed(() => visibleConversations.value.find(({ id }) => id === activeConversationId.value))
  const currentPeerId = computed(() => currentConversation.value
    ? getConversationPeerId(currentConversation.value, currentOperatorId.value)
    : undefined)
  const currentBot = computed(() => getBot(currentPeerId.value))
  const currentPeer = computed(() => currentBot.value
    ?? users.value.find(({ id }) => id === currentPeerId.value))
  const currentGroup = computed(() => snapshot.value.groups.find(({ id }) => id === currentConversation.value?.groupId))
  const currentConversationTitle = computed(() => currentGroup.value?.name
    ?? currentPeer.value?.name
    ?? (currentConversation.value ? currentConversation.value.id : '选择一个会话'))
  const currentConversationSubtitle = computed(() => {
    if (currentGroup.value) return `群聊 ${currentGroup.value.id} · ${currentGroup.value.members.length} 人`
    if (currentBot.value) return '在线 · 虚拟 OneBot 机器人'
    return currentPeer.value ? '在线 · 好友' : '暂无会话'
  })
  const messages = computed(() => {
    const ids = new Set(currentConversation.value?.messageIds ?? [])
    return snapshot.value.messages.filter(({ id }) => ids.has(id))
  })
  const participants = computed(() => Object.fromEntries(snapshot.value.participants
    .map(({ id, name, avatar, kind }) => [id, { name, avatar: resolveAvatar(avatar), isBot: kind === 'bot' }])))
  const friendMenuStates = computed<Record<string, FriendMenuState>>(() => {
    const actorId = currentOperatorId.value
    if (!actorId) return {}
    return Object.fromEntries(Object.keys(participants.value).map((targetId) => [targetId, {
      isFriend: snapshot.value.friendships.some(({ participantIds }) => participantIds.includes(actorId) && participantIds.includes(targetId)),
      pendingOutgoing: snapshot.value.requests.some(({ type, requesterId, targetId: requestedId }) => type === 'friend' && requesterId === actorId && requestedId === targetId),
      pendingIncoming: snapshot.value.requests.some(({ type, requesterId, targetId: requestedId }) => type === 'friend' && requesterId === targetId && requestedId === actorId),
    }]))
  })
  const replyMessages = computed(() => Object.fromEntries(messages.value.flatMap(({ replyToMessageId }) => {
    if (!replyToMessageId) return []
    const reply = snapshot.value.messages.find(({ id }) => id === replyToMessageId)
    return reply ? [[reply.id, reply]] : []
  })))
  const forwardPreviews = computed(() => buildForwardPreviewMap(
    messages.value,
    // chat.forwards 是 DeepReadonly，预览投影只读节点内容，可安全降级为可变输入类型。
    workspaceController.chat.value.forwards as unknown as SandboxForward[],
  ))
  const messageListModel = computed<WebqqMessageListModel>(() => ({
    messages: messages.value,
    chatLunaStates: workspaceController.chat.value.chatLunaStates.map((state) => ({ ...state })),
    replyMessages: replyMessages.value,
    forwardPreviews: forwardPreviews.value,
    participants: participants.value,
    friendMenuStates: friendMenuStates.value,
    currentConversation: currentConversation.value,
    currentGroup: currentGroup.value,
    currentOperatorId: currentOperatorId.value,
    title: currentConversationTitle.value,
    avatar: resolveAvatar(currentGroup.value?.avatar ?? currentPeer.value?.avatar),
    avatarKind: currentGroup.value ? 'group' : currentBot.value ? 'bot' : 'user',
    hasMoreMessages: !!currentConversation.value?.hasMoreMessages,
    mediaSources: mediaSources.value,
    mediaLoadFailures: mediaLoadFailures.value,
    markRecalledMessages: appearance.value.webQQMarkRecalledMessages,
  }))
  const mentionCandidates = computed(() => {
    const group = currentGroup.value
    if (!group) return []
    return group.members.flatMap((member) => {
      const participant = participants.value[member.participantId]
      if (!participant) return []
      const displayName = member.card?.trim() || participant.name
      const keywords = member.card?.trim() && member.card.trim() !== participant.name
        ? [participant.name]
        : undefined
      return [{
        id: member.participantId,
        name: displayName,
        avatar: participant.avatar,
        kind: participant.isBot ? 'bot' as const : 'user' as const,
        keywords,
      }]
    })
  })
  const composerModel = computed<WebqqComposerModel>(() => ({
    senders: composerSenders.value,
    currentOperatorId: currentOperatorId.value,
    conversationId: currentConversation.value?.id,
    mentionCandidates: mentionCandidates.value,
    accentColor: appearance.value.webQQAccentColor,
    externalError: errorMessage.value,
  }))
  const participantNames = computed(() => Object.fromEntries([
    ...snapshot.value.participants.map(({ id, name }) => [id, name]),
  ]))
  const forwardTargets = computed<WebqqForwardTargetModel>(() => {
    const recent: WebqqForwardTargetOption[] = sidebarConversations.value.map((conversation) => ({
      conversationId: conversation.id,
      title: conversation.title,
      subtitle: conversation.preview,
      avatar: conversation.avatar,
      avatarKind: conversation.avatarKind,
    }))
    const friends: WebqqForwardTargetOption[] = getFriendDirectory(snapshot.value, currentOperatorId.value)
      .filter((entry) => entry.isFriend && entry.conversationId)
      .map((entry) => ({
        conversationId: entry.conversationId!,
        title: entry.displayName,
        subtitle: entry.status,
        avatar: resolveAvatar(entry.avatar),
        avatarKind: entry.isBot ? 'bot' as const : 'user' as const,
      }))
    const groups: WebqqForwardTargetOption[] = getGroupDirectory(snapshot.value, currentOperatorId.value)
      .filter((group) => !!group.member && group.conversationId)
      .map((group) => ({
        conversationId: group.conversationId!,
        title: group.name,
        subtitle: `群聊 ${group.id} · ${group.members.length} 人`,
        avatar: resolveAvatar(group.avatar),
        avatarKind: 'group' as const,
      }))
    return { recent, friends, groups }
  })
  const chatPaneModel = computed<WebqqChatPaneModel>(() => ({
    conversationId: currentConversation.value?.id,
    title: currentConversationTitle.value,
    subtitle: currentConversationSubtitle.value,
    avatar: resolveAvatar(currentGroup.value?.avatar ?? currentPeer.value?.avatar),
    avatarKind: currentGroup.value ? 'group' : currentBot.value ? 'bot' : 'user',
    profileParticipantId: currentGroup.value ? undefined : currentPeer.value?.id,
    profileGroupId: currentGroup.value?.id,
    detailsVisible: detailsVisible.value,
    participantNames: participantNames.value,
    messageList: messageListModel.value,
    composer: composerModel.value,
    forwardTargets: forwardTargets.value,
  }))
  const detailsPanelModel = computed<WebqqDetailsPanelModel>(() => ({
    view: currentView.value === 'profile' ? 'profile' : currentGroup.value ? 'group' : 'private',
    conversationId: currentConversation.value?.id,
    revision: snapshot.value.revision,
    counts: {
      users: users.value.length,
      bots: bots.value.length,
      groups: snapshot.value.groups.length,
      requests: snapshot.value.requests.length,
    },
    group: currentGroup.value,
    bot: currentBot.value,
    privateParticipant: currentPeer.value ? {
      id: currentPeer.value.id,
      name: currentPeer.value.name,
      avatar: resolveAvatar(currentPeer.value.avatar),
      isBot: !!currentBot.value,
      personalNote: currentPeer.value.profile?.personalNote,
    } : undefined,
    currentOperatorName: currentOperator.value?.name,
    currentOperatorId: currentOperatorId.value,
    persistence: workspace.value.persistence,
    participants: participants.value,
  }))
  const sidebarConversations = computed(() => getVisibleRecentConversations(
    visibleConversations.value,
  ).map((conversation) => {
    const group = conversation.type === 'group'
      ? snapshot.value.groups.find(({ id }) => id === conversation.groupId)
      : undefined
    const peerId = getConversationPeerId(conversation, currentOperatorId.value)
    const bot = getBot(peerId)
    const peer = bot ?? users.value.find(({ id }) => id === peerId)
    const messageIds = new Set(conversation.messageIds)
    const latestMessage = snapshot.value.messages.filter(({ id }) => messageIds.has(id)).at(-1)
    const actorRole = group?.members.find(({ participantId }) => participantId === currentOperatorId.value)?.role
    const latestPreview = (() => {
      if (!latestMessage) return '开始一段新对话'
      if (isRecalledMessage(latestMessage)) {
        const operatorId = latestMessage.lifecycle.operatorId
        const operatorName = participantNames.value[operatorId] ?? operatorId
        return formatRecalledMessageEventText(latestMessage, operatorName)
      }
      return formatMentionContent(latestMessage.content, participantNames.value)
    })()
    return {
      id: conversation.id,
      groupId: group?.id,
      title: group?.name ?? peer?.name ?? conversation.id,
      avatar: resolveAvatar(group?.avatar ?? peer?.avatar),
      avatarKind: group ? 'group' as const : bot ? 'bot' as const : 'user' as const,
      preview: latestPreview,
      time: latestMessage?.createdAt
        ? new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date(latestMessage.createdAt))
        : '',
      actorRole,
      entityTarget: group
        ? { type: 'group' as const, id: group.id }
        : { type: bot ? 'bot' as const : 'user' as const, id: peerId ?? '' },
      entityLabel: group ? '群组' as const : bot ? '机器人' as const : '用户' as const,
    }
  }))
  const sidebarModel = computed<WebqqSidebarModel>(() => ({
    appearance: appearance.value,
    currentView: currentView.value,
    activeConversationId: activeConversationId.value,
    currentGroupId: currentGroup.value?.id,
    currentGroupMemberIds: currentGroup.value?.members.map(({ participantId }) => participantId) ?? [],
    currentOperator: currentOperator.value ? { ...currentOperator.value, avatar: resolveAvatar(currentOperator.value.avatar) } : undefined,
    bots: bots.value.map((bot) => ({ ...bot, avatar: resolveAvatar(bot.avatar) })),
    conversations: sidebarConversations.value,
    friends: getFriendDirectory(snapshot.value, currentOperatorId.value).map((entry) => ({
      ...entry,
      avatar: resolveAvatar(entry.avatar),
    })),
    groups: getGroupDirectory(snapshot.value, currentOperatorId.value).map((group) => ({
      ...group,
      avatar: resolveAvatar(group.avatar),
    })),
    notificationRequests: getIncomingNotificationRequests(snapshot.value, currentOperatorId.value),
    participants: participants.value,
    groupNames: Object.fromEntries(snapshot.value.groups.map(({ id, name }) => [id, name])),
  }))
  const overlayModel = computed(() => ({
    users: users.value.map((user) => ({ ...user, avatar: resolveAvatar(user.avatar) })),
    bots: bots.value.map((bot) => ({ ...bot, avatar: resolveAvatar(bot.avatar) })),
    groups: snapshot.value.groups.map((group) => ({ ...group, avatar: resolveAvatar(group.avatar) })),
    accentColor: appearance.value.webQQAccentColor,
  }))
  const environmentModel = computed(() => ({
    ...snapshot.value,
    participants: snapshot.value.participants.map((participant) => ({
      ...participant,
      avatar: resolveAvatar(participant.avatar),
    })),
    groups: snapshot.value.groups.map((group) => ({
      ...group,
      avatar: resolveAvatar(group.avatar),
    })),
  }))
  const debugWorkspaceModel = computed(() => ({
    records: workspaceController.oneBotDebugRecords.value,
    loading: debugLoading.value,
    error: debugError.value,
  }))

  onMounted(() => workspaceController.load())

  watch(activeConversationId, () => {
    workspaceLayout.resetDetails()
  })

  watch(
    () => [
      currentOperatorId.value,
      ...messages.value.flatMap(({ media }) => media?.map(({ id }) => id) ?? []),
      ...(snapshot.value.forwards ?? []).flatMap(({ nodes }) => nodes.flatMap(({ media }) => media?.map(({ id }) => id) ?? [])),
      ...snapshot.value.participants.map(({ avatar }) => avatar ?? ''),
      ...snapshot.value.groups.map(({ avatar }) => avatar ?? ''),
    ].join(':'),
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

  function openGroupActionDialog(mode: GroupActionMode, targetId = '', groupId = currentGroup.value?.id ?? '') {
    const member = getCurrentGroupMember(targetId)
    const value = mode === 'name'
      ? snapshot.value.groups.find(({ id }) => id === groupId)?.name ?? ''
      : mode === 'title' ? member?.title ?? '' : member?.card ?? ''
    getOverlayHost()?.openGroupAction(mode, targetId, groupId, value)
  }

  async function saveGroupAction(
    input: { mode: GroupActionMode, targetId: string, groupId: string, value: string },
    resolve: Resolve,
    reject: Reject,
  ) {
    errorMessage.value = ''
    try {
      if (input.mode === 'name') {
        await workspaceController.performGroupAction({ action: 'set-name', groupId: input.groupId, name: input.value })
      } else if (input.targetId && input.mode === 'title') {
        await workspaceController.performGroupAction({ action: 'set-title', groupId: input.groupId, targetId: input.targetId, title: input.value })
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

  async function recallMessage(messageId: string) {
    const conversationId = currentConversation.value?.id
    if (!conversationId) return
    errorMessage.value = ''
    try {
      await workspaceController.recallMessage({ conversationId, messageId })
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '撤回失败'
    }
  }

  async function setMessageReaction(messageId: string, emojiId: string, enabled: boolean) {
    errorMessage.value = ''
    try {
      await workspaceController.setMessageReaction({ messageId, emojiId, enabled })
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '贴表情失败'
    }
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

  function openProfile(participantId: string) {
    const card = buildProfileCardModel({
      snapshot: snapshot.value,
      participantId,
      viewerId: currentOperatorId.value,
      groupId: currentGroup.value?.id,
    })
    if (card) getOverlayHost()?.openProfile({ ...card, avatar: resolveAvatar(card.avatar) })
  }

  function openGroupProfile(groupId: string) {
    const group = snapshot.value.groups.find(({ id }) => id === groupId)
    if (group) {
      const card = buildGroupProfileCardModel(group)
      getOverlayHost()?.openProfile({ ...card, avatar: resolveAvatar(card.avatar) })
    }
  }

  function selectConversation(conversationId: string) {
    workspaceController.selectConversation(conversationId)
  }

  function selectNavigation(view: SandboxWorkspaceView) {
    workspaceController.selectView(view)
    if (view === 'debug') void loadOneBotDebugRecords()
  }

  async function loadOneBotDebugRecords(input: GetSandboxOneBotDebugRecordsInput = {}) {
    debugLoading.value = true
    debugError.value = ''
    try {
      await workspaceController.loadOneBotDebugRecords(input)
    } catch (error) {
      debugError.value = error instanceof Error ? error.message : '读取 OneBot 调试记录失败'
    } finally {
      debugLoading.value = false
    }
  }

  async function clearOneBotDebugRecords() {
    debugLoading.value = true
    debugError.value = ''
    try {
      await workspaceController.clearOneBotDebugRecords()
    } catch (error) {
      debugError.value = error instanceof Error ? error.message : '清理 OneBot 调试记录失败'
    } finally {
      debugLoading.value = false
    }
  }

  function toggleDetails() {
    workspaceLayout.toggleDetails()
  }

  function closeDetails() {
    workspaceLayout.closeDetails()
  }

  function getBot(botId?: string) {
    return bots.value.find(({ id }) => id === botId)
  }

  function resolveAvatar(reference?: string) {
    const id = reference?.match(/^sandbox-media:\/\/([a-f0-9]{32})$/)?.[1]
    return id ? mediaSources.value[id] ?? '' : reference ?? ''
  }

  async function loadVisibleMedia() {
    if (!currentOperatorId.value) return
    const messageIds = messages.value.flatMap(({ media }) => media?.map(({ id }) => id) ?? [])
    // 合并转发详情弹窗可能挂着嵌套资源媒体；按本地已缓存 forwards 一并预取。
    const forwardMediaIds = (snapshot.value.forwards ?? []).flatMap(({ nodes }) => nodes.flatMap(({ media }) => media?.map(({ id }) => id) ?? []))
    const avatarIds = [...snapshot.value.participants.map(({ avatar }) => avatar), ...snapshot.value.groups.map(({ avatar }) => avatar)]
      .flatMap((reference) => reference?.match(/^sandbox-media:\/\/([a-f0-9]{32})$/)?.[1] ?? [])
    const missingIds = [...new Set([...messageIds, ...forwardMediaIds, ...avatarIds])].filter((id) => !mediaSources.value[id])
    await Promise.all(missingIds.map(async (mediaId) => {
      try {
        const content = await workspaceController.getMediaContent(mediaId)
        mediaSources.value = { ...mediaSources.value, [mediaId]: `data:${content.mimeType};base64,${content.dataBase64}` }
        const { [mediaId]: _, ...remainingFailures } = mediaLoadFailures.value
        mediaLoadFailures.value = remainingFailures
      } catch {
        mediaLoadFailures.value = { ...mediaLoadFailures.value, [mediaId]: true }
      }
    }))
  }

  async function loadEarlierMessages(resolve: Resolve, reject: Reject) {
    const conversation = currentConversation.value
    const beforeMessageId = conversation?.messageIds[0]
    if (!conversation || !currentOperator.value || !beforeMessageId) return resolve()
    errorMessage.value = ''
    try {
      await workspaceController.loadMessageHistory({ conversationId: conversation.id, beforeMessageId, limit: 50 })
      resolve()
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '读取历史消息失败'
      reject(error)
    }
  }

  // 搜索只返回摘要；定位旧消息仍走 loadEarlierMessages 循环加载。
  async function searchConversationMessages(
    input: { conversationId: string, query: string, beforeMessageId?: string, limit?: number },
    resolve: (result: Awaited<ReturnType<WorkspaceController['searchConversationMessages']>>) => void,
    reject: Reject,
  ) {
    errorMessage.value = ''
    try {
      resolve(await workspaceController.searchConversationMessages(input))
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '搜索会话消息失败'
      reject(error)
    }
  }

  async function sendComposerMessage(input: WebqqComposerSendIntent, resolve: Resolve, reject: Reject) {
    try {
      if (input.media?.length) {
        await workspaceController.sendMediaMessage({
          conversationId: input.conversationId,
          media: input.media,
          content: input.content || undefined,
          replyToMessageId: input.replyToMessageId,
        })
      } else {
        await workspaceController.sendMessage({
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

  // Phase D 多选目标确认后由 chat-pane 调用；选择态仍由 chat-pane 本地持有。
  async function sendForwardMessage(
    input: { conversationId: string; messageIds?: string[] },
    resolve: Resolve,
    reject: Reject,
  ) {
    errorMessage.value = ''
    try {
      await workspaceController.sendForwardMessage(input)
      resolve()
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '合并转发失败'
      reject(error)
    }
  }

  async function getForwardMessage(
    input: { forwardId?: string; messageId?: string },
    resolve: (forward: Awaited<ReturnType<WorkspaceController['getForwardMessage']>>) => void,
    reject: Reject,
  ) {
    try {
      resolve(await workspaceController.getForwardMessage(input))
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '读取合并转发失败'
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
    clearOneBotDebugRecords,
    closeDetails,
    currentView,
    deleteAnnouncement,
    deleteFriend,
    detailsPanelModel,
    detailsVisible,
    debugWorkspaceModel,
    environmentModel,
    handleSidebarNotification,
    kickGroupMember,
    loadEarlierMessages,
    searchConversationMessages,
    loadOneBotDebugRecords,
    manageEnvironment,
    openComposerParticipantDialog,
    openEntityDialog,
    openGroupActionDialog,
    openGroupProfile,
    openProfile,
    openRemarkDialog,
    overlayModel,
    performFriendAction,
    performGroupAction,
    pokeFriend,
    pokeGroupMember,
    publishAnnouncement,
    recallMessage,
    setMessageReaction,
    requestFriend,
    resolveAvatar,
    saveFriendRemark,
    saveGroupAction,
    selectComposerOperator,
    selectConversation,
    selectNavigation,
    sendComposerMessage,
    sendForwardMessage,
    getForwardMessage,
    setGroupAdmin,
    sidebarModel,
    toggleDetails,
    transferGroupOwner,
  }
}
