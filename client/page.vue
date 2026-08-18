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
          :bots="debugBots"
          :loading="debugWorkspaceModel.loading"
          :error="debugWorkspaceModel.error"
          @query="loadOneBotDebugRecords"
          @clear="clearOneBotDebugRecords"
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
          @query="loadModelRequestRecords"
          @load-more="loadMoreModelRequestRecords"
          @open="loadModelRequestRecord"
          @trajectory="loadModelRequestTrajectory"
          @clear="clearModelRequestRecords"
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
import ModelRequestWorkspace from './model-request-workspace.vue'
import OneBotDebugWorkspace from './onebot-debug-workspace.vue'
import WebqqChatPane from './webqq-chat-pane.vue'
import WebqqDetailsPanel from './webqq-details-panel.vue'
import WebqqSidebar from './webqq-sidebar.vue'
import WorkspaceOverlayHost from './workspace-overlay-host.vue'
import { useResolvedColorMode, useFrostedSurfaceFlag } from './webqq/color-scheme'
import { rememberFloatingPanelAnchor } from './webqq/floating-panel'
import { createKoishiWorkspacePort } from './webqq/koishi-workspace-port'
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
  clearModelRequestRecords,
  closeDetails,
  currentView,
  deleteAnnouncement,
  deleteFriend,
  detailsPanelModel,
  detailsVisible,
  debugWorkspaceModel,
  modelRequestVisitKey,
  modelRequestWorkspaceModel,
  environmentModel,
  handleSidebarNotification,
  kickGroupMember,
  loadEarlierMessages,
  searchConversationMessages,
  loadOneBotDebugRecords,
  loadModelRequestRecords,
  loadMoreModelRequestRecords,
  loadModelRequestRecord,
  loadModelRequestTrajectory,
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
} = createWebqqWorkspaceShell(workspaceController, workspaceLayout, () => overlayHostRef.value)

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
onBeforeUnmount(disposeSceneMutationSync)
// 正在观察一个仍由 AI 控制的测试空间时，叠加 ego 式被控覆盖层（发光边缘 + 控制条 + agent 光标）。
const observingSpace = computed(() => isWebqqView.value
  ? testSpaces.value.find((space) => space.id === activeSpaceId.value && space.status === 'running')
  : undefined)
</script>
