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
          @remove-recent-conversation="removeRecentConversation"
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
          :main-snapshot="mainSnapshot"
          :thumbnail-captures="thumbnailCaptures"
          :appearance="appearance"
          :color-mode="resolvedColorMode"
          @enter="enterTestSpace"
          @create="createTestSpace"
          @action="handleTestSpaceAction"
        />
        <main v-else-if="currentView === 'profile'" class="chatluna-sandbox-chat is-environment">
          <EnvironmentManager :snapshot="environmentModel" :test-spaces="testSpaces" />
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
        <McpCallWorkspace
          v-else-if="currentView === 'mcp-calls'"
          :records="mcpCallWorkspaceModel.records"
          :detail="mcpCallWorkspaceModel.detail"
          :loading="mcpCallWorkspaceModel.loading"
          :detail-loading="mcpCallWorkspaceModel.detailLoading"
          :error="mcpCallWorkspaceModel.error"
          :visit-key="mcpCallVisitKey"
          @query="loadMcpCallRecords"
          @open="loadMcpCallRecord"
          @clear="clearMcpCallRecords"
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
          :origin-restore="presetOriginRestore"
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
          :loading="modelRequestWorkspaceModel.loading"
          :detail-loading="modelRequestWorkspaceModel.detailLoading"
          :error="modelRequestWorkspaceModel.error"
          :visit-key="modelRequestVisitKey"
          :navigation-intent="presetEvidenceIntent"
          :request-navigation-intent="modelRequestNavigationIntent"
          :can-return-to-preset="canReturnFromPresetEvidence"
          @query="loadModelRequestRecords"
          @load-more="loadMoreModelRequestRecords"
          @open="loadModelRequestRecord"
          @trajectory="loadModelRequestTrajectory"
          @clear="clearModelRequestRecords"
          @consume-navigation-intent="consumePresetEvidenceIntent"
          @consume-request-navigation-intent="consumeModelRequestNavigationIntent"
          @navigation-intent-failure="reportPresetEvidenceNavigationFailure"
          @return-to-preset="returnFromPresetEvidence"
        />
        <WebqqChatPane
          v-else
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
import AiTestSpaceOverview from './ai-test-space-overview.vue'
import EnvironmentManager from './environment-manager.vue'
import McpCallWorkspace from './mcp-call-workspace.vue'
import ModelRequestWorkspace from './model-request-workspace.vue'
import OneBotDebugWorkspace from './onebot-debug-workspace.vue'
import PresetWorkspace from './preset-workspace.vue'
import WebqqChatPane from './webqq-chat-pane.vue'
import WebqqDetailsPanel from './webqq-details-panel.vue'
import WebqqSidebar from './webqq-sidebar.vue'
import WorkspaceOverlayHost from './workspace-overlay-host.vue'
import { useResolvedColorMode, useFrostedSurfaceFlag } from './webqq/color-scheme'
import { rememberFloatingPanelAnchor } from './webqq/floating-panel'
import { createKoishiWorkspacePort } from './webqq/koishi-workspace-port'
import { createMcpActivitySync } from './webqq/mcp-activity-sync'
import { createSceneMutationSync } from './webqq/scene-sync'
import { createWorkspaceController } from './webqq/workspace-controller'
import { createWorkspaceLayout } from './webqq/workspace-layout'
import { createWebqqWorkspaceShell } from './webqq/workspace-shell'
import { createAiTestSpaceShell } from './webqq/test-space-shell'
import { getSandboxBots, type SandboxDirectoryBot } from '../src/types'

const activeSpaceId = ref<string>()
const workspaceController = createWorkspaceController(createKoishiWorkspacePort(() => activeSpaceId.value), window.localStorage)
const workspaceLayout = createWorkspaceLayout()
const overlayHostRef = ref<InstanceType<typeof WorkspaceOverlayHost>>()
const {
  appearance,
  chatPaneModel,
  clearOneBotDebugRecords,
  clearMcpCallRecords,
  clearModelRequestRecords,
  closeDetails,
  currentView,
  deleteAnnouncement,
  deleteFriend,
  detailsPanelModel,
  detailsVisible,
  debugVisitKey,
  debugWorkspaceModel,
  mcpCallVisitKey,
  mcpCallWorkspaceModel,
  modelRequestVisitKey,
  modelRequestWorkspaceModel,
  modelRequestNavigationIntent,
  presetDiscardGuard,
  presetEvidenceIntent,
  presetWorkspaceModel,
  environmentModel,
  handleSidebarNotification,
  kickGroupMember,
  loadEarlierMessages,
  searchConversationMessages,
  loadOneBotDebugRecords,
  loadOneBotDebugRecord,
  loadMcpCallRecords,
  loadMcpCallRecord,
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
  consumePresetEvidenceIntent,
  navigateToModelRequest,
  consumeModelRequestNavigationIntent,
  reportPresetEvidenceNavigationFailure,
  canReturnFromPresetEvidence,
  returnFromPresetEvidence,
  presetOriginRestore,
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
  removeRecentConversation,
  setMessageReaction,
  requestFriend,
  resolveAvatar,
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

const { createTestSpace, enterTestSpace, handleTestSpaceAction, mainSnapshot, selectNavigation, testSpaces, thumbnailCaptures } = createAiTestSpaceShell(
  workspaceController,
  activeSpaceId,
  currentView,
  selectWorkspaceNavigation,
)
const isWebqqView = computed(() => currentView.value === 'messages' || currentView.value === 'contacts')
const modelRequestSpaces = computed(() => [
  { id: 'main', name: '主环境' },
  ...testSpaces.value.map((space) => ({ id: space.id, name: space.name })),
])
const modelRequestBots = computed<SandboxDirectoryBot[]>(() => [
  ...getSandboxBots(mainSnapshot.value).map((bot) => ({
    ...bot,
    avatar: resolveAvatar(bot.avatar),
    source: { type: 'main' as const, name: '主环境' },
  })),
  ...testSpaces.value.flatMap((space) => getSandboxBots(space.snapshot).map((bot) => ({
    ...bot,
    avatar: resolveAvatar(bot.avatar),
    source: { type: 'test-space' as const, spaceId: space.id, name: space.name },
  }))),
])
const debugBots = modelRequestBots
const resolvedColorMode = useResolvedColorMode(appearance)
useFrostedSurfaceFlag(appearance)
const disposeSceneMutationSync = createSceneMutationSync(workspaceController, () => activeSpaceId.value)
const { running: mcpRunning, dispose: disposeMcpActivitySync } = createMcpActivitySync()
onBeforeUnmount(() => {
  disposeSceneMutationSync()
  disposeMcpActivitySync()
})
// 正在观察一个仍由 AI 控制的测试空间时，叠加 ego 式被控覆盖层（发光边缘 + 控制条 + agent 光标）。
const observingSpace = computed(() => isWebqqView.value
  ? testSpaces.value.find((space) => space.id === activeSpaceId.value && space.status === 'running')
  : undefined)
</script>
