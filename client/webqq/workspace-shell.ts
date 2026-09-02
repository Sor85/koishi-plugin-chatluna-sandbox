import { computed, onMounted, ref, watch } from 'vue'
import type { WebqqChatPaneModel } from '#client/webqq-chat-pane.vue'
import type { WebqqComposerModel, WebqqComposerSendIntent, WebqqComposerSender } from '#client/webqq-composer.vue'
import type { WebqqDetailsPanelModel } from '#client/webqq-details-panel.vue'
import type { WebqqForwardTargetModel, WebqqForwardTargetOption } from '#client/webqq-forward-target-dialog.vue'
import type { WebqqMessageListModel } from '#client/webqq-message-list.vue'
import type { WebqqSidebarModel } from '#client/webqq-sidebar.vue'
import type { ListSandboxTestCallRecordsInput } from '../../src/mcp/call-records'
import { readConversationMessageIds, type ResolvedConversation } from '../../src/conversation-resolution'
import type {
  GetSandboxOneBotDebugRecordInput,
  GetSandboxOneBotDebugRecordsInput,
  ManageSandboxEnvironmentInput,
  SandboxForward,
  SandboxFriendAction,
  SandboxGroupAction,
  SandboxMessageModelRequestReference,
  SearchConversationMessagesInput,
} from '../../src/types'
import { getSandboxBots, getSandboxUsers } from '../../src/types'
import type { SandboxWorkspaceView } from './workspace-state'
import type { FriendMenuState } from './friend-menu'
import { buildConversationTree, toRecentForwardTargets } from './conversation-tree'
import { buildForwardPreviewMap } from './forward-preview'
import { buildMessageCapabilityMap } from './message-capabilities'
import { getIncomingNotificationRequests } from './notification-requests'
import { buildGroupProfileCardModel, buildProfileCardModel } from './profile-card'
import { getConversationPeerId, getFriendDirectory, getGroupDirectory } from './relationship-directory'
import type { createWorkspaceController } from './workspace-controller'
import type { createWorkspaceLayout } from './workspace-layout'
import type {
  ClearModelRequestRecordsQuery,
  ModelRequestRecordQuery,
  ModelRequestRecordsQuery,
  ModelRequestTrajectoryQuery,
} from './model-request-query'
import type {
  LocateSandboxPresetExpressionInput,
  LocateSandboxPresetExpressionResult,
  ReadSandboxPresetInput,
} from '../../src/presets'
import type { CreatePresetInput, DeletePresetInput, RenamePresetInput, SavePresetInput } from '../../src/presets'
import {
  createEvidenceNavigation,
  type PresetOriginSnapshot,
} from './evidence-navigation'
import { createErrorSlot } from './error-slot'
import { createRegionReadGate } from './region-read-gate'
import { createPresetDirtyGuard } from './preset-dirty-guard'

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
  openConversationRename(conversationId: string, value: string): void
  openProfile(card: NonNullable<ReturnType<typeof buildProfileCardModel>>): void
}

export function createWebqqWorkspaceShell(
  workspaceController: WorkspaceController,
  workspaceLayout: WorkspaceLayout,
  getOverlayHost: () => WebqqWorkspaceOverlayHost | undefined,
  getActiveSpaceId: () => string | undefined = () => undefined,
) {
  const workspace = workspaceController.workspace
  const currentOperatorId = workspaceController.currentOperatorId
  const activeConversationId = workspaceController.activeConversationId
  const currentView = workspaceController.currentView
  const detailsVisible = workspaceLayout.detailsVisible
  const mediaSources = ref<Record<string, string>>({})
  const mediaLoadFailures = ref<Record<string, true>>({})
  // 操作那一族共用一个全局错误位，唯一的消费方是发送控件上的外部错误字段。
  // 「后一次操作的错误覆盖前一次」因此是它的可观察语义，本轮原样保留。
  const actionErrorSlot = createErrorSlot()
  const errorMessage = actionErrorSlot.error
  // 四个区域各有一个错误位，区域内的进行中通道共用它——这是今天的行为。三个区域各声明列表与
  // 详情两条通道；预设没有详情通道，读目录与读单个预设共用 `read`，另有一条保存通道。
  // 四个区域的形状差异因此写在这几行声明上，而不是表现为「少了一个引用」。
  const debugErrorSlot = createErrorSlot()
  const debugGate = createRegionReadGate(debugErrorSlot, ['list', 'detail'])
  const testCallErrorSlot = createErrorSlot()
  const testCallGate = createRegionReadGate(testCallErrorSlot, ['list', 'detail'])
  const modelRequestErrorSlot = createErrorSlot()
  const modelRequestGate = createRegionReadGate(modelRequestErrorSlot, ['list', 'detail'])
  const presetErrorSlot = createErrorSlot()
  const presetGate = createRegionReadGate(presetErrorSlot, ['read', 'save'])
  const debugVisitKey = ref(0)
  const testCallVisitKey = ref(0)
  const modelRequestVisitKey = ref(0)
  const presetDirtyGuard = createPresetDirtyGuard()
  const presetDiscardGuard = ref(presetDirtyGuard.peek())
  // 跨视图往返的全部决策与四个一次性触发编号都在证据导航 module 里；这里不再镜像任何状态。
  const evidenceNavigation = createEvidenceNavigation()
  const snapshot = computed(() => workspace.value.snapshot)
  const users = computed(() => getSandboxUsers(snapshot.value))
  const bots = computed(() => getSandboxBots(snapshot.value))
  const appearance = computed(() => workspace.value.appearance)
  const currentOperator = computed(() => snapshot.value.participants.find(({ id }) => id === currentOperatorId.value))
  const composerSenders = computed<WebqqComposerSender[]>(() => workspaceController.composer.value.participants
    .map((participant) => ({ ...participant, avatar: resolveAvatar(participant.avatar) })))
  const visibleConversations = computed<readonly ResolvedConversation[]>(() => workspaceController.sidebar.value.conversations)
  const currentConversation = computed(() => visibleConversations.value.find(({ id }) => id === activeConversationId.value))
  const currentPeerId = computed(() => currentConversation.value
    ? getConversationPeerId(currentConversation.value, currentOperatorId.value)
    : undefined)
  const currentBot = computed(() => getBot(currentPeerId.value))
  const currentPeer = computed(() => currentBot.value
    ?? users.value.find(({ id }) => id === currentPeerId.value))
  const currentGroup = computed(() => snapshot.value.groups.find(({ id }) => id === currentConversation.value?.groupId))
  const presetEvidenceContext = computed(() => ({
    scope: activeSpaceIdScope(),
  }))
  const currentRootTitle = computed(() => currentGroup.value?.name
    ?? currentPeer.value?.name
    ?? (currentConversation.value ? currentConversation.value.id : '选择一个会话'))
  // 会话实例有自己的名字；根会话的名字由参与者关系决定，实例名不覆盖它。
  const currentConversationTitle = computed(() => currentConversation.value?.title ?? currentRootTitle.value)
  const currentConversationSubtitle = computed(() => {
    const instanceOf = currentConversation.value?.kind === 'instance' ? `${currentRootTitle.value} · ` : ''
    if (currentGroup.value) return `${instanceOf}群聊 ${currentGroup.value.id} · ${currentGroup.value.members.length} 人`
    if (currentBot.value) return `${instanceOf}在线 · 虚拟 OneBot 机器人`
    return currentPeer.value ? `${instanceOf}在线 · 好友` : '暂无会话'
  })
  const messages = computed(() => {
    const conversation = currentConversation.value
    const ids = new Set(conversation ? readConversationMessageIds(snapshot.value, conversation.id) : [])
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
  // 「这条消息能做什么」由共享判据回答一次，菜单只渲染它；客户端不再自己推导。
  const messageCapabilities = computed(() => buildMessageCapabilityMap({
    messages: messages.value,
    conversation: currentConversation.value,
    operatorId: currentOperatorId.value,
    group: currentGroup.value,
  }))
  const messageListModel = computed<WebqqMessageListModel>(() => ({
    messages: messages.value,
    chatLunaStates: workspaceController.chat.value.chatLunaStates.map((state) => ({ ...state })),
    replyMessages: replyMessages.value,
    forwardPreviews: forwardPreviews.value,
    messageCapabilities: messageCapabilities.value,
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
    markRecalledMessages: appearance.value.sandboxMarkRecalledMessages,
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
    accentColor: appearance.value.sandboxAccentColor,
    // page.vue 会用 Koishi 已解析的响应式明暗模式覆盖此值；这里仍提供确定值，保证基础模型契约完整。
    colorMode: appearance.value.sandboxColorMode === 'dark' ? 'dark' : 'light',
    externalError: errorMessage.value,
  }))
  const participantNames = computed(() => Object.fromEntries([
    ...snapshot.value.participants.map(({ id, name }) => [id, name]),
  ]))
  const forwardTargets = computed<WebqqForwardTargetModel>(() => {
    // 「最近」一列由会话树的结果派生，不是另投一次：改会话树的预览口径时这一列跟着变。
    const recent: WebqqForwardTargetOption[] = toRecentForwardTargets(sidebarConversations.value)
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
  // 会话树的投影口径住在 conversation-tree module 里；外壳只负责把场景与头像解析喂给它。
  const sidebarConversations = computed(() => buildConversationTree({
    scene: snapshot.value,
    conversations: visibleConversations.value,
    operatorId: currentOperatorId.value,
    resolveAvatar,
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
    accentColor: appearance.value.sandboxAccentColor,
  }))
  const debugWorkspaceModel = computed(() => ({
    records: workspaceController.oneBotDebugRecords.value,
    detail: workspaceController.oneBotDebugRecord.value,
    loading: debugGate.loading.list.value,
    detailLoading: debugGate.loading.detail.value,
    error: debugGate.error.value,
  }))
  const testCallWorkspaceModel = computed(() => ({
    records: workspaceController.testCallRecords.value,
    detail: workspaceController.testCallRecord.value,
    loading: testCallGate.loading.list.value,
    detailLoading: testCallGate.loading.detail.value,
    error: testCallGate.error.value,
  }))
  const modelRequestWorkspaceModel = computed(() => ({
    records: workspaceController.modelRequestRecords.value,
    detail: workspaceController.modelRequestRecord.value,
    hasMore: workspaceController.modelRequestRecordsPage.value.hasMore,
    nextCursor: workspaceController.modelRequestRecordsPage.value.nextCursor,
    nextCreatedAt: workspaceController.modelRequestRecordsPage.value.nextCreatedAt,
    nextId: workspaceController.modelRequestRecordsPage.value.nextId,
    trajectory: workspaceController.modelRequestTrajectory.value,
    loading: modelRequestGate.loading.list.value,
    detailLoading: modelRequestGate.loading.detail.value,
    error: modelRequestGate.error.value,
  }))
  const presetWorkspaceModel = computed(() => ({
    catalog: workspaceController.presetCatalog.value,
    document: workspaceController.presetDocument.value,
    loading: presetGate.loading.read.value,
    saving: presetGate.loading.save.value,
    error: presetGate.error.value,
    evidenceContext: presetEvidenceContext.value,
  }))

  onMounted(async () => {
    await workspaceController.load()
    // 视图会从本地偏好直接恢复为独立页，此路径不会触发侧栏点击处理器；
    // 必须在工作区恢复后主动读取，否则重启后的首屏会一直显示空状态。
    if (currentView.value === 'debug') debugVisitKey.value += 1
    if (currentView.value === 'test-calls') testCallVisitKey.value += 1
    if (currentView.value === 'presets') await loadPresetCatalog()
  })

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

  /** 新建会话实例。失败走界面既有的错误展示路径，不落进浏览器控制台。 */
  async function createConversationInstance(rootConversationId: string) {
    await actionErrorSlot.run('创建会话失败', () => workspaceController.createConversationInstance({ rootConversationId }))
  }

  /** 从当前会话的某条消息分叉出一个会话实例。 */
  async function branchConversationInstance(messageId: string) {
    const conversationId = currentConversation.value?.id
    if (!conversationId) return
    await actionErrorSlot.run('创建会话分支失败', () => workspaceController.branchConversationInstance({ conversationId, messageId }))
  }

  /** 重命名会话实例：对话框预填当前名字，只有实例才有名字可改。 */
  function openConversationRenameDialog(conversationId: string) {
    const conversation = visibleConversations.value.find(({ id }) => id === conversationId)
    if (conversation?.kind !== 'instance') return
    getOverlayHost()?.openConversationRename(conversationId, conversation.title ?? '')
  }

  async function saveConversationRename(input: { conversationId: string, title: string }, resolve: Resolve, reject: Reject) {
    try {
      await actionErrorSlot.runOrThrow('重命名会话失败', () => workspaceController.renameConversationInstance(input))
      resolve()
    } catch (error) {
      reject(error)
    }
  }

  /** 删除会话实例：领域删除，连带清掉它的消息，刷新后不会回来。 */
  async function deleteConversationInstance(conversationId: string) {
    await actionErrorSlot.run('删除会话失败', () => workspaceController.deleteConversationInstance({ conversationId }))
  }

  async function manageEnvironment(input: ManageSandboxEnvironmentInput, resolve: Resolve, reject: Reject) {
    try {
      await workspaceController.manageEnvironment(input)
      resolve()
    } catch (error) {
      reject(error)
    }
  }

  async function performFriendAction(input: SandboxFriendAction) {
    await actionErrorSlot.run('好友操作失败', () => workspaceController.performFriendAction(input))
  }

  async function performGroupAction(input: SandboxGroupAction) {
    await actionErrorSlot.run('群组操作失败', () => workspaceController.performGroupAction(input))
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
    try {
      await actionErrorSlot.runOrThrow('群组操作失败', async () => {
        if (input.mode === 'name') {
          await workspaceController.performGroupAction({ action: 'set-name', groupId: input.groupId, name: input.value })
        } else if (input.targetId && input.mode === 'title') {
          await workspaceController.performGroupAction({ action: 'set-title', groupId: input.groupId, targetId: input.targetId, title: input.value })
        } else if (input.targetId) {
          await workspaceController.performGroupAction({ action: 'set-card', groupId: input.groupId, targetId: input.targetId, card: input.value })
        }
      })
      resolve()
    } catch (error) {
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
    await actionErrorSlot.run('撤回失败', () => workspaceController.recallMessage({ conversationId, messageId }))
  }

  async function clearConversationMessages() {
    const conversationId = currentConversation.value?.id
    if (!conversationId) return
    await actionErrorSlot.run('清空会话记录失败', () => workspaceController.clearConversationMessages({ conversationId }))
  }

  async function setMessageReaction(messageId: string, emojiId: string, enabled: boolean) {
    const conversationId = currentConversation.value?.id
    if (!conversationId) return
    // 带上当前会话，服务端才能判定目标是不是继承前缀：分支里那一段与原会话共享同一份记录，只读。
    await actionErrorSlot.run('贴表情失败', () => workspaceController.setMessageReaction({ conversationId, messageId, emojiId, enabled }))
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
    try {
      await actionErrorSlot.runOrThrow('好友操作失败', () => workspaceController.performFriendAction({ action: 'set-remark', ...input }))
      resolve()
    } catch (error) {
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
    if (currentView.value === 'presets' && !presetDirtyGuard.request({ action: 'leave', targetView: 'messages', conversationId })) {
      presetDiscardGuard.value = presetDirtyGuard.peek()
      return
    }
    if (currentView.value === 'model-requests') evidenceNavigation.clear()
    workspaceController.selectConversation(conversationId)
  }

  function selectNavigation(view: SandboxWorkspaceView, commit = true) {
    if (currentView.value === 'presets' && view !== 'presets' && !presetDirtyGuard.request({ action: 'leave', targetView: view })) {
      presetDiscardGuard.value = presetDirtyGuard.peek()
      return false
    }
    if (!commit) return true
    if (view !== 'model-requests') evidenceNavigation.clear()
    workspaceController.selectView(view)
    if (view === 'debug') debugVisitKey.value += 1
    if (view === 'test-calls') testCallVisitKey.value += 1
    if (view === 'model-requests') modelRequestVisitKey.value += 1
    if (view === 'presets') void loadPresetCatalog()
    return true
  }

  function updatePresetDirty(dirty: boolean) {
    presetDirtyGuard.update(dirty)
    presetDiscardGuard.value = presetDirtyGuard.peek()
  }

  function cancelPresetDiscard() {
    presetDirtyGuard.cancel()
    presetDiscardGuard.value = presetDirtyGuard.peek()
  }

  function confirmPresetDiscard() {
    const request = presetDirtyGuard.discard()
    presetDiscardGuard.value = presetDirtyGuard.peek()
    if (request?.action !== 'leave') return
    if (request.conversationId) {
      workspaceController.selectConversation(request.conversationId)
      return
    }
    if (request.targetView) selectNavigation(request.targetView)
  }

  function activeSpaceIdScope() {
    const spaceId = getActiveSpaceId()
    return spaceId ? { scope: 'space' as const, spaceId } : { scope: 'main' as const }
  }

  async function loadOneBotDebugRecords(input: GetSandboxOneBotDebugRecordsInput = {}) {
    await debugGate.read('list', '读取 OneBot 调试记录失败', () => workspaceController.loadOneBotDebugRecords(input))
  }

  async function loadOneBotDebugRecord(input: GetSandboxOneBotDebugRecordInput & { spaceId?: string }) {
    await debugGate.read('detail', '读取 OneBot 调试详情失败', () => workspaceController.loadOneBotDebugRecord(input))
  }

  async function loadTestCallRecords(input: ListSandboxTestCallRecordsInput = {}) {
    await testCallGate.read('list', '读取测试调用记录失败', () => workspaceController.loadTestCallRecords(input))
  }

  async function loadTestCallRecord(input: { recordId: string }) {
    await testCallGate.read('detail', '读取测试调用详情失败', () => workspaceController.loadTestCallRecord(input))
  }

  async function clearTestCallRecords() {
    await testCallGate.read('list', '清理测试调用记录失败', () => workspaceController.clearTestCallRecords())
  }

  async function clearOneBotDebugRecords() {
    await debugGate.read('list', '清理 OneBot 调试记录失败', () => workspaceController.clearOneBotDebugRecords())
  }

  async function loadModelRequestRecords(input: ModelRequestRecordsQuery, mode: 'replace' | 'append' = 'replace') {
    await modelRequestGate.read('list', '读取模型请求记录失败', () => workspaceController.loadModelRequestRecords(input, mode))
  }

  async function loadMoreModelRequestRecords(input: ModelRequestRecordsQuery) {
    return loadModelRequestRecords(input, 'append')
  }

  async function loadModelRequestRecord(input: ModelRequestRecordQuery) {
    return modelRequestGate.readOrThrow('detail', '读取模型请求详情失败', () => workspaceController.loadModelRequestRecord(input))
  }

  async function loadModelRequestTrajectory(input: ModelRequestTrajectoryQuery) {
    await modelRequestGate.read('detail', '读取模型请求轨迹失败', () => workspaceController.loadModelRequestTrajectory(input))
  }

  async function clearModelRequestRecords(input: ClearModelRequestRecordsQuery) {
    await modelRequestGate.read('list', '清理模型请求记录失败', () => workspaceController.clearModelRequestRecords(input))
  }

  async function loadPresetCatalog() {
    await presetGate.read('read', '读取预设目录失败', () => workspaceController.loadPresetCatalog())
  }

  async function readPreset(input: ReadSandboxPresetInput) {
    return presetGate.readOrThrow('read', '读取预设失败', () => workspaceController.readPreset(input))
  }

  async function runPresetMutation<T>(operation: () => Promise<T>) {
    return presetGate.readOrThrow('save', '预设操作失败', operation)
  }

  const createPreset = (input: CreatePresetInput) => runPresetMutation(() => workspaceController.createPreset(input))
  const savePreset = (input: SavePresetInput) => runPresetMutation(async () => {
    const result = await workspaceController.savePreset(input)
    updatePresetDirty(false)
    return result
  })
  const renamePreset = (input: RenamePresetInput) => runPresetMutation(() => workspaceController.renamePreset(input))
  const deletePreset = (input: DeletePresetInput) => runPresetMutation(() => workspaceController.deletePreset(input))

  async function locatePresetExpression(input: LocateSandboxPresetExpressionInput) {
    // 定位不展示进行中：它今天没有进度通道，因此直接用区域错误位而不是经闸门。
    return presetErrorSlot.runOrThrow('定位预设表达式失败', () => workspaceController.locatePresetExpression(input))
  }

  function navigateToModelRequest(reference: SandboxMessageModelRequestReference) {
    evidenceNavigation.enterFromMessage(reference)
    workspaceController.selectView('model-requests')
    modelRequestVisitKey.value += 1
  }

  function navigateToPresetEvidence(result: LocateSandboxPresetExpressionResult, snapshot?: PresetOriginSnapshot) {
    if (!evidenceNavigation.enterFromPreset(result, snapshot)) return
    workspaceController.selectView('model-requests')
    modelRequestVisitKey.value += 1
  }

  function reportEvidenceNavigationFailure(message: string) {
    modelRequestErrorSlot.error.value = message
  }

  function returnToPresetOrigin() {
    if (!evidenceNavigation.returnToPresetOrigin()) return
    workspaceController.selectView('presets')
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
    const beforeMessageId = conversation ? readConversationMessageIds(snapshot.value, conversation.id)[0] : undefined
    if (!conversation || !currentOperator.value || !beforeMessageId) return resolve()
    try {
      await actionErrorSlot.runOrThrow('读取历史消息失败', () => workspaceController.loadMessageHistory({
        conversationId: conversation.id,
        beforeMessageId,
        limit: 50,
      }))
      resolve()
    } catch (error) {
      reject(error)
    }
  }

  // 搜索只返回摘要；定位旧消息仍走 loadEarlierMessages 循环加载。
  async function searchConversationMessages(
    input: Omit<SearchConversationMessagesInput, 'operatorId'>,
    resolve: (result: Awaited<ReturnType<WorkspaceController['searchConversationMessages']>>) => void,
    reject: Reject,
  ) {
    try {
      resolve(await actionErrorSlot.runOrThrow('搜索会话消息失败', () => workspaceController.searchConversationMessages(input)))
    } catch (error) {
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
    try {
      await actionErrorSlot.runOrThrow('合并转发失败', () => workspaceController.sendForwardMessage(input))
      resolve()
    } catch (error) {
      reject(error)
    }
  }

  async function getForwardMessage(
    input: { forwardId?: string; messageId?: string },
    resolve: (forward: Awaited<ReturnType<WorkspaceController['getForwardMessage']>>) => void,
    reject: Reject,
  ) {
    try {
      // 经错误位表达后这一处也会在调用前清掉上一条错误。收拢前它是十七处里唯一漏了这一步的，
      // 表现是读取成功后上一条过期报错仍留在发送控件上。
      resolve(await actionErrorSlot.runOrThrow('读取合并转发失败', () => workspaceController.getForwardMessage(input)))
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
    clearOneBotDebugRecords,
    clearTestCallRecords,
    clearModelRequestRecords,
    closeDetails,
    currentView,
    deleteAnnouncement,
    deleteFriend,
    detailsPanelModel,
    detailsVisible,
    debugVisitKey,
    debugWorkspaceModel,
    testCallVisitKey,
    testCallWorkspaceModel,
    modelRequestVisitKey,
    modelRequestWorkspaceModel,
    evidenceNavigation,
    presetDiscardGuard,
    presetWorkspaceModel,
    handleSidebarNotification,
    kickGroupMember,
    loadEarlierMessages,
    searchConversationMessages,
    loadOneBotDebugRecords,
    loadOneBotDebugRecord,
    loadTestCallRecords,
    loadTestCallRecord,
    loadModelRequestRecords,
    loadMoreModelRequestRecords,
    loadModelRequestRecord,
    loadModelRequestTrajectory,
    loadPresetCatalog,
    readPreset,
    createPreset,
    savePreset,
    renamePreset,
    deletePreset,
    locatePresetExpression,
    updatePresetDirty,
    cancelPresetDiscard,
    confirmPresetDiscard,
    navigateToPresetEvidence,
    navigateToModelRequest,
    reportEvidenceNavigationFailure,
    returnToPresetOrigin,
    manageEnvironment,
    createConversationInstance,
    branchConversationInstance,
    openConversationRenameDialog,
    deleteConversationInstance,
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
    clearConversationMessages,
    setMessageReaction,
    requestFriend,
    resolveAvatar,
    saveConversationRename,
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
