<template>
  <k-layout container="chatluna-sandbox-layout" main="chatluna-sandbox-page">
    <k-content>
      <div
        class="webqq-workspace"
        :class="{
          'is-frosted': appearance.enableSandboxFrostedGlass,
          'has-tim-tail': appearance.sandboxTimBubbleTail,
          'is-details-open': detailsVisible && isWebqqView,
          'is-details-closed': !detailsVisible || !isWebqqView,
          'is-standalone-view': !isWebqqView,
        }"
        :data-color-mode="resolvedColorMode"
        :data-mobile-view="currentView"
        :style="{ '--webqq-accent': appearance.sandboxAccentColor }"
        @click.capture="rememberFloatingPanelAnchor"
        @contextmenu.capture="rememberFloatingPanelAnchor"
      >
        <WebqqSidebar
          :model="sidebarModel"
          :active-space-id="activeSpaceId"
          :mcp-running="mcpRunning"
          :color-mode="resolvedColorMode"
          @select-view="selectNavigation"
          @select-conversation="selectConversation"
          @create-conversation-instance="createConversationInstance"
          @open-conversation-rename-dialog="openConversationRenameDialog"
          @delete-conversation-instance="deleteConversationInstance"
          @manage-environment="manageEnvironment"
          @friend-action="performFriendAction"
          @group-action="performGroupAction"
          @handle-notification="handleSidebarNotification"
          @open-entity-dialog="openEntityDialog"
          @open-group-action-dialog="openGroupActionDialog"
          @open-remark-dialog="openRemarkDialog"
          @open-profile="openProfile"
        />

        <AiTestSpaceOverview
          v-if="currentView === 'spaces'"
          :spaces="testSpaces"
          :thumbnail-models="thumbnailModels"
          :thumbnail-captures="thumbnailCaptures"
          :appearance="appearance"
          :color-mode="resolvedColorMode"
          @enter="enterTestSpace"
          @create="createTestSpace"
          @action="handleTestSpaceAction"
        />
        <main v-else-if="currentView === 'profile'" class="chatluna-sandbox-chat is-environment">
          <EnvironmentManager :directory="environmentDirectory" :port="mcpAdminPort" />
        </main>
        <OneBotDebugWorkspace
          v-else-if="currentView === 'debug'"
          :records="debugWorkspaceModel.records"
          :detail="debugWorkspaceModel.detail"
          :bots="debugBots"
          :loading="debugWorkspaceModel.loading"
          :detail-loading="debugWorkspaceModel.detailLoading"
          :error="debugWorkspaceModel.error"
          :visit-key="debugVisitKey"
          @query="loadOneBotDebugRecords"
          @open="loadOneBotDebugRecord"
          @clear="clearOneBotDebugRecords"
        />
        <TestCallWorkspace
          v-else-if="currentView === 'test-calls'"
          :records="testCallWorkspaceModel.records"
          :detail="testCallWorkspaceModel.detail"
          :loading="testCallWorkspaceModel.loading"
          :detail-loading="testCallWorkspaceModel.detailLoading"
          :error="testCallWorkspaceModel.error"
          :visit-key="testCallVisitKey"
          @query="loadTestCallRecords"
          @open="loadTestCallRecord"
          @clear="clearTestCallRecords"
        />
        <PresetWorkspace
          v-else-if="currentView === 'presets'"
          :catalog="presetWorkspaceModel.catalog"
          :document="presetWorkspaceModel.document"
          :loading="presetWorkspaceModel.loading"
          :saving="presetWorkspaceModel.saving"
          :error="presetWorkspaceModel.error"
          :evidence-context="presetWorkspaceModel.evidenceContext"
          :discard-guard-open="Boolean(presetDiscardGuard.pending)"
          :discard-guard-action="presetDiscardGuard.pending?.action"
          :origin-restore="evidenceNavigation.presetOriginRestore.value"
          @refresh="loadPresetCatalog"
          @read="readPresetFromWorkspace"
          @create="createPresetFromWorkspace"
          @save="savePresetFromWorkspace"
          @rename="renamePresetFromWorkspace"
          @delete="deletePresetFromWorkspace"
          @locate="locatePresetExpressionFromWorkspace"
          @read-request="readPresetRequestFromWorkspace"
          @navigate-evidence="navigateToPresetEvidence"
          @dirty-change="updatePresetDirty"
          @cancel-discard="cancelPresetDiscard"
          @confirm-discard="confirmPresetDiscard"
        />
        <ModelRequestWorkspace
          v-else-if="currentView === 'model-requests'"
          :records="modelRequestWorkspaceModel.records"
          :detail="modelRequestWorkspaceModel.detail"
          :trajectory="modelRequestWorkspaceModel.trajectory"
          :spaces="modelRequestSpaces"
          :bots="modelRequestBots"
          :default-space-id="activeSpaceId ?? 'main'"
          :has-more="modelRequestWorkspaceModel.hasMore"
          :next-cursor="modelRequestWorkspaceModel.nextCursor"
          :next-created-at="modelRequestWorkspaceModel.nextCreatedAt"
          :next-id="modelRequestWorkspaceModel.nextId"
          :capacity="modelRequestWorkspaceModel.capacity"
          :loading="modelRequestWorkspaceModel.loading"
          :detail-loading="modelRequestWorkspaceModel.detailLoading"
          :error="modelRequestWorkspaceModel.error"
          :visit-key="modelRequestVisitKey"
          :navigation="evidenceNavigation"
          @query="loadModelRequestRecords"
          @load-more="loadMoreModelRequestRecords"
          @open="loadModelRequestRecord"
          @trajectory="loadModelRequestTrajectory"
          @clear="clearModelRequestRecords"
          @navigation-failure="reportEvidenceNavigationFailure"
          @return-to-preset="returnToPresetOrigin"
        />
        <WebqqChatPane
          v-else
          ref="chatPaneRef"
          :model="chatPaneViewModel"
          :scroll-scope="activeSpaceId ?? 'main'"
          @back="selectNavigation('contacts')"
          @toggle-details="toggleDetails"
          @send="sendComposerMessage"
          @select-operator="selectComposerOperator"
          @manage-environment="manageEnvironment"
          @edit-participant="openComposerParticipantDialog('edit', $event)"
          @delete-participant="openComposerParticipantDialog('delete', $event)"
          @load-history="loadEarlierMessages"
          @search-conversation-messages="searchConversationMessages"
          @recall-message="recallMessage"
          @clear-conversation="clearConversationMessages"
          @branch-conversation-instance="branchConversationInstance"
          @set-message-reaction="setMessageReaction"
          @open-model-request="navigateToModelRequest"
          @send-forward-message="sendForwardMessage"
          @get-forward-message="getForwardMessage"
          @request-friend="requestFriend"
          @poke-friend="pokeFriend"
          @set-remark="openRemarkDialog"
          @delete-friend="deleteFriend"
          @mention-group-member="mentionGroupMember"
          @poke-group-member="pokeGroupMember"
          @set-group-card="openGroupActionDialog('card', $event)"
          @set-group-title="openGroupActionDialog('title', $event)"
          @set-group-admin="setGroupAdmin"
          @transfer-group-owner="transferGroupOwner"
          @kick-group-member="kickGroupMember"
          @open-profile="openProfile"
          @open-group-profile="openGroupProfile"
        />

        <WebqqDetailsPanel
          v-if="isWebqqView"
          :model="detailsPanelModel"
          @close="closeDetails"
          @publish-announcement="publishAnnouncement"
          @delete-announcement="deleteAnnouncement"
          @mention-group-member="mentionGroupMember"
          @focus-composer="chatPaneRef?.focusComposer()"
          @poke-group-member="pokeGroupMember"
          @set-group-card="openGroupActionDialog('card', $event)"
          @set-group-title="openGroupActionDialog('title', $event)"
          @set-group-admin="setGroupAdmin"
          @transfer-group-owner="transferGroupOwner"
          @kick-group-member="kickGroupMember"
          @open-profile="openProfile"
        />
        <WorkspaceOverlayHost
          ref="overlayHostRef"
          :users="overlayModel.users"
          :bots="overlayModel.bots"
          :groups="overlayModel.groups"
          :accent-color="overlayModel.accentColor"
          @manage-environment="manageEnvironment"
          @save-remark="saveFriendRemark"
          @save-group-action="saveGroupAction"
          @save-conversation-rename="saveConversationRename"
        />
        <AgentObserveOverlay
          v-if="observingSpace"
          :space-name="observingSpace.name"
          @take-over="handleTestSpaceAction('take-over', observingSpace.id)"
          @terminate="handleTestSpaceAction('terminate', observingSpace.id)"
        />
      </div>
    </k-content>
  </k-layout>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import AgentObserveOverlay from './agent-observe-overlay.vue'
import AiTestSpaceOverview from '#client/test-space/overview.vue'
import EnvironmentManager from '#client/environment/manager.vue'
import TestCallWorkspace from '#client/test-call/workspace.vue'
import ModelRequestWorkspace from '#client/model-request/workspace.vue'
import OneBotDebugWorkspace from '#client/onebot-debug/workspace.vue'
import PresetWorkspace from '#client/preset/workspace.vue'
import WebqqChatPane from '#client/webqq/chat-pane.vue'
import WebqqDetailsPanel from '#client/webqq/details-panel.vue'
import WebqqSidebar from '#client/webqq/sidebar.vue'
import WorkspaceOverlayHost from './overlay-host.vue'
import { useResolvedColorMode, useFrostedSurfaceFlag } from './color-scheme'
import { rememberFloatingPanelAnchor } from '#client/shared/floating-panel'
import { createKoishiMcpAdminPort } from '#client/mcp/koishi-port'
import { createKoishiTestCallRecordPort } from '#client/test-call/koishi-port'
import { createKoishiModelRequestPort } from '#client/model-request/koishi-port'
import { createKoishiOneBotDebugPort } from '#client/onebot-debug/koishi-port'
import { createKoishiPresetPort } from '#client/preset/koishi-port'
import { createKoishiTestSpacePort } from '#client/test-space/koishi-port'
import { createKoishiWorkspacePort } from './koishi-port'
import { createMcpActivitySync } from '#client/mcp/activity-sync'
import { createSceneMutationSync } from './scene-sync'
import { createWorkspaceController } from './controller'
import { createWorkspaceLayout } from './layout'
import { createWebqqWorkspaceShell } from './shell'
import { createAiTestSpaceShell } from '#client/test-space/shell'

const activeSpaceId = ref<string>()
// 两道定域的端口收同一个「解析当前空间标识」的实参，不是各写一个同形的箭头函数：
// 定域来源只有一处，改它不会漏掉其中一道。
const resolveActiveSpaceId = () => activeSpaceId.value
const workspacePort = createKoishiWorkspacePort(resolveActiveSpaceId)
// 调试记录那道跟工作区端口收同一个「解析当前空间标识」的实参；余下三道的适配器不注入空间
// 标识，因此不需要第二份实例，构造一次就够。
const workspaceController = createWorkspaceController({
  workspace: workspacePort,
  oneBotDebug: createKoishiOneBotDebugPort(resolveActiveSpaceId),
  modelRequest: createKoishiModelRequestPort(),
  preset: createKoishiPresetPort(),
  testCallRecord: createKoishiTestCallRecordPort(),
}, window.localStorage)
// 总览要读主场景与任意测试空间的头像媒体，因此另配一个不跟随当前活动空间的工作区端口。
// 拆分后它只剩场景那一道：缩略图要的就是越过隐式定域读任意空间的媒体。
const mainWorkspacePort = createKoishiWorkspacePort()
const testSpacePort = createKoishiTestSpacePort()
const mcpAdminPort = createKoishiMcpAdminPort()
const workspaceLayout = createWorkspaceLayout()
const overlayHostRef = ref<InstanceType<typeof WorkspaceOverlayHost>>()
/** 详情栏的群成员菜单要把焦点交给消息输入框，而发送控件在聊天区域里：这里只做转交。 */
const chatPaneRef = ref<{ focusComposer: () => void }>()
const {
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
  createConversationInstance,
  branchConversationInstance,
  openConversationRenameDialog,
  deleteConversationInstance,
  setMessageReaction,
  requestFriend,
  resolveAvatar,
  saveConversationRename,
  saveFriendRemark,
  saveGroupAction,
  selectComposerOperator,
  selectConversation,
  selectNavigation: selectWorkspaceNavigation,
  sendComposerMessage,
  sendForwardMessage,
  getForwardMessage,
  setGroupAdmin,
  sidebarModel,
  toggleDetails,
  transferGroupOwner,
} = createWebqqWorkspaceShell(workspaceController, workspaceLayout, () => overlayHostRef.value, () => activeSpaceId.value)

function readPresetFromWorkspace(input: Parameters<typeof readPreset>[0]) {
  void readPreset(input).catch(() => undefined)
}

function createPresetFromWorkspace(input: Parameters<typeof createPreset>[0], resolve: () => void, reject: (error: unknown) => void) {
  void createPreset(input).then(() => resolve(), reject)
}

function savePresetFromWorkspace(input: Parameters<typeof savePreset>[0], resolve: () => void, reject: (error: unknown) => void) {
  void savePreset(input).then(() => resolve(), reject)
}

function renamePresetFromWorkspace(input: Parameters<typeof renamePreset>[0], resolve: () => void, reject: (error: unknown) => void) {
  void renamePreset(input).then(() => resolve(), reject)
}

function deletePresetFromWorkspace(input: Parameters<typeof deletePreset>[0], resolve: () => void, reject: (error: unknown) => void) {
  void deletePreset(input).then(() => resolve(), reject)
}

function locatePresetExpressionFromWorkspace(
  input: Parameters<typeof locatePresetExpression>[0],
  resolve: (result: Awaited<ReturnType<typeof locatePresetExpression>>) => void,
  reject: (error: unknown) => void,
) {
  void locatePresetExpression(input).then(resolve, reject)
}

function readPresetRequestFromWorkspace(
  input: Parameters<typeof loadModelRequestRecord>[0],
  resolve: (result: Awaited<ReturnType<typeof loadModelRequestRecord>>) => void,
  reject: (error: unknown) => void,
) {
  void loadModelRequestRecord(input).then(resolve, reject)
}

const mentionRequest = ref<{ id: string, name: string, requestId: number }>()
const chatPaneViewModel = computed(() => ({
  ...chatPaneModel.value,
  composer: {
    ...chatPaneModel.value.composer,
    colorMode: resolvedColorMode.value,
    mentionRequest: mentionRequest.value,
  },
}))

function mentionGroupMember(targetId: string) {
  mentionRequest.value = {
    id: targetId,
    name: chatPaneModel.value.participantNames[targetId] ?? targetId,
    requestId: (mentionRequest.value?.requestId ?? 0) + 1,
  }
}

const resolvedColorMode = useResolvedColorMode(appearance)
const {
  botDirectory,
  createTestSpace,
  enterTestSpace,
  environmentDirectory,
  handleTestSpaceAction,
  selectNavigation,
  spaceOptions,
  testSpaces,
  thumbnailCaptures,
  thumbnailModels,
} = createAiTestSpaceShell({
  controller: workspaceController,
  testSpacePort,
  mainWorkspacePort,
  activeSpaceId,
  currentView,
  selectWorkspaceNavigation,
  appearance,
  colorMode: resolvedColorMode,
  resolveAvatar,
})

const isWebqqView = computed(() => currentView.value === 'messages' || currentView.value === 'contacts')
const modelRequestSpaces = spaceOptions
const modelRequestBots = botDirectory
const debugBots = botDirectory
useFrostedSurfaceFlag(appearance)
const disposeSceneMutationSync = createSceneMutationSync(workspacePort, workspaceController, () => activeSpaceId.value)
const { running: mcpRunning, dispose: disposeMcpActivitySync } = createMcpActivitySync(mcpAdminPort)
onBeforeUnmount(() => {
  disposeSceneMutationSync()
  disposeMcpActivitySync()
})
// 正在观察一个仍由 AI 控制的测试空间时，叠加 ego 式被控覆盖层（发光边缘 + 控制条 + agent 光标）。
const observingSpace = computed(() => isWebqqView.value
  ? testSpaces.value.find((space) => space.id === activeSpaceId.value && space.status === 'running')
  : undefined)
</script>
